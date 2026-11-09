// One complaint row per (source, source_ref) (section 7). Buyer reports, low reviews and disputes all land
// here; the complaint.created job then extracts, embeds and schedules a shared-cause scan (task I6).
import { and, eq, sql } from 'drizzle-orm';
import { complaints, order_items } from '@fairfold/db';
import type { DatabaseExecutor } from '@fairfold/ledger';
import type { IntelRuntime } from '../runtime.js';

export interface NewComplaint {
  merchantId: string;
  orderId: string | null;
  buyerId: string | null;
  source: 'buyer_report' | 'dispute' | 'review';
  sourceRef: string;
  text: string;
  imageShas?: string[];
}

/** The order's only item, so product_id is known before extraction; null for multi-item orders. */
async function singleItem(db: DatabaseExecutor, orderId: string | null) {
  if (!orderId) return null;
  const items = await db
    .select({ id: order_items.id, productId: order_items.product_id })
    .from(order_items)
    .where(eq(order_items.order_id, orderId));
  return items.length === 1 ? items[0]! : null;
}

/** Inserts the complaint, or appends text to the existing one for the same source and ref. Returns its id and whether it is new. */
export async function upsertComplaint(
  rt: IntelRuntime,
  c: NewComplaint,
  db: DatabaseExecutor = rt.db,
): Promise<{ id: string; isNew: boolean }> {
  const [existing] = await db
    .select({ id: complaints.id })
    .from(complaints)
    .where(and(eq(complaints.source, c.source), eq(complaints.source_ref, c.sourceRef)));
  if (existing) {
    await db
      .update(complaints)
      .set({ text: sql`${complaints.text} || ${'\n\n' + c.text}` })
      .where(eq(complaints.id, existing.id));
    return { id: existing.id, isNew: false };
  }
  const item = await singleItem(db, c.orderId);
  const [row] = await db
    .insert(complaints)
    .values({
      merchant_id: c.merchantId,
      order_id: c.orderId,
      order_item_id: item?.id ?? null,
      product_id: item?.productId ?? null,
      buyer_id: c.buyerId,
      source: c.source,
      source_ref: c.sourceRef,
      text: c.text,
      image_shas: c.imageShas ?? [],
      created_at: rt.clock.now(),
    })
    .returning({ id: complaints.id });
  return { id: row!.id, isNew: true };
}
