import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { AppError, systemClock, type Clock, type ForMerchant } from '@fairfold/contracts';
import { disputes, merchants, orders, schema, type createDatabase } from '@fairfold/db';
import { createLedger } from '@fairfold/ledger';
import { type Jobs } from '@fairfold/jobs';
import {
  newBuyerMessages,
  disputeContacts,
  sanitizeDisputeDetail,
  type SanitizedDispute,
} from './dispute-policy.js';
import { disputeId } from './dispute-validation.js';
import type { CaptureContext } from './capture-store.js';

function sourceObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AppError('DISPUTE_DETAIL_INVALID', `Dispute ${field} is invalid`, 502);
  return value as Record<string, unknown>;
}

function sourceTransactions(value: unknown): Array<Record<string, unknown>> {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100)
    throw new AppError('DISPUTE_DETAIL_INVALID', 'Dispute transactions are invalid', 502);
  return value.map((item) => sourceObject(item, 'transaction'));
}

function persistedDetail(detail: SanitizedDispute, fingerprints: string[]) {
  const { message_fingerprints: _messageFingerprints, messages, ...fields } = detail;
  return {
    ...fields,
    messages: messages.map(({ fingerprint: _fingerprint, ...message }) => message),
    _fairfold: { message_fingerprints: [...new Set(fingerprints)] },
  };
}

function resolved(detail: SanitizedDispute): boolean {
  return detail.status === 'RESOLVED' || detail.dispute_outcome !== undefined;
}

export function createDisputeSynchronizer(options: {
  database: Pick<ReturnType<typeof createDatabase>, 'db' | 'pool'>;
  jobs: Pick<Jobs, 'publish'>;
  forMerchant: ForMerchant;
  clock?: Clock;
}) {
  const clock = options.clock ?? systemClock;
  return async (
    { merchantId, disputeId: inputId }: { merchantId: string; disputeId: string },
    context?: CaptureContext,
  ) => {
    disputeId(inputId);
    const apply = async ({ tx, client }: CaptureContext) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${'dispute:' + inputId}, 0))`,
      );
      const [merchant] = await tx.select().from(merchants).where(eq(merchants.id, merchantId));
      if (!merchant || merchant.is_simulated)
        throw new AppError('MERCHANT_NOT_AVAILABLE', 'Dispute merchant is unavailable', 409);
      const paypal = await options.forMerchant(merchantId);
      const source = sourceObject(await paypal.disputes.get(inputId), 'body');
      if (source.dispute_id !== inputId)
        throw new AppError(
          'DISPUTE_DETAIL_INVALID',
          'Dispute detail ID does not match request',
          502,
        );
      const transactions = sourceTransactions(source.disputed_transactions);
      const [existing] = await tx
        .select()
        .from(disputes)
        .where(eq(disputes.id, inputId))
        .for('update');
      if (existing && existing.merchant_id !== merchantId)
        throw new AppError('DISPUTE_MERCHANT_MISMATCH', 'Dispute belongs to another merchant', 409);
      const priorRaw = existing?.raw && typeof existing.raw === 'object' ? existing.raw : {};
      const priorFingerprints =
        '_fairfold' in priorRaw &&
        priorRaw._fairfold &&
        typeof priorRaw._fairfold === 'object' &&
        !Array.isArray(priorRaw._fairfold) &&
        Array.isArray((priorRaw._fairfold as Record<string, unknown>).message_fingerprints)
          ? (
              (priorRaw._fairfold as Record<string, unknown>).message_fingerprints as unknown[]
            ).filter((value): value is string => typeof value === 'string')
          : [];
      const linkedOrders = new Map<string, typeof orders.$inferSelect>();
      for (const transaction of transactions) {
        const captureId = transaction.seller_transaction_id;
        if (typeof captureId !== 'string' || !captureId)
          throw new AppError('DISPUTE_DETAIL_INVALID', 'Seller transaction ID is invalid', 502);
        const matches = await tx
          .select()
          .from(orders)
          .where(eq(orders.paypal_capture_id, captureId));
        for (const order of matches) {
          if (order.merchant_id !== merchantId)
            throw new AppError(
              'DISPUTE_MERCHANT_MISMATCH',
              'Dispute capture belongs to another merchant',
              409,
            );
          linkedOrders.set(order.id, order);
        }
      }
      if (linkedOrders.size === 0)
        for (const transaction of transactions) {
          const invoice = transaction.invoice_number;
          if (typeof invoice !== 'string' || !invoice) continue;
          const [order] = await tx
            .select()
            .from(orders)
            .where(and(eq(orders.merchant_id, merchantId), eq(orders.invoice_id, invoice)));
          if (order) linkedOrders.set(order.id, order);
        }
      if (linkedOrders.size > 1)
        throw new AppError(
          'DISPUTE_ORDER_AMBIGUOUS',
          'Dispute matches multiple merchant orders',
          409,
        );
      const order = [...linkedOrders.values()][0];
      if (existing?.order_id && order && existing.order_id !== order.id)
        throw new AppError('DISPUTE_ORDER_AMBIGUOUS', 'Dispute order linkage changed', 409);
      const linkedOrder =
        order ??
        (existing?.order_id
          ? (
              await tx
                .select()
                .from(orders)
                .where(and(eq(orders.id, existing.order_id), eq(orders.merchant_id, merchantId)))
            )[0]
          : undefined);
      const authoritativeOrder =
        linkedOrder && Array.isArray(source.messages) && source.messages.length
          ? await paypal.orders.get(linkedOrder.paypal_order_id)
          : undefined;
      const detail = sanitizeDisputeDetail(
        { ...source, _fairfold: { message_fingerprints: priorFingerprints } },
        disputeContacts(source, authoritativeOrder),
      );
      if (existing?.resolved_at && !resolved(detail))
        throw new AppError(
          'DISPUTE_STATE_REGRESSED',
          'Resolved dispute requires reconciliation',
          409,
        );
      const now = new Date(clock.now());
      if (!Number.isFinite(now.getTime())) throw new Error('Invalid dispute clock');
      const buyerMessages = newBuyerMessages(detail);
      const allFingerprints = [
        ...priorFingerprints,
        ...detail.messages.map((message) => message.fingerprint),
      ];
      const raw = persistedDetail(detail, allFingerprints);
      const isNew = !existing;
      const justResolved = resolved(detail) && !existing?.resolved_at;
      await tx
        .insert(disputes)
        .values({
          id: inputId,
          merchant_id: merchantId,
          order_id: linkedOrder?.id ?? null,
          reason: detail.reason,
          status: detail.status,
          life_cycle_stage: detail.dispute_life_cycle_stage ?? null,
          amount_value: detail.dispute_amount?.value ?? null,
          currency: detail.dispute_amount?.currency_code ?? null,
          seller_response_due_date: detail.seller_response_due_date
            ? new Date(detail.seller_response_due_date)
            : null,
          outcome_code: detail.dispute_outcome?.outcome_code ?? null,
          resolved_at: justResolved ? now : (existing?.resolved_at ?? null),
          raw,
          updated_at: now,
        })
        .onConflictDoUpdate({
          target: disputes.id,
          set: {
            order_id: linkedOrder?.id ?? null,
            reason: detail.reason,
            status: detail.status,
            life_cycle_stage: detail.dispute_life_cycle_stage ?? null,
            amount_value: detail.dispute_amount?.value ?? null,
            currency: detail.dispute_amount?.currency_code ?? null,
            seller_response_due_date: detail.seller_response_due_date
              ? new Date(detail.seller_response_due_date)
              : null,
            outcome_code: detail.dispute_outcome?.outcome_code ?? null,
            resolved_at: justResolved ? now : (existing?.resolved_at ?? null),
            raw,
            updated_at: now,
          },
        });
      if (linkedOrder && (isNew || !existing?.order_id || justResolved)) {
        const ledger = createLedger(tx, clock);
        if (isNew || !existing?.order_id)
          await ledger.append(linkedOrder.id, {
            type: 'dispute_opened',
            actor: 'paypal',
            payload: { disputeId: inputId, status: detail.status, reason: detail.reason },
          });
        if (justResolved)
          await ledger.append(linkedOrder.id, {
            type: 'resolved',
            actor: 'paypal',
            payload: { disputeId: inputId, outcome: detail.dispute_outcome?.outcome_code ?? null },
          });
      }
      const jobId = await options.jobs.publish(
        'dispute.synced',
        {
          disputeId: inputId,
          isNew,
          newBuyerMessages: buyerMessages.map((message) => message.content),
        },
        { db: { executeSql: (query, values) => client.query(query, values) } },
      );
      if (!jobId)
        throw new AppError(
          'DISPUTE_SYNC_QUEUE_FAILED',
          'Dispute notification could not be queued',
          503,
        );
      if (
        justResolved &&
        !(await options.jobs.publish(
          'storereport.refresh',
          { merchantId },
          { db: { executeSql: (query, values) => client.query(query, values) } },
        ))
      )
        throw new AppError(
          'DISPUTE_SYNC_QUEUE_FAILED',
          'Resolution refresh could not be queued',
          503,
        );
    };
    if (context) return apply(context);
    const client = await options.database.pool.connect();
    try {
      await drizzle(client, { schema }).transaction((tx) => apply({ tx, client }));
    } finally {
      client.release();
    }
  };
}
