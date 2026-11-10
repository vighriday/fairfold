import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDatabase, merchants, paypal_events, migrateDatabase } from '@fairfold/db';
import { fixedClock } from '@fairfold/contracts';
import { getIntelRuntime } from '@fairfold/intelligence';
import { testDatabaseUrl } from '../../../packages/db/test/environment.js';
import { createWorkerRuntime, readWorkerConfig } from '../src/runtime.js';

const url = testDatabaseUrl();
describe.skipIf(!url)('H3 normal worker lifecycle with actual pg-boss', () => {
  let database: ReturnType<typeof createDatabase>;
  beforeAll(async () => {
    database = createDatabase(url!);
    await migrateDatabase(database.db);
  });
  afterAll(async () => {
    await database?.close();
  });
  function runtime() {
    const log = { info: vi.fn(), error: vi.fn() };
    const worker = createWorkerRuntime(
      readWorkerConfig({
        DATABASE_URL: url!,
        APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
      }),
      {
        log,
        queueSchema: 'h3_runtime_' + randomUUID().replaceAll('-', ''),
        clock: fixedClock('2026-11-10T04:05:06.007Z'),
      },
    );
    return { worker, log };
  }
  it('starts once, consumes a real event job, wires H4 synchronization and closes once', async () => {
    const { worker, log } = runtime();
    const merchantId = randomUUID(),
      eventId = 'WH-' + randomUUID();
    await database.db.insert(merchants).values({
      id: merchantId,
      slug: 'h3-runtime-' + merchantId,
      name: 'Synthetic runtime merchant',
      domain: 'synthetic.invalid',
      country: 'US',
    });
    await database.db.insert(paypal_events).values({
      id: eventId,
      event_type: 'CHECKOUT.ORDER.APPROVED',
      merchant_id: merchantId,
      verified: true,
      payload: {
        id: eventId,
        event_type: 'CHECKOUT.ORDER.APPROVED',
        resource: { id: 'SYNTHETICORDER' },
      },
    });
    try {
      const first = worker.start();
      expect(worker.start()).toBe(first);
      await first;
      expect(log.info).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: 'H3',
          handlerCount: 16,
          intelligence: 'ready',
          disputeSync: 'configured',
        }),
        'Worker ready',
      );
      await worker.jobs.publish('paypal.event', { eventId });
      await expect
        .poll(
          async () =>
            (await database.db.query.paypal_events.findFirst({
              where: (event, { eq }) => eq(event.id, eventId),
            }))!.processed_at,
          { timeout: 8000 },
        )
        .not.toBeNull();
    } finally {
      const closed = worker.close();
      expect(worker.close()).toBe(closed);
      await closed;
    }
    await expect(worker.start()).rejects.toMatchObject({ code: 'WORKER_CLOSED' });
  });
  it("binds the intelligence handlers to the worker's own database and queue", async () => {
    const { worker } = runtime();
    try {
      await worker.start();
      // A job the intelligence runtime publishes lands in this worker's queue schema, not in a second queue.
      const merchantId = randomUUID();
      const jobId = await getIntelRuntime().jobs.publish('sharedcause.scan', { merchantId });
      expect(await worker.jobs.boss.getJobById('sharedcause.scan', jobId as string)).toMatchObject({
        data: { merchantId },
      });
    } finally {
      await worker.close();
    }
  });
  it('handles closing during startup without leaking a queue or refresh timer', async () => {
    const { worker } = runtime(),
      started = worker.start(),
      closed = worker.close();
    await expect(started).rejects.toMatchObject({ code: 'WORKER_START_FAILED' });
    await closed;
    await expect(worker.start()).rejects.toMatchObject({ code: 'WORKER_CLOSED' });
  });
});
