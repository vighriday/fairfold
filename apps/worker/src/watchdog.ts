import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { systemClock, type Clock } from '@fairfold/contracts';
import { alerts, disputes, orders, shipments, type Database } from '@fairfold/db';
import { createLedger } from '@fairfold/ledger';

const hours = (value: number) => value * 60 * 60 * 1000;
export function createWatchdogHandler(options: { database: Database; clock?: Clock }) {
  const clock = options.clock ?? systemClock;
  return async () => {
    const now = clock.now();
    const cutoff = new Date(now.getTime() - hours(72));
    const dueCutoff = new Date(now.getTime() + hours(48));
    const candidates = await options.database
      .select({ id: orders.id })
      .from(orders)
      .where(
        or(
          eq(orders.status, 'shipped'),
          eq(orders.status, 'captured'),
          eq(orders.status, 'packing'),
        ),
      );
    for (const candidate of candidates) {
      await options.database.transaction(async (tx) => {
        const [order] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, candidate.id))
          .for('update');
        if (!order) return;
        let type: 'tracking_gap' | 'seal_overdue' | undefined;
        let refId: string | null = null;
        if (order.status === 'shipped') {
          const [shipment] = await tx
            .select()
            .from(shipments)
            .where(eq(shipments.order_id, order.id))
            .for('update');
          if (!shipment || shipment.status === 'delivered') return;
          const since = shipment.last_scan_at ?? order.shipped_at;
          if (since && since < cutoff) {
            type = 'tracking_gap';
            refId = shipment.id;
          }
        } else if (
          ['captured', 'packing'].includes(order.status) &&
          !order.sealed_at &&
          order.captured_at &&
          order.captured_at < cutoff
        )
          type = 'seal_overdue';
        if (!type) return;
        const [existing] = await tx
          .select({ id: alerts.id })
          .from(alerts)
          .where(
            and(
              eq(alerts.order_id, order.id),
              eq(alerts.merchant_id, order.merchant_id),
              eq(alerts.type, type),
              isNull(alerts.acknowledged_at),
            ),
          )
          .limit(1);
        if (existing) return;
        await tx.insert(alerts).values({
          merchant_id: order.merchant_id,
          order_id: order.id,
          type,
          ref_id: refId,
          message:
            type === 'tracking_gap'
              ? 'Tracking has been silent for more than 72 hours'
              : 'Captured order has not been sealed within 72 hours',
          created_at: now,
        });
        if (type === 'tracking_gap')
          await createLedger(tx, clock).append(order.id, {
            type: 'gap_alert',
            actor: 'system',
            payload: { kind: 'tracking_gap', thresholdHours: 72 },
          });
      });
    }
    const due = await options.database
      .select({ id: disputes.id })
      .from(disputes)
      .where(and(lt(disputes.seller_response_due_date, dueCutoff), isNull(disputes.resolved_at)));
    for (const candidate of due) {
      await options.database.transaction(async (tx) => {
        const [dispute] = await tx
          .select()
          .from(disputes)
          .where(eq(disputes.id, candidate.id))
          .for('update');
        if (
          !dispute ||
          dispute.resolved_at ||
          dispute.status === 'RESOLVED' ||
          !dispute.seller_response_due_date ||
          dispute.seller_response_due_date >= dueCutoff
        )
          return;
        const [existing] = await tx
          .select({ id: alerts.id })
          .from(alerts)
          .where(
            and(
              eq(alerts.merchant_id, dispute.merchant_id),
              eq(alerts.type, 'dispute_due_soon'),
              eq(alerts.ref_id, dispute.id),
              isNull(alerts.acknowledged_at),
            ),
          )
          .limit(1);
        if (!existing)
          await tx.insert(alerts).values({
            merchant_id: dispute.merchant_id,
            order_id: dispute.order_id,
            type: 'dispute_due_soon',
            ref_id: dispute.id,
            message: 'Dispute response is due within 48 hours or overdue',
            created_at: now,
          });
      });
    }
  };
}
