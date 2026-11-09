import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  fixedClock,
  OrderDetailSchema,
  OrderRowSchema,
  OrderSummarySchema,
} from '@fairfold/contracts';
import { computeBuyerSignal } from '@fairfold/contracts/stubs';
import {
  alerts,
  buyers,
  buyer_signals,
  complaint_clusters,
  disputes,
  hypotheses,
  merchants,
  order_items,
  orders,
  products,
  shipments,
  createDatabase,
  migrateDatabase,
} from '@fairfold/db';
import { createLedger } from '@fairfold/ledger';
import { testDatabaseUrl } from '../../../packages/db/test/environment.js';
import { createOrderReads } from '../src/orders/read.js';

const integrationUrl = testDatabaseUrl();
const clock = fixedClock('2026-11-09T14:30:00.000Z');

describe.skipIf(!integrationUrl)('owner-scoped order reads on PostgreSQL', () => {
  let database: ReturnType<typeof createDatabase>;
  beforeAll(async () => {
    database = createDatabase(integrationUrl!);
    await migrateDatabase(database.db);
  });
  afterAll(async () => {
    await database?.close();
  });
  async function fixture() {
    async function merchant() {
      const [row] = await database.db
        .insert(merchants)
        .values({
          slug: 'read-test-' + randomUUID(),
          name: 'Synthetic read merchant',
          domain: 'read.example.invalid',
          country: 'US',
          paypal_client_secret_enc: 'EXCLUDED-CREDENTIAL',
        })
        .returning();
      return row!;
    }
    async function buyer() {
      const [row] = await database.db
        .insert(buyers)
        .values({
          paypal_payer_id: 'SEED-READ-' + randomUUID(),
          email_hash: 'EXCLUDED-EMAIL-HASH',
          display_name: 'Synthetic buyer',
        })
        .returning();
      return row!;
    }
    const [m1, m2, b1, b2] = await Promise.all([merchant(), merchant(), buyer(), buyer()]);
    const productRows = await database.db
      .insert(products)
      .values(
        [m1, m2].map((m) => ({
          merchant_id: m.id,
          sku: 'SYNTHETIC-HOODIE',
          name: 'Synthetic hoodie',
          description: 'Synthetic listing',
          unit_value: '38.00',
        })),
      )
      .returning();
    async function order(m: typeof m1, buyerId: string | null, hour: number, status = 'captured') {
      const id = randomUUID();
      const [row] = await database.db
        .insert(orders)
        .values({
          id,
          merchant_id: m.id,
          buyer_id: buyerId,
          paypal_order_id: 'SEED-READ-' + id,
          invoice_id: 'FF-' + id,
          status,
          amount_value: '38.00',
          currency: 'USD',
          created_at: new Date(`2026-11-09T${hour}:00:00.000Z`),
          seller_protection_status: 'ELIGIBLE',
          seller_protection_categories: ['ITEM_NOT_RECEIVED'],
          payer_account_status: 'VERIFIED',
          ship_to_postal: 'EXCLUDED-POSTAL',
          ship_to_hash: 'EXCLUDED-ADDRESS-HASH',
        })
        .returning();
      const product = productRows.find((p) => p.merchant_id === m.id)!;
      await database.db.insert(order_items).values({
        order_id: id,
        product_id: product.id,
        sku: product.sku,
        name: product.name,
        quantity: 1,
        unit_value: product.unit_value,
        listing_version: product.listing_version,
        batch_code: 'PRIVATE-BATCH',
        packed_by: 'PRIVATE-PACKER',
      });
      return row!;
    }
    const a1 = await order(m1, b1.id, 10);
    const a2 = await order(m1, b2.id, 11);
    const bOrder = await order(m2, b1.id, 12);
    const unowned = await order(m1, null, 13, 'created');
    const tied = await order(m1, b1.id, 13);
    const compute = vi.fn(computeBuyerSignal);
    const reads = createOrderReads({ database: database.db, computeBuyerSignal: compute });
    const merchantAuth = { role: 'merchant' as const, subjectId: m1.id };
    const buyerAuth = { role: 'buyer' as const, subjectId: b1.id };
    return {
      m1,
      m2,
      b1,
      b2,
      a1,
      a2,
      bOrder,
      unowned,
      tied,
      reads,
      compute,
      merchantAuth,
      buyerAuth,
    };
  }
  it('lists only the merchant’s orders and the buyer’s own orders across stores with exact projections', async () => {
    const f = await fixture();
    const merchantRows = await f.reads.listMerchant(f.merchantAuth);
    expect(new Set(merchantRows.map((row) => row.id))).toEqual(
      new Set([f.a1.id, f.a2.id, f.unowned.id, f.tied.id]),
    );
    for (const row of merchantRows) expect(OrderRowSchema.safeParse(row).success).toBe(true);
    const buyerRows = await f.reads.listBuyer(f.buyerAuth);
    expect(new Set(buyerRows.map((row) => row.id))).toEqual(
      new Set([f.a1.id, f.bOrder.id, f.tied.id]),
    );
    for (const row of buyerRows) {
      expect(OrderSummarySchema.safeParse(row).success).toBe(true);
      expect(row).not.toHaveProperty('buyerSignal');
      expect(row).not.toHaveProperty('hold');
    }
    expect(f.compute).not.toHaveBeenCalled();
  });
  it('applies status and stable created-time/UUID pagination without duplicates at tied timestamps', async () => {
    const f = await fixture();
    const all = await f.reads.listMerchant(f.merchantAuth);
    const first = await f.reads.listMerchant(f.merchantAuth, { limit: 2 });
    const second = await f.reads.listMerchant(f.merchantAuth, {
      limit: 2,
      cursor: first.at(-1)!.id,
    });
    expect([...first, ...second].map((row) => row.id)).toEqual(all.map((row) => row.id));
    expect(await f.reads.listMerchant(f.merchantAuth, { cursor: all.at(-1)!.id })).toEqual([]);
    expect(
      (await f.reads.listMerchant(f.merchantAuth, { status: 'created' })).map((row) => row.id),
    ).toEqual([f.unowned.id]);
    const buyerFirst = await f.reads.listBuyer(f.buyerAuth, { limit: 1 });
    const buyerRest = await f.reads.listBuyer(f.buyerAuth, { cursor: buyerFirst[0]!.id });
    expect([...buyerFirst, ...buyerRest].map((row) => row.id)).toEqual(
      (await f.reads.listBuyer(f.buyerAuth)).map((row) => row.id),
    );
  });
  it('does not accept foreign or filtered-out cursors as a way to traverse another account', async () => {
    const f = await fixture();
    await expect(
      f.reads.listMerchant(f.merchantAuth, { cursor: f.bOrder.id }),
    ).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
    await expect(f.reads.listBuyer(f.buyerAuth, { cursor: f.a2.id })).rejects.toMatchObject({
      code: 'INVALID_CURSOR',
    });
    await expect(
      f.reads.listMerchant(f.merchantAuth, { status: 'created', cursor: f.a1.id }),
    ).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
    await expect(f.reads.listBuyer(f.buyerAuth, { cursor: randomUUID() })).rejects.toMatchObject({
      code: 'INVALID_CURSOR',
    });
  });
  it.each([
    { limit: 0 },
    { limit: 2_147_483_648 },
    { cursor: 'not-a-uuid' },
    { status: 'invalid' },
  ])('validates list query %j', async (query) => {
    const f = await fixture();
    await expect(f.reads.listMerchant(f.merchantAuth, query)).rejects.toMatchObject({
      code: query.cursor ? 'INVALID_CURSOR' : 'INVALID_ORDER_QUERY',
    });
  });
  it('reads the latest matching merchant/order/buyer signal and counts open alerts/disputes without fanout', async () => {
    const f = await fixture();
    await database.db.insert(buyer_signals).values([
      {
        merchant_id: f.m1.id,
        buyer_id: f.b1.id,
        order_id: f.a1.id,
        band: 'green',
        points: 0,
        reasons: [],
        features: {},
        recommendation: 'Synthetic',
        computed_at: new Date('2026-11-09T14:00:00Z'),
      },
      {
        merchant_id: f.m1.id,
        buyer_id: f.b1.id,
        order_id: f.a1.id,
        band: 'yellow',
        points: 3,
        reasons: [{ code: 'SYNTHETIC', label: 'Synthetic observed reason', points: 3 }],
        features: {},
        recommendation: 'Synthetic',
        computed_at: new Date('2026-11-09T15:00:00Z'),
      },
      {
        merchant_id: f.m2.id,
        buyer_id: f.b1.id,
        order_id: f.a1.id,
        band: 'red',
        points: 9,
        reasons: [{ code: 'FOREIGN', label: 'FOREIGN-SIGNAL', points: 9 }],
        features: {},
        recommendation: 'Synthetic',
        computed_at: new Date('2026-11-09T16:00:00Z'),
      },
      {
        merchant_id: f.m1.id,
        buyer_id: f.b2.id,
        order_id: f.a1.id,
        band: 'red',
        points: 9,
        reasons: [{ code: 'FOREIGN', label: 'OTHER-BUYER-SIGNAL', points: 9 }],
        features: {},
        recommendation: 'Synthetic',
        computed_at: new Date('2026-11-09T17:00:00Z'),
      },
    ]);
    await database.db.insert(alerts).values([
      { merchant_id: f.m1.id, order_id: f.a1.id, type: 'tracking_gap', message: 'Synthetic alert' },
      { merchant_id: f.m1.id, order_id: f.a1.id, type: 'seal_overdue', message: 'Synthetic alert' },
      {
        merchant_id: f.m1.id,
        order_id: f.a1.id,
        type: 'tracking_gap',
        message: 'Acknowledged synthetic',
        acknowledged_at: clock.now(),
      },
      { merchant_id: f.m2.id, order_id: f.a1.id, type: 'tracking_gap', message: 'FOREIGN-ALERT' },
    ]);
    await database.db.insert(disputes).values([
      {
        id: 'SEED-READ-' + randomUUID(),
        merchant_id: f.m1.id,
        order_id: f.a1.id,
        reason: 'ITEM_NOT_RECEIVED',
        status: 'OPEN',
        raw: {},
      },
      {
        id: 'SEED-READ-' + randomUUID(),
        merchant_id: f.m1.id,
        order_id: f.a1.id,
        reason: 'ITEM_NOT_RECEIVED',
        status: 'RESOLVED',
        resolved_at: clock.now(),
        raw: {},
      },
    ]);
    const row = (await f.reads.listMerchant(f.merchantAuth)).find((row) => row.id === f.a1.id)!;
    expect(row).toMatchObject({
      alertCount: 2,
      disputeOpen: true,
      buyerSignal: { band: 'yellow', topReasons: ['Synthetic observed reason'] },
    });
    expect(JSON.stringify(row)).not.toContain('FOREIGN');
    expect(JSON.stringify(row)).not.toContain('OTHER-BUYER');
    await database.db
      .update(disputes)
      .set({ status: 'RESOLVED', resolved_at: clock.now() })
      .where(eq(disputes.order_id, f.a1.id));
    expect(
      (await f.reads.listMerchant(f.merchantAuth)).find((row) => row.id === f.a1.id)!.disputeOpen,
    ).toBe(false);
  });
  it('authorizes details before invoking intelligence and returns the same 404 for missing/foreign orders', async () => {
    const f = await fixture();
    for (const [auth, id] of [
      [f.merchantAuth, f.bOrder.id],
      [f.buyerAuth, f.a2.id],
      [f.buyerAuth, f.unowned.id],
      [f.merchantAuth, randomUUID()],
    ] as const)
      await expect(f.reads.detail(auth, id)).rejects.toMatchObject({
        code: 'ORDER_NOT_FOUND',
        statusCode: 404,
      });
    expect(f.compute).not.toHaveBeenCalled();
    const detail = await f.reads.detail(f.merchantAuth, f.a1.id);
    expect(OrderDetailSchema.safeParse(detail).success).toBe(true);
    expect(detail.buyerSignal?.reasons[0]?.code).toBe('INTELLIGENCE_STUB');
    expect(f.compute).toHaveBeenCalledExactlyOnceWith(f.a1.id);
  });
  it('hides buyer signal, stock/packing/account and investigation fields from buyer details on both paths', async () => {
    const f = await fixture();
    const [cluster] = await database.db
      .insert(complaint_clusters)
      .values({
        merchant_id: f.m1.id,
        category: 'product_defect',
        label: 'PRIVATE-INVESTIGATION',
        centroid: [],
      })
      .returning();
    const [hypothesis] = await database.db
      .insert(hypotheses)
      .values({
        merchant_id: f.m1.id,
        cluster_id: cluster!.id,
        dimension: 'batch_code',
        value: 'PRIVATE-BATCH',
        status: 'open',
        strength: 'possible',
        stats: {},
        alternatives: [],
        affected: {
          unshipped: [f.a1.id],
          inTransit: [],
          deliveredNoComplaint: [],
          openDisputes: [],
        },
        explanation: 'PRIVATE-EXPLANATION',
      })
      .returning();
    await database.db
      .update(orders)
      .set({ hold_reason: 'PRIVATE-HOLD', held_by_hypothesis_id: hypothesis!.id })
      .where(eq(orders.id, f.a1.id));
    const merchantDetail = await f.reads.detail(f.merchantAuth, f.a1.id);
    expect(merchantDetail.sharedCauses).toEqual([
      { hypothesisId: hypothesis!.id, label: 'PRIVATE-INVESTIGATION', status: 'open' },
    ]);
    expect(merchantDetail.hold?.reason).toBe('PRIVATE-HOLD');
    expect(merchantDetail.items[0]!.batchCode).toBe('PRIVATE-BATCH');
    f.compute.mockClear();
    const buyerDetail = await f.reads.detail(f.buyerAuth, f.a1.id);
    expect(buyerDetail).toMatchObject({
      buyerSignal: null,
      hold: null,
      sharedCauses: [],
      buyer: { payerAccountStatus: null },
    });
    expect(buyerDetail.items[0]!.batchCode).toBeNull();
    expect(f.compute).not.toHaveBeenCalled();
    expect(JSON.stringify(buyerDetail)).not.toContain('PRIVATE-');
    expect(JSON.stringify(buyerDetail)).not.toContain(hypothesis!.id);
  });
  it('includes only the order’s merchant-scoped disputes and shipment, with actual ledger verification', async () => {
    const f = await fixture();
    await database.db.insert(shipments).values({
      order_id: f.a1.id,
      carrier: 'DHL',
      tracking_number: 'SYNTHETIC-TRACK',
      status: 'in_transit',
      last_scan_at: clock.now(),
      events: [{ private: 'EXCLUDED-SCAN-RAW' }],
    });
    const caseId = 'SEED-READ-' + randomUUID();
    await database.db.insert(disputes).values([
      {
        id: caseId,
        merchant_id: f.m1.id,
        order_id: f.a1.id,
        reason: 'ITEM_NOT_RECEIVED',
        status: 'OPEN',
        seller_response_due_date: clock.now(),
        raw: { private: 'EXCLUDED-DISPUTE-RAW' },
      },
      {
        id: 'SEED-FOREIGN-' + randomUUID(),
        merchant_id: f.m2.id,
        order_id: f.a1.id,
        reason: 'OTHER',
        status: 'OPEN',
        raw: {},
      },
    ]);
    await createLedger(database.db, clock).append(f.a1.id, {
      type: 'captured',
      payload: { synthetic: true },
    });
    const detail = await f.reads.detail(f.buyerAuth, f.a1.id);
    expect(detail.ledger).toEqual({ length: 1, verified: true });
    expect(detail.disputes).toEqual([
      { id: caseId, reason: 'ITEM_NOT_RECEIVED', status: 'OPEN', dueAt: clock.now().toISOString() },
    ]);
    expect(detail.shipment).toEqual({
      carrier: 'DHL',
      trackingNumber: 'SYNTHETIC-TRACK',
      status: 'in_transit',
      lastScanAt: clock.now().toISOString(),
    });
    expect(JSON.stringify(detail)).not.toContain('EXCLUDED');
    expect(JSON.stringify(detail)).not.toContain('SEED-FOREIGN');
    await database.pool.query('update ledger_entries set payload=$1 where order_id=$2', [
      JSON.stringify({ synthetic: false }),
      f.a1.id,
    ]);
    expect((await f.reads.detail(f.buyerAuth, f.a1.id)).ledger).toEqual({
      length: 1,
      verified: false,
    });
  });
  it('returns null unknown data and exact safe DTOs rather than full rows or hashes', async () => {
    const f = await fixture();
    const detail = await f.reads.detail(f.merchantAuth, f.unowned.id);
    expect(detail).toMatchObject({
      buyer: null,
      shipment: null,
      hold: null,
      disputes: [],
      sharedCauses: [],
      ledger: { length: 0, verified: true },
    });
    const serialized = JSON.stringify({
      detail,
      list: await f.reads.listMerchant(f.merchantAuth),
      buyer: await f.reads.listBuyer(f.buyerAuth),
    });
    for (const field of [
      'EXCLUDED',
      'packed_by',
      'paypal_payer_id',
      'email_hash',
      'ship_to_hash',
      'ship_to_postal',
      'invoice_id',
    ])
      expect(serialized).not.toContain(field);
  });
  it.each(['admin', 'agent'])('does not give %s an implicit private-order bypass', async (role) => {
    const f = await fixture();
    const auth = { role: role as 'admin' | 'agent', subjectId: f.m1.id };
    await expect(f.reads.detail(auth, f.a1.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(() => f.reads.listMerchant(auth)).toThrow('This role cannot access');
    expect(() => f.reads.listBuyer(auth)).toThrow('This role cannot access');
    expect(f.compute).not.toHaveBeenCalled();
  });
  it('rejects missing credentials, invalid IDs and wrong list roles without intelligence execution', async () => {
    const f = await fixture();
    await expect(f.reads.detail(null, f.a1.id)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(f.reads.detail(f.merchantAuth, 'not-a-uuid')).rejects.toMatchObject({
      code: 'INVALID_ORDER_ID',
    });
    expect(() => f.reads.listMerchant(f.buyerAuth)).toThrow('This role cannot access');
    expect(() => f.reads.listBuyer(f.merchantAuth)).toThrow('This role cannot access');
    expect(f.compute).not.toHaveBeenCalled();
  });
  it('rejects malformed intelligence output without exposing it', async () => {
    const f = await fixture();
    f.compute.mockResolvedValueOnce({ private: 'EXCLUDED-MODEL-RAW' } as unknown as Awaited<
      ReturnType<typeof computeBuyerSignal>
    >);
    await expect(f.reads.detail(f.merchantAuth, f.a1.id)).rejects.toMatchObject({
      code: 'BUYER_SIGNAL_INVALID',
      details: {},
    });
  });
});
