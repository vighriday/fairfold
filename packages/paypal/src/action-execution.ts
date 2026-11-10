import { and, eq, inArray } from 'drizzle-orm';
import { AppError, type Clock, systemClock, type JobPayload } from '@fairfold/contracts';
import { actions, inspection_rules, messages, orders, schema, type Database } from '@fairfold/db';
import { createLedger } from '@fairfold/ledger';
import type { Jobs } from '@fairfold/jobs';
import type { PayPalMerchantClient } from './client.js';

const actionTypes = new Set([
  'hold_orders',
  'add_inspection_rule',
  'send_buyer_messages',
  'propose_offers',
  'proactive_refund',
  'release_orders',
]);

export function createActionHandler(options: {
  database: { db: Database };
  jobs: Pick<Jobs, 'publish'>;
  forMerchant: (merchantId: string) => Promise<PayPalMerchantClient>;
  clock?: Clock;
}) {
  const clock = options.clock ?? systemClock;
  return async ({ actionId }: JobPayload<'action.approved'>) => {
    const [row] = await options.database.db
      .select({ action: actions, hypothesis: schema.hypotheses })
      .from(actions)
      .innerJoin(schema.hypotheses, eq(schema.hypotheses.id, actions.hypothesis_id))
      .where(eq(actions.id, actionId));
    if (!row) throw new AppError('ACTION_NOT_FOUND', 'Action was not found', 404);
    if (row.action.status === 'done') return;
    if (row.action.status !== 'approved')
      throw new AppError('ACTION_NOT_APPROVED', 'Action is not approved', 409);
    if (!actionTypes.has(row.action.type))
      throw new AppError('ACTION_INVALID', 'Action type is invalid', 409);
    const payload = (row.action.payload ?? {}) as Record<string, unknown>;
    const orderIds = Array.isArray(payload.orderIds)
      ? payload.orderIds.filter((id): id is string => typeof id === 'string')
      : [];
    // release_orders may also (or only) switch off the inspection rules the hypothesis created (I-D34).
    const inspectionRuleIds =
      row.action.type === 'release_orders' && Array.isArray(payload.inspectionRuleIds)
        ? payload.inspectionRuleIds.filter((id): id is string => typeof id === 'string')
        : [];
    if (['hold_orders', 'proactive_refund'].includes(row.action.type) && !orderIds.length)
      throw new AppError('ACTION_PAYLOAD_INVALID', 'Action order list is required', 409);
    if (row.action.type === 'release_orders' && !orderIds.length && !inspectionRuleIds.length)
      throw new AppError(
        'ACTION_PAYLOAD_INVALID',
        'A release needs orders or inspection rules',
        409,
      );
    if (row.action.type === 'hold_orders' || row.action.type === 'release_orders') {
      await options.database.db.transaction(async (tx) => {
        const owned = orderIds.length
          ? await tx
              .select()
              .from(orders)
              .where(
                and(
                  eq(orders.merchant_id, row.hypothesis.merchant_id),
                  inArray(orders.id, orderIds),
                ),
              )
              .for('update')
          : [];
        if (owned.length !== orderIds.length)
          throw new AppError(
            'ACTION_OWNERSHIP_FAILED',
            'Action includes another merchant order',
            409,
          );
        for (const order of owned) {
          if (row.action.type === 'hold_orders') {
            await tx
              .update(orders)
              .set({
                hold_reason: row.hypothesis.explanation,
                held_by_hypothesis_id: row.hypothesis.id,
              })
              .where(eq(orders.id, order.id));
            await createLedger(tx, clock).append(order.id, {
              type: 'held',
              actor: `merchant:${row.hypothesis.merchant_id}`,
              payload: { hypothesisId: row.hypothesis.id, reason: row.hypothesis.explanation },
            });
          } else {
            await tx
              .update(orders)
              .set({ hold_reason: null, held_by_hypothesis_id: null })
              .where(eq(orders.id, order.id));
            await createLedger(tx, clock).append(order.id, {
              type: 'released',
              actor: `merchant:${row.hypothesis.merchant_id}`,
              payload: { hypothesisId: row.hypothesis.id },
            });
          }
        }
        if (inspectionRuleIds.length) {
          const switchedOff = await tx
            .update(inspection_rules)
            .set({ active: false })
            .where(
              and(
                eq(inspection_rules.merchant_id, row.hypothesis.merchant_id),
                inArray(inspection_rules.id, inspectionRuleIds),
              ),
            )
            .returning({ id: inspection_rules.id });
          if (switchedOff.length !== inspectionRuleIds.length)
            throw new AppError(
              'ACTION_OWNERSHIP_FAILED',
              'Action includes another merchant inspection rule',
              409,
            );
        }
        await tx
          .update(actions)
          .set({
            status: 'done',
            result: {
              orderIds,
              ...(row.action.type === 'release_orders' ? { inspectionRuleIds } : {}),
              completedAt: clock.now().toISOString(),
            },
          })
          .where(eq(actions.id, actionId));
      });
      return;
    }
    if (row.action.type === 'add_inspection_rule') {
      const batchCode = typeof payload.batchCode === 'string' ? payload.batchCode : '';
      const instruction = typeof payload.instruction === 'string' ? payload.instruction : '';
      const requiredPhotoLabel =
        typeof payload.requiredPhotoLabel === 'string' ? payload.requiredPhotoLabel : '';
      if (!batchCode || !instruction || !requiredPhotoLabel)
        throw new AppError('ACTION_PAYLOAD_INVALID', 'Inspection rule fields are required', 409);
      await options.database.db.transaction(async (tx) => {
        await tx.insert(inspection_rules).values({
          merchant_id: row.hypothesis.merchant_id,
          product_id: typeof payload.productId === 'string' ? payload.productId : null,
          batch_code: batchCode,
          instruction,
          required_photo_label: requiredPhotoLabel,
          created_by_hypothesis_id: row.hypothesis.id,
        });
        await tx
          .update(actions)
          .set({ status: 'done', result: { completedAt: clock.now().toISOString() } })
          .where(eq(actions.id, actionId));
      });
      return;
    }
    if (row.action.type === 'send_buyer_messages') {
      const messageIds = Array.isArray(payload.messageIds)
        ? payload.messageIds.filter((id): id is string => typeof id === 'string')
        : [];
      await options.database.db.transaction(async (tx) => {
        const owned = await tx
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.merchant_id, row.hypothesis.merchant_id),
              inArray(messages.id, messageIds),
            ),
          )
          .for('update');
        if (owned.length !== messageIds.length)
          throw new AppError(
            'ACTION_OWNERSHIP_FAILED',
            'Action includes another merchant message',
            409,
          );
        for (const message of owned) {
          if (message.status === 'sent') continue;
          await tx
            .update(messages)
            .set({ status: 'sent', sent_at: clock.now() })
            .where(eq(messages.id, message.id));
          if (message.order_id)
            await createLedger(tx, clock).append(message.order_id, {
              type: 'message_sent',
              actor: `merchant:${row.hypothesis.merchant_id}`,
              payload: { messageId: message.id, channel: message.channel },
            });
        }
        await tx
          .update(actions)
          .set({ status: 'done', result: { messageIds, completedAt: clock.now().toISOString() } })
          .where(eq(actions.id, actionId));
      });
      return;
    }
    if (row.action.type === 'propose_offers') {
      const disputeIds = Array.isArray(payload.disputeIds)
        ? payload.disputeIds.filter((id): id is string => typeof id === 'string')
        : [];
      if (disputeIds.length) await options.jobs.publish('evidence.rebuild', { disputeIds });
      await options.database.db
        .update(actions)
        .set({ status: 'done', result: { disputeIds, completedAt: clock.now().toISOString() } })
        .where(eq(actions.id, actionId));
      return;
    }
    const amounts = (payload.amounts ?? {}) as Record<
      string,
      { currency_code: string; value: string }
    >;
    for (const orderId of orderIds) {
      const [order] = await options.database.db
        .select()
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.merchant_id, row.hypothesis.merchant_id)));
      if (!order?.paypal_capture_id)
        throw new AppError('ACTION_ORDER_INVALID', 'Refund order is not captured', 409);
      const client = await options.forMerchant(order.merchant_id);
      const refund = await client.payments.refund(
        order.paypal_capture_id,
        {
          amount: amounts[orderId],
          invoiceId: order.invoice_id,
          noteToPayer: 'Fairfold approved shared-cause refund',
        },
        { requestId: `ff-refund-${actionId}-${orderId}` },
      );
      await options.database.db.transaction(async (tx) => {
        await tx.update(orders).set({ status: 'refunded' }).where(eq(orders.id, orderId));
        await createLedger(tx, clock).append(orderId, {
          type: 'refund',
          actor: 'paypal',
          payload: { refundId: refund.refundId, status: refund.status, actionId },
        });
      });
    }
    await options.database.db
      .update(actions)
      .set({ status: 'done', result: { orderIds, completedAt: clock.now().toISOString() } })
      .where(eq(actions.id, actionId));
  };
}
