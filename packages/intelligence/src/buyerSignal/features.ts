// Buyer Signal features from this merchant's own records (section 10 / I3). Never the ship-to country.
import { and, eq, gt, isNotNull, lte, ne, sql } from 'drizzle-orm';
import { AppError } from '@fairfold/contracts';
import { buyer_network_simulated, disputes, orders } from '@fairfold/db';
import type { IntelRuntime } from '../runtime.js';
import { toCents, type BuyerFeatures } from './points.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** PayPal dispute_outcome.outcome_code when the case was decided for the seller, i.e. lost by the buyer. */
export const LOST_BY_BUYER = 'RESOLVED_SELLER_FAVOUR';

export type OrderRow = typeof orders.$inferSelect;

export async function loadOrder(rt: IntelRuntime, orderId: string): Promise<OrderRow> {
  const [order] = await rt.db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order not found', 404);
  return order;
}

/** Median in cents (lower middle for an even count, so it stays a whole cent). */
export function medianCents(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.floor((sorted[mid - 1]! + sorted[mid]!) / 2);
}

export const centsToString = (cents: number) =>
  `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;

function payerStatus(value: string | null): BuyerFeatures['payerAccountStatus'] {
  return value === 'VERIFIED' || value === 'UNVERIFIED' ? value : null;
}

export async function buyerFeatures(rt: IntelRuntime, order: OrderRow): Promise<BuyerFeatures> {
  const ref = order.captured_at ?? order.created_at;
  const amount = order.amount_value;
  const medianOf = async () => {
    const rows = await rt.db
      .select({ amount: orders.amount_value })
      .from(orders)
      .where(
        and(
          eq(orders.merchant_id, order.merchant_id),
          isNotNull(orders.captured_at),
          ne(orders.id, order.id),
        ),
      );
    const m = medianCents(rows.map((r) => toCents(r.amount)));
    return m === null ? null : centsToString(m);
  };

  if (!order.buyer_id) {
    return {
      payerAccountStatus: payerStatus(order.payer_account_status),
      priorOrders: 0,
      priorDelivered: 0,
      refundedOrders: 0,
      ownDisputesFiled12m: 0,
      ownDisputesLost12m: 0,
      ordersLast24h: 1,
      newAddress: false,
      amount,
      merchantMedianAmount: await medianOf(),
      network: null,
    };
  }
  const buyerId = order.buyer_id;

  const prior = await rt.db
    .select({
      status: orders.status,
      deliveredAt: orders.delivered_at,
      shipToHash: orders.ship_to_hash,
    })
    .from(orders)
    .where(
      and(
        eq(orders.buyer_id, buyerId),
        eq(orders.merchant_id, order.merchant_id),
        ne(orders.id, order.id),
        isNotNull(orders.captured_at),
        lte(orders.captured_at, ref),
      ),
    );

  const since = new Date(ref.getTime() - 365 * DAY_MS);
  const ownDisputes = await rt.db
    .select({ outcome: disputes.outcome_code })
    .from(disputes)
    .innerJoin(orders, eq(orders.id, disputes.order_id))
    .where(
      and(
        eq(orders.buyer_id, buyerId),
        eq(disputes.merchant_id, order.merchant_id),
        sql`coalesce((${disputes.raw}->>'create_time')::timestamptz, ${disputes.updated_at}) > ${since}`,
      ),
    );

  const dayStart = new Date(ref.getTime() - DAY_MS);
  const recentBy = async (match: ReturnType<typeof eq>) => {
    const [row] = await rt.db
      .select({ n: sql<number>`count(*)::int` })
      .from(orders)
      .where(
        and(
          eq(orders.merchant_id, order.merchant_id),
          ne(orders.id, order.id),
          match,
          gt(orders.captured_at, dayStart),
          lte(orders.captured_at, ref),
        ),
      );
    return (row?.n ?? 0) + 1;
  };
  const byBuyer = await recentBy(eq(orders.buyer_id, buyerId));
  const byAddress = order.ship_to_hash
    ? await recentBy(eq(orders.ship_to_hash, order.ship_to_hash))
    : 1;

  const [network] = await rt.db
    .select({ lost: buyer_network_simulated.disputes_lost_by_buyer_12m })
    .from(buyer_network_simulated)
    .where(eq(buyer_network_simulated.buyer_id, buyerId));

  return {
    payerAccountStatus: payerStatus(order.payer_account_status),
    priorOrders: prior.length,
    priorDelivered: prior.filter((p) => p.deliveredAt !== null || p.status === 'delivered').length,
    refundedOrders: prior.filter((p) => p.status === 'refunded').length,
    ownDisputesFiled12m: ownDisputes.length,
    ownDisputesLost12m: ownDisputes.filter((d) => d.outcome === LOST_BY_BUYER).length,
    ordersLast24h: Math.max(byBuyer, byAddress),
    newAddress:
      prior.length > 0 &&
      order.ship_to_hash !== null &&
      prior.every((p) => p.shipToHash !== order.ship_to_hash),
    amount,
    merchantMedianAmount: await medianOf(),
    network: network ? { disputesLost12m: network.lost } : null,
  };
}
