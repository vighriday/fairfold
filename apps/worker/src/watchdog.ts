import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { AppError, systemClock, type Clock } from '@fairfold/contracts';
import { alerts, disputes, orders, shipments, type Database } from '@fairfold/db';
import { createLedger } from '@fairfold/ledger';

const hours = (value: number) => value * 60 * 60 * 1000;

export function createWatchdogHandler(options: { database: Database; clock?: Clock }) {
  const clock = options.clock ?? systemClock;
  return async () => {
    const now = clock.now();
    const trackingCutoff = new Date(now.getTime() - hours(72));
    const dueCutoff = new Date(now.getTime() + hours(48));

    const tracking = await options.database
      .select({ order: orders, shipment: shipments })
      .from(orders)
      .innerJoin(shipments, eq(shipments.order_id, orders.id))
      .where(
        and(
          eq(orders.status, 'shipped'),
          or(isNull(shipments.last_scan_at), lt(shipments.last_scan_at, trackingCutoff)),
        ),
      );
    for (const row of tracking) {
      await options.database.transaction(async (tx) => {
        const [locked] = await tx
          .select({ id: orders.id })
          .from(orders)
          .where(eq(orders.id, row.order.id))
          .for('update');
        if (!locked) throw new AppError('ORDER_NOT_FOUND', 'Watchdog order was not found', 404);
        const [existing] = await tx
          .select({ id: alerts.id })
          .from(alerts)
          .where(
            and(
              eq(alerts.order_id, row.order.id),
              eq(alerts.merchant_id, row.order.merchant_id),
              eq(alerts.type, 'tracking_gap'),
              isNull(alerts.acknowledged_at),
            ),
          )
          .limit(1);
        if (existing) return;
        await tx.insert(alerts).values({
          merchant_id: row.order.merchant_id,
          order_id: row.order.id,
          type: 'tracking_gap',
          ref_id: row.shipment.id,
          message: 'Tracking has been silent for more than 72 hours',
          created_at: now,
        });
        await createLedger(tx, clock).append(row.order.id, {
          type: 'gap_alert',
          actor: 'system',
          payload: { kind: 'tracking_gap', thresholdHours: 72 },
        });
      });
    }

    const unsealed = await options.database
      .select()
      .from(orders)
      .where(
        and(
          or(eq(orders.status, 'captured'), eq(orders.status, 'packing')),
          lt(orders.captured_at, trackingCutoff),
        ),
      );
    for (const order of unsealed) {
      await options.database.transaction(async (tx) => {
        const [existing] = await tx
          .select({ id: alerts.id })
          .from(alerts)
          .where(
            and(
              eq(alerts.order_id, order.id),
              eq(alerts.merchant_id, order.merchant_id),
              eq(alerts.type, 'seal_overdue'),
              isNull(alerts.acknowledged_at),
            ),
          )
          .limit(1);
        if (existing) return;
        await tx.insert(alerts).values({
          merchant_id: order.merchant_id,
          order_id: order.id,
          type: 'seal_overdue',
          message: 'Captured order has not been sealed within 72 hours',
          created_at: now,
        });
      });
    }

    const due = await options.database
      .select()
      .from(disputes)
      .where(
        and(
          lt(disputes.seller_response_due_date, dueCutoff),
          or(eq(disputes.status, 'OPEN'), eq(disputes.status, 'open')),
        ),
      );
    for (const dispute of due) {
      if (!dispute.order_id) continue;
      await options.database.transaction(async (tx) => {
        const [existing] = await tx
          .select({ id: alerts.id })
          .from(alerts)
          .where(
            and(
              eq(alerts.order_id, dispute.order_id!),
              eq(alerts.merchant_id, dispute.merchant_id),
              eq(alerts.type, 'dispute_due_soon'),
              eq(alerts.ref_id, dispute.id),
              isNull(alerts.acknowledged_at),
            ),
          )
          .limit(1);
        if (existing) return;
        await tx.insert(alerts).values({
          merchant_id: dispute.merchant_id,
          order_id: dispute.order_id,
          type: 'dispute_due_soon',
          ref_id: dispute.id,
          message: 'Dispute response is due within 48 hours',
          created_at: now,
        });
      });
    }
  };
}
