// Section 11: "list endpoints accept ?limit= (default 50) and ?cursor=". Same convention as Hriday's order lists:
// newest first, and the cursor is the id of the last item already received (the catalogue, whose items have no id,
// uses the last item's `merchantId:sku`). An unknown cursor is refused with 400 INVALID_CURSOR.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buyer_signals,
  complaint_clusters,
  hypotheses,
  reviews,
  signal_contests,
} from '@fairfold/db';
import { setIntelRuntime } from '../../src/runtime.js';
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

const at = (minute: number) => new Date(Date.UTC(2026, 10, 1, 10, minute));
const EMPTY_AFFECTED = { unshipped: [], inTransit: [], deliveredNoComplaint: [], openDisputes: [] };

describe.skipIf(!dbUrl)('list endpoints page with ?limit= and ?cursor= (section 11)', () => {
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
    setIntelRuntime(testRuntime(database.db).runtime);
  });

  const ids = (body: Array<{ id: string }>) => body.map((r) => r.id);

  it('endpoint 42: store reviews, newest first', async () => {
    const merchant = await insertMerchant(database.db);
    const product = await insertProduct(database.db, merchant.id);
    const made: string[] = [];
    for (const minute of [1, 2, 3, 4, 5]) {
      const buyer = await insertBuyer(database.db);
      const { order } = await insertOrder(database.db, {
        merchantId: merchant.id,
        buyerId: buyer.id,
        product,
      });
      const [r] = await database.db
        .insert(reviews)
        .values({
          merchant_id: merchant.id,
          order_id: order.id,
          buyer_id: buyer.id,
          rating: 5,
          text: `Review ${minute}`,
          created_at: at(minute),
        })
        .returning();
      made.push(r!.id);
    }
    const { app } = await buildApi();
    const url = (q: string) => `/api/stores/${merchant.id}/reviews${q}`;
    const first = await app.inject({ url: url('?limit=2') });
    expect(ids(first.json())).toEqual([made[4], made[3]]);
    const second = await app.inject({ url: url(`?limit=2&cursor=${made[3]}`) });
    expect(ids(second.json())).toEqual([made[2], made[1]]);
    const last = await app.inject({ url: url(`?limit=2&cursor=${made[1]}`) });
    expect(ids(last.json())).toEqual([made[0]]);
    expect(ids((await app.inject({ url: url('') })).json())).toHaveLength(5);

    const unknown = await app.inject({ url: url(`?cursor=${randomUUID()}`) });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().error.code).toBe('INVALID_CURSOR');
    expect((await app.inject({ url: url('?limit=0') })).statusCode).toBe(400);
    expect((await app.inject({ url: url('?limit=101') })).statusCode).toBe(400);
    await app.close();
  });

  it('endpoint 40: signal contests, newest first, and a cursor from another store is refused', async () => {
    const merchant = await insertMerchant(database.db);
    const product = await insertProduct(database.db, merchant.id);
    const buyer = await insertBuyer(database.db);
    const { order } = await insertOrder(database.db, {
      merchantId: merchant.id,
      buyerId: buyer.id,
      product,
    });
    const [signal] = await database.db
      .insert(buyer_signals)
      .values({
        merchant_id: merchant.id,
        buyer_id: buyer.id,
        order_id: order.id,
        band: 'yellow',
        points: 25,
        reasons: [],
        features: {},
        recommendation: 'Capture extra packing evidence and ship tracked',
      })
      .returning();
    const made: string[] = [];
    for (const minute of [1, 2, 3]) {
      const [c] = await database.db
        .insert(signal_contests)
        .values({
          buyer_id: buyer.id,
          signal_id: signal!.id,
          text: `Contest ${minute}`,
          created_at: at(minute),
        })
        .returning();
      made.push(c!.id);
    }
    const { app, as } = await buildApi();
    const headers = await as('merchant', merchant.id);
    const url = (q: string) => `/api/merchant/signal-contests${q}`;
    expect(ids((await app.inject({ url: url('?limit=2'), headers })).json())).toEqual([
      made[2],
      made[1],
    ]);
    expect(
      ids((await app.inject({ url: url(`?limit=2&cursor=${made[1]}`), headers })).json()),
    ).toEqual([made[0]]);
    const other = await insertMerchant(database.db);
    const foreign = await app.inject({
      url: url(`?cursor=${made[1]}`),
      headers: await as('merchant', other.id),
    });
    expect(foreign.statusCode).toBe(400);
    expect(foreign.json().error.code).toBe('INVALID_CURSOR');
    await app.close();
  });

  it('endpoint 22: shared causes, newest first', async () => {
    const merchant = await insertMerchant(database.db);
    const [cluster] = await database.db
      .insert(complaint_clusters)
      .values({
        merchant_id: merchant.id,
        category: 'product_defect',
        label: 'sleeve seam: stitching came apart',
        centroid: [1, 0],
      })
      .returning();
    const made: string[] = [];
    for (const [minute, value] of [
      [1, 'B15'],
      [2, 'B16'],
      [3, 'B17'],
    ] as const) {
      const [h] = await database.db
        .insert(hypotheses)
        .values({
          merchant_id: merchant.id,
          cluster_id: cluster!.id,
          dimension: 'batch_code',
          value,
          strength: 'possible',
          stats: {},
          alternatives: [],
          affected: EMPTY_AFFECTED,
          explanation: 'From the stats.',
          created_at: at(minute),
        })
        .returning();
      made.push(h!.id);
    }
    const { app, as } = await buildApi();
    const headers = await as('merchant', merchant.id);
    expect(ids((await app.inject({ url: '/api/shared-causes?limit=2', headers })).json())).toEqual([
      made[2],
      made[1],
    ]);
    expect(
      ids(
        (await app.inject({ url: `/api/shared-causes?limit=2&cursor=${made[1]}`, headers })).json(),
      ),
    ).toEqual([made[0]]);
    await app.close();
  });

  it('endpoint 6: the catalogue, by name, with the last item’s merchantId:sku as the cursor', async () => {
    const a = await insertMerchant(database.db);
    const b = await insertMerchant(database.db, { name: 'Indigo Loom', domain: 'indigo.example' });
    await insertProduct(database.db, a.id, { sku: 'A1', name: 'Alpha hoodie' });
    await insertProduct(database.db, a.id, { sku: 'B1', name: 'Beta tee' });
    await insertProduct(database.db, b.id, { sku: 'G1', name: 'Gamma cap' });
    const { app } = await buildApi();
    const names = (res: { json(): Array<{ name: string }> }) => res.json().map((i) => i.name);
    const first = await app.inject({ url: '/api/catalog?limit=2' });
    expect(names(first)).toEqual(['Alpha hoodie', 'Beta tee']);
    const next = await app.inject({ url: `/api/catalog?limit=2&cursor=${a.id}:B1` });
    expect(names(next)).toEqual(['Gamma cap']);
    const bad = await app.inject({ url: `/api/catalog?cursor=${a.id}:NOPE` });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('INVALID_CURSOR');
    await app.close();
  });
});
