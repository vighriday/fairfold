import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError, fixedClock } from '@fairfold/contracts';
import {
  actions,
  attestations,
  hypotheses,
  inventory_batches,
  messages,
  orders,
} from '@fairfold/db';
import { setIntelRuntime } from '../../src/runtime.js';
import { draftBuyerMessagesWith } from '../../src/sharedCause/actions.js';
import { confirmHypothesis, dismissHypothesis } from '../../src/sharedCause/confirm.js';
import { runSharedCauseScanWith } from '../../src/sharedCause/scan.js';
import { hypothesisTrend, weekStart } from '../../src/sharedCause/trend.js';
import { hypothesisDetail, listHypotheses } from '../../src/sharedCause/views.js';
import {
  dbUrl,
  insertBatch,
  insertBuyer,
  insertDispute,
  insertMerchant,
  insertOrder,
  openTestDb,
  resetTables,
  testRuntime,
} from './harness.js';
import { buildWorld } from './sharedCauseWorld.js';
import { mockModel } from '../helpers/mockModel.js';

const NOW = new Date('2026-11-09T12:00:00.000Z');

async function rejection(p: Promise<unknown>): Promise<AppError> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(AppError);
  return e as AppError;
}

describe.skipIf(!dbUrl)('shared cause views, confirm, dismiss and trend against Postgres', () => {
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

  async function scanned() {
    const w = await buildWorld(database.db, NOW);
    const { runtime, jobs } = testRuntime(database.db, { clock: fixedClock(NOW) });
    const [h] = await runSharedCauseScanWith(runtime, w.merchant.id);
    return { w, runtime, jobs, h: h! };
  }

  async function inspect(hypothesisId: string, units: Array<boolean>) {
    await database.db.insert(attestations).values(
      units.map((defective) => ({
        order_id: null,
        hypothesis_id: hypothesisId,
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
          defects: defective
            ? [{ component: 'sleeve seam', description: 'open stitch', severity: 'functional' }]
            : [],
          inspection: {
            instruction: 'Photograph the sleeve seam',
            defectVisible: defective,
            matchesCluster: defective,
          },
          couldNotVerify: [],
          confidence: 0.9,
        },
      })),
    );
  }

  it('endpoints 22 and 23: summary and detail for the owner only', async () => {
    const { w, runtime, h } = await scanned();
    const list = await listHypotheses(runtime, w.merchant.id);
    expect(list).toEqual([
      {
        id: h.id,
        headline: 'Possible shared product issue: batch B17',
        status: 'open',
        strength: 'strong',
        dimension: 'batch_code',
        value: 'B17',
        complaintCount: 6,
        unshippedCount: 18,
        safetyFlag: false,
        createdAt: NOW.toISOString(),
      },
    ]);
    const detail = await hypothesisDetail(runtime, w.merchant.id, h.id);
    expect(detail.cluster).toMatchObject({
      label: 'sleeve seam: stitching came apart',
      category: 'product_defect',
    });
    expect(detail.cluster.complaints).toHaveLength(6);
    expect(detail.actions.map((a) => a.type).sort()).toEqual([
      'add_inspection_rule',
      'hold_orders',
      'send_buyer_messages',
    ]);
    expect(detail.stats.primary.value).toBe('B17');
    const other = await insertMerchant(database.db);
    expect((await rejection(hypothesisDetail(runtime, other.id, h.id))).statusCode).toBe(403);
    expect(await listHypotheses(runtime, other.id)).toEqual([]);
  });

  it('confirm needs a defective inspected unit; ten clean units suggest Dismiss', async () => {
    const { w, runtime, h } = await scanned();
    const none = await rejection(confirmHypothesis(runtime, w.merchant.id, h.id));
    expect(none).toMatchObject({
      code: 'NO_DEFECTIVE_UNIT',
      statusCode: 409,
      details: { inspected: 0, defective: 0, suggestDismiss: false },
    });
    await inspect(h.id, Array(10).fill(false));
    const clean = await rejection(confirmHypothesis(runtime, w.merchant.id, h.id));
    expect(clean.details).toEqual({ inspected: 10, defective: 0, clean: 10, suggestDismiss: true });
  });

  it('confirm: confirmed, propose_offers for open disputes, confirmed-level drafts and a pack rebuild', async () => {
    const { w, runtime, jobs, h } = await scanned();
    const dispute = await insertDispute(database.db, {
      merchant_id: w.merchant.id,
      order_id: w.seamB17Orders[0],
      status: 'WAITING_FOR_SELLER_RESPONSE',
    });
    const draftsBefore = (await database.db.select().from(messages)).length;
    await inspect(h.id, [false, true]);

    const detail = await confirmHypothesis(runtime, w.merchant.id, h.id);
    expect(detail).toMatchObject({
      status: 'confirmed',
      headline: 'Confirmed shared product issue: batch B17',
    });
    const [row] = await database.db.select().from(hypotheses).where(eq(hypotheses.id, h.id));
    expect(row!.confirmed_at).toEqual(NOW);
    const offers = detail.actions.find((a) => a.type === 'propose_offers');
    expect(offers).toMatchObject({ status: 'proposed', payload: { disputeIds: [dispute.id] } });
    const sends = detail.actions.filter((a) => a.type === 'send_buyer_messages');
    expect(sends.map((a) => (a.payload as { level: string }).level).sort()).toEqual([
      'confirmed',
      'suspected',
    ]);
    const confirmedIds = (
      sends.find((a) => (a.payload as { level: string }).level === 'confirmed')!.payload as {
        messageIds: string[];
      }
    ).messageIds;
    expect(confirmedIds).toHaveLength(38);
    expect((await database.db.select().from(messages)).length).toBe(draftsBefore + 38);
    const [one] = await database.db
      .select()
      .from(messages)
      .where(eq(messages.id, confirmedIds[0]!));
    expect(one!.body).toMatch(/we found a fault in one production batch/);
    expect(jobs.published).toContainEqual({
      name: 'evidence.rebuild',
      payload: { disputeIds: [dispute.id] },
    });
    expect((await rejection(confirmHypothesis(runtime, w.merchant.id, h.id))).code).toBe(
      'HYPOTHESIS_NOT_OPEN',
    );

    // a re-scan of a confirmed hypothesis updates its stats but proposes nothing new
    const before = (await database.db.select().from(actions)).length;
    await runSharedCauseScanWith(runtime, w.merchant.id);
    expect((await database.db.select().from(actions)).length).toBe(before);
  });

  it('dismiss: dismissed, release_orders for held orders, proposed actions withdrawn', async () => {
    const { w, runtime, h } = await scanned();
    const held = w.unshipped.slice(0, 3).sort();
    await database.db
      .update(orders)
      .set({ hold_reason: 'shared_cause', held_by_hypothesis_id: h.id })
      .where(inArray(orders.id, held));
    const detail = await dismissHypothesis(
      runtime,
      w.merchant.id,
      h.id,
      'Inspected 12 units, all fine',
    );
    expect(detail.status).toBe('dismissed');
    const release = detail.actions.find((a) => a.type === 'release_orders');
    expect(release).toMatchObject({
      status: 'proposed',
      payload: { orderIds: held, reason: 'Inspected 12 units, all fine' },
    });
    const withdrawn = await database.db
      .select()
      .from(actions)
      .where(and(eq(actions.hypothesis_id, h.id), eq(actions.status, 'failed')));
    expect(withdrawn.map((a) => a.type).sort()).toEqual([
      'add_inspection_rule',
      'hold_orders',
      'send_buyer_messages',
    ]);
    expect(withdrawn[0]!.result).toEqual({
      withdrawn: 'hypothesis_dismissed',
      reason: 'Inspected 12 units, all fine',
    });
    expect((await rejection(dismissHypothesis(runtime, w.merchant.id, h.id, 'again'))).code).toBe(
      'HYPOTHESIS_NOT_OPEN',
    );
    // a dismissed hypothesis stays dismissed on re-scan and gets no new proposals
    const [again] = await runSharedCauseScanWith(runtime, w.merchant.id);
    expect(again!.status).toBe('dismissed');
    expect(
      (
        await database.db
          .select()
          .from(actions)
          .where(and(eq(actions.hypothesis_id, h.id), eq(actions.status, 'proposed')))
      ).map((a) => a.type),
    ).toEqual(['release_orders']);
  });

  it('buyer messages: one Message Drafter call per hypothesis and level, filled per buyer', async () => {
    const w = await buildWorld(database.db, NOW);
    const { model, calls } = mockModel([
      {
        subject: 'Your {product}',
        body: 'We are checking a possible seam issue. If order {order} shows it, reply here.',
      },
    ]);
    const { runtime } = testRuntime(database.db, {
      clock: fixedClock(NOW),
      models: { text: model },
    });
    const [h] = await runSharedCauseScanWith(runtime, w.merchant.id);
    const drafted = await database.db.select().from(messages);
    expect(drafted.length).toBeGreaterThan(1);
    expect(calls).toHaveLength(1);
    const orderRefs = await database.db
      .select({ id: orders.id, invoice: orders.invoice_id })
      .from(orders)
      .where(
        inArray(
          orders.id,
          drafted.map((m) => m.order_id!),
        ),
      );
    const refOf = new Map(orderRefs.map((o) => [o.id, o.invoice]));
    for (const m of drafted) {
      expect(m.subject).toBe('Your Block-print cotton hoodie');
      expect(m.body).toBe(
        `We are checking a possible seam issue. If order ${refOf.get(m.order_id!)} shows it, reply here.`,
      );
    }

    // a new affected buyer on a re-run reuses the stored template: no model call
    const buyer = await insertBuyer(database.db, { display_name: 'Ravi P.' });
    const { order } = await insertOrder(database.db, {
      merchantId: w.merchant.id,
      buyerId: buyer.id,
      product: w.hoodie,
      status: 'shipped',
      batchCode: 'B17',
      shippedAt: new Date('2026-11-07T00:00:00Z'),
    });
    const [row] = await database.db.select().from(hypotheses).where(eq(hypotheses.id, h!.id));
    const affected = row!.affected as { inTransit: string[] };
    await database.db
      .update(hypotheses)
      .set({ affected: { ...affected, inTransit: [...affected.inTransit, order.id] } })
      .where(eq(hypotheses.id, h!.id));
    const added = await draftBuyerMessagesWith(runtime, h!.id, 'suspected');
    expect(added).toHaveLength(1);
    expect(added[0]!.body).toBe(
      `We are checking a possible seam issue. If order ${order.invoice_id} shows it, reply here.`,
    );
    expect(calls).toHaveLength(1);

    // the confirmed level is a second template: one more call, however many buyers
    await inspect(h!.id, [true]);
    await confirmHypothesis(runtime, w.merchant.id, h!.id);
    expect(calls).toHaveLength(2);
  });

  it('trend: weekly exposure-based rates for B17 and the later batch of the same product', async () => {
    const { w, runtime, h } = await scanned();
    await insertBatch(database.db, w.merchant.id, w.hoodie.id, 'B18', 50);
    await database.db // received after B17, so it is a later batch
      .update(inventory_batches)
      .set({ received_at: new Date('2026-11-01T00:00:00Z') })
      .where(eq(inventory_batches.batch_code, 'B18'));
    for (let i = 0; i < 6; i++)
      await insertOrder(database.db, {
        merchantId: w.merchant.id,
        product: w.hoodie,
        status: 'delivered',
        batchCode: 'B18',
        shippedAt: new Date('2026-11-02T00:00:00Z'),
        deliveredAt: new Date('2026-11-04T00:00:00Z'),
      });

    const trend = await hypothesisTrend(runtime, w.merchant.id, h.id);
    const b17 = trend.weeks.filter((x) => x.value === 'B17');
    const b18 = trend.weeks.filter((x) => x.value === 'B18');
    expect(b17.reduce((s, x) => s + x.n, 0)).toBe(39);
    expect(b17.reduce((s, x) => s + x.k, 0)).toBe(5);
    expect(b18).toEqual([{ weekStart: '2026-11-02', value: 'B18', rate: 0, n: 6, k: 0 }]);
    expect(b17.every((x) => x.rate >= 0 && Number.isFinite(x.rate))).toBe(true);
    expect(trend.weeks.map((x) => x.weekStart)).toEqual(
      [...trend.weeks.map((x) => x.weekStart)].sort(),
    );
    expect(weekStart(new Date('2026-11-08T23:00:00Z'))).toBe('2026-11-02');
    expect(weekStart(new Date('2026-11-09T00:00:00Z'))).toBe('2026-11-09');
  });
});
