import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { alerts, buyer_network_simulated, buyer_signals, signal_contests } from '@fairfold/db';
import { computeBuyerSignal, computeBuyerSignalWith } from '../../src/buyerSignal/index.js';
import { createHandlers } from '../../src/handlers.js';
import { setIntelRuntime } from '../../src/runtime.js';
import { mockModel } from '../helpers/mockModel.js';
import { buildApi } from '../routes/api.js';
import {
  dbUrl,
  insertBuyer,
  insertDispute,
  insertMerchant,
  insertOrder,
  insertProduct,
  openTestDb,
  resetTables,
  testRuntime,
} from './harness.js';

const day = (iso: string) => new Date(iso);

describe.skipIf(!dbUrl)('buyer signal against Postgres', () => {
  let database: Awaited<ReturnType<typeof openTestDb>>;
  beforeAll(async () => {
    database = await openTestDb();
  });
  afterAll(async () => {
    setIntelRuntime(null);
    await database?.close();
  });
  beforeEach(async () => {
    await resetTables(database.db);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  async function store() {
    const merchant = await insertMerchant(database.db);
    const product = await insertProduct(database.db, merchant.id);
    // a few other buyers set the store median at 38.00
    for (const n of [1, 2, 3]) {
      const other = await insertBuyer(database.db, { display_name: `Other ${n}` });
      await insertOrder(database.db, { merchantId: merchant.id, buyerId: other.id, product });
    }
    return { merchant, product };
  }

  /** Alex R. (DECISIONS.md I-D5): 2 earlier orders, both refunded, one disputed and lost, new address. */
  async function alexOrder(merchantId: string, product: Awaited<ReturnType<typeof insertProduct>>) {
    const alex = await insertBuyer(database.db, { display_name: 'Alex R.' });
    const first = await insertOrder(database.db, {
      merchantId,
      buyerId: alex.id,
      product,
      status: 'refunded',
      shipToHash: 'addr-old',
      capturedAt: day('2026-08-01T10:00:00Z'),
      deliveredAt: day('2026-08-08T10:00:00Z'),
    });
    await insertOrder(database.db, {
      merchantId,
      buyerId: alex.id,
      product,
      status: 'refunded',
      shipToHash: 'addr-old',
      capturedAt: day('2026-09-01T10:00:00Z'),
      deliveredAt: day('2026-09-08T10:00:00Z'),
    });
    await insertDispute(database.db, {
      merchant_id: merchantId,
      order_id: first.order.id,
      status: 'RESOLVED',
      outcome_code: 'RESOLVED_SELLER_FAVOUR',
      raw: { create_time: '2026-08-20T10:00:00Z' },
    });
    const current = await insertOrder(database.db, {
      merchantId,
      buyerId: alex.id,
      product,
      payerAccountStatus: 'VERIFIED',
      shipToHash: 'addr-new',
      capturedAt: day('2026-11-09T09:00:00Z'),
    });
    return { alex, order: current.order };
  }

  it('Alex R. in the seed is yellow with OWN_DISPUTES_LOST, OWN_REFUND_RATIO and NEW_ADDRESS', async () => {
    const { merchant, product } = await store();
    const { order } = await alexOrder(merchant.id, product);
    const { runtime } = testRuntime(database.db);
    const signal = await computeBuyerSignalWith(runtime, order.id);
    expect(signal).toMatchObject({ band: 'yellow', points: 25, simulatedNetworkUsed: false });
    expect(signal.reasons.map((r) => r.code).sort()).toEqual([
      'NEW_ADDRESS',
      'OWN_DISPUTES_LOST',
      'OWN_REFUND_RATIO',
      'PAYER_VERIFIED',
    ]);
    expect(signal.sentence.length).toBeGreaterThan(0);
    const rows = await database.db
      .select()
      .from(buyer_signals)
      .where(eq(buyer_signals.order_id, order.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.features).toMatchObject({
      priorOrders: 2,
      refundedOrders: 2,
      newAddress: true,
      sentence: signal.sentence,
    });
  });

  it('a new buyer (Maya) is grey; the model writes the sentence from reason codes only', async () => {
    const { merchant, product } = await store();
    const maya = await insertBuyer(database.db, { display_name: 'Maya K.' });
    const { order } = await insertOrder(database.db, {
      merchantId: merchant.id,
      buyerId: maya.id,
      product,
      payerAccountStatus: 'VERIFIED',
      shipToHash: 'maya-street',
    });
    const { model, calls } = mockModel([
      { sentence: 'Maya is new to your store, so the signal is grey.' },
    ]);
    const { runtime } = testRuntime(database.db, { models: { text: model } });
    const signal = await computeBuyerSignalWith(runtime, order.id);
    expect(signal).toMatchObject({
      band: 'grey',
      sentence: 'Maya is new to your store, so the signal is grey.',
    });
    const prompt = JSON.stringify(calls[0]!.prompt);
    expect(prompt).not.toContain('Maya');
    expect(prompt).not.toContain('maya-street');
    expect(prompt).toContain('PAYER_VERIFIED');
  });

  it('velocity counts orders to the same address in 24 hours; network data is labelled simulated', async () => {
    const { merchant, product } = await store();
    const buyer = await insertBuyer(database.db);
    await insertOrder(database.db, {
      merchantId: merchant.id,
      buyerId: buyer.id,
      product,
      shipToHash: 'h',
      capturedAt: day('2026-10-01T00:00:00Z'),
      deliveredAt: day('2026-10-05T00:00:00Z'),
    });
    const stranger = await insertBuyer(database.db);
    await insertOrder(database.db, {
      merchantId: merchant.id,
      buyerId: stranger.id,
      product,
      shipToHash: 'h',
      capturedAt: day('2026-11-09T02:00:00Z'),
    });
    await insertOrder(database.db, {
      merchantId: merchant.id,
      buyerId: stranger.id,
      product,
      shipToHash: 'h',
      capturedAt: day('2026-11-09T03:00:00Z'),
    });
    const { order } = await insertOrder(database.db, {
      merchantId: merchant.id,
      buyerId: buyer.id,
      product,
      shipToHash: 'h',
      capturedAt: day('2026-11-09T09:00:00Z'),
    });
    await database.db.insert(buyer_network_simulated).values({
      buyer_id: buyer.id,
      disputes_filed_12m: 3,
      disputes_lost_by_buyer_12m: 2,
      merchants_transacted_12m: 5,
    });
    const { runtime } = testRuntime(database.db);
    const signal = await computeBuyerSignalWith(runtime, order.id);
    expect(signal.reasons.map((r) => r.code)).toEqual(
      expect.arrayContaining(['VELOCITY', 'NETWORK_DISPUTES_LOST']),
    );
    expect(signal.simulatedNetworkUsed).toBe(true);
  });

  it('the order.captured handler stores a signal', async () => {
    const { merchant, product } = await store();
    const { order } = await alexOrder(merchant.id, product);
    const { runtime } = testRuntime(database.db);
    await createHandlers(() => runtime)['order.captured']!({ orderId: order.id });
    const rows = await database.db
      .select()
      .from(buyer_signals)
      .where(eq(buyer_signals.order_id, order.id));
    expect(rows.map((r) => r.band)).toEqual(['yellow']);
  });

  describe('one signal per order, computed at capture (section 10)', () => {
    const signalRows = (orderId: string) =>
      database.db.select().from(buyer_signals).where(eq(buyer_signals.order_id, orderId));

    it('computeBuyerSignal returns the stored signal without a second row or model call', async () => {
      const { merchant, product } = await store();
      const { order } = await alexOrder(merchant.id, product);
      const { model, calls } = mockModel([
        { sentence: 'Written at capture.' },
        { sentence: 'Written again on a later read.' },
      ]);
      const { runtime } = testRuntime(database.db, { models: { text: model } });
      setIntelRuntime(runtime);
      await createHandlers(() => runtime)['order.captured']!({ orderId: order.id });

      const read = await computeBuyerSignal(order.id);

      expect(read).toMatchObject({ band: 'yellow', points: 25, sentence: 'Written at capture.' });
      expect(calls).toHaveLength(1);
      expect(await signalRows(order.id)).toHaveLength(1);
    });

    it('a redelivered order.captured job stores no second signal', async () => {
      const { merchant, product } = await store();
      const { order } = await alexOrder(merchant.id, product);
      const { runtime } = testRuntime(database.db);
      const captured = createHandlers(() => runtime)['order.captured']!;
      await captured({ orderId: order.id });
      await captured({ orderId: order.id });
      expect(await signalRows(order.id)).toHaveLength(1);
    });

    it('concurrent first reads store exactly one signal', async () => {
      const { merchant, product } = await store();
      const { order } = await alexOrder(merchant.id, product);
      const { runtime } = testRuntime(database.db);
      const results = await Promise.all(
        [1, 2, 3, 4].map(() => computeBuyerSignalWith(runtime, order.id)),
      );
      expect(new Set(results.map((r) => r.band))).toEqual(new Set(['yellow']));
      expect(await signalRows(order.id)).toHaveLength(1);
    });
  });

  describe('routes 9, 34, 35, 40, 41', () => {
    async function setup() {
      const { merchant, product } = await store();
      const { alex, order } = await alexOrder(merchant.id, product);
      const { runtime } = testRuntime(database.db);
      setIntelRuntime(runtime);
      const api = await buildApi();
      return { merchant, alex, order, ...api };
    }

    it('the merchant reads the signal for their own order; another store gets 403', async () => {
      const { app, as, merchant, order } = await setup();
      const own = await app.inject({
        url: `/api/orders/${order.id}/buyer-signal`,
        headers: await as('merchant', merchant.id),
      });
      expect(own.statusCode).toBe(200);
      expect(own.json()).toMatchObject({ band: 'yellow', points: 25 });
      const other = await insertMerchant(database.db);
      const denied = await app.inject({
        url: `/api/orders/${order.id}/buyer-signal`,
        headers: await as('merchant', other.id),
      });
      expect(denied.statusCode).toBe(403);
      expect(denied.json().error.code).toBe('FORBIDDEN');
      const asBuyer = await app.inject({
        url: `/api/orders/${order.id}/buyer-signal`,
        headers: await as('buyer', merchant.id),
      });
      expect(asBuyer.statusCode).toBe(403);
      await app.close();
    });

    it('a buyer cannot read or contest another buyer’s signal (403)', async () => {
      const { app, as, merchant, alex, order } = await setup();
      await app.inject({
        url: `/api/orders/${order.id}/buyer-signal`,
        headers: await as('merchant', merchant.id),
      });
      const mine = await app.inject({
        url: `/api/buyer/signal?merchantId=${merchant.id}`,
        headers: await as('buyer', alex.id),
      });
      expect(mine.statusCode).toBe(200);
      expect(mine.json()).toMatchObject({ band: 'yellow', simulatedNetworkUsed: false });
      expect(mine.json()).not.toHaveProperty('points');
      const someoneElse = await insertBuyer(database.db);
      const none = await app.inject({
        url: `/api/buyer/signal?merchantId=${merchant.id}`,
        headers: await as('buyer', someoneElse.id),
      });
      expect(none.statusCode).toBe(404);
      const steal = await app.inject({
        method: 'POST',
        url: '/api/buyer/signal/contest',
        headers: await as('buyer', someoneElse.id),
        payload: { signalId: mine.json().signalId, text: 'not mine' },
      });
      expect(steal.statusCode).toBe(403);
      await app.close();
    });

    it('a contest creates an alert; the merchant lists and resolves it once', async () => {
      const { app, as, merchant, alex, order } = await setup();
      await app.inject({
        url: `/api/orders/${order.id}/buyer-signal`,
        headers: await as('merchant', merchant.id),
      });
      const view = await app.inject({
        url: `/api/buyer/signal?merchantId=${merchant.id}`,
        headers: await as('buyer', alex.id),
      });
      const contest = await app.inject({
        method: 'POST',
        url: '/api/buyer/signal/contest',
        headers: await as('buyer', alex.id),
        payload: { signalId: view.json().signalId, text: 'The lost dispute was a courier error.' },
      });
      expect(contest.statusCode).toBe(200);
      const { contestId } = contest.json();
      const [alert] = await database.db.select().from(alerts).where(eq(alerts.ref_id, contestId));
      expect(alert).toMatchObject({
        type: 'signal_contest',
        merchant_id: merchant.id,
        order_id: order.id,
      });

      const list = await app.inject({
        url: '/api/merchant/signal-contests',
        headers: await as('merchant', merchant.id),
      });
      expect(list.json()).toEqual([
        expect.objectContaining({ id: contestId, status: 'open', buyerId: alex.id }),
      ]);
      const other = await insertMerchant(database.db);
      expect(
        (
          await app.inject({
            url: '/api/merchant/signal-contests',
            headers: await as('merchant', other.id),
          })
        ).json(),
      ).toEqual([]);

      const resolve = (headers: Record<string, string>) =>
        app.inject({
          method: 'POST',
          url: `/api/merchant/signal-contests/${contestId}/resolve`,
          headers,
          payload: { status: 'corrected', merchantNote: 'Courier confirmed the loss.' },
        });
      expect((await resolve(await as('merchant', other.id))).statusCode).toBe(403);
      const done = await resolve(await as('merchant', merchant.id));
      expect(done.statusCode).toBe(200);
      expect(done.json()).toMatchObject({
        status: 'corrected',
        merchantNote: 'Courier confirmed the loss.',
      });
      expect((await resolve(await as('merchant', merchant.id))).statusCode).toBe(409);
      await app.close();
    });

    it('two resolutions of one contest sent at once resolve it once', async () => {
      const { app, as, merchant, alex, order } = await setup();
      await app.inject({
        url: `/api/orders/${order.id}/buyer-signal`,
        headers: await as('merchant', merchant.id),
      });
      const view = await app.inject({
        url: `/api/buyer/signal?merchantId=${merchant.id}`,
        headers: await as('buyer', alex.id),
      });
      const { contestId } = (
        await app.inject({
          method: 'POST',
          url: '/api/buyer/signal/contest',
          headers: await as('buyer', alex.id),
          payload: {
            signalId: view.json().signalId,
            text: 'The lost dispute was a courier error.',
          },
        })
      ).json();
      const headers = await as('merchant', merchant.id);
      const resolve = (status: 'upheld' | 'corrected') =>
        app.inject({
          method: 'POST',
          url: `/api/merchant/signal-contests/${contestId}/resolve`,
          headers,
          payload: { status, merchantNote: `Resolved as ${status}.` },
        });
      const [first, second] = await Promise.all([resolve('upheld'), resolve('corrected')]);
      expect([first.statusCode, second.statusCode].sort()).toEqual([200, 409]);
      const winner = first.statusCode === 200 ? first : second;
      const [row] = await database.db
        .select()
        .from(signal_contests)
        .where(eq(signal_contests.id, contestId));
      expect(row).toMatchObject({
        status: winner.json().status,
        merchant_note: winner.json().merchantNote,
      });
      await app.close();
    });

    it('rejects an empty contest text with the validation envelope', async () => {
      const { app, as, alex } = await setup();
      const res = await app.inject({
        method: 'POST',
        url: '/api/buyer/signal/contest',
        headers: await as('buyer', alex.id),
        payload: { signalId: alex.id, text: '' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
      await app.close();
    });
  });
});
