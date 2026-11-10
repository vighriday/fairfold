import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OrderSummarySchema } from '@fairfold/contracts';
import {
  buyers,
  createDatabase,
  ledger_entries,
  merchants,
  migrateDatabase,
  orders,
  products,
} from '@fairfold/db';
import { createJobs, type Jobs } from '@fairfold/jobs';
import { testDatabaseUrl } from '../../../packages/db/test/environment.js';
import { checkoutFixture, checkoutClock } from './checkout-fixture.js';

const integrationUrl = testDatabaseUrl();
describe.skipIf(!integrationUrl)(
  'checkout workflow with real database/queue and injected sandbox HTTP',
  () => {
    let database: ReturnType<typeof createDatabase>;
    let jobs: Jobs;
    beforeAll(async () => {
      database = createDatabase(integrationUrl!);
      await migrateDatabase(database.db);
      jobs = createJobs(integrationUrl!, { schema: 'h2_flow_' + randomUUID().replaceAll('-', '') });
      await jobs.start();
    });
    afterAll(async () => {
      await jobs?.stop();
      await database?.close();
    });
    async function stored(id: string) {
      const [order] = await database.db.select().from(orders).where(eq(orders.id, id));
      const entries = await database.db
        .select()
        .from(ledger_entries)
        .where(eq(ledger_entries.order_id, id));
      const queue = (await jobs.boss.findJobs<{ orderId: string }>('order.captured')).filter(
        (job) => job.data.orderId === id,
      );
      return { order: order!, entries, queue };
    }
    it('runs source create → authoritative GET → capture → minimal summary with one ledger/job', async () => {
      const f = await checkoutFixture(database, jobs);
      const created = await f.service.create(null, f.input);
      const result = await f.service.capture(null, created.paypalOrderId);
      expect(OrderSummarySchema.safeParse(result).success).toBe(true);
      expect(result).toMatchObject({
        id: created.orderId,
        status: 'captured',
        amount: { currency_code: 'USD', value: '38.00' },
      });
      expect(f.calls.map((call) => call.method)).toEqual(['POST', 'GET', 'POST']);
      expect(f.calls[0]!.requestId).toBe('ff-create-' + created.orderId);
      expect(f.calls[2]!.requestId).toBe('ff-capture-' + created.orderId);
      const state = await stored(created.orderId);
      expect(state.order).toMatchObject({
        paypal_capture_id: f.captureId,
        captured_at: checkoutClock.now(),
        payer_account_status: 'VERIFIED',
      });
      expect(state.entries).toHaveLength(1);
      expect(state.queue).toHaveLength(1);
      expect(state.queue[0]!.data).toEqual({ orderId: created.orderId });
      const serialized = JSON.stringify({
        result,
        entries: state.entries,
        queue: state.queue,
        logs: f.logger.warn.mock.calls,
      });
      for (const excluded of [
        '@example.invalid',
        'Synthetic Street',
        'Suite 2',
        'Excluded Recipient',
        'access_token',
        'purchase_units',
      ])
        expect(serialized).not.toContain(excluded);
    });
    it('coalesces eight simultaneous callbacks and skips vendor access after a committed capture', async () => {
      const f = await checkoutFixture(database, jobs);
      const created = await f.service.create(null, f.input);
      const results = await Promise.all(
        Array.from({ length: 8 }, () => f.service.capture(null, created.paypalOrderId)),
      );
      expect(results.every((row) => row.id === created.orderId)).toBe(true);
      expect(f.calls).toHaveLength(3);
      await database.db
        .update(merchants)
        .set({ paypal_client_secret_enc: null })
        .where(eq(merchants.id, f.merchant.id));
      expect((await f.service.capture(null, created.paypalOrderId)).status).toBe('captured');
      expect(f.calls).toHaveLength(3);
      const state = await stored(created.orderId);
      expect(state.entries).toHaveLength(1);
      expect(state.queue).toHaveLength(1);
    });
    it('recovers an existing PayPal capture with GET only and no capture POST', async () => {
      const f = await checkoutFixture(database, jobs);
      const created = await f.service.create(null, f.input);
      f.state.captured = true;
      expect((await f.service.capture(null, created.paypalOrderId)).status).toBe('captured');
      expect(f.calls.map((row) => row.method)).toEqual(['POST', 'GET']);
      expect((await stored(created.orderId)).queue).toHaveLength(1);
    });
    it.each(['network-after-commit', 'already-captured'])(
      're-fetches after %s and persists the observed capture without replaying POST',
      async (failure) => {
        const f = await checkoutFixture(database, jobs);
        const created = await f.service.create(null, f.input);
        f.state.postFailure = failure;
        expect((await f.service.capture(null, created.paypalOrderId)).status).toBe('captured');
        expect(f.calls.map((row) => row.method)).toEqual(['POST', 'GET', 'POST', 'GET']);
        const state = await stored(created.orderId);
        expect(state.entries).toHaveLength(1);
        expect(state.queue).toHaveLength(1);
      },
    );
    it('leaves an uncertain uncaptured request retryable, retaining the same deterministic capture ID', async () => {
      const f = await checkoutFixture(database, jobs);
      const created = await f.service.create(null, f.input);
      f.state.postFailure = 'network-before-commit';
      await expect(f.service.capture(null, created.paypalOrderId)).rejects.toMatchObject({
        code: 'PAYPAL_NETWORK_ERROR',
        outcomeUnknown: true,
      });
      const before = await stored(created.orderId);
      expect(before.order.status).toBe('created');
      expect(before.queue).toHaveLength(0);
      f.state.postFailure = '';
      await f.service.capture(null, created.paypalOrderId);
      const postIds = f.calls
        .filter((row) => row.path.endsWith('/capture'))
        .map((row) => row.requestId);
      expect(postIds).toEqual(['ff-capture-' + created.orderId, 'ff-capture-' + created.orderId]);
      expect((await stored(created.orderId)).entries).toHaveLength(1);
    });
    it('rolls local writes back after enqueue failure, then recovers from PayPal without another capture POST', async () => {
      let fail = true;
      const failingJobs: Pick<Jobs, 'publish'> = {
        async publish(name, payload, publishOptions) {
          const id = await jobs.publish(name, payload, publishOptions);
          if (fail) {
            fail = false;
            throw new Error('Synthetic queue failure');
          }
          return id;
        },
      };
      const f = await checkoutFixture(database, failingJobs);
      const created = await f.service.create(null, f.input);
      await expect(f.service.capture(null, created.paypalOrderId)).rejects.toThrow(
        'Synthetic queue failure',
      );
      const before = await stored(created.orderId);
      expect(before.order.status).toBe('created');
      expect(before.entries).toHaveLength(0);
      expect(before.queue).toHaveLength(0);
      expect((await f.service.capture(null, created.paypalOrderId)).status).toBe('captured');
      expect(f.calls.filter((row) => row.path.endsWith('/capture'))).toHaveLength(1);
      expect((await stored(created.orderId)).queue).toHaveLength(1);
    });
    it.each(['PENDING', 'DECLINED'])(
      'does not turn an existing %s capture into payment success or replay it',
      async (status) => {
        const f = await checkoutFixture(database, jobs);
        const created = await f.service.create(null, f.input);
        f.state.captured = true;
        f.state.status = status;
        await expect(f.service.capture(null, created.paypalOrderId)).rejects.toMatchObject({
          code: 'CAPTURE_NOT_COMPLETED',
        });
        const state = await stored(created.orderId);
        expect(state.order.status).toBe('created');
        expect(state.entries).toHaveLength(0);
        expect(state.queue).toHaveLength(0);
        expect(f.calls.map((row) => row.method)).toEqual(['POST', 'GET']);
      },
    );
    it('preserves a definite instrument decline instead of a recovery loop', async () => {
      const f = await checkoutFixture(database, jobs);
      const created = await f.service.create(null, f.input);
      f.state.postFailure = 'declined';
      await expect(f.service.capture(null, created.paypalOrderId)).rejects.toMatchObject({
        code: 'PAYPAL_HTTP_ERROR',
        outcomeUnknown: false,
      });
      expect(f.calls.map((row) => row.method)).toEqual(['POST', 'GET', 'POST']);
      expect(JSON.stringify(f.logger.warn.mock.calls)).not.toContain('email@example.invalid');
      expect((await stored(created.orderId)).queue).toHaveLength(0);
    });
    it('validates capture money before local captured state even when PayPal returned a completed capture', async () => {
      const f = await checkoutFixture(database, jobs);
      const created = await f.service.create(null, f.input);
      f.state.amount = '37.99';
      await expect(f.service.capture(null, created.paypalOrderId)).rejects.toMatchObject({
        code: 'CAPTURE_ORDER_MISMATCH',
      });
      const state = await stored(created.orderId);
      expect(state.order.status).toBe('created');
      expect(state.queue).toHaveLength(0);
    });
    it('does not trust the browser’s role/merchant/UUID as a substitute for the actual PayPal payer identity', async () => {
      const f = await checkoutFixture(database, jobs);
      const buyerId = randomUUID();
      await database.db
        .insert(buyers)
        .values({ id: buyerId, display_name: 'Synthetic authenticated buyer' });
      const auth = { role: 'buyer' as const, subjectId: buyerId };
      const created = await f.service.create(auth, f.input);
      expect((await stored(created.orderId)).order.buyer_id).toBeNull();
      await f.service.capture(auth, created.paypalOrderId);
      const state = await stored(created.orderId);
      expect(state.order.buyer_id).not.toBe(buyerId);
      const calls = f.calls.length;
      await expect(f.service.capture(auth, created.paypalOrderId)).rejects.toMatchObject({
        code: 'ORDER_NOT_FOUND',
      });
      expect(f.calls).toHaveLength(calls);
      expect((await f.service.capture(null, created.paypalOrderId)).id).toBe(created.orderId);
    });
    it('reuses the existing buyer row only when its PayPal payer ID actually matches', async () => {
      const f = await checkoutFixture(database, jobs);
      const buyerId = randomUUID();
      await database.db.insert(buyers).values({
        id: buyerId,
        paypal_payer_id: f.payerId,
        display_name: 'Synthetic seeded buyer',
      });
      const auth = { role: 'buyer' as const, subjectId: buyerId };
      const created = await f.service.create(auth, f.input);
      await f.service.capture(auth, created.paypalOrderId);
      expect((await stored(created.orderId)).order.buyer_id).toBe(buyerId);
      expect((await f.service.capture(auth, created.paypalOrderId)).id).toBe(created.orderId);
    });
    it('rejects cancelled, unknown, seeded IDs and invalid checkout roles before vendor calls', async () => {
      const f = await checkoutFixture(database, jobs);
      const created = await f.service.create(null, f.input);
      await database.db
        .update(orders)
        .set({ status: 'cancelled' })
        .where(eq(orders.id, created.orderId));
      const count = f.calls.length;
      await expect(f.service.capture(null, created.paypalOrderId)).rejects.toMatchObject({
        code: 'CAPTURE_STATE_CONFLICT',
      });
      await expect(f.service.capture(null, 'UNKNOWNORDER')).rejects.toMatchObject({
        code: 'ORDER_NOT_FOUND',
      });
      await expect(f.service.capture(null, 'SEED-ORDER')).rejects.toMatchObject({
        code: 'INVALID_PAYPAL_ORDER_ID',
      });
      for (const role of ['merchant', 'admin', 'agent'] as const) {
        const auth = { role, subjectId: f.merchant.id };
        expect(() => f.service.create(auth, f.input)).toThrow(
          'This role cannot use buyer checkout',
        );
        await expect(f.service.capture(auth, created.paypalOrderId)).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
      }
      expect(f.calls).toHaveLength(count);
    });
    it('returns the actual refunded state on repeat instead of recapturing or rewinding it', async () => {
      const f = await checkoutFixture(database, jobs);
      const created = await f.service.create(null, f.input);
      await f.service.capture(null, created.paypalOrderId);
      await database.db
        .update(orders)
        .set({ status: 'refunded' })
        .where(eq(orders.id, created.orderId));
      expect((await f.service.capture(null, created.paypalOrderId)).status).toBe('refunded');
      expect(f.calls).toHaveLength(3);
    });
    it('returns only public client/config fields and rejects absent, simulated or ambiguous configuration', async () => {
      const f = await checkoutFixture(database, jobs);
      expect(await f.service.config({ merchant: f.merchant.slug })).toEqual({
        clientId: 'synthetic-flow-client',
        merchantId: f.merchant.id,
        currency: 'USD',
      });
      expect(f.forMerchant).not.toHaveBeenCalled();
      expect(f.fetcher).not.toHaveBeenCalled();
      await expect(f.service.config({ merchant: 'missing-' + randomUUID() })).rejects.toMatchObject(
        { code: 'MERCHANT_NOT_FOUND' },
      );
      await database.db
        .update(merchants)
        .set({ paypal_client_id: null })
        .where(eq(merchants.id, f.merchant.id));
      await expect(f.service.config({ merchant: f.merchant.slug })).rejects.toMatchObject({
        code: 'PAYPAL_CREDENTIALS_MISSING',
      });
      await database.db
        .update(merchants)
        .set({ paypal_client_id: 'synthetic-flow-client', is_simulated: true })
        .where(eq(merchants.id, f.merchant.id));
      await expect(f.service.config({ merchant: f.merchant.slug })).rejects.toMatchObject({
        code: 'MERCHANT_NOT_PAYABLE',
      });
      await database.db
        .update(merchants)
        .set({ is_simulated: false })
        .where(eq(merchants.id, f.merchant.id));
      await database.db.insert(products).values({
        merchant_id: f.merchant.id,
        sku: 'EUR-ITEM',
        name: 'Synthetic euro',
        description: 'Test',
        unit_value: '1.00',
        currency: 'EUR',
      });
      await expect(f.service.config({ merchant: f.merchant.slug })).rejects.toMatchObject({
        code: 'CHECKOUT_CURRENCY_UNAVAILABLE',
      });
    });
    it('does not return success from an inconsistent pre-existing local capture state', async () => {
      const f = await checkoutFixture(database, jobs);
      const created = await f.service.create(null, f.input);
      await database.db
        .update(orders)
        .set({ paypal_capture_id: f.captureId })
        .where(eq(orders.id, created.orderId));
      await expect(f.service.capture(null, created.paypalOrderId)).rejects.toMatchObject({
        code: 'CAPTURE_CONFLICT',
      });
      expect(f.calls).toHaveLength(1);
    });
  },
);
