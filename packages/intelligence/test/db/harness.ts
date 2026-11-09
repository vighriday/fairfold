// Postgres harness for intelligence integration tests. Runs only with FAIRFOLD_RUN_DB_TESTS=true and an
// isolated loopback fairfold_*test database (Hriday's guard), e.g. via `pnpm --filter @fairfold/intelligence test:db`.
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { fixedClock, type Clock, type JobName, type JobPayload } from '@fairfold/contracts';
import {
  buyers,
  createDatabase,
  disputes,
  inventory_batches,
  merchants,
  migrateDatabase,
  order_items,
  orders,
  products,
  shipments,
} from '@fairfold/db';
import { testDatabaseUrl } from '../../../db/test/environment.js';
import { createIntelRuntime, type IntelRuntime, type Publisher } from '../../src/runtime.js';

export const dbUrl = testDatabaseUrl();

const TABLES = [
  'actions',
  'messages',
  'hypotheses',
  'complaints',
  'complaint_clusters',
  'store_reports',
  'reviews',
  'buyer_network_simulated',
  'signal_contests',
  'buyer_signals',
  'evidence_packs',
  'attestations',
  'disputes',
  'paypal_events',
  'alerts',
  'inspection_rules',
  'ledger_entries',
  'evidence_blobs',
  'shipments',
  'order_items',
  'orders',
  'inventory_batches',
  'products',
  'buyers',
  'merchants',
];

export interface RecordingPublisher extends Publisher {
  published: Array<{ name: JobName; payload: unknown }>;
  debounced: Array<{ name: string; key: string; seconds: number }>;
}

export function recordingPublisher(): RecordingPublisher {
  const published: RecordingPublisher['published'] = [];
  const debounced: RecordingPublisher['debounced'] = [];
  return {
    published,
    debounced,
    async publish<N extends JobName>(name: N, payload: JobPayload<N>) {
      published.push({ name, payload });
      return null;
    },
    async publishDebounced(name, key, seconds) {
      debounced.push({ name, key, seconds });
      return null;
    },
  };
}

export async function openTestDb() {
  const database = createDatabase(dbUrl!);
  await migrateDatabase(database.db);
  return database;
}

export async function resetTables(db: IntelRuntime['db']): Promise<void> {
  await db.execute(sql.raw(`truncate ${TABLES.join(', ')} restart identity cascade`));
}

export function testRuntime(
  db: IntelRuntime['db'],
  over: {
    clock?: Clock;
    models?: IntelRuntime['models'];
    env?: IntelRuntime['env'];
    fetch?: typeof fetch;
  } = {},
) {
  const jobs = recordingPublisher();
  const runtime = createIntelRuntime({
    db,
    jobs,
    clock: over.clock ?? fixedClock('2026-11-09T12:00:00.000Z'),
    env: over.env ?? {},
    models: over.models ?? {},
    fetch: over.fetch,
  });
  return { runtime, jobs };
}

type Db = IntelRuntime['db'];

export async function insertMerchant(db: Db, over: Partial<typeof merchants.$inferInsert> = {}) {
  const [m] = await db
    .insert(merchants)
    .values({
      slug: 'm-' + randomUUID(),
      name: 'Neel Block Prints',
      domain: 'neelblockprints.example',
      country: 'IN',
      is_simulated: true,
      ...over,
    })
    .returning();
  return m!;
}

export async function insertBuyer(db: Db, over: Partial<typeof buyers.$inferInsert> = {}) {
  const [b] = await db
    .insert(buyers)
    .values({ display_name: 'Maya K.', country: 'US', ...over })
    .returning();
  return b!;
}

export async function insertProduct(
  db: Db,
  merchantId: string,
  over: Partial<typeof products.$inferInsert> = {},
) {
  const [p] = await db
    .insert(products)
    .values({
      merchant_id: merchantId,
      sku: 'HD-IND-01',
      name: 'Block-print cotton hoodie',
      description: 'Indigo block-print cotton hoodie',
      colour: 'navy',
      size: 'M',
      unit_value: '38.00',
      ...over,
    })
    .returning();
  return p!;
}

export async function insertBatch(
  db: Db,
  merchantId: string,
  productId: string,
  batchCode: string,
  qtyRemaining = 0,
) {
  const [b] = await db
    .insert(inventory_batches)
    .values({
      merchant_id: merchantId,
      product_id: productId,
      batch_code: batchCode,
      received_at: new Date('2026-08-01T00:00:00Z'),
      qty_received: 100,
      qty_remaining: qtyRemaining,
    })
    .returning();
  return b!;
}

export interface OrderSpec {
  merchantId: string;
  buyerId?: string | null;
  product: { id: string; sku: string; name: string; unit_value: string; listing_version?: string };
  quantity?: number;
  status?: string;
  amount?: string;
  batchCode?: string | null;
  packer?: string | null;
  payerAccountStatus?: string | null;
  shipToHash?: string | null;
  shipToCountry?: string | null;
  createdAt?: Date;
  capturedAt?: Date | null;
  sealedAt?: Date | null;
  shippedAt?: Date | null;
  deliveredAt?: Date | null;
}

export async function insertOrder(db: Db, spec: OrderSpec) {
  const id = randomUUID();
  const qty = spec.quantity ?? 1;
  const [o] = await db
    .insert(orders)
    .values({
      id,
      merchant_id: spec.merchantId,
      buyer_id: spec.buyerId ?? null,
      paypal_order_id: 'SEED-' + id,
      invoice_id: 'FF-' + id,
      status: spec.status ?? 'captured',
      amount_value: spec.amount ?? spec.product.unit_value,
      currency: 'USD',
      ship_to_country: spec.shipToCountry ?? 'US',
      ship_to_hash: spec.shipToHash ?? null,
      payer_account_status: spec.payerAccountStatus ?? null,
      created_at: spec.createdAt ?? spec.capturedAt ?? new Date('2026-11-01T00:00:00Z'),
      captured_at:
        spec.capturedAt === undefined ? new Date('2026-11-01T00:00:00Z') : spec.capturedAt,
      sealed_at: spec.sealedAt ?? null,
      shipped_at: spec.shippedAt ?? null,
      delivered_at: spec.deliveredAt ?? null,
    })
    .returning();
  const [item] = await db
    .insert(order_items)
    .values({
      order_id: id,
      product_id: spec.product.id,
      sku: spec.product.sku,
      name: spec.product.name,
      quantity: qty,
      unit_value: spec.product.unit_value,
      listing_version: spec.product.listing_version ?? 'v1',
      batch_code: spec.batchCode ?? null,
      packed_by: spec.packer ?? null,
    })
    .returning();
  return { order: o!, item: item! };
}

export async function insertShipment(
  db: Db,
  orderId: string,
  over: Partial<typeof shipments.$inferInsert> = {},
) {
  const [s] = await db
    .insert(shipments)
    .values({
      order_id: orderId,
      carrier: 'DHL',
      tracking_number: 'FF' + randomUUID().slice(0, 8),
      ...over,
    })
    .returning();
  return s!;
}

export async function insertDispute(
  db: Db,
  over: Partial<typeof disputes.$inferInsert> & { merchant_id: string },
) {
  const [d] = await db
    .insert(disputes)
    .values({
      id: 'PP-D-' + randomUUID().slice(0, 8),
      reason: 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED',
      status: 'OPEN',
      raw: {},
      ...over,
    })
    .returning();
  return d!;
}
