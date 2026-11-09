import { testDatabaseUrl } from '../../db/test/environment.js';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { DemoSubjects, JobNames } from '@fairfold/contracts';
import { createDatabase } from '../../db/src/index.js';
import { createJobs } from '../src/index.js';

const integrationUrl = testDatabaseUrl();

describe.skipIf(!integrationUrl)('pg-boss delivery and debounce', () => {
  let jobs: ReturnType<typeof createJobs>;
  let database: ReturnType<typeof createDatabase>;
  const schema = 'h1_jobs_' + randomUUID().replaceAll('-', '');
  beforeAll(async () => {
    database = createDatabase(integrationUrl!);
    jobs = createJobs(integrationUrl!, { schema });
    await jobs.start();
  });
  afterAll(async () => {
    await jobs?.stop();
    await database?.close();
  });
  it('creates the prescribed queues and rejects invalid payloads', async () => {
    const names = (await jobs.boss.getQueues()).map((queue) => queue.name);
    for (const name of JobNames) expect(names).toContain(name);
    await expect(jobs.publish('order.captured', { orderId: 'invalid' })).rejects.toThrow();
  });
  it('delivers a validated payload to the registered worker', async () => {
    const seen: string[] = [];
    await jobs.work('order.captured', async ({ orderId }) => {
      seen.push(orderId);
    });
    await jobs.publish('order.captured', { orderId: DemoSubjects.buyer });
    await expect.poll(() => seen, { timeout: 8000 }).toEqual([DemoSubjects.buyer]);
  });
  it('coalesces concurrent complaints into one pending delayed scan per merchant', async () => {
    const before = Date.now();
    await Promise.all(
      Array.from({ length: 10 }, () =>
        jobs.publishDebounced('sharedcause.scan', DemoSubjects.merchant, 60),
      ),
    );
    const pending = await jobs.boss.findJobs<{ merchantId: string }>('sharedcause.scan');
    expect(pending).toHaveLength(1);
    expect(pending[0]!.data.merchantId).toBe(DemoSubjects.merchant);
    expect(pending[0]!.startAfter.getTime()).toBeGreaterThanOrEqual(before + 60_000);
  });
  it('persists an explicit IST schedule', async () => {
    await jobs.schedule('sharedcause.sweep', '0 2 * * *', {}, 'Asia/Kolkata');
    expect((await jobs.boss.getSchedule('sharedcause.sweep'))!.timezone).toBe('Asia/Kolkata');
  });
  it('allows a job insert to roll back with an existing PostgreSQL transaction', async () => {
    const client = await database.pool.connect();
    try {
      await client.query('begin');
      const db = { executeSql: (text: string, values?: unknown[]) => client.query(text, values) };
      await jobs.publish('action.approved', { actionId: randomUUID() }, { db });
      await client.query('rollback');
      expect(await jobs.boss.findJobs('action.approved')).toHaveLength(0);
    } finally {
      client.release();
    }
  });
});
