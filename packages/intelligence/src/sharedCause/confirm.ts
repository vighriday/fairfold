// Confirm (endpoint 26) and dismiss (27), section 9 "Confirmation and the fix" and F5 step 6. Confirmation counts
// come only from the inspection attestations; the merchant presses the button, code checks the evidence.
import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import { AppError, AttestationResultSchema, type HypothesisDetail } from '@fairfold/contracts';
import { actions, attestations, complaints, disputes, hypotheses, orders } from '@fairfold/db';
import type { IntelRuntime } from '../runtime.js';
import { draftBuyerMessages } from './actions.js';
import { hypothesisDetail, ownedHypothesis } from './views.js';

/** Ten or more clean units with no defective one suggest Dismiss. */
export const CLEAN_UNITS_SUGGEST_DISMISS = 10;

/** Inspected and defective units from the hypothesis's inspection attestations (one attestation per unit). */
export async function inspectionCounts(rt: IntelRuntime, hypothesisId: string) {
  const rows = await rt.db
    .select({ result: attestations.result })
    .from(attestations)
    .where(and(eq(attestations.hypothesis_id, hypothesisId), eq(attestations.step, 'inspection')));
  const defective = rows.filter((r) => {
    const inspection = AttestationResultSchema.safeParse(r.result).data?.inspection;
    return Boolean(inspection?.defectVisible && inspection.matchesCluster);
  }).length;
  return { inspected: rows.length, defective, clean: rows.length - defective };
}

/** Open disputes on the orders of the hypothesis's cluster. */
async function openClusterDisputes(rt: IntelRuntime, clusterId: string): Promise<string[]> {
  const members = await rt.db
    .select({ orderId: complaints.order_id })
    .from(complaints)
    .where(eq(complaints.cluster_id, clusterId));
  const orderIds = [...new Set(members.flatMap((m) => (m.orderId ? [m.orderId] : [])))];
  if (!orderIds.length) return [];
  const rows = await rt.db
    .select({ id: disputes.id })
    .from(disputes)
    .where(
      and(
        inArray(disputes.order_id, orderIds),
        isNull(disputes.resolved_at),
        ne(disputes.status, 'RESOLVED'),
      ),
    );
  return rows.map((r) => r.id).sort();
}

/**
 * Endpoint 26: needs at least one inspected unit showing the cluster's fault. Sets confirmed, proposes offers for
 * the cluster's open disputes, drafts confirmed-level buyer messages and asks the Dispute Agent to rebuild packs.
 */
export async function confirmHypothesis(
  rt: IntelRuntime,
  merchantId: string,
  hypothesisId: string,
): Promise<HypothesisDetail> {
  const h = await ownedHypothesis(rt, merchantId, hypothesisId);
  if (h.status !== 'open')
    throw new AppError('HYPOTHESIS_NOT_OPEN', `This shared cause is ${h.status}`, 409);
  const counts = await inspectionCounts(rt, h.id);
  if (counts.defective === 0)
    throw new AppError(
      'NO_DEFECTIVE_UNIT',
      counts.inspected
        ? 'No inspected unit shows the reported fault'
        : 'Upload inspection photos before confirming',
      409,
      { ...counts, suggestDismiss: counts.clean >= CLEAN_UNITS_SUGGEST_DISMISS },
    );

  const disputeIds = await openClusterDisputes(rt, h.cluster_id);
  const now = rt.clock.now();
  await rt.db.transaction(async (tx) => {
    await tx
      .update(hypotheses)
      .set({ status: 'confirmed', confirmed_at: now })
      .where(eq(hypotheses.id, h.id));
    if (disputeIds.length)
      await tx.insert(actions).values({
        hypothesis_id: h.id,
        type: 'propose_offers',
        payload: { disputeIds },
        created_at: now,
      });
  });
  await draftBuyerMessages(rt, h.id, 'confirmed');
  if (disputeIds.length) await rt.jobs.publish('evidence.rebuild', { disputeIds });
  return hypothesisDetail(rt, merchantId, h.id);
}

/**
 * Endpoint 27: sets dismissed, proposes release_orders for the orders this hypothesis held, and withdraws its
 * still-proposed actions (status failed, result { withdrawn: 'hypothesis_dismissed', reason }).
 */
export async function dismissHypothesis(
  rt: IntelRuntime,
  merchantId: string,
  hypothesisId: string,
  reason: string,
): Promise<HypothesisDetail> {
  const h = await ownedHypothesis(rt, merchantId, hypothesisId);
  if (h.status !== 'open' && h.status !== 'confirmed')
    throw new AppError('HYPOTHESIS_NOT_OPEN', `This shared cause is ${h.status}`, 409);
  const held = await rt.db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.held_by_hypothesis_id, h.id))
    .orderBy(orders.id);
  const now = rt.clock.now();
  await rt.db.transaction(async (tx) => {
    await tx.update(hypotheses).set({ status: 'dismissed' }).where(eq(hypotheses.id, h.id));
    await tx
      .update(actions)
      .set({ status: 'failed', result: { withdrawn: 'hypothesis_dismissed', reason } })
      .where(and(eq(actions.hypothesis_id, h.id), eq(actions.status, 'proposed')));
    if (held.length)
      await tx.insert(actions).values({
        hypothesis_id: h.id,
        type: 'release_orders',
        payload: { orderIds: held.map((o) => o.id), reason },
        created_at: now,
      });
  });
  return hypothesisDetail(rt, merchantId, h.id);
}
