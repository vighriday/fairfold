import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixedClock } from '@fairfold/contracts';
import { attestations, complaints, merchants, reviews, store_reports } from '@fairfold/db';
import { createLedger } from '@fairfold/ledger';
import { searchCatalogWith } from '../../src/catalog.js';
import { createHandlers } from '../../src/handlers.js';
import { setIntelRuntime } from '../../src/runtime.js';
import { buildStoreReportWith } from '../../src/storeReport/index.js';
import { mockModel } from '../helpers/mockModel.js';
import { buildApi } from '../routes/api.js';
import {
  dbUrl,
  insertBuyer,
  insertMerchant,
  insertOrder,
  insertProduct,
  openTestDb,
  resetTables,
  testRuntime,
} from './harness.js';

const NOW = new Date('2026-11-09T12:00:00.000Z');
const daysAgo = (d: number, hours = 0) =>
  new Date(NOW.getTime() - d * 86_400_000 + hours * 3_600_000);

describe.skipIf(!dbUrl)('store report against Postgres', () => {
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

  /** n sealed orders captured `ago` days back; tracking pushed `trackingHours` after capture (null = never). */
  async function sealedOrders(
    merchantId: string,
    product: Awaited<ReturnType<typeof insertProduct>>,
    n: number,
    opts: { trackingHours: number | null; attestation: 'match' | 'mismatch' | null },
  ) {
    const buyer = await insertBuyer(database.db);
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const capturedAt = daysAgo(10 + i);
      const { order } = await insertOrder(database.db, {
        merchantId,
        buyerId: buyer.id,
        product,
        status: 'shipped',
        capturedAt,
        sealedAt: new Date(capturedAt.getTime() + 20 * 3_600_000),
      });
      if (opts.trackingHours !== null) {
        const pushedAt = new Date(capturedAt.getTime() + opts.trackingHours * 3_600_000);
        await createLedger(database.db, fixedClock(pushedAt)).append(order.id, {
          type: 'tracking_pushed',
          payload: { synthetic: true },
        });
      }
      if (opts.attestation) {
        await database.db.insert(attestations).values({
          order_id: order.id,
          step: 'pack',
          photo_shas: [],
          photo_labels: [],
          model: 'seed',
          result: {},
          status: opts.attestation,
          confidence: 0.9,
        });
      }
      ids.push(order.id);
    }
    return { buyer, ids };
  }

  async function neel() {
    const merchant = await insertMerchant(database.db, {
      name: 'Neel Block Prints',
      policy_urls: [
        { kind: 'returns', url: 'https://neelblockprints.example/returns' },
        { kind: 'bad', url: 'x' },
      ],
      domain_registered_at: new Date('2019-03-01T00:00:00Z'),
    });
    const product = await insertProduct(database.db, merchant.id);
    const { buyer, ids } = await sealedOrders(merchant.id, product, 25, {
      trackingHours: 30,
      attestation: 'match',
    });
    return { merchant, product, buyer, ids };
  }

  async function quickTees() {
    const merchant = await insertMerchant(database.db, {
      name: 'QuickTees',
      domain: 'quicktees.example',
    });
    const product = await insertProduct(database.db, merchant.id, {
      sku: 'QT-01',
      name: 'Plain navy tee',
      unit_value: '12.00',
    });
    const { ids } = await sealedOrders(merchant.id, product, 12, {
      trackingHours: 100,
      attestation: null,
    });
    for (const [i, orderId] of ids.slice(0, 4).entries()) {
      await database.db.insert(complaints).values({
        merchant_id: merchant.id,
        order_id: orderId,
        source: 'buyer_report',
        source_ref: `qt-${i}`,
        text: 'Never arrived.',
        extracted: { category: 'not_received' },
        created_at: daysAgo(5),
      });
    }
    return { merchant, product };
  }

  it('A14 shape: Neel is verified, QuickTees is caution, every theme cites its reviews', async () => {
    const n = await neel();
    const q = await quickTees();
    const other = await insertMerchant(database.db, { name: 'Elsewhere' });
    const otherProduct = await insertProduct(database.db, other.id, { sku: 'EL-1' });
    // a reviewer who also bought elsewhere counts at full weight
    await insertOrder(database.db, {
      merchantId: other.id,
      buyerId: n.buyer.id,
      product: otherProduct,
    });
    const reviewIds: string[] = [];
    for (const [i, orderId] of n.ids.slice(0, 3).entries()) {
      const [r] = await database.db
        .insert(reviews)
        .values({
          merchant_id: n.merchant.id,
          order_id: orderId,
          buyer_id: n.buyer.id,
          rating: [5, 4, 5][i]!,
          text: ['Beautiful print', 'Print slightly faded', 'Lovely colours'][i]!,
          created_at: daysAgo(3 - i),
        })
        .returning();
      reviewIds.push(r!.id);
    }
    const { model } = mockModel([
      {
        themes: [
          {
            label: 'Print quality',
            tone: 'positive',
            reviewIds: [reviewIds[0], reviewIds[2], 'invented'],
          },
        ],
      },
    ]);
    const { runtime } = testRuntime(database.db, {
      clock: fixedClock(NOW),
      models: { text: model },
      env: { APP_BASE_URL: 'https://fairfold.example.com' },
    });

    const neelReport = await buildStoreReportWith(runtime, n.merchant.id);
    expect(neelReport.band).toBe('verified');
    expect(neelReport.fulfilment).toMatchObject({
      ordersSealed90d: 25,
      medianHoursCaptureToSeal: 20,
      pctTrackingWithin72h: 1,
      pctWithPackingEvidence: 1,
      disputeRate90d: 0,
    });
    expect(neelReport.reviews).toMatchObject({ count: 3, average: 4.67 });
    expect(neelReport.reviews.themes).toEqual([
      {
        label: 'Print quality',
        tone: 'positive',
        count: 2,
        reviewIds: [reviewIds[0], reviewIds[2]],
      },
    ]);
    expect(neelReport.facts).toEqual({
      domain: 'neelblockprints.example',
      domainRegisteredAt: '2019-03-01T00:00:00.000Z',
      policies: [{ kind: 'returns', url: 'https://neelblockprints.example/returns' }],
    });
    expect(neelReport.sources.map((s) => s.label)).toEqual([
      'Returns policy',
      'Verified-payment reviews',
    ]);

    const qtReport = await buildStoreReportWith(runtime, q.merchant.id);
    expect(qtReport.band).toBe('caution');
    expect(qtReport.fulfilment).toMatchObject({
      ordersSealed90d: 12,
      pctTrackingWithin72h: 0,
      unansweredNotReceived: 4,
    });
    const stored = await database.db.select().from(store_reports);
    expect(stored).toHaveLength(2);
  });

  it('rdap failure keeps the stored registration date of a real domain', async () => {
    const merchant = await insertMerchant(database.db, {
      domain: 'neelprints.in',
      is_simulated: false,
      domain_registered_at: new Date('2020-01-01T00:00:00Z'),
    });
    const failing = vi.fn(async () => {
      throw new Error('network down');
    });
    const { runtime } = testRuntime(database.db, {
      clock: fixedClock(NOW),
      fetch: failing as typeof fetch,
    });
    const report = await buildStoreReportWith(runtime, merchant.id);
    expect(failing).toHaveBeenCalledOnce();
    expect(report.facts.domainRegisteredAt).toBe('2020-01-01T00:00:00.000Z');
    expect(report.band).toBe('new');
    expect(report.sources).toContainEqual({
      label: 'Domain registration (RDAP)',
      url: 'https://rdap.org/domain/neelprints.in',
    });
  });

  it('rdap success updates the merchant registration date', async () => {
    const merchant = await insertMerchant(database.db, {
      domain: 'neelprints.in',
      is_simulated: false,
    });
    const ok = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            events: [{ eventAction: 'registration', eventDate: '2015-05-05T00:00:00Z' }],
          }),
        ),
    );
    const { runtime } = testRuntime(database.db, {
      clock: fixedClock(NOW),
      fetch: ok as typeof fetch,
    });
    expect((await buildStoreReportWith(runtime, merchant.id)).facts.domainRegisteredAt).toBe(
      '2015-05-05T00:00:00.000Z',
    );
    const [m] = await database.db.select().from(merchants).where(eq(merchants.id, merchant.id));
    expect(m!.domain_registered_at).toEqual(new Date('2015-05-05T00:00:00Z'));
  });

  it('searchCatalog matches name or sku, filters by price and carries each store band', async () => {
    const n = await neel();
    const q = await quickTees();
    const { runtime } = testRuntime(database.db, { clock: fixedClock(NOW) });
    await buildStoreReportWith(runtime, n.merchant.id);
    const navy = await searchCatalogWith(runtime, { query: 'NAVY' });
    expect(navy).toEqual([
      {
        merchantId: q.merchant.id,
        sku: 'QT-01',
        name: 'Plain navy tee',
        price: { currency_code: 'USD', value: '12.00' },
        storeBand: 'caution',
      },
    ]);
    const cheap = await searchCatalogWith(runtime, { query: '', maxPrice: 20 });
    expect(cheap.map((c) => c.sku)).toEqual(['QT-01']);
    const hoodie = await searchCatalogWith(runtime, { query: 'hd-ind' });
    expect(hoodie).toEqual([expect.objectContaining({ sku: 'HD-IND-01', storeBand: 'verified' })]);
    expect(await searchCatalogWith(runtime, { query: '%' })).toEqual([]);
  });

  it('the storereport.refresh handler upserts the report', async () => {
    const n = await neel();
    const { runtime } = testRuntime(database.db, { clock: fixedClock(NOW) });
    await createHandlers(() => runtime)['storereport.refresh']!({ merchantId: n.merchant.id });
    await createHandlers(() => runtime)['storereport.refresh']!({ merchantId: n.merchant.id });
    const rows = await database.db
      .select()
      .from(store_reports)
      .where(eq(store_reports.merchant_id, n.merchant.id));
    expect(rows).toHaveLength(1);
  });

  describe('routes 5, 6, 29, 33, 42', () => {
    it('public report, catalogue and reviews; replies only by the owner', async () => {
      const n = await neel();
      const { runtime } = testRuntime(database.db, { clock: fixedClock(NOW) });
      setIntelRuntime(runtime);
      const { app, as } = await buildApi();
      const report = await app.inject(`/api/stores/${n.merchant.id}/report`);
      expect(report.statusCode).toBe(200);
      expect(report.json().band).toBe('verified');
      expect(
        (await app.inject('/api/stores/00000000-0000-4000-8000-0000000000ff/report')).statusCode,
      ).toBe(404);
      expect((await app.inject('/api/catalog?q=hoodie&maxPrice=40')).json()).toHaveLength(1);
      expect((await app.inject('/api/catalog?maxPrice=-3')).statusCode).toBe(400);

      const review = await app.inject({
        method: 'POST',
        url: `/api/buyer/orders/${n.ids[0]}/review`,
        headers: await as('buyer', n.buyer.id),
        payload: { rating: 5, text: 'Lovely print' },
      });
      expect(review.statusCode).toBe(200);
      expect(review.json()).toMatchObject({ rating: 5, weight: 0.5, merchantReply: null });
      const again = await app.inject({
        method: 'POST',
        url: `/api/buyer/orders/${n.ids[0]}/review`,
        headers: await as('buyer', n.buyer.id),
        payload: { rating: 4, text: 'Second try' },
      });
      expect(again.statusCode).toBe(409);
      const stranger = await insertBuyer(database.db);
      const notMine = await app.inject({
        method: 'POST',
        url: `/api/buyer/orders/${n.ids[1]}/review`,
        headers: await as('buyer', stranger.id),
        payload: { rating: 5, text: 'x' },
      });
      expect(notMine.statusCode).toBe(403);

      const other = await insertMerchant(database.db);
      const reply = (merchantId: string) =>
        as('merchant', merchantId).then((headers) =>
          app.inject({
            method: 'POST',
            url: `/api/reviews/${review.json().id}/reply`,
            headers,
            payload: { text: 'Thank you!' },
          }),
        );
      expect((await reply(other.id)).statusCode).toBe(403);
      expect((await reply(n.merchant.id)).json()).toMatchObject({ merchantReply: 'Thank you!' });
      const list = await app.inject(`/api/stores/${n.merchant.id}/reviews`);
      expect(list.json()).toEqual([
        expect.objectContaining({ id: review.json().id, merchantReply: 'Thank you!' }),
      ]);
      await app.close();
    });

    it('a 1-2 star review also becomes a complaint and schedules extraction and a report refresh', async () => {
      const n = await neel();
      const { runtime, jobs } = testRuntime(database.db, { clock: fixedClock(NOW) });
      setIntelRuntime(runtime);
      const { app, as } = await buildApi();
      const res = await app.inject({
        method: 'POST',
        url: `/api/buyer/orders/${n.ids[2]}/review`,
        headers: await as('buyer', n.buyer.id),
        payload: { rating: 2, text: 'The sleeve seam opened after one wash.' },
      });
      expect(res.statusCode).toBe(200);
      const [c] = await database.db
        .select()
        .from(complaints)
        .where(eq(complaints.source_ref, res.json().id));
      expect(c).toMatchObject({
        source: 'review',
        order_id: n.ids[2],
        product_id: n.product.id,
        buyer_id: n.buyer.id,
      });
      expect(jobs.published).toEqual([
        { name: 'complaint.created', payload: { complaintId: c!.id } },
        { name: 'storereport.refresh', payload: { merchantId: n.merchant.id } },
      ]);
      await app.close();
    });
  });
});
