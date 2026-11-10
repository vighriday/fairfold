import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDatabase, merchants, migrateDatabase, paypal_events } from '@fairfold/db';
import { fixedClock, type ForMerchant, type PayPalClient } from '@fairfold/contracts';
import { createJobs, type Jobs } from '@fairfold/jobs';
import { createEventIngress } from '@fairfold/paypal';
import { testDatabaseUrl } from '../../../packages/db/test/environment.js';
import { createApi } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { createWebhookRoutes } from '../src/routes/core/webhooks.js';

const databaseUrl = testDatabaseUrl();
const clock = fixedClock('2026-11-10T01:02:03.004Z');
describe.skipIf(!databaseUrl)(
  'H3 verified ingress with real PostgreSQL/pg-boss (synthetic verifier)',
  () => {
    let database: ReturnType<typeof createDatabase>;
    let jobs: Jobs;
    const queueSchema = 'h3_ingress_' + randomUUID().replaceAll('-', '');
    beforeAll(async () => {
      database = createDatabase(databaseUrl!);
      await migrateDatabase(database.db);
      jobs = createJobs(databaseUrl!, { schema: queueSchema });
      await jobs.start();
    });
    afterAll(async () => {
      await jobs?.stop();
      await database?.close();
    });
    async function fixture(queue: Pick<Jobs, 'publish'> = jobs) {
      const id = randomUUID(),
        slug = 'h3-events-' + id;
      await database.db.insert(merchants).values({
        id,
        slug,
        name: 'Synthetic webhook merchant',
        domain: 'synthetic.invalid',
        country: 'US',
        paypal_webhook_id: 'SYNTHETICWEBHOOK123',
      });
      const verify = vi.fn<PayPalClient['webhooks']['verify']>(async () => true);
      const forMerchant = vi.fn(async () => ({ webhooks: { verify } })) as unknown as ForMerchant;
      const ingest = createEventIngress({ database, jobs: queue, forMerchant, clock });
      const eventId = 'WH-' + randomUUID();
      const body =
        '{ "id": ' +
        JSON.stringify(eventId) +
        ', "event_type":"PAYMENT.CAPTURE.COMPLETED", "resource_type":"capture", "resource": { "id":"CAPTURE001", "status":"COMPLETED", "email":"excluded@example.invalid", "shipping":{"address_line_1":"Excluded street"}, "supplementary_data":{"related_ids":{"order_id":"ORDER001"}} } }';
      const bytes = Buffer.from(body);
      const row = async () =>
        (await database.db.select().from(paypal_events).where(eq(paypal_events.id, eventId)))[0];
      const queued = async () =>
        (await jobs.boss.findJobs<{ eventId: string }>('paypal.event')).filter(
          (j) => j.data.eventId === eventId,
        );
      return { id, slug, verify, ingest, eventId, body, bytes, row, queued };
    }
    it('preserves exact bytes for verification and stores minimized payload plus one job atomically', async () => {
      const f = await fixture();
      await f.ingest(f.slug, {}, f.bytes);
      expect(f.verify).toHaveBeenCalledWith({}, f.body, 'SYNTHETICWEBHOOK123');
      expect(await f.row()).toMatchObject({
        merchant_id: f.id,
        verified: true,
        received_at: clock.now(),
        processed_at: null,
      });
      expect(JSON.stringify((await f.row())!.payload)).not.toMatch(/excluded|shipping|street/i);
      expect(await f.queued()).toHaveLength(1);
    });
    it('serializes concurrent duplicate deliveries to one durable job', async () => {
      const f = await fixture();
      await Promise.all(Array.from({ length: 12 }, () => f.ingest(f.slug, {}, f.bytes)));
      expect(await f.queued()).toHaveLength(1);
      expect(f.verify).toHaveBeenCalledTimes(12);
    });
    it('rolls back a verified row when enqueue returns no job; an authentic retry recovers', async () => {
      const f = await fixture({ publish: vi.fn(async () => null) });
      await expect(f.ingest(f.slug, {}, f.bytes)).rejects.toMatchObject({
        code: 'WEBHOOK_QUEUE_UNAVAILABLE',
      });
      expect(await f.row()).toBeUndefined();
      const retry = createEventIngress({
        database,
        jobs,
        forMerchant: async () => ({ webhooks: { verify: f.verify } }) as never,
        clock,
      });
      await retry(f.slug, {}, f.bytes);
      expect(await f.queued()).toHaveLength(1);
    });
    it('rolls back when the queue adapter throws', async () => {
      const f = await fixture({
        publish: vi.fn(async () => {
          throw new Error('Synthetic queue failure');
        }),
      });
      await expect(f.ingest(f.slug, {}, f.bytes)).rejects.toThrow();
      expect(await f.row()).toBeUndefined();
    });
    it('stores a failed verification minimally, then promotes it without ID poisoning', async () => {
      const f = await fixture();
      f.verify.mockResolvedValueOnce(false);
      await expect(f.ingest(f.slug, {}, f.bytes)).rejects.toMatchObject({
        code: 'WEBHOOK_SIGNATURE_INVALID',
      });
      expect(await f.row()).toMatchObject({
        verified: false,
        resource_id: null,
        resource_type: null,
        payload: { id: f.eventId, event_type: 'PAYMENT.CAPTURE.COMPLETED' },
      });
      expect(await f.queued()).toHaveLength(0);
      await f.ingest(f.slug, {}, f.bytes);
      expect((await f.row())!.verified).toBe(true);
      expect(await f.queued()).toHaveLength(1);
      f.verify.mockResolvedValueOnce(false);
      await expect(f.ingest(f.slug, {}, f.bytes)).rejects.toThrow();
      expect((await f.row())!.verified).toBe(true);
      expect(await f.queued()).toHaveLength(1);
    });
    it('does not mark a provider outage as signature failure or persist any event', async () => {
      const f = await fixture();
      f.verify.mockRejectedValueOnce(new Error('excluded provider body'));
      await expect(f.ingest(f.slug, {}, f.bytes)).rejects.toMatchObject({
        code: 'WEBHOOK_VERIFICATION_UNAVAILABLE',
        statusCode: 503,
      });
      expect(await f.row()).toBeUndefined();
      expect(await f.queued()).toHaveLength(0);
    });
    it('rejects another merchant claiming a verified event ID without overwriting it', async () => {
      const f = await fixture(),
        other = await fixture();
      await f.ingest(f.slug, {}, f.bytes);
      await expect(other.ingest(other.slug, {}, f.bytes)).rejects.toMatchObject({
        code: 'WEBHOOK_MERCHANT_CONFLICT',
      });
      expect((await f.row())!.merchant_id).toBe(f.id);
      expect(await f.queued()).toHaveLength(1);
    });
    it('rejects unknown/simulated/unconfigured merchants and invalid UTF-8 before verification', async () => {
      const f = await fixture();
      await expect(f.ingest('absent', {}, f.bytes)).rejects.toMatchObject({ statusCode: 404 });
      await database.db.update(merchants).set({ is_simulated: true }).where(eq(merchants.id, f.id));
      await expect(f.ingest(f.slug, {}, f.bytes)).rejects.toMatchObject({ statusCode: 404 });
      await database.db
        .update(merchants)
        .set({ is_simulated: false, paypal_webhook_id: null })
        .where(eq(merchants.id, f.id));
      await expect(f.ingest(f.slug, {}, f.bytes)).rejects.toMatchObject({
        code: 'WEBHOOK_NOT_CONFIGURED',
      });
      await database.db
        .update(merchants)
        .set({ paypal_webhook_id: 'ID123' })
        .where(eq(merchants.id, f.id));
      await expect(f.ingest(f.slug, {}, Buffer.from([0xff]))).rejects.toThrow();
      expect(f.verify).not.toHaveBeenCalled();
    });
    it('preserves committed event/job across a new queue instance', async () => {
      const f = await fixture();
      await f.ingest(f.slug, {}, f.bytes);
      const reopened = createJobs(databaseUrl!, { schema: queueSchema });
      try {
        await reopened.start();
        expect(
          (await reopened.boss.findJobs<{ eventId: string }>('paypal.event')).filter(
            (j) => j.data.eventId === f.eventId,
          ),
        ).toHaveLength(1);
      } finally {
        await reopened.stop();
      }
    });
    it('serves endpoint 37 with an isolated raw parser, safe errors and body limits', async () => {
      const f = await fixture();
      const app = await createApi({
        config: readConfig({
          DATABASE_URL: databaseUrl!,
          APP_BASE_URL: 'http://localhost:3112',
          FRONTEND_ORIGIN: 'http://localhost:3112',
          APP_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString('base64'),
          DEMO_TOKEN_SECRET: 'synthetic-webhook-http-key-not-a-real-secret',
        }),
        logger: false,
        phase: 'H3',
        checkDatabase: async () => {},
        routes: createWebhookRoutes(f.ingest),
      });
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/webhooks/paypal/' + f.slug,
          headers: { 'content-type': 'application/json', 'paypal-auth-algo': 'SHA256withRSA' },
          payload: f.body,
        });
        expect(response.statusCode).toBe(200);
        expect(f.verify.mock.calls[0]![1]).toBe(f.body);
        expect((await app.inject('/docs/json')).json().paths).toHaveProperty(
          '/webhooks/paypal/{merchantSlug}',
        );
        expect(
          (
            await app.inject({
              method: 'POST',
              url: '/api/auth/demo-login',
              payload: { role: 'invalid', subjectId: 'bad' },
            })
          ).statusCode,
        ).toBe(400);
        expect(
          (
            await app.inject({
              method: 'POST',
              url: '/webhooks/paypal/' + f.slug,
              headers: { 'content-type': 'text/plain' },
              payload: f.body,
            })
          ).statusCode,
        ).toBe(400);
        expect(
          (
            await app.inject({
              method: 'POST',
              url: '/webhooks/paypal/' + f.slug,
              headers: { 'content-type': 'application/json' },
              payload: 'x'.repeat(1024 * 1024 + 1),
            })
          ).statusCode,
        ).toBe(413);
      } finally {
        await app.close();
      }
      expect(
        await database.db
          .select()
          .from(paypal_events)
          .where(and(eq(paypal_events.id, f.eventId), eq(paypal_events.verified, true))),
      ).toHaveLength(1);
    });
  },
);
