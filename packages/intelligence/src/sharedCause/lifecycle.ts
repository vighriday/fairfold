// How a hypothesis ends (section 9 stage 5): superseded by a new primary value of its cluster, retired by the scan
// when it is no longer significant, or dismissed by the merchant. Its still-proposed actions are withdrawn, and what
// it put in place — the orders it holds and the inspection rule it created — is proposed for release. Nothing is
// executed here: the merchant approves the release and Hriday's module carries it out.
import { and, eq } from 'drizzle-orm';
import { actions, inspection_rules, orders } from '@fairfold/db';
import type { DatabaseExecutor } from '@fairfold/ledger';

export type Withdrawal =
  'hypothesis_superseded' | 'hypothesis_retired' | 'hypothesis_dismissed' | 'hypothesis_reopened';

export const RETIRED_REASON = 'The shared cause is no longer statistically significant.';

/**
 * Withdraws every still-proposed action of the hypothesis (status failed, result { withdrawn, reason }) and, when it
 * holds orders or created an inspection rule that is still active, proposes release_orders
 * { orderIds, inspectionRuleIds, reason }.
 */
export async function withdrawAndProposeRelease(
  tx: DatabaseExecutor,
  hypothesisId: string,
  withdrawn: Withdrawal,
  reason: string,
  now: Date,
): Promise<void> {
  await tx
    .update(actions)
    .set({ status: 'failed', result: { withdrawn, reason } })
    .where(and(eq(actions.hypothesis_id, hypothesisId), eq(actions.status, 'proposed')));
  const held = await tx
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.held_by_hypothesis_id, hypothesisId))
    .orderBy(orders.id);
  const rules = await tx
    .select({ id: inspection_rules.id })
    .from(inspection_rules)
    .where(
      and(
        eq(inspection_rules.created_by_hypothesis_id, hypothesisId),
        eq(inspection_rules.active, true),
      ),
    )
    .orderBy(inspection_rules.id);
  if (!held.length && !rules.length) return;
  await tx.insert(actions).values({
    hypothesis_id: hypothesisId,
    type: 'release_orders',
    payload: {
      orderIds: held.map((o) => o.id),
      inspectionRuleIds: rules.map((r) => r.id),
      reason,
    },
    created_at: now,
  });
}

/** A hypothesis open again (significant once more) no longer proposes releasing what it holds. */
export async function withdrawPendingRelease(
  tx: DatabaseExecutor,
  hypothesisId: string,
): Promise<void> {
  await tx
    .update(actions)
    .set({
      status: 'failed',
      result: {
        withdrawn: 'hypothesis_reopened' satisfies Withdrawal,
        reason: 'The shared cause is significant again.',
      },
    })
    .where(
      and(
        eq(actions.hypothesis_id, hypothesisId),
        eq(actions.type, 'release_orders'),
        eq(actions.status, 'proposed'),
      ),
    );
}
