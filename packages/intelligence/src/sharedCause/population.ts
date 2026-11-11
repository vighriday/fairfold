// The merchant's orders as Shared Cause sees them (section 9 stage 4): one row per order item, with the
// dimension values (batch, listing version, packer, carrier, ship-to country, ship week) and the anchors.
import { asc, eq } from 'drizzle-orm';
import { order_items, orders, shipments } from '@fairfold/db';
import type { IntelRuntime } from '../runtime.js';
import type { PopulationOrder } from './localise.js';

export interface ScanOrder extends PopulationOrder {
  buyerId: string | null;
  invoiceId: string;
  productName: string;
}

export async function loadScanOrders(rt: IntelRuntime, merchantId: string): Promise<ScanOrder[]> {
  return rt.db
    .select({
      orderId: orders.id,
      status: orders.status,
      buyerId: orders.buyer_id,
      invoiceId: orders.invoice_id,
      shipToCountry: orders.ship_to_country,
      shippedAt: orders.shipped_at,
      deliveredAt: orders.delivered_at,
      productId: order_items.product_id,
      productName: order_items.name,
      batchCode: order_items.batch_code,
      listingVersion: order_items.listing_version,
      packer: order_items.packed_by,
      carrier: shipments.carrier,
    })
    .from(orders)
    .innerJoin(order_items, eq(order_items.order_id, orders.id))
    .leftJoin(shipments, eq(shipments.order_id, orders.id))
    .where(eq(orders.merchant_id, merchantId))
    .orderBy(asc(orders.id), asc(order_items.id));
}

/**
 * One row per order: for a product cluster, the order's item of that product (orders without it are left out);
 * for a transit cluster (productId null), the order's first item, since the product is irrelevant.
 */
export function clusterOrders(all: ScanOrder[], productId: string | null): ScanOrder[] {
  const seen = new Set<string>();
  const out: ScanOrder[] = [];
  for (const o of all) {
    if (productId !== null && o.productId !== productId) continue;
    if (seen.has(o.orderId)) continue;
    seen.add(o.orderId);
    out.push(o);
  }
  return out;
}
