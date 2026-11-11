// Concurrency: one scan per merchant at a time, the sweep queues scans, the complaint upsert is one statement, and a
// double-clicked Confirm or Dismiss applies once.
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError, fixedClock } from '@fairfold/contracts';
import {
  actions,
  attestations,
  complaint_clusters,
  complaints,
  hypotheses,
  messages,
  orders,
} from '@fairfold/db';
import { upsertComplaint } from '../../src/complaints/create.js';
import { setIntelRuntime } from '../../src/runtime.js';
import { confirmHypothesis, dismissHypothesis } from '../../src/sharedCause/confirm.js';
import { runSharedCauseScanWith, sweepSharedCauses } from '../../src/sharedCause/scan.js';
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
import { buildWorld } from './sharedCauseWorld.js';

const NOW = new Date('2026-11-09T12:00:00.000Z');

describe.skipIf(!dbUrl)('concurrency against Postgres', () => {
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

  it('two scans of one merchant at the same time give the result of one scan', async () => {
    const w = await buildWorld(database.db, NOW);
    const { runtime } = testRuntime(database.db, { clock: fixedClock(NOW) });
    const [a, b] = await Promise.all([
      runSharedCauseScanWith(runtime, w.merchant.id),
      runSharedCauseScanWith(runtime, w.merchant.id),
    ]);
    expect(a!.map((h) => h.id)).toEqual(b!.map((h) => h.id));
    const rows = await database.db.select().from(hypotheses);
    expect(rows).toHaveLength(1);
    expect((await database.db.select().from(actions)).map((x) => x.type).sort()).toEqual([
      'add_inspection_rule',
      'hold_orders',
      'send_buyer_messages',
    ]);
    const used = new Set(
      (await database.db.select().from(complaints)).map((c) => c.cluster_id).filter(Boolean),
    );
    const clusters = await database.db.select().from(complaint_clusters);
    expect(clusters.map((c) => c.id).sort()).toEqual([...used].sort()); // no orphan clusters
    expect(new Set((await database.db.select().from(messages)).map((m) => m.buyer_id)).size).toBe(
      38,
    );
    expect(await database.db.select().from(messages)).toHaveLength(38);
  });

  it('the nightly sweep queues one scan per merchant instead of scanning inline', async () => {
    const w = await buildWorld(database.db, NOW);
    const { runtime, jobs } = testRuntime(database.db, { clock: fixedClock(NOW) });
    await sweepSharedCauses(runtime);
    expect(jobs.published).toEqual([
      { name: 'sharedcause.scan', payload: { merchantId: w.merchant.id } },
    ]);
    expect(await database.db.select().from(hypotheses)).toEqual([]);
  });

  it('concurrent upserts of one complaint store one row with every text, and one of them is new', async () => {
    const merchant = await insertMerchant(database.db);
    const product = await insertProduct(database.db, merchant.id);
    const buyer = await insertBuyer(database.db);
    const { order } = await insertOrder(database.db, {
      merchantId: merchant.id,
      buyerId: buyer.id,
      product,
      status: 'delivered',
    });
    const { runtime } = testRuntime(database.db, { clock: fixedClock(NOW) });
    const texts = ['first', 'second', 'third', 'fourth', 'fifth'];
    const results = await Promise.all(
      texts.map((text) =>
        upsertComplaint(runtime, {
          merchantId: merchant.id,
          orderId: order.id,
          buyerId: buyer.id,
          source: 'dispute',
          sourceRef: 'PP-D-RACE',
          text,
        }),
      ),
    );
    const rows = await database.db
      .select()
      .from(complaints)
      .where(eq(complaints.source_ref, 'PP-D-RACE'));
    expect(rows).toHaveLength(1);
    expect(new Set(results.map((r) => r.id))).toEqual(new Set([rows[0]!.id]));
    expect(results.filter((r) => r.isNew)).toHaveLength(1);
    expect(rows[0]!.text.split('\n\n').sort()).toEqual([...texts].sort());
    expect(rows[0]!.product_id).toBe(product.id); // the single item, set on insert
  });

  async function scannedWithDispute() {
    const w = await buildWorld(database.db, NOW);
    const { runtime, jobs } = testRuntime(database.db, { clock: fixedClock(NOW) });
    const [h] = await runSharedCauseScanWith(runtime, w.merchant.id);
    await insertDispute(database.db, {
      merchant_id: w.merchant.id,
      order_id: w.seamB17Orders[0],
      status: 'WAITING_FOR_SELLER_RESPONSE',
    });
    await database.db.insert(attestations).values({
      order_id: null,
      hypothesis_id: h!.id,
      batch_code: 'B17',
      step: 'inspection',
      photo_shas: ['a'.repeat(64)],
      photo_labels: ['seam_closeup'],
      model: 'mock-vision',
      status: 'match',
      confidence: 0.9,
      result: {
        items: [],
        batchLabelText: 'B17',
        shippingLabel: { visible: false, trackingNumberText: null },
        defects: [{ component: 'sleeve seam', description: 'open stitch', severity: 'functional' }],
        inspection: {
          instruction: 'Photograph the seam',
          defectVisible: true,
          matchesCluster: true,
        },
        couldNotVerify: [],
        confidence: 0.9,
      },
    });
    return { w, runtime, jobs, h: h! };
  }

  const settledOnce = (results: PromiseSettledResult<unknown>[], code: string) => {
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(AppError);
    expect((rejected[0]!.reason as AppError).code).toBe(code);
  };

  it('a double-clicked Confirm applies once', async () => {
    const { w, runtime, jobs, h } = await scannedWithDispute();
    const before = (await database.db.select().from(messages)).length;
    settledOnce(
      await Promise.allSettled([
        confirmHypothesis(runtime, w.merchant.id, h.id),
        confirmHypothesis(runtime, w.merchant.id, h.id),
      ]),
      'HYPOTHESIS_NOT_OPEN',
    );
    const offers = await database.db
      .select()
      .from(actions)
      .where(and(eq(actions.hypothesis_id, h.id), eq(actions.type, 'propose_offers')));
    expect(offers).toHaveLength(1);
    expect(jobs.published.filter((j) => j.name === 'evidence.rebuild')).toHaveLength(1);
    expect((await database.db.select().from(messages)).length).toBe(before + 38);
  });

  it('a double-clicked Dismiss applies once', async () => {
    const { w, runtime, h } = await scannedWithDispute();
    await database.db
      .update(orders)
      .set({ hold_reason: 'shared_cause', held_by_hypothesis_id: h.id })
      .where(eq(orders.id, w.unshipped[0]!));
    settledOnce(
      await Promise.allSettled([
        dismissHypothesis(runtime, w.merchant.id, h.id, 'Inspected, all fine'),
        dismissHypothesis(runtime, w.merchant.id, h.id, 'Inspected, all fine'),
      ]),
      'HYPOTHESIS_NOT_OPEN',
    );
    const releases = await database.db
      .select()
      .from(actions)
      .where(and(eq(actions.hypothesis_id, h.id), eq(actions.type, 'release_orders')));
    expect(releases).toHaveLength(1);
  });
});
