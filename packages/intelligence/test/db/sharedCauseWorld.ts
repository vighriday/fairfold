// A seed-shaped Neel Block Prints world for Shared Cause integration tests (section 19, scaled to the same
// numbers): 200 delivered B14–B16 hoodie orders, 39 delivered and 4 in-transit B17 orders, 18 unshipped
// orders, B17 with stock left, 5 B17 seam complaints, 1 B15 seam complaint and noise. All data is synthetic.
import { randomUUID } from 'node:crypto';
import type { ComplaintExtraction } from '@fairfold/contracts';
import { buyers, complaints, order_items, orders, shipments } from '@fairfold/db';
import { embeddingText, localEmbedding } from '../../src/sharedCause/reader.js';
import type { IntelRuntime } from '../../src/runtime.js';
import { insertBatch, insertMerchant, insertProduct } from './harness.js';

type Db = IntelRuntime['db'];
const DAY = 86_400_000;
const CARRIERS = ['DHL', 'FEDEX', 'UPS', 'OTHER'];

export const SEAM: ComplaintExtraction = {
  category: 'product_defect',
  component: 'sleeve seam',
  failureMode: 'stitching came apart',
  locationOnItem: 'left sleeve',
  severity: 'functional',
  summary: 'The sleeve seam came apart.',
  language: 'en',
};
const SIZE: ComplaintExtraction = {
  ...SEAM,
  category: 'size_fit',
  component: 'chest',
  failureMode: 'runs small',
  locationOnItem: null,
  severity: 'cosmetic',
  summary: 'Runs small.',
};
const LATE: ComplaintExtraction = {
  ...SEAM,
  category: 'late',
  component: null,
  failureMode: 'arrived late',
  locationOnItem: null,
  severity: 'cosmetic',
  summary: 'Arrived late.',
};

export interface WorldOrder {
  id: string;
  itemId: string;
  batch: string | null;
  status: string;
  buyerId: string | null;
  deliveredAt: Date | null;
}

export async function buildWorld(
  db: Db,
  now: Date,
  opts: { safety?: boolean; fault?: Partial<ComplaintExtraction> } = {},
) {
  // The shared fault of the B17 complaints (and the one B15 complaint): the seam by default.
  const fault: ComplaintExtraction = { ...SEAM, ...opts.fault };
  const merchant = await insertMerchant(db);
  const hoodie = await insertProduct(db, merchant.id);
  for (const code of ['B14', 'B15', 'B16']) await insertBatch(db, merchant.id, hoodie.id, code, 0);
  await insertBatch(db, merchant.id, hoodie.id, 'B17', 21);

  const specs: Array<{
    batch: string | null;
    status: string;
    deliveredDaysAgo?: number;
    shippedDaysAgo?: number;
    capturedDaysAgo: number;
    withBuyer: boolean;
  }> = [];
  for (let i = 0; i < 200; i++) {
    const delivered = 15 + (i % 41); // 15–55 days ago: full 14-day exposure, inside the 60-day window
    specs.push({
      batch: ['B14', 'B15', 'B16'][i % 3]!,
      status: 'delivered',
      deliveredDaysAgo: delivered,
      shippedDaysAgo: delivered + 3,
      capturedDaysAgo: delivered + 4,
      withBuyer: false,
    });
  }
  for (let i = 0; i < 39; i++) {
    const delivered = 15 + (i % 15); // 15–29 days ago
    specs.push({
      batch: 'B17',
      status: 'delivered',
      deliveredDaysAgo: delivered,
      shippedDaysAgo: delivered + 3,
      capturedDaysAgo: delivered + 4,
      withBuyer: true,
    });
  }
  for (let i = 0; i < 4; i++)
    specs.push({
      batch: 'B17',
      status: 'shipped',
      shippedDaysAgo: 2,
      capturedDaysAgo: 3,
      withBuyer: true,
    });
  for (let i = 0; i < 18; i++)
    specs.push({ batch: null, status: 'captured', capturedDaysAgo: i % 3, withBuyer: true });

  const ago = (days?: number) => (days === undefined ? null : new Date(now.getTime() - days * DAY));
  const buyerRows = await db
    .insert(buyers)
    .values(
      specs
        .filter((s) => s.withBuyer)
        .map((_, i) => ({ display_name: `Buyer ${i + 1}`, country: 'US' })),
    )
    .returning();
  let nextBuyer = 0;
  const world: WorldOrder[] = specs.map((s) => ({
    id: randomUUID(),
    itemId: randomUUID(),
    batch: s.batch,
    status: s.status,
    buyerId: s.withBuyer ? buyerRows[nextBuyer++]!.id : null,
    deliveredAt: ago(s.deliveredDaysAgo),
  }));
  await db.insert(orders).values(
    specs.map((s, i) => ({
      id: world[i]!.id,
      merchant_id: merchant.id,
      buyer_id: world[i]!.buyerId,
      paypal_order_id: 'SEED-' + world[i]!.id,
      invoice_id: 'FF-' + world[i]!.id,
      status: s.status,
      amount_value: '38.00',
      currency: 'USD',
      ship_to_country: 'US',
      created_at: ago(s.capturedDaysAgo)!,
      captured_at: ago(s.capturedDaysAgo),
      sealed_at: ago(s.shippedDaysAgo),
      shipped_at: ago(s.shippedDaysAgo),
      delivered_at: ago(s.deliveredDaysAgo),
    })),
  );
  await db.insert(order_items).values(
    specs.map((s, i) => ({
      id: world[i]!.itemId,
      order_id: world[i]!.id,
      product_id: hoodie.id,
      sku: hoodie.sku,
      name: hoodie.name,
      quantity: 1,
      unit_value: '38.00',
      listing_version: 'v1',
      batch_code: s.batch,
      packed_by: s.batch ? `station-${(i % 2) + 1}` : null,
    })),
  );
  await db.insert(shipments).values(
    specs.flatMap((s, i) =>
      s.shippedDaysAgo === undefined
        ? []
        : [
            {
              order_id: world[i]!.id,
              carrier: CARRIERS[i % CARRIERS.length]!,
              tracking_number: `TRK${i}`,
              status: s.status === 'delivered' ? 'delivered' : 'in_transit',
            },
          ],
    ),
  );

  const delivered = (batch: string) =>
    world.filter((o) => o.batch === batch && o.status === 'delivered');
  const complaintsSpec: Array<{ order: WorldOrder; e: ComplaintExtraction; afterDays: number }> = [
    ...[3, 5, 7, 9, 12].map((afterDays, i) => ({
      order: delivered('B17')[i * 3]!,
      e: opts.safety && i === 0 ? { ...fault, severity: 'safety' as const } : fault,
      afterDays,
    })),
    { order: delivered('B15')[0]!, e: fault, afterDays: 6 },
    { order: delivered('B14')[1]!, e: SIZE, afterDays: 4 },
    { order: delivered('B15')[2]!, e: SIZE, afterDays: 2 },
    { order: delivered('B16')[3]!, e: SIZE, afterDays: 5 },
    { order: delivered('B14')[4]!, e: LATE, afterDays: 0 },
    { order: delivered('B16')[5]!, e: LATE, afterDays: 0 },
  ];
  const complaintRows = await db
    .insert(complaints)
    .values(
      complaintsSpec.map((c, i) => ({
        merchant_id: merchant.id,
        order_id: c.order.id,
        order_item_id: c.order.itemId,
        product_id: hoodie.id,
        buyer_id: c.order.buyerId,
        source: 'buyer_report',
        source_ref: `seed-report-${i}`,
        text: c.e.summary,
        extracted: c.e,
        embedding: localEmbedding(embeddingText(c.e)),
        created_at: new Date(c.order.deliveredAt!.getTime() + c.afterDays * DAY),
      })),
    )
    .returning();

  return {
    merchant,
    hoodie,
    world,
    complaints: complaintRows,
    seamB17Orders: complaintsSpec.slice(0, 5).map((c) => c.order.id),
    inTransit: world.filter((o) => o.status === 'shipped').map((o) => o.id),
    unshipped: world.filter((o) => o.status === 'captured').map((o) => o.id),
  };
}
