// Merchant alerts written by the intelligence services (section 7 `alerts`: each side writes its own types).
// An alert is raised once per (merchant, type, ref_id), so a redelivered job or a re-run scan never repeats it.
import { and, eq, sql } from 'drizzle-orm';
import { alerts } from '@fairfold/db';
import type { DatabaseExecutor } from '@fairfold/ledger';

export type IntelAlertType = 'shared_cause' | 'safety_complaint';

export interface AlertInput {
  merchantId: string;
  type: IntelAlertType;
  /** Hypothesis id or complaint id: the dedupe key (section 7 `ref_id`). */
  refId: string;
  orderId?: string | null;
  message: string;
  now: Date;
}

/**
 * Inserts the alert unless one with the same merchant, type and ref_id exists. `alerts` has no unique key, so the
 * check and the insert run under a transaction-scoped advisory lock on that triple; concurrent jobs raise it once.
 */
export async function raiseAlertOnce(db: DatabaseExecutor, a: AlertInput): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`fairfold:alert:${a.merchantId}:${a.type}:${a.refId}`}, 0))`,
    );
    const [existing] = await tx
      .select({ id: alerts.id })
      .from(alerts)
      .where(
        and(
          eq(alerts.merchant_id, a.merchantId),
          eq(alerts.type, a.type),
          eq(alerts.ref_id, a.refId),
        ),
      );
    if (existing) return;
    await tx.insert(alerts).values({
      merchant_id: a.merchantId,
      order_id: a.orderId ?? null,
      type: a.type,
      ref_id: a.refId,
      message: a.message,
      created_at: a.now,
    });
  });
}
