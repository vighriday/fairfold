import { z } from 'zod';
import { and, desc, eq, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import {
  AppError,
  BandSchema,
  BuyerSignalSchema,
  ListQuerySchema,
  OrderDetailSchema,
  OrderRowSchema,
  OrderSummarySchema,
  UuidSchema,
  type BuyerSignal,
  type OrderRow,
  type OrderSummary,
} from '@fairfold/contracts';
import {
  alerts,
  buyers,
  buyer_signals,
  complaint_clusters,
  complaints,
  disputes,
  hypotheses,
  order_items,
  orders,
  shipments,
  type Database,
} from '@fairfold/db';
import { createLedger, type DatabaseExecutor } from '@fairfold/ledger';
import { type AuthContext } from '../auth.js';

export const OrderStatusSchema = z.enum([
  'created',
  'approved',
  'captured',
  'packing',
  'sealed',
  'shipped',
  'delivered',
  'refunded',
  'cancelled',
]);
export const OrderListQuerySchema = ListQuerySchema.extend({
  status: OrderStatusSchema.optional(),
});
type Order = typeof orders.$inferSelect;

function context(auth: AuthContext | null, role?: 'buyer' | 'merchant') {
  if (!auth) throw new AppError('UNAUTHENTICATED', 'A valid bearer token is required', 401);
  if (!['buyer', 'merchant'].includes(auth.role) || (role && auth.role !== role))
    throw new AppError('FORBIDDEN', 'This role cannot access the resource', 403);
  if (!UuidSchema.safeParse(auth.subjectId).success)
    throw new AppError('UNAUTHENTICATED', 'A valid bearer token is required', 401);
  return auth;
}

function scope(auth: AuthContext): SQL {
  return eq(auth.role === 'merchant' ? orders.merchant_id : orders.buyer_id, auth.subjectId);
}

function summary(order: Order, items: Array<{ sku: string; name: string; quantity: number }>) {
  return OrderSummarySchema.parse({
    id: order.id,
    merchantId: order.merchant_id,
    status: order.status,
    amount: { currency_code: order.currency, value: order.amount_value },
    createdAt: order.created_at.toISOString(),
    items: items.map(({ sku, name, quantity }) => ({ sku, name, quantity })),
  });
}

async function itemRows(db: DatabaseExecutor, orderIds: string[]) {
  if (!orderIds.length) return [];
  return db
    .select({
      orderId: order_items.order_id,
      id: order_items.id,
      sku: order_items.sku,
      name: order_items.name,
      quantity: order_items.quantity,
      batchCode: order_items.batch_code,
    })
    .from(order_items)
    .where(inArray(order_items.order_id, orderIds))
    .orderBy(order_items.sku, order_items.id);
}

function hold(order: Order) {
  return order.hold_reason && order.held_by_hypothesis_id
    ? { reason: order.hold_reason, hypothesisId: order.held_by_hypothesis_id }
    : null;
}

export function createOrderReads(options: {
  database: Database;
  computeBuyerSignal: (orderId: string) => Promise<BuyerSignal>;
}) {
  function list(auth: AuthContext & { role: 'merchant' }, query: unknown): Promise<OrderRow[]>;
  function list(auth: AuthContext & { role: 'buyer' }, query: unknown): Promise<OrderSummary[]>;
  async function list(auth: AuthContext, query: unknown) {
    const parsed = OrderListQuerySchema.safeParse(query);
    if (!parsed.success || parsed.data.limit > 2_147_483_647)
      throw new AppError('INVALID_ORDER_QUERY', 'Order query is invalid', 400);
    const { limit, status, cursor } = parsed.data;
    return options.database.transaction(
      async (tx) => {
        const owner = and(scope(auth), status ? eq(orders.status, status) : undefined)!;
        let after: SQL | undefined;
        if (cursor !== undefined) {
          if (!UuidSchema.safeParse(cursor).success)
            throw new AppError('INVALID_CURSOR', 'Order cursor is invalid', 400);
          const [anchor] = await tx
            .select({ id: orders.id, createdAt: orders.created_at })
            .from(orders)
            .where(and(owner, eq(orders.id, cursor)));
          if (!anchor) throw new AppError('INVALID_CURSOR', 'Order cursor is invalid', 400);
          after = or(
            lt(orders.created_at, anchor.createdAt),
            and(eq(orders.created_at, anchor.createdAt), lt(orders.id, anchor.id)),
          );
        }
        if (auth.role === 'buyer') {
          const rows = await tx
            .select()
            .from(orders)
            .where(and(owner, after))
            .orderBy(desc(orders.created_at), desc(orders.id))
            .limit(limit);
          const items = await itemRows(
            tx,
            rows.map((row) => row.id),
          );
          return rows.map((row) =>
            summary(
              row,
              items.filter((item) => item.orderId === row.id),
            ),
          );
        }
        const rows = await tx
          .select({
            order: orders,
            buyerDisplayName: buyers.display_name,
            alertCount: sql<number>`(select count(*)::integer from ${alerts} where ${alerts.order_id} = ${orders.id} and ${alerts.merchant_id} = ${orders.merchant_id} and ${alerts.acknowledged_at} is null)`,
            disputeOpen: sql<boolean>`exists(select 1 from ${disputes} where ${disputes.order_id} = ${orders.id} and ${disputes.merchant_id} = ${orders.merchant_id} and ${disputes.status} <> 'RESOLVED' and ${disputes.resolved_at} is null)`,
          })
          .from(orders)
          .leftJoin(buyers, eq(buyers.id, orders.buyer_id))
          .where(and(owner, after))
          .orderBy(desc(orders.created_at), desc(orders.id))
          .limit(limit);
        const items = await itemRows(
          tx,
          rows.map((row) => row.order.id),
        );
        const signals = rows.length
          ? await tx
              .selectDistinctOn([buyer_signals.order_id], {
                orderId: buyer_signals.order_id,
                band: buyer_signals.band,
                reasons: buyer_signals.reasons,
              })
              .from(buyer_signals)
              .innerJoin(
                orders,
                and(
                  eq(orders.id, buyer_signals.order_id),
                  eq(orders.buyer_id, buyer_signals.buyer_id),
                ),
              )
              .where(
                and(
                  eq(buyer_signals.merchant_id, auth.subjectId),
                  eq(orders.merchant_id, auth.subjectId),
                  inArray(
                    orders.id,
                    rows.map((row) => row.order.id),
                  ),
                ),
              )
              .orderBy(
                buyer_signals.order_id,
                desc(buyer_signals.computed_at),
                desc(buyer_signals.id),
              )
          : [];
        return rows.map((row) => {
          const stored = signals.find((signal) => signal.orderId === row.order.id);
          let signal = null;
          if (stored) {
            const parsed = z
              .object({ band: BandSchema, reasons: BuyerSignalSchema.shape.reasons })
              .safeParse(stored);
            if (!parsed.success)
              throw new AppError('STORED_SIGNAL_INVALID', 'Stored buyer signal is invalid', 500);
            signal = {
              band: parsed.data.band,
              topReasons: parsed.data.reasons.slice(0, 3).map((reason) => reason.label),
            };
          }
          return OrderRowSchema.parse({
            ...summary(
              row.order,
              items.filter((item) => item.orderId === row.order.id),
            ),
            buyerDisplayName: row.buyerDisplayName,
            buyerSignal: signal,
            hold: hold(row.order),
            alertCount: row.alertCount,
            disputeOpen: row.disputeOpen,
          });
        });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  return {
    listMerchant(auth: AuthContext | null, query: unknown = {}) {
      return list({ ...context(auth, 'merchant'), role: 'merchant' }, query);
    },
    listBuyer(auth: AuthContext | null, query: unknown = {}) {
      return list({ ...context(auth, 'buyer'), role: 'buyer' }, query);
    },
    async detail(authInput: AuthContext | null, id: string) {
      const auth = context(authInput);
      if (!UuidSchema.safeParse(id).success)
        throw new AppError('INVALID_ORDER_ID', 'Order ID is invalid', 400);
      const result = await options.database.transaction(
        async (tx) => {
          const [row] = await tx
            .select({ order: orders, buyerName: buyers.display_name })
            .from(orders)
            .leftJoin(buyers, eq(buyers.id, orders.buyer_id))
            .where(and(eq(orders.id, id), scope(auth)));
          if (!row) throw new AppError('ORDER_NOT_FOUND', 'Order not found', 404);
          const order = row.order;
          const items = await itemRows(tx, [id]);
          const [shipment] = await tx
            .select({
              carrier: shipments.carrier,
              trackingNumber: shipments.tracking_number,
              status: shipments.status,
              lastScanAt: shipments.last_scan_at,
            })
            .from(shipments)
            .where(eq(shipments.order_id, id));
          const cases = await tx
            .select({
              id: disputes.id,
              reason: disputes.reason,
              status: disputes.status,
              dueAt: disputes.seller_response_due_date,
            })
            .from(disputes)
            .where(and(eq(disputes.order_id, id), eq(disputes.merchant_id, order.merchant_id)))
            .orderBy(disputes.id);
          const chain = await createLedger(tx).verify(id);
          const related =
            auth.role === 'merchant'
              ? await tx
                  .select({
                    hypothesisId: hypotheses.id,
                    label: complaint_clusters.label,
                    status: hypotheses.status,
                  })
                  .from(hypotheses)
                  .innerJoin(
                    complaint_clusters,
                    and(
                      eq(complaint_clusters.id, hypotheses.cluster_id),
                      eq(complaint_clusters.merchant_id, order.merchant_id),
                    ),
                  )
                  .where(
                    and(
                      eq(hypotheses.merchant_id, order.merchant_id),
                      or(
                        order.held_by_hypothesis_id
                          ? eq(hypotheses.id, order.held_by_hypothesis_id)
                          : undefined,
                        sql`(${hypotheses.affected}->'unshipped') @> ${JSON.stringify([id])}::jsonb`,
                        sql`(${hypotheses.affected}->'inTransit') @> ${JSON.stringify([id])}::jsonb`,
                        sql`(${hypotheses.affected}->'deliveredNoComplaint') @> ${JSON.stringify([id])}::jsonb`,
                        cases.length
                          ? sql`(${hypotheses.affected}->'openDisputes') ?| ${cases.map((row) => row.id)}::text[]`
                          : undefined,
                        sql`exists(select 1 from ${complaints} where ${complaints.cluster_id} = ${hypotheses.cluster_id} and ${complaints.order_id} = ${id} and ${complaints.merchant_id} = ${order.merchant_id})`,
                      ),
                    ),
                  )
                  .orderBy(hypotheses.created_at, hypotheses.id)
              : [];
          return OrderDetailSchema.parse({
            id: order.id,
            paypalOrderId: order.paypal_order_id,
            paypalCaptureId: order.paypal_capture_id,
            status: order.status,
            amount: { currency_code: order.currency, value: order.amount_value },
            items: items.map(({ id, sku, name, quantity, batchCode }) => ({
              id,
              sku,
              name,
              quantity,
              batchCode: auth.role === 'merchant' ? batchCode : null,
            })),
            buyer: order.buyer_id
              ? {
                  id: order.buyer_id,
                  displayName: row.buyerName,
                  payerAccountStatus: auth.role === 'merchant' ? order.payer_account_status : null,
                }
              : null,
            sellerProtection: {
              status: order.seller_protection_status,
              disputeCategories: order.seller_protection_categories ?? [],
            },
            buyerSignal: null,
            shipment: shipment
              ? { ...shipment, lastScanAt: shipment.lastScanAt?.toISOString() ?? null }
              : null,
            hold: auth.role === 'merchant' ? hold(order) : null,
            ledger: { length: chain.entries.length, verified: chain.verified },
            disputes: cases.map((row) => ({ ...row, dueAt: row.dueAt?.toISOString() ?? null })),
            sharedCauses: related,
          });
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      );
      if (auth.role === 'merchant') {
        const signal = BuyerSignalSchema.safeParse(await options.computeBuyerSignal(id));
        if (!signal.success)
          throw new AppError('BUYER_SIGNAL_INVALID', 'Buyer signal is invalid', 502);
        result.buyerSignal = signal.data;
      }
      return result;
    },
  };
}
