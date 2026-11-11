// Hypothesis lifecycle: a superseded or no-longer-significant hypothesis has its proposals withdrawn and its holds and
// inspection rule proposed for release; a dismissed one proposes switching off the inspection rule it created.
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixedClock } from '@fairfold/contracts';
import { actions, hypotheses, inspection_rules, messages, orders } from '@fairfold/db';
import { setIntelRuntime } from '../../src/runtime.js';
import { dismissHypothesis } from '../../src/sharedCause/confirm.js';
import { runSharedCauseScanWith } from '../../src/sharedCause/scan.js';
import { dbUrl, openTestDb, resetTables, testRuntime } from './harness.js';
import { buildWorld } from './sharedCauseWorld.js';

const NOW = new Date('2026-11-09T12:00:00.000Z');

describe.skipIf(!dbUrl)('hypothesis lifecycle against Postgres', () => {
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

  const actionsOf = (hypothesisId: string) =>
    database.db.select().from(actions).where(eq(actions.hypothesis_id, hypothesisId));

  /** The B17 world scanned once; the hypothesis held three unshipped orders and created its inspection rule. */
  async function scannedWithMeasures() {
    const w = await buildWorld(database.db, NOW);
    const { runtime } = testRuntime(database.db, { clock: fixedClock(NOW) });
    const [h] = await runSharedCauseScanWith(runtime, w.merchant.id);
    const held = w.unshipped.slice(0, 3).sort();
    await database.db
      .update(orders)
      .set({ hold_reason: 'shared_cause', held_by_hypothesis_id: h!.id })
      .where(inArray(orders.id, held));
    const [rule] = await database.db
      .insert(inspection_rules)
      .values({
        merchant_id: w.merchant.id,
        product_id: w.hoodie.id,
        batch_code: 'B17',
        instruction: 'Photograph the sleeve seam',
        required_photo_label: 'seam_closeup',
        created_by_hypothesis_id: h!.id,
      })
      .returning();
    return { w, runtime, h: h!, held, rule: rule! };
  }

  it('a hypothesis that is no longer significant is retired: proposals withdrawn, holds and rule proposed for release', async () => {
    const { w, h, held, rule } = await scannedWithMeasures();
    const strict = testRuntime(database.db, {
      clock: fixedClock(NOW),
      env: { SHARED_CAUSE_MIN_RATE_RATIO: '1000' },
    }).runtime;

    expect(await runSharedCauseScanWith(strict, w.merchant.id)).toEqual([]);
    const [row] = await database.db.select().from(hypotheses).where(eq(hypotheses.id, h.id));
    expect(row!.status).toBe('superseded');
    const all = await actionsOf(h.id);
    const withdrawn = all.filter((a) => a.status === 'failed');
    expect(withdrawn.map((a) => a.type).sort()).toEqual([
      'add_inspection_rule',
      'hold_orders',
      'send_buyer_messages',
    ]);
    expect(withdrawn[0]!.result).toEqual({
      withdrawn: 'hypothesis_retired',
      reason: 'The shared cause is no longer statistically significant.',
    });
    const release = all.find((a) => a.type === 'release_orders');
    expect(release).toMatchObject({
      status: 'proposed',
      payload: {
        orderIds: held,
        inspectionRuleIds: [rule.id],
        reason: 'The shared cause is no longer statistically significant.',
      },
    });

    // significant again: the same hypothesis reopens and its proposals come back
    const normal = testRuntime(database.db, { clock: fixedClock(NOW) }).runtime;
    const [again] = await runSharedCauseScanWith(normal, w.merchant.id);
    expect(again!.id).toBe(h.id);
    expect(again!.status).toBe('open');
    const after = await actionsOf(h.id);
    const proposed = after.filter((a) => a.status === 'proposed');
    expect(proposed.map((a) => a.type).sort()).toEqual([
      'add_inspection_rule',
      'hold_orders',
      'send_buyer_messages',
    ]);
    // the pending release is withdrawn; holds are proposed for the orders it does not hold now
    expect(after.find((a) => a.type === 'release_orders')).toMatchObject({
      status: 'failed',
      result: { withdrawn: 'hypothesis_reopened' },
    });
    const hold = proposed.find((a) => a.type === 'hold_orders')!;
    expect((hold.payload as { orderIds: string[] }).orderIds.sort()).toEqual(
      w.unshipped.filter((o) => !held.includes(o)).sort(),
    );
    const send = proposed.find((a) => a.type === 'send_buyer_messages')!;
    expect((send.payload as { messageIds: string[] }).messageIds).toHaveLength(38);
    expect(await database.db.select().from(messages)).toHaveLength(76);
  });

  it('a hypothesis replaced by a new primary value is superseded with its proposals withdrawn', async () => {
    const { w, runtime, h } = await scannedWithMeasures();
    // an earlier primary of the same cluster, still open with a proposal of its own
    const [old] = await database.db
      .insert(hypotheses)
      .values({
        merchant_id: w.merchant.id,
        cluster_id: h.clusterId,
        dimension: 'packer',
        value: 'station-1',
        status: 'open',
        strength: 'possible',
        stats: h.stats,
        alternatives: [],
        affected: h.affected,
        explanation: 'An earlier primary.',
        created_at: new Date('2026-11-01T00:00:00Z'),
      })
      .returning();
    await database.db.insert(actions).values({
      hypothesis_id: old!.id,
      type: 'send_buyer_messages',
      payload: { messageIds: [], level: 'suspected' },
    });

    await runSharedCauseScanWith(runtime, w.merchant.id);
    const [row] = await database.db.select().from(hypotheses).where(eq(hypotheses.id, old!.id));
    expect(row!.status).toBe('superseded');
    const [send] = await actionsOf(old!.id);
    expect(send).toMatchObject({
      status: 'failed',
      result: {
        withdrawn: 'hypothesis_superseded',
        reason: 'The shared cause now points to batch B17.',
      },
    });
  });

  it('dismiss proposes switching off the inspection rule the hypothesis created', async () => {
    const { w, runtime, h, held, rule } = await scannedWithMeasures();
    await dismissHypothesis(runtime, w.merchant.id, h.id, 'Inspected 12 units, all fine');
    const release = (await actionsOf(h.id)).find((a) => a.type === 'release_orders');
    expect(release).toMatchObject({
      status: 'proposed',
      payload: {
        orderIds: held,
        inspectionRuleIds: [rule.id],
        reason: 'Inspected 12 units, all fine',
      },
    });
  });

  it('dismiss with no held orders still proposes switching off the rule', async () => {
    const { w, runtime, h, rule } = await scannedWithMeasures();
    await database.db
      .update(orders)
      .set({ hold_reason: null, held_by_hypothesis_id: null })
      .where(eq(orders.merchant_id, w.merchant.id));
    await dismissHypothesis(runtime, w.merchant.id, h.id, 'Supplier fixed the machine');
    const release = (await actionsOf(h.id)).find((a) => a.type === 'release_orders');
    expect(release!.payload).toEqual({
      orderIds: [],
      inspectionRuleIds: [rule.id],
      reason: 'Supplier fixed the machine',
    });
  });
});
