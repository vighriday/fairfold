import { and, eq } from 'drizzle-orm';
import { AppError, type Clock, systemClock, type JobPayload } from '@fairfold/contracts';
import { alerts, orders, shipments, type Database } from '@fairfold/db';
import { createLedger } from '@fairfold/ledger';
import type { Jobs } from '@fairfold/jobs';
import type { PayPalMerchantClient } from './client.js';

function requestId(orderId: string): string {
  return `ff-tracking-${orderId}`;
}

export function createTrackingPushHandler(options: {
  database: { db: Database };
  jobs: Pick<Jobs, 'publish'>;
  forMerchant: (merchantId: string) => Promise<PayPalMerchantClient>;
  clock?: Clock;
}) {
  const clock = options.clock ?? systemClock;
  return async ({ orderId }: JobPayload<'tracking.push'>) => {
    const [context] = await options.database.db
      .select({
        order: orders,
        shipment: shipments,
      })
      .from(orders)
      .innerJoin(shipments, eq(shipments.order_id, orders.id))
      .where(eq(orders.id, orderId));
    if (!context) throw new AppError('ORDER_NOT_FOUND', 'Order or shipment not found', 404);
    if (context.shipment.paypal_tracker_id) return;
    if (!context.order.paypal_capture_id)
      throw new AppError('CAPTURE_REQUIRED', 'A captured order is required for tracking', 409);

    let trackerId: string | undefined;
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const client = await options.forMerchant(context.order.merchant_id);
        const result = await client.orders.addTracking(
          context.order.paypal_order_id,
          {
            captureId: context.order.paypal_capture_id,
            trackingNumber: context.shipment.tracking_number,
            carrier: context.shipment.carrier,
            ...(context.shipment.carrier_name_other
              ? { carrierNameOther: context.shipment.carrier_name_other }
              : {}),
            notifyPayer: true,
          },
          { requestId: requestId(orderId) },
        );
        trackerId = result.trackerId;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!trackerId) {
      await options.database.db
        .insert(alerts)
        .values({
          merchant_id: context.order.merchant_id,
          order_id: orderId,
          type: 'tracking_push_failed',
          ref_id: orderId,
          message: 'PayPal tracking could not be pushed after three attempts',
          created_at: clock.now(),
        })
        .onConflictDoNothing();
      throw lastError instanceof Error ? lastError : new Error('Tracking push failed');
    }

    await options.database.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(shipments)
        .where(and(eq(shipments.id, context.shipment.id), eq(shipments.order_id, orderId)))
        .for('update');
      if (!current?.paypal_tracker_id) {
        const now = new Date(Math.trunc(clock.now().getTime()));
        await tx
          .update(shipments)
          .set({ paypal_tracker_id: trackerId, status: 'in_transit', last_scan_at: now })
          .where(eq(shipments.id, context.shipment.id));
        await tx
          .update(orders)
          .set({ status: 'shipped', shipped_at: now })
          .where(eq(orders.id, orderId));
        await createLedger(tx, clock).append(orderId, {
          type: 'tracking_pushed',
          actor: 'paypal',
          payload: { trackerId, carrier: context.shipment.carrier },
        });
      }
    });
    await options.jobs.publish('storereport.refresh', { merchantId: context.order.merchant_id });
  };
}
