import { and, eq } from 'drizzle-orm';
import { AppError, MoneySchema } from '@fairfold/contracts';
import { orders, type Database } from '@fairfold/db';
import { createLedger } from '@fairfold/ledger';
import { minimizeEvent, type VerifiedEvent } from './event-policy.js';
import { moneyMinor } from './money.js';

/** Read-only state inspection; operator-observed real delivery provenance remains separate. */
export async function inspectCapturedEvent(
  database: Database,
  merchantSlug: string,
  eventId: string,
) {
  const merchant = await database.query.merchants.findFirst({
    where: (m, { and, eq }) => and(eq(m.slug, merchantSlug), eq(m.is_simulated, false)),
    columns: { id: true, paypal_webhook_id: true },
  });
  if (!merchant?.paypal_webhook_id)
    throw new AppError('WEBHOOK_NOT_CONFIGURED', 'Merchant webhook is not configured');
  const row = await database.query.paypal_events.findFirst({
    where: (e, { and, eq }) => and(eq(e.id, eventId), eq(e.merchant_id, merchant.id)),
  });
  if (
    !row?.verified ||
    !row.processed_at ||
    row.error ||
    row.event_type !== 'PAYMENT.CAPTURE.COMPLETED'
  )
    throw new AppError(
      'WEBHOOK_ACCEPTANCE_NOT_READY',
      'A verified processed capture event is required',
    );
  const event = minimizeEvent(row.payload, true) as VerifiedEvent;
  if (event.id !== row.id || event.event_type !== row.event_type || !event.resource.id)
    throw new AppError('WEBHOOK_ACCEPTANCE_NOT_READY', 'Stored event references are invalid');
  const [order] = await database
    .select()
    .from(orders)
    .where(
      and(eq(orders.merchant_id, merchant.id), eq(orders.paypal_capture_id, event.resource.id)),
    );
  const relatedOrderId = event.resource.supplementary_data?.related_ids.order_id;
  if (!order?.captured_at || (relatedOrderId && relatedOrderId !== order.paypal_order_id))
    throw new AppError('WEBHOOK_ACCEPTANCE_NOT_READY', 'Event has no matching captured order');
  const ledger = await createLedger(database).verify(order.id);
  const captured = ledger.entries.filter((entry) => entry.type === 'captured');
  const entry = captured[0]?.payload as Record<string, unknown> | undefined;
  const amount = MoneySchema.safeParse(entry?.amount);
  if (
    !ledger.verified ||
    captured.length !== 1 ||
    captured[0]!.seq !== 1 ||
    !amount.success ||
    amount.data.currency_code !== order.currency ||
    moneyMinor(amount.data) !==
      moneyMinor({ currency_code: order.currency, value: order.amount_value }) ||
    entry?.paypalOrderId !== order.paypal_order_id ||
    entry.paypalCaptureId !== order.paypal_capture_id
  )
    throw new AppError(
      'WEBHOOK_ACCEPTANCE_NOT_READY',
      'Capture ledger is missing, duplicated or invalid',
    );
  return {
    status: 'LOCAL_EVENT_STATE_READY' as const,
    merchantId: merchant.id,
    eventId: row.id,
    orderId: order.id,
    paypalOrderId: order.paypal_order_id,
    paypalCaptureId: order.paypal_capture_id,
    verified: true,
    processedAt: row.processed_at.toISOString(),
    captureLedgerEntries: captured.length,
    ledgerVerified: ledger.verified,
    realDeliveryAndRedeliveryProof: 'REQUIRES_OPERATOR_OBSERVATION' as const,
  };
}
