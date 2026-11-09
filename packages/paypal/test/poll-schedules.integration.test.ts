import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, merchants, migrateDatabase } from '@fairfold/db';
import { createJobs } from '@fairfold/jobs';
import { testDatabaseUrl } from '../../db/test/environment.js';
import { syncDisputePollSchedules } from '../src/disputes-poll.js';

const url = testDatabaseUrl();
describe.skipIf(!url)('H3 actual per-merchant cron schedules', () => {
  let database: ReturnType<typeof createDatabase>, jobs: ReturnType<typeof createJobs>;
  const ids: string[] = [];
  beforeAll(async () => {
    database = createDatabase(url!);
    await migrateDatabase(database.db);
    jobs = createJobs(url!, { schema: 'h3_schedules_' + randomUUID().replaceAll('-', '') });
    await jobs.start();
  });
  afterAll(async () => {
    await jobs?.stop();
    for (const id of ids) await database.db.delete(merchants).where(eq(merchants.id, id));
    await database?.close();
  });
  async function merchant(extra: Partial<typeof merchants.$inferInsert> = {}) {
    const id = randomUUID();
    ids.push(id);
    await database.db
      .insert(merchants)
      .values({
        id,
        slug: 'h3-schedule-' + id,
        name: 'Synthetic schedule merchant',
        domain: 'synthetic.invalid',
        country: 'US',
        paypal_client_id: 'synthetic-client',
        paypal_client_secret_enc: 'synthetic-not-decrypted',
        ...extra,
      });
    return id;
  }
  it('retains independent one-minute UTC schedules for two configured real merchants', async () => {
    const first = await merchant(),
      second = await merchant();
    await syncDisputePollSchedules({ database: database.db, jobs });
    for (const id of [first, second])
      expect(await jobs.boss.getSchedule('disputes.poll', id)).toMatchObject({
        key: id,
        cron: '* * * * *',
        timezone: 'UTC',
        data: { merchantId: id },
      });
  });
  it('excludes simulated and missing/blank credentials without inspecting secret values', async () => {
    const blocked = await Promise.all([
      merchant({ is_simulated: true }),
      merchant({ paypal_client_id: null }),
      merchant({ paypal_client_secret_enc: null }),
      merchant({ paypal_client_id: ' ' }),
    ]);
    await syncDisputePollSchedules({ database: database.db, jobs });
    for (const id of blocked) expect(await jobs.boss.getSchedule('disputes.poll', id)).toBeNull();
  });
  it('removes stale schedules after credentials are removed and restores one after setup', async () => {
    const id = await merchant();
    await syncDisputePollSchedules({ database: database.db, jobs });
    await database.db.update(merchants).set({ paypal_client_id: null }).where(eq(merchants.id, id));
    await syncDisputePollSchedules({ database: database.db, jobs });
    expect(await jobs.boss.getSchedule('disputes.poll', id)).toBeNull();
    await database.db
      .update(merchants)
      .set({ paypal_client_id: 'synthetic-client' })
      .where(eq(merchants.id, id));
    await syncDisputePollSchedules({ database: database.db, jobs });
    expect(
      (await jobs.boss.getSchedules('disputes.poll')).filter((s) => s.key === id),
    ).toHaveLength(1);
  });
});
