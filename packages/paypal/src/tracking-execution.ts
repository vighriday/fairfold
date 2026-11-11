import { eq } from 'drizzle-orm';
import { AppError, systemClock, type Clock, type JobPayload } from '@fairfold/contracts';
import { alerts, orders, shipments, withTransaction, type createDatabase } from '@fairfold/db';
import { createLedger } from '@fairfold/ledger';
import type { Jobs } from '@fairfold/jobs';
import type { PayPalMerchantClient } from './client.js';
import { PayPalError } from './errors.js';

type Event = Record<string, unknown>;
export function createTrackingPushHandler(options: {
  database: Pick<ReturnType<typeof createDatabase>, 'db' | 'pool'>;
  jobs: Pick<Jobs, 'publish'>;
  forMerchant: (merchantId: string) => Promise<PayPalMerchantClient>;
  clock?: Clock;
}) {
  const clock = options.clock ?? systemClock;
  return async ({ orderId }: JobPayload<'tracking.push'>) => {
    const requestId = 'ff-tracking-' + orderId;
    const context = await withTransaction(options.database, async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
      const [shipment] = await tx
        .select()
        .from(shipments)
        .where(eq(shipments.order_id, orderId))
        .for('update');
      if (!order || !shipment)
        throw new AppError('ORDER_NOT_FOUND', 'Order or shipment was not found', 404);
      if (shipment.paypal_tracker_id) return null;
      if (!order.paypal_capture_id || order.status !== 'sealed')
        throw new AppError('TRACKING_STATE_CONFLICT', 'A sealed captured order is required', 409);
      const events = shipment.events as Event[];
      if (events.some((event) => event.type === 'fairfold_tracking_push'))
        throw new AppError(
          'TRACKING_RECONCILIATION_REQUIRED',
          'A previous tracking attempt requires review',
          409,
        );
      await tx
        .update(shipments)
        .set({
          events: [
            ...events,
            {
              type: 'fairfold_tracking_push',
              state: 'in_progress',
              requestId,
              at: clock.now().toISOString(),
            },
          ],
        })
        .where(eq(shipments.id, shipment.id));
      return { order, shipment };
    });
    if (!context) return;
    let unknown = false;
    try {
      const paypal = await options.forMerchant(context.order.merchant_id);
      let trackerId: string | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const result = await paypal.orders.addTracking(
            context.order.paypal_order_id,
            {
              captureId: context.order.paypal_capture_id!,
              trackingNumber: context.shipment.tracking_number,
              carrier: context.shipment.carrier,
              ...(context.shipment.carrier_name_other
                ? { carrierNameOther: context.shipment.carrier_name_other }
                : {}),
              notifyPayer: true,
            },
            { requestId },
          );
          trackerId = result.trackerId;
          unknown = true;
          break;
        } catch (error) {
          unknown =
            error instanceof PayPalError ? error.outcomeUnknown : !(error instanceof AppError);
          if (unknown || attempt === 2) throw error;
        }
      }
      if (!trackerId)
        throw new AppError('TRACKING_RESPONSE_INVALID', 'Tracking result is unavailable', 502);
      await withTransaction(options.database, async (tx, queueDb) => {
        await tx.select({ id: orders.id }).from(orders).where(eq(orders.id, orderId)).for('update');
        const [shipment] = await tx
          .select()
          .from(shipments)
          .where(eq(shipments.id, context.shipment.id))
          .for('update');
        if (!shipment) throw new AppError('SHIPMENT_NOT_FOUND', 'Shipment was not found', 404);
        const events = (shipment.events as Event[]).map((event) =>
          event.type === 'fairfold_tracking_push'
            ? { ...event, state: 'submitted', at: clock.now().toISOString() }
            : event,
        );
        await tx
          .update(shipments)
          .set({ paypal_tracker_id: trackerId, status: 'in_transit', events })
          .where(eq(shipments.id, shipment.id));
        await tx
          .update(orders)
          .set({ status: 'shipped', shipped_at: clock.now() })
          .where(eq(orders.id, orderId));
        await createLedger(tx, clock).append(orderId, {
          type: 'tracking_pushed',
          actor: 'paypal',
          payload: { trackerId, carrier: context.shipment.carrier },
        });
        if (
          !(await options.jobs.publish(
            'storereport.refresh',
            { merchantId: context.order.merchant_id },
            { db: queueDb },
          ))
        )
          throw new AppError('TRACKING_QUEUE_FAILED', 'Report refresh could not be queued', 503);
      });
    } catch {
      await withTransaction(options.database, async (tx) => {
        const [shipment] = await tx
          .select()
          .from(shipments)
          .where(eq(shipments.id, context.shipment.id))
          .for('update');
        if (shipment)
          await tx
            .update(shipments)
            .set({
              events: (shipment.events as Event[]).map((event) =>
                event.type === 'fairfold_tracking_push'
                  ? {
                      ...event,
                      state: unknown ? 'outcome_unknown' : 'failed',
                      at: clock.now().toISOString(),
                    }
                  : event,
              ),
            })
            .where(eq(shipments.id, shipment.id));
        await tx
          .insert(alerts)
          .values({
            merchant_id: context.order.merchant_id,
            order_id: orderId,
            type: 'tracking_push_failed',
            ref_id: orderId,
            message: unknown
              ? 'Tracking outcome requires reconciliation; do not push again'
              : 'Tracking push failed after bounded attempts',
            created_at: clock.now(),
          });
      });
      throw new AppError(
        unknown ? 'TRACKING_RECONCILIATION_REQUIRED' : 'TRACKING_PUSH_FAILED',
        'Tracking push requires review',
        409,
      );
    }
  };
}
