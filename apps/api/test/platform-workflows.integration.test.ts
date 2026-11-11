import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { fixedClock, type PayPalClient } from '@fairfold/contracts';
import {
  actions,
  alerts,
  buyers,
  complaint_clusters,
  createDatabase,
  disputes,
  hypotheses,
  inspection_rules,
  inventory_batches,
  ledger_entries,
  messages,
  migrateDatabase,
  orders,
  products,
  shipments,
} from '@fairfold/db';
import { createJobs, type Jobs } from '@fairfold/jobs';
import {
  createActionHandler,
  createTrackingPushHandler,
  PayPalError,
  type PayPalMerchantClient,
} from '@fairfold/paypal';
import { testDatabaseUrl } from '../../../packages/db/test/environment.js';
import { createSharedCauseActionApproval } from '../src/shared-causes/approve-action.js';
import { createProofMessageRoutes } from '../src/routes/core/proof-messages.js';
import { createApi } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { createAuth } from '../src/auth.js';

const url = testDatabaseUrl();
const clock = fixedClock('2026-11-11T12:00:00Z');
describe.skipIf(!url)('H5 audited platform workflows', () => {
  let database: ReturnType<typeof createDatabase>;
  let jobs: Jobs;
  beforeAll(async () => {
    database = createDatabase(url!);
    await migrateDatabase(database.db);
    jobs = createJobs(url!, { schema: 'audit_h5_' + randomUUID().replaceAll('-', ''), clock });
    await jobs.start();
  });
  afterAll(async () => {
    await jobs?.stop();
    await database?.close();
  });
  async function fixture() {
    const merchantId = randomUUID(),
      buyerId = randomUUID(),
      orderId = randomUUID();
    await database.db
      .insert((await import('@fairfold/db')).merchants)
      .values({
        id: merchantId,
        slug: 'audit-' + merchantId,
        name: 'Synthetic audit merchant',
        domain: 'audit.invalid',
        country: 'US',
      });
    await database.db.insert(buyers).values({ id: buyerId, display_name: 'Synthetic audit buyer' });
    const [product] = await database.db
      .insert(products)
      .values({
        merchant_id: merchantId,
        sku: 'AUDIT',
        name: 'Audit hoodie',
        description: 'Synthetic fixture',
        unit_value: '38.00',
      })
      .returning();
    const [batch] = await database.db
      .insert(inventory_batches)
      .values({
        merchant_id: merchantId,
        product_id: product!.id,
        batch_code: 'B17',
        received_at: clock.now(),
        qty_received: 20,
        qty_remaining: 20,
      })
      .returning();
    await database.db
      .insert(orders)
      .values({
        id: orderId,
        merchant_id: merchantId,
        buyer_id: buyerId,
        paypal_order_id: 'SEED-ORDER-' + orderId,
        paypal_capture_id: 'SEED-CAPTURE-' + orderId,
        invoice_id: 'FF-' + orderId,
        status: 'captured',
        amount_value: '38.00',
        currency: 'USD',
      });
    const [cluster] = await database.db
      .insert(complaint_clusters)
      .values({
        merchant_id: merchantId,
        product_id: product!.id,
        category: 'product_defect',
        label: 'Synthetic seam',
        centroid: [1],
      })
      .returning();
    const [hypothesis] = await database.db
      .insert(hypotheses)
      .values({
        merchant_id: merchantId,
        cluster_id: cluster!.id,
        dimension: 'batch_code',
        value: 'B17',
        strength: 'strong',
        stats: {},
        alternatives: [],
        affected: {},
        explanation: 'Synthetic hypothesis',
      })
      .returning();
    const refund = vi.fn<PayPalClient['payments']['refund']>(async () => ({
      refundId: 'SYNTHETICREFUND',
      status: 'COMPLETED',
    }));
    const sendMessage = vi.fn<PayPalClient['disputes']['sendMessage']>(async () => ({}));
    const addTracking = vi.fn<PayPalClient['orders']['addTracking']>(async () => ({
      trackerId: 'SYNTHETICTRACKER',
    }));
    const detail: Record<string, unknown> = {
      status: 'WAITING_FOR_SELLER_RESPONSE',
      dispute_life_cycle_stage: 'INQUIRY',
    };
    const get = vi.fn(async (id: string) => ({ ...detail, dispute_id: id }));
    const forMerchant = vi.fn(async (id: string) => {
      expect(id).toBe(merchantId);
      return {
        payments: { refund },
        disputes: { get, sendMessage },
        orders: { addTracking },
      } as unknown as PayPalMerchantClient;
    });
    const handler = createActionHandler({ database, jobs, forMerchant, clock });
    const approve = createSharedCauseActionApproval({ database, jobs, clock });
    const auth = { role: 'merchant' as const, subjectId: merchantId };
    const action = async (type: string, payload: Record<string, unknown>) => {
      const [a] = await database.db
        .insert(actions)
        .values({ hypothesis_id: hypothesis!.id, type, payload })
        .returning();
      await approve(auth, hypothesis!.id, a!.id);
      return a!;
    };
    return {
      merchantId,
      buyerId,
      orderId,
      product: product!,
      batch: batch!,
      hypothesis: hypothesis!,
      refund,
      sendMessage,
      addTracking,
      forMerchant,
      detail,
      handler,
      approve,
      auth,
      action,
    };
  }
  it('executes concurrent approved holds once, updates the batch and preserves another hypothesis hold', async () => {
    const f = await fixture();
    const action = await f.action('hold_orders', { orderIds: [f.orderId] });
    const results = await Promise.allSettled([
      f.handler({ actionId: action.id }),
      f.handler({ actionId: action.id }),
    ]);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(
      (
        await database.db
          .select()
          .from(inventory_batches)
          .where(eq(inventory_batches.id, f.batch.id))
      )[0]?.status,
    ).toBe('on_hold');
    expect(
      await database.db
        .select()
        .from(ledger_entries)
        .where(and(eq(ledger_entries.order_id, f.orderId), eq(ledger_entries.type, 'held'))),
    ).toHaveLength(1);
    const release = await f.action('release_orders', { orderIds: [f.orderId] });
    await f.handler({ actionId: release.id });
    expect(
      (
        await database.db
          .select()
          .from(inventory_batches)
          .where(eq(inventory_batches.id, f.batch.id))
      )[0]?.status,
    ).toBe('active');
  });
  it('requires explicit recorded approval, validates edits and creates one inspection rule', async () => {
    const f = await fixture();
    const [unapproved] = await database.db
      .insert(actions)
      .values({
        hypothesis_id: f.hypothesis.id,
        type: 'hold_orders',
        payload: { orderIds: [f.orderId] },
        status: 'approved',
      })
      .returning();
    await expect(f.handler({ actionId: unapproved!.id })).rejects.toMatchObject({
      code: 'ACTION_NOT_APPROVED',
    });
    const [proposed] = await database.db
      .insert(actions)
      .values({
        hypothesis_id: f.hypothesis.id,
        type: 'hold_orders',
        payload: { orderIds: [f.orderId] },
      })
      .returning();
    await expect(
      f.approve(f.auth, f.hypothesis.id, proposed!.id, { orderIds: [] }),
    ).rejects.toMatchObject({ code: 'ACTION_PAYLOAD_INVALID' });
    const rule = await f.action('add_inspection_rule', {
      batchCode: 'B17',
      instruction: 'Inspect seam',
      requiredPhotoLabel: 'seam_closeup',
    });
    await Promise.all([f.handler({ actionId: rule.id }), f.handler({ actionId: rule.id })]);
    expect(
      await database.db
        .select()
        .from(inspection_rules)
        .where(eq(inspection_rules.created_by_hypothesis_id, f.hypothesis.id)),
    ).toHaveLength(1);
  });
  it('prevents a repeated or uncertain refund and does not label partial/pending refunds as full', async () => {
    const f = await fixture();
    const action = await f.action('proactive_refund', {
      orderIds: [f.orderId],
      amounts: { [f.orderId]: { currency_code: 'USD', value: '12.00' } },
    });
    await Promise.allSettled([
      f.handler({ actionId: action.id }),
      f.handler({ actionId: action.id }),
    ]);
    expect(f.refund).toHaveBeenCalledTimes(1);
    expect(
      (await database.db.select().from(orders).where(eq(orders.id, f.orderId)))[0]?.status,
    ).toBe('captured');
    const tooMuch = await f.action('proactive_refund', {
      orderIds: [f.orderId],
      amounts: { [f.orderId]: { currency_code: 'USD', value: '30.00' } },
    });
    await expect(f.handler({ actionId: tooMuch.id })).rejects.toMatchObject({
      code: 'ACTION_REFUND_INVALID',
    });
    const g = await fixture();
    g.refund.mockRejectedValueOnce(
      new PayPalError('PAYPAL_NETWORK_ERROR', null, null, null, [], true),
    );
    const uncertain = await g.action('proactive_refund', {
      orderIds: [g.orderId],
      amounts: { [g.orderId]: { currency_code: 'USD', value: '38.00' } },
    });
    await expect(g.handler({ actionId: uncertain.id })).rejects.toMatchObject({
      code: 'ACTION_RECONCILIATION_REQUIRED',
    });
    await expect(g.handler({ actionId: uncertain.id })).rejects.toMatchObject({
      code: 'ACTION_NOT_APPROVED',
    });
    const retry = await g.action('proactive_refund', {
      orderIds: [g.orderId],
      amounts: { [g.orderId]: { currency_code: 'USD', value: '38.00' } },
    });
    await expect(g.handler({ actionId: retry.id })).rejects.toMatchObject({
      code: 'ACTION_RECONCILIATION_REQUIRED',
    });
    expect(g.refund).toHaveBeenCalledTimes(1);
  });
  it('actually sends approved inquiry messages and never sends safety/unapproved messages', async () => {
    const f = await fixture();
    const disputeId = 'PP-D-AUDIT-' + randomUUID();
    await database.db
      .insert(disputes)
      .values({
        id: disputeId,
        merchant_id: f.merchantId,
        order_id: f.orderId,
        reason: 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED',
        status: 'WAITING_FOR_SELLER_RESPONSE',
        raw: {},
      });
    const [action] = await database.db
      .insert(actions)
      .values({ hypothesis_id: f.hypothesis.id, type: 'send_buyer_messages', payload: {} })
      .returning();
    const [message] = await database.db
      .insert(messages)
      .values({
        merchant_id: f.merchantId,
        buyer_id: f.buyerId,
        order_id: f.orderId,
        action_id: action!.id,
        dispute_id: disputeId,
        channel: 'paypal_dispute',
        body: 'We are checking the seam. Email: test@example.invalid',
      })
      .returning();
    await database.db
      .update(actions)
      .set({ payload: { messageIds: [message!.id] } })
      .where(eq(actions.id, action!.id));
    await f.approve(f.auth, f.hypothesis.id, action!.id);
    await f.handler({ actionId: action!.id });
    await f.handler({ actionId: action!.id });
    expect(f.sendMessage).toHaveBeenCalledTimes(1);
    expect(f.sendMessage.mock.calls[0]?.[1]).toBe(
      'We are checking the seam. Email: [CONTACT_REDACTED]',
    );
    expect(
      (await database.db.select().from(messages).where(eq(messages.id, message!.id)))[0]?.status,
    ).toBe('sent');
    await database.db
      .update(hypotheses)
      .set({ safety_flag: true })
      .where(eq(hypotheses.id, f.hypothesis.id));
    await expect(
      f.action('send_buyer_messages', { messageIds: [message!.id] }),
    ).rejects.toMatchObject({ code: 'SAFETY_REVIEW_REQUIRED' });
  });
  it('claims tracking once and preserves a courier scan as unknown until a scan arrives', async () => {
    const f = await fixture();
    await database.db
      .update(orders)
      .set({ status: 'sealed', sealed_at: clock.now() })
      .where(eq(orders.id, f.orderId));
    const [shipment] = await database.db
      .insert(shipments)
      .values({ order_id: f.orderId, carrier: 'UPS', tracking_number: 'AUDIT' })
      .returning();
    const handler = createTrackingPushHandler({
      database,
      jobs,
      forMerchant: f.forMerchant,
      clock,
    });
    await Promise.allSettled([handler({ orderId: f.orderId }), handler({ orderId: f.orderId })]);
    expect(f.addTracking).toHaveBeenCalledTimes(1);
    expect(
      (await database.db.select().from(shipments).where(eq(shipments.id, shipment!.id)))[0],
    ).toMatchObject({ paypal_tracker_id: 'SYNTHETICTRACKER', last_scan_at: null });
  });
  it('exposes only owned ledger proof and sent buyer messages over authenticated HTTP', async () => {
    const f = await fixture();
    const tokenSecret = 'synthetic-platform-workflow-signing-key';
    await database.db.insert(messages).values([
      {
        merchant_id: f.merchantId,
        buyer_id: f.buyerId,
        order_id: f.orderId,
        channel: 'in_app',
        body: 'Sent synthetic message',
        status: 'sent',
        sent_at: clock.now(),
      },
      {
        merchant_id: f.merchantId,
        buyer_id: f.buyerId,
        order_id: f.orderId,
        channel: 'in_app',
        body: 'Private draft',
      },
    ]);
    const config = readConfig({
      DATABASE_URL: url!,
      APP_BASE_URL: 'http://localhost:3117',
      FRONTEND_ORIGIN: 'http://localhost:3117',
      APP_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString('base64'),
      DEMO_TOKEN_SECRET: tokenSecret,
      DEMO_MODE: 'true',
    });
    const app = await createApi({
      config,
      clock,
      logger: false,
      checkDatabase: async () => {},
      routes: createProofMessageRoutes(database.db),
    });
    try {
      const auth = createAuth(tokenSecret, clock);
      const buyer = {
        authorization: 'Bearer ' + (await auth.issue({ role: 'buyer', subjectId: f.buyerId })),
      };
      const response = await app.inject({ url: '/api/buyer/messages', headers: buyer });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveLength(1);
      expect(response.body).not.toContain('Private draft');
      expect(
        (await app.inject({ url: '/api/orders/' + f.orderId + '/ledger', headers: buyer })).json(),
      ).toMatchObject({ verified: true, entries: [] });
      const foreign = {
        authorization: 'Bearer ' + (await auth.issue({ role: 'buyer', subjectId: randomUUID() })),
      };
      expect(
        (await app.inject({ url: '/api/orders/' + f.orderId + '/ledger', headers: foreign }))
          .statusCode,
      ).toBe(404);
    } finally {
      await app.close();
    }
  });
});
