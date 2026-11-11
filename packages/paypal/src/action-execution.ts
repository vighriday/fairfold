import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  AppError,
  systemClock,
  type Clock,
  type JobPayload,
  type Money,
} from '@fairfold/contracts';
import {
  actions,
  disputes,
  hypotheses,
  inspection_rules,
  inventory_batches,
  ledger_entries,
  messages,
  orders,
  withTransaction,
  type createDatabase,
} from '@fairfold/db';
import { createLedger } from '@fairfold/ledger';
import type { Jobs } from '@fairfold/jobs';
import type { PayPalMerchantClient } from './client.js';
import { validateActionPayload } from './action-policy.js';
import { assertDisputeActionAvailable } from './dispute-guards.js';
import { redactDisputeText } from './dispute-policy.js';
import { moneyMinor } from './money.js';
import { PayPalError } from './errors.js';

type Tx = Parameters<Parameters<ReturnType<typeof createDatabase>['db']['transaction']>[0]>[0];
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function createActionHandler(options: {
  database: Pick<ReturnType<typeof createDatabase>, 'db' | 'pool'>;
  jobs: Pick<Jobs, 'publish'>;
  forMerchant: (merchantId: string) => Promise<PayPalMerchantClient>;
  clock?: Clock;
}) {
  const clock = options.clock ?? systemClock;
  return async ({ actionId }: JobPayload<'action.approved'>) => {
    const claim = await withTransaction(options.database, async (tx, queueDb) => {
      const [row] = await tx
        .select({ action: actions, hypothesis: hypotheses })
        .from(actions)
        .innerJoin(hypotheses, eq(hypotheses.id, actions.hypothesis_id))
        .where(eq(actions.id, actionId))
        .for('update');
      if (!row) throw new AppError('ACTION_NOT_FOUND', 'Action was not found', 404);
      if (row.action.status === 'done') return null;
      if (
        row.action.status !== 'approved' ||
        row.action.approved_by !== 'merchant:' + row.hypothesis.merchant_id
      )
        throw new AppError('ACTION_NOT_APPROVED', 'Recorded merchant approval is required', 409);
      if (row.action.result !== null)
        throw new AppError(
          'ACTION_RECONCILIATION_REQUIRED',
          'Claimed action requires reconciliation before retry',
          409,
        );
      const payload = validateActionPayload(row.action.type, row.action.payload);
      const merchantId = row.hypothesis.merchant_id;
      const actor = ('merchant:' + merchantId) as `merchant:${string}`;
      const done = async (result: Record<string, unknown>) =>
        tx
          .update(actions)
          .set({ status: 'done', result: { ...result, completedAt: clock.now().toISOString() } })
          .where(eq(actions.id, actionId));
      const ownedOrders = async (ids: string[]) => {
        if (!ids.length) return [];
        const owned = await tx
          .select()
          .from(orders)
          .where(and(eq(orders.merchant_id, merchantId), inArray(orders.id, ids)))
          .orderBy(orders.id)
          .for('update');
        if (owned.length !== ids.length)
          throw new AppError(
            'ACTION_OWNERSHIP_FAILED',
            'Action contains an unavailable order',
            409,
          );
        return owned;
      };
      if (row.action.type === 'hold_orders' || row.action.type === 'release_orders') {
        const owned = await ownedOrders(payload.orderIds as string[]);
        const release = row.action.type === 'release_orders';
        for (const order of owned) {
          if (!['captured', 'packing'].includes(order.status))
            throw new AppError(
              'ACTION_ORDER_STATE',
              'Only unshipped orders may be held or released',
              409,
            );
          if (
            (release && order.held_by_hypothesis_id !== row.hypothesis.id) ||
            (!release &&
              order.held_by_hypothesis_id &&
              order.held_by_hypothesis_id !== row.hypothesis.id)
          )
            throw new AppError(
              'ACTION_HOLD_CONFLICT',
              'The hold belongs to another hypothesis',
              409,
            );
          await tx
            .update(orders)
            .set({
              hold_reason: release ? null : 'Shared product issue under review',
              held_by_hypothesis_id: release ? null : row.hypothesis.id,
            })
            .where(eq(orders.id, order.id));
          await createLedger(tx, clock).append(order.id, {
            type: release ? 'released' : 'held',
            actor,
            payload: { hypothesisId: row.hypothesis.id, actionId },
          });
        }
        if (row.hypothesis.dimension === 'batch_code') {
          const [batch] = await tx
            .select()
            .from(inventory_batches)
            .where(
              and(
                eq(inventory_batches.merchant_id, merchantId),
                eq(inventory_batches.batch_code, row.hypothesis.value),
              ),
            )
            .for('update');
          if (!batch || batch.status === 'retired')
            throw new AppError('ACTION_BATCH_INVALID', 'Hypothesis batch is unavailable', 409);
          if (release) {
            const [other] = await tx
              .select({ id: hypotheses.id })
              .from(hypotheses)
              .where(
                and(
                  eq(hypotheses.merchant_id, merchantId),
                  eq(hypotheses.dimension, 'batch_code'),
                  eq(hypotheses.value, batch.batch_code),
                  inArray(hypotheses.status, ['open', 'confirmed']),
                  sql`${hypotheses.id} <> ${row.hypothesis.id}`,
                ),
              );
            if (other)
              throw new AppError(
                'ACTION_HOLD_CONFLICT',
                'Another active hypothesis covers this batch',
                409,
              );
          }
          await tx
            .update(inventory_batches)
            .set({ status: release ? 'active' : 'on_hold' })
            .where(eq(inventory_batches.id, batch.id));
        }
        const ruleIds = (payload.inspectionRuleIds ?? []) as string[];
        if (release && ruleIds.length) {
          const disabled = await tx
            .update(inspection_rules)
            .set({ active: false })
            .where(
              and(
                eq(inspection_rules.merchant_id, merchantId),
                eq(inspection_rules.created_by_hypothesis_id, row.hypothesis.id),
                inArray(inspection_rules.id, ruleIds),
              ),
            )
            .returning({ id: inspection_rules.id });
          if (disabled.length !== ruleIds.length)
            throw new AppError(
              'ACTION_OWNERSHIP_FAILED',
              'Inspection rule belongs to another hypothesis',
              409,
            );
        }
        await done({
          orderIds: payload.orderIds,
          ...(release ? { inspectionRuleIds: ruleIds } : {}),
        });
        return null;
      }
      if (row.action.type === 'add_inspection_rule') {
        const [batch] = await tx
          .select()
          .from(inventory_batches)
          .where(
            and(
              eq(inventory_batches.merchant_id, merchantId),
              eq(inventory_batches.batch_code, payload.batchCode as string),
            ),
          )
          .for('update');
        if (!batch || (payload.productId && payload.productId !== batch.product_id))
          throw new AppError('ACTION_BATCH_INVALID', 'Inspection batch is unavailable', 409);
        await tx.insert(inspection_rules).values({
          merchant_id: merchantId,
          product_id: batch.product_id,
          batch_code: batch.batch_code,
          instruction: payload.instruction as string,
          required_photo_label: payload.requiredPhotoLabel as string,
          created_by_hypothesis_id: row.hypothesis.id,
          created_at: clock.now(),
        });
        await done({ batchCode: batch.batch_code });
        return null;
      }
      if (row.action.type === 'propose_offers') {
        const ids = payload.disputeIds as string[];
        const owned = await tx
          .select({ id: disputes.id })
          .from(disputes)
          .where(and(eq(disputes.merchant_id, merchantId), inArray(disputes.id, ids)));
        if (owned.length !== ids.length)
          throw new AppError(
            'ACTION_OWNERSHIP_FAILED',
            'Action contains an unavailable dispute',
            409,
          );
        if (!(await options.jobs.publish('evidence.rebuild', { disputeIds: ids }, { db: queueDb })))
          throw new AppError('ACTION_QUEUE_FAILED', 'Evidence rebuild could not be queued', 503);
        await done({ disputeIds: ids });
        return null;
      }
      if (row.action.type === 'send_buyer_messages') {
        if (row.hypothesis.safety_flag)
          throw new AppError(
            'SAFETY_REVIEW_REQUIRED',
            'Safety complaints require manual review before messaging',
            409,
          );
        const ids = payload.messageIds as string[];
        const owned = await tx
          .select()
          .from(messages)
          .where(and(eq(messages.merchant_id, merchantId), inArray(messages.id, ids)))
          .orderBy(messages.id)
          .for('update');
        if (
          owned.length !== ids.length ||
          owned.some(
            (message) =>
              message.action_id !== actionId || !['draft', 'approved'].includes(message.status),
          )
        )
          throw new AppError(
            'ACTION_OWNERSHIP_FAILED',
            'Action contains an unavailable message',
            409,
          );
        for (const message of owned) {
          redactDisputeText(message.body);
          if (message.subject) redactDisputeText(message.subject);
          if (message.order_id) {
            const [order] = await ownedOrders([message.order_id]);
            if (message.buyer_id && order!.buyer_id !== message.buyer_id)
              throw new AppError('ACTION_OWNERSHIP_FAILED', 'Message buyer does not match', 409);
          }
          if (message.dispute_id) {
            const [dispute] = await tx
              .select()
              .from(disputes)
              .where(
                and(eq(disputes.id, message.dispute_id), eq(disputes.merchant_id, merchantId)),
              );
            if (!dispute || (message.order_id && dispute.order_id !== message.order_id))
              throw new AppError('ACTION_OWNERSHIP_FAILED', 'Message dispute does not match', 409);
          }
        }
      } else {
        const owned = await ownedOrders(payload.orderIds as string[]);
        const amounts = payload.amounts as Record<string, Money>;
        for (const order of owned) {
          if (
            !order.paypal_capture_id ||
            ['created', 'approved', 'refunded', 'cancelled'].includes(order.status) ||
            amounts[order.id]!.currency_code !== order.currency ||
            moneyMinor(amounts[order.id]!) <= 0n
          )
            throw new AppError(
              'ACTION_REFUND_INVALID',
              'Approved refund does not match a captured order',
              409,
            );
          const [uncertain] = await tx
            .select({ id: actions.id })
            .from(actions)
            .innerJoin(hypotheses, eq(hypotheses.id, actions.hypothesis_id))
            .where(
              and(
                eq(hypotheses.merchant_id, merchantId),
                eq(actions.type, 'proactive_refund'),
                sql`${actions.id} <> ${actionId}`,
                sql`${actions.payload}->'orderIds' ? ${order.id}`,
                sql`${actions.result}->>'outcome' = 'outcome_unknown'`,
              ),
            );
          if (uncertain)
            throw new AppError(
              'ACTION_RECONCILIATION_REQUIRED',
              'Another refund for this order requires reconciliation',
              409,
            );
          const refunds = await tx
            .select({ payload: ledger_entries.payload })
            .from(ledger_entries)
            .where(and(eq(ledger_entries.order_id, order.id), eq(ledger_entries.type, 'refund')));
          let reserved = 0n;
          for (const refund of refunds) {
            const prior = object(refund.payload);
            if (!prior.amount)
              throw new AppError(
                'ACTION_RECONCILIATION_REQUIRED',
                'Earlier refund amount requires reconciliation',
                409,
              );
            reserved += moneyMinor(prior.amount as Money);
          }
          if (
            moneyMinor(amounts[order.id]!) + reserved >
            moneyMinor({ currency_code: order.currency, value: order.amount_value })
          )
            throw new AppError(
              'ACTION_REFUND_INVALID',
              'Approved refund exceeds the remaining captured amount',
              409,
            );
        }
      }
      await tx
        .update(actions)
        .set({
          result: { outcome: 'outcome_unknown', claimedAt: clock.now().toISOString(), entries: [] },
        })
        .where(eq(actions.id, actionId));
      return { ...row, payload };
    });
    if (!claim) return;
    const merchantId = claim.hypothesis.merchant_id;
    const actor = ('merchant:' + merchantId) as `merchant:${string}`;
    const entries: Record<string, unknown>[] = [];
    let attempted = false;
    let vendorCompleted = false;
    const record = async (entry: Record<string, unknown>, work: (tx: Tx) => Promise<void>) => {
      entries.push(entry);
      await options.database.db.transaction(async (tx) => {
        await work(tx);
        await tx
          .update(actions)
          .set({
            result: { outcome: 'outcome_unknown', entries, observedAt: clock.now().toISOString() },
          })
          .where(eq(actions.id, actionId));
      });
    };
    try {
      if (claim.action.type === 'send_buyer_messages') {
        for (const messageId of claim.payload.messageIds as string[]) {
          attempted = false;
          vendorCompleted = false;
          const [message] = await options.database.db
            .select()
            .from(messages)
            .where(eq(messages.id, messageId));
          if (!message) throw new AppError('MESSAGE_NOT_FOUND', 'Message was not found', 404);
          const body = redactDisputeText(message.body);
          let sentToPayPal = false;
          if (message.dispute_id) {
            const paypal = await options.forMerchant(merchantId);
            const fresh = await paypal.disputes.get(message.dispute_id);
            if (object(fresh).dispute_life_cycle_stage === 'INQUIRY') {
              assertDisputeActionAvailable(fresh, {
                disputeId: message.dispute_id,
                operation: 'send_message',
              });
              attempted = true;
              await paypal.disputes.sendMessage(message.dispute_id, body, {
                requestId: 'ff-message-' + message.id,
              });
              vendorCompleted = true;
              sentToPayPal = true;
            } else if (message.channel === 'paypal_dispute')
              throw new AppError(
                'STAGE_CHANGED',
                'PayPal dispute no longer accepts this message',
                409,
              );
          } else if (message.channel === 'paypal_dispute')
            throw new AppError('ACTION_PAYLOAD_INVALID', 'PayPal message requires a dispute', 409);
          await record({ messageId, outcome: 'submitted', sentToPayPal }, async (tx) => {
            await tx
              .update(messages)
              .set({
                body,
                subject: message.subject ? redactDisputeText(message.subject) : null,
                status: 'sent',
                sent_at: clock.now(),
              })
              .where(eq(messages.id, messageId));
            if (message.order_id)
              await createLedger(tx, clock).append(message.order_id, {
                type: 'message_sent',
                actor,
                payload: { messageId, actionId, channel: message.channel, sentToPayPal },
              });
          });
        }
      } else {
        for (const orderId of claim.payload.orderIds as string[]) {
          attempted = false;
          vendorCompleted = false;
          const [order] = await options.database.db
            .select()
            .from(orders)
            .where(eq(orders.id, orderId));
          if (!order?.paypal_capture_id)
            throw new AppError('ACTION_ORDER_INVALID', 'Refund order is unavailable', 409);
          const amount = (claim.payload.amounts as Record<string, Money>)[orderId]!;
          const paypal = await options.forMerchant(merchantId);
          attempted = true;
          const result = await paypal.payments.refund(
            order.paypal_capture_id,
            {
              amount,
              invoiceId: order.invoice_id,
              noteToPayer: 'Fairfold approved shared-cause refund',
            },
            { requestId: 'ff-refund-' + actionId + '-' + orderId },
          );
          vendorCompleted = true;
          await record(
            {
              orderId,
              refundId: result.refundId,
              status: result.status,
              amount,
              outcome: 'submitted',
            },
            async (tx) => {
              if (
                result.status === 'COMPLETED' &&
                moneyMinor(amount) ===
                  moneyMinor({ currency_code: order.currency, value: order.amount_value })
              )
                await tx.update(orders).set({ status: 'refunded' }).where(eq(orders.id, orderId));
              await createLedger(tx, clock).append(orderId, {
                type: 'refund',
                actor: 'paypal',
                payload: { refundId: result.refundId, status: result.status, amount, actionId },
              });
            },
          );
        }
      }
      await options.database.db
        .update(actions)
        .set({
          status: 'done',
          result: { outcome: 'submitted', entries, completedAt: clock.now().toISOString() },
        })
        .where(eq(actions.id, actionId));
    } catch (error) {
      const unknown =
        vendorCompleted ||
        (attempted &&
          (!(error instanceof AppError) || (error instanceof PayPalError && error.outcomeUnknown)));
      await options.database.db
        .update(actions)
        .set({
          status: 'failed',
          result: {
            outcome: unknown ? 'outcome_unknown' : 'failed',
            entries,
            errorCode: error instanceof AppError ? error.code : 'ACTION_EXECUTION_FAILED',
            observedAt: clock.now().toISOString(),
          },
        })
        .where(eq(actions.id, actionId));
      throw new AppError(
        unknown ? 'ACTION_RECONCILIATION_REQUIRED' : 'ACTION_EXECUTION_FAILED',
        unknown
          ? 'Action outcome requires reconciliation; do not resubmit'
          : 'Approved action failed; review its result',
        409,
      );
    }
  };
}
