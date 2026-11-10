import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { AppError, systemClock, type Clock, type ForMerchant } from '@fairfold/contracts';
import { merchants, orders, paypal_events, schema, type createDatabase } from '@fairfold/db';
import { type Jobs } from '@fairfold/jobs';
import { createCaptureStore, type CaptureContext } from './capture-store.js';
import { minimizeEvent, type VerifiedEvent } from './event-policy.js';
import { parseCaptured } from './orders.js';

export type DisputeSynchronizer = (input: {
  merchantId: string;
  disputeId: string;
}) => Promise<void>;
export const pendingDisputeSync: DisputeSynchronizer = async () => {
  throw new AppError(
    'H4_DISPUTE_SYNC_PENDING',
    'H4 dispute synchronization is not implemented',
    503,
  );
};

export function createPayPalEventHandler(options: {
  database: Pick<ReturnType<typeof createDatabase>, 'db' | 'pool'>;
  jobs: Pick<Jobs, 'publish'>;
  forMerchant: ForMerchant;
  clock?: Clock;
  syncDispute?: DisputeSynchronizer;
}) {
  const clock = options.clock ?? systemClock;
  const captures = createCaptureStore({ ...options, clock });
  async function reconcile(event: VerifiedEvent, merchantId: string, context: CaptureContext) {
    const related = event.resource.supplementary_data?.related_ids;
    const captureId =
      event.event_type === 'PAYMENT.CAPTURE.COMPLETED' ? event.resource.id : related?.capture_id;
    let paypalOrderId = related?.order_id;
    const [byCapture] = captureId
      ? await context.tx.select().from(orders).where(eq(orders.paypal_capture_id, captureId))
      : [];
    if (byCapture) {
      if (
        byCapture.merchant_id !== merchantId ||
        (paypalOrderId && paypalOrderId !== byCapture.paypal_order_id)
      )
        throw new AppError(
          'PAYPAL_EVENT_ORDER_MISMATCH',
          'Event does not match the merchant order',
          409,
        );
      paypalOrderId ??= byCapture.paypal_order_id;
    }
    if (!paypalOrderId || !captureId)
      throw new AppError(
        'PAYPAL_EVENT_REFERENCE_MISSING',
        'Event has no usable order/capture reference',
        409,
      );
    const [known] = await context.tx
      .select()
      .from(orders)
      .where(eq(orders.paypal_order_id, paypalOrderId));
    if (known && known.merchant_id !== merchantId)
      throw new AppError(
        'PAYPAL_EVENT_ORDER_MISMATCH',
        'Event does not match the merchant order',
        409,
      );
    const paypal = await options.forMerchant(merchantId);
    const capture = parseCaptured(await paypal.orders.get(paypalOrderId), paypalOrderId);
    if (capture.captureId !== captureId)
      throw new AppError(
        'PAYPAL_EVENT_ORDER_MISMATCH',
        'Event capture differs from authoritative order',
        409,
      );
    if (
      event.event_type === 'PAYMENT.CAPTURE.REFUNDED' &&
      !['REFUNDED', 'PARTIALLY_REFUNDED'].includes(capture.status)
    )
      throw new AppError(
        'PAYPAL_REFUND_NOT_RECONCILED',
        'Refund state is not yet authoritative',
        503,
      );
    const result = await captures.persist(
      { merchantId, orderId: known?.id ?? randomUUID(), capture, webhookImport: true },
      context,
    );
    if (capture.status === 'REFUNDED' && known?.status !== 'refunded') {
      const job = await options.jobs.publish(
        'storereport.refresh',
        { merchantId },
        {
          db: { executeSql: (query, values) => context.client.query(query, values) },
        },
      );
      if (!job)
        throw new AppError(
          'PAYPAL_EVENT_QUEUE_FAILED',
          'Refund report refresh could not be queued',
          503,
        );
    }
    return result;
  }
  return async ({ eventId }: { eventId: string }) => {
    const client = await options.database.pool.connect();
    try {
      await drizzle(client, { schema }).transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(paypal_events)
          .where(eq(paypal_events.id, eventId))
          .for('update');
        if (!row) throw new AppError('PAYPAL_EVENT_NOT_FOUND', 'Event not found', 404);
        if (!row.verified || row.processed_at) return;
        const [merchant] = row.merchant_id
          ? await tx
              .select()
              .from(merchants)
              .where(and(eq(merchants.id, row.merchant_id), eq(merchants.is_simulated, false)))
          : [];
        if (!merchant)
          throw new AppError('MERCHANT_NOT_AVAILABLE', 'Event merchant is unavailable', 409);
        const event = minimizeEvent(row.payload, true) as VerifiedEvent;
        if (event.id !== row.id || event.event_type !== row.event_type)
          throw new AppError('PAYPAL_EVENT_INVALID', 'Stored event metadata conflicts', 409);
        let diagnostic: string | null = null;
        if (['PAYMENT.CAPTURE.COMPLETED', 'PAYMENT.CAPTURE.REFUNDED'].includes(event.event_type)) {
          await reconcile(event, merchant.id, { tx, client });
        } else if (event.event_type.startsWith('CUSTOMER.DISPUTE.')) {
          const disputeId = event.resource.dispute_id ?? event.resource.id;
          if (!disputeId)
            throw new AppError('PAYPAL_EVENT_REFERENCE_MISSING', 'Dispute ID is missing', 409);
          await (options.syncDispute ?? pendingDisputeSync)({ merchantId: merchant.id, disputeId });
        } else if (event.event_type === 'PAYMENT.CAPTURE.REVERSED') {
          diagnostic = 'REVERSAL_REQUIRES_REVIEW';
        } else if (event.event_type !== 'CHECKOUT.ORDER.APPROVED') {
          diagnostic = 'EVENT_NOT_SUBSCRIBED';
        }
        const now = new Date(clock.now());
        if (!Number.isFinite(now.getTime())) throw new Error('Invalid event clock');
        await tx
          .update(paypal_events)
          .set({ processed_at: now, error: diagnostic })
          .where(eq(paypal_events.id, eventId));
      });
    } catch (error) {
      const code =
        error instanceof AppError && /^[A-Z][A-Z0-9_]{0,79}$/.test(error.code)
          ? error.code
          : 'PAYPAL_EVENT_PROCESSING_FAILED';
      // Rollback first; a safe diagnostic must not clear another attempt's success.
      try {
        await drizzle(client, { schema })
          .update(paypal_events)
          .set({ error: code })
          .where(
            and(
              eq(paypal_events.id, eventId),
              eq(paypal_events.verified, true),
              sql`${paypal_events.processed_at} is null`,
            ),
          );
      } catch {
        /* Return only the fixed error if diagnostic persistence is unavailable. */
      }
      throw new AppError(code, 'PayPal event processing did not complete', 503);
    } finally {
      client.release();
    }
  };
}
