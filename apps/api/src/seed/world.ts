// The demo world of architecture section 19, "the B17 story", built by `pnpm seed`. Every store, buyer and order is
// fictional; every seeded PayPal identifier starts with SEED-. Ishaan's fixture JSON (packages/intelligence/eval/
// fixtures) supplies the complaint and review texts, with pre-read extractions marked model 'seed', so seeding makes no
// Complaint Reader call. The world is the same every time: ids are derived from fixed keys, choices come from a
// generator seeded with "fairfold", and every row is inserted only when absent, so a second run changes nothing.
// It ends, as section 19 says, with one shared-cause scan for Neel, then the three store reports.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import { and, eq, sql } from 'drizzle-orm';
import {
  ComplaintExtractionSchema,
  DemoSubjects,
  fixedClock,
  type AttestationResult,
  type ComplaintExtraction,
} from '@fairfold/contracts';
import {
  attestations,
  buyer_network_simulated,
  buyers,
  complaints,
  disputes,
  inventory_batches,
  merchants,
  order_items,
  orders,
  products,
  reviews,
  shipments,
  type Database,
} from '@fairfold/db';
import {
  buildStoreReportWith,
  runSharedCauseScanWith,
  type IntelRuntime,
} from '@fairfold/intelligence';
import { createBlobStore, createLedger } from '@fairfold/ledger';
import { SandboxHoodie } from '../checkout/setup-sandbox.js';

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** Neel is the real sandbox merchant setup:sandbox provisions; Indigo Loom and QuickTees Outlet are simulated. */
export const SEED_MERCHANTS = {
  neel: DemoSubjects.merchant,
  indigo: '00000000-0000-4000-8000-000000000102',
  quicktees: '00000000-0000-4000-8000-000000000103',
} as const;
type MerchantKey = keyof typeof SEED_MERCHANTS;

const MERCHANT_ROWS: Record<MerchantKey, typeof merchants.$inferInsert> = {
  neel: {
    id: SEED_MERCHANTS.neel,
    slug: SandboxHoodie.slug,
    name: SandboxHoodie.name,
    domain: SandboxHoodie.domain,
    country: SandboxHoodie.country,
    is_simulated: false,
    policy_urls: [
      { kind: 'returns', url: 'https://neelblockprints.example/policies/returns' },
      { kind: 'shipping', url: 'https://neelblockprints.example/policies/shipping' },
      { kind: 'contact', url: 'https://neelblockprints.example/contact' },
    ],
    domain_registered_at: new Date('2019-03-01T00:00:00.000Z'),
  },
  indigo: {
    id: SEED_MERCHANTS.indigo,
    slug: 'indigo-loom',
    name: 'Indigo Loom',
    domain: 'indigoloom.example',
    country: 'IN',
    is_simulated: true,
    policy_urls: [
      { kind: 'returns', url: 'https://indigoloom.example/returns' },
      { kind: 'shipping', url: 'https://indigoloom.example/shipping' },
      { kind: 'contact', url: 'https://indigoloom.example/contact' },
    ],
    domain_registered_at: new Date('2016-07-12T00:00:00.000Z'),
  },
  quicktees: {
    id: SEED_MERCHANTS.quicktees,
    slug: 'quicktees-outlet',
    name: 'QuickTees Outlet',
    domain: 'quicktees-outlet.example',
    country: 'IN',
    is_simulated: true,
    policy_urls: [{ kind: 'contact', url: 'https://quicktees-outlet.example/contact' }],
    domain_registered_at: new Date('2026-06-20T00:00:00.000Z'),
  },
};

interface ProductSpec {
  merchant: MerchantKey;
  sku: string;
  name: string;
  description: string;
  colour: string;
  size: string;
  value: string;
}

const PRODUCTS = {
  neelHoodie: {
    merchant: 'neel',
    sku: SandboxHoodie.sku,
    name: SandboxHoodie.productName,
    description: 'Indigo block-print cotton hoodie, hand-printed in Jaipur.',
    colour: 'navy',
    size: 'M',
    value: SandboxHoodie.value,
  },
  neelTee: {
    merchant: 'neel',
    sku: 'TS-IND-02',
    name: 'Hand-block T-shirt',
    description: 'Hand-block printed cotton T-shirt in ochre.',
    colour: 'ochre',
    size: 'M',
    value: '12.00',
  },
  indigoKurta: {
    merchant: 'indigo',
    sku: 'IL-KUR-01',
    name: 'Handloom cotton kurta',
    description: 'Handwoven indigo-dyed cotton kurta.',
    colour: 'indigo',
    size: 'M',
    value: '45.00',
  },
  indigoHoodie: {
    merchant: 'indigo',
    sku: 'IL-HD-02',
    name: 'Handloom navy hoodie',
    description: 'Handloom cotton hoodie in navy.',
    colour: 'navy',
    size: 'M',
    value: '52.00',
  },
  quickHoodie: {
    merchant: 'quicktees',
    sku: 'QT-HD-01',
    name: 'Plain navy hoodie',
    description: 'Plain cotton-blend hoodie.',
    colour: 'navy',
    size: 'M',
    value: '29.00',
  },
  quickTee: {
    merchant: 'quicktees',
    sku: 'QT-TEE-01',
    name: 'Plain cotton tee',
    description: 'Plain cotton tee.',
    colour: 'white',
    size: 'M',
    value: '9.00',
  },
} satisfies Record<string, ProductSpec>;
type ProductKey = keyof typeof PRODUCTS;

/** Batch code → its product and how many days ago it was received (section 19 for the hoodie batches). */
const BATCHES: Record<string, { product: ProductKey; receivedDaysAgo: number; remaining: number }> =
  {
    B14: { product: 'neelHoodie', receivedDaysAgo: 75, remaining: 0 },
    B15: { product: 'neelHoodie', receivedDaysAgo: 65, remaining: 0 },
    B16: { product: 'neelHoodie', receivedDaysAgo: 50, remaining: 0 },
    B17: { product: 'neelHoodie', receivedDaysAgo: 32, remaining: 21 },
    T01: { product: 'neelTee', receivedDaysAgo: 100, remaining: 0 },
    T02: { product: 'neelTee', receivedDaysAgo: 70, remaining: 0 },
    T03: { product: 'neelTee', receivedDaysAgo: 45, remaining: 0 },
    'IL-K01': { product: 'indigoKurta', receivedDaysAgo: 100, remaining: 12 },
    'IL-H01': { product: 'indigoHoodie', receivedDaysAgo: 100, remaining: 12 },
    'QT-H01': { product: 'quickHoodie', receivedDaysAgo: 100, remaining: 30 },
    'QT-T01': { product: 'quickTee', receivedDaysAgo: 100, remaining: 30 },
  };

const CARRIERS = ['DHL', 'FEDEX', 'UPS', 'OTHER'] as const;
/** Orders written at once; below the database pool's 10 connections. */
const ORDER_CONCURRENCY = 6;
const COUNTRIES = ['US', 'US', 'US', 'GB', 'DE', 'CA', 'AU', 'FR', 'NL'];

/** A version-4-shaped uuid derived from a fixed key, so every seeded row has the same id on every run. */
export function seedId(key: string): string {
  const h = createHash('sha256').update(`fairfold:${key}`).digest('hex');
  const variant = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Section 19's "seeded random generator, seed fairfold" (mulberry32). */
function generator(seed: string) {
  let state = createHash('sha256').update(seed).digest().readUInt32BE(0);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A small PNG that differs for every n, so no two seeded packing photos share a SHA-256. */
function packingPhoto(n: number): Buffer {
  const width = 64;
  const height = 48;
  const row = Buffer.alloc(1 + width * 3);
  const raw = Buffer.alloc(row.length * height);
  for (let y = 0; y < height; y++) {
    const offset = y * row.length;
    raw[offset] = 0;
    for (let x = 0; x < width; x++) {
      const p = offset + 1 + x * 3;
      raw[p] = (n * 37 + x) & 0xff;
      raw[p + 1] = ((n >> 8) * 61 + y) & 0xff;
      raw[p + 2] = (n * 11 + x + y) & 0xff;
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

interface OrderSpec {
  key: string;
  merchant: MerchantKey;
  product: ProductKey;
  batch: string | null;
  status: 'captured' | 'shipped' | 'delivered' | 'refunded';
  capturedAt: Date;
  sealedAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  trackingAt: Date | null;
  lastScanAt: Date | null;
  refundedAt: Date | null;
  carrier: (typeof CARRIERS)[number] | null;
  packer: string | null;
  buyer: string;
  address: string;
  country: string;
  verified: boolean;
}

interface Fixtures {
  complaints: Array<{
    id: string;
    product: string;
    batch: string;
    carrier: string;
    category: string;
    daysAfterDelivery: number;
    text: string;
    model: string;
    extracted: unknown;
  }>;
  reviews: Array<{
    id: string;
    merchant: string;
    buyerRef: string;
    rating: number;
    text: string;
    merchantReply: string | null;
    model?: string;
    extracted?: unknown;
  }>;
}

function loadFixtures(): Fixtures {
  const read = (name: string) =>
    JSON.parse(
      readFileSync(
        new URL(`../../../../packages/intelligence/eval/fixtures/${name}`, import.meta.url),
        'utf8',
      ),
    ) as Record<string, unknown>;
  return {
    complaints: read('complaints.json').seed as Fixtures['complaints'],
    reviews: read('reviews.json').reviews as Fixtures['reviews'],
  };
}

/** The world's orders, buyers, complaints and reviews, laid out in memory before anything is written. */
function plan(now: Date, fixtures: Fixtures) {
  const random = generator('fairfold');
  const t = (msAgo: number) => new Date(now.getTime() - msAgo);
  const specs: OrderSpec[] = [];
  let carrierTurn = 0;

  /** An order that was captured, packed, sealed, shipped and (unless `inTransit`) delivered. */
  const sealed = (o: {
    key: string;
    merchant: MerchantKey;
    product: ProductKey;
    batch: string;
    deliveredDaysAgo?: number;
    capturedDaysAgo?: number;
    slowTracking?: boolean;
    inTransit?: { lastScanDaysAgo: number };
    status?: OrderSpec['status'];
  }) => {
    const hours = Math.floor(random() * 10) * HOUR;
    let capturedAt: Date;
    let deliveredAt: Date | null = null;
    if (o.deliveredDaysAgo !== undefined) {
      deliveredAt = t(o.deliveredDaysAgo * DAY + hours);
      capturedAt = new Date(deliveredAt.getTime() - 3 * DAY - 22 * HOUR);
    } else capturedAt = t(o.capturedDaysAgo! * DAY + hours);
    const sealedAt = new Date(capturedAt.getTime() + (o.slowTracking ? 30 : 20) * HOUR);
    const shippedAt = new Date(sealedAt.getTime() + 2 * HOUR);
    if (o.inTransit) deliveredAt = null;
    const carrier = CARRIERS[carrierTurn++ % CARRIERS.length]!;
    const spec: OrderSpec = {
      key: o.key,
      merchant: o.merchant,
      product: o.product,
      batch: o.batch,
      status: o.status ?? (deliveredAt ? 'delivered' : 'shipped'),
      capturedAt,
      sealedAt,
      shippedAt,
      deliveredAt,
      trackingAt: new Date(
        o.slowTracking ? capturedAt.getTime() + 100 * HOUR : sealedAt.getTime() + HOUR,
      ),
      lastScanAt: o.inTransit ? t(o.inTransit.lastScanDaysAgo * DAY) : deliveredAt,
      refundedAt: null,
      carrier,
      packer: `station-${(specs.length % 2) + 1}`,
      buyer: `order:${o.key}`,
      address: `order:${o.key}`,
      country: COUNTRIES[Math.floor(random() * COUNTRIES.length)]!,
      verified: random() > 0.08,
    };
    specs.push(spec);
    return spec;
  };
  const captured = (key: string, capturedDaysAgo: number, buyer?: string, address?: string) => {
    const spec: OrderSpec = {
      key,
      merchant: 'neel',
      product: 'neelHoodie',
      batch: null,
      status: 'captured',
      capturedAt: t(capturedDaysAgo * DAY + Math.floor(random() * 10) * HOUR),
      sealedAt: null,
      shippedAt: null,
      deliveredAt: null,
      trackingAt: null,
      lastScanAt: null,
      refundedAt: null,
      carrier: null,
      packer: null,
      buyer: buyer ?? `order:${key}`,
      address: address ?? `order:${key}`,
      country: COUNTRIES[Math.floor(random() * COUNTRIES.length)]!,
      verified: random() > 0.08,
    };
    specs.push(spec);
    return spec;
  };

  // Neel's hoodie: 200 delivered orders from B14–B16 and 39 from B17, all delivered 15–55 days ago (full 14-day
  // exposure, inside the 60-day population) and after their batch arrived; 4 B17 orders in transit.
  const ranges = { B14: [40, 16], B15: [25, 31], B16: [15, 31] } as const;
  for (let i = 0; i < 200; i++) {
    const batch = (['B14', 'B15', 'B16'] as const)[i % 3]!;
    const j = Math.floor(i / 3);
    const [from, span] = ranges[batch];
    sealed({
      key: `neel:hoodie:${batch}:${j}`,
      merchant: 'neel',
      product: 'neelHoodie',
      batch,
      deliveredDaysAgo: from + (j % span),
    });
  }
  for (let j = 0; j < 39; j++)
    sealed({
      key: `neel:hoodie:B17:${j}`,
      merchant: 'neel',
      product: 'neelHoodie',
      batch: 'B17',
      deliveredDaysAgo: 15 + (j % 14),
    });
  for (let j = 0; j < 4; j++)
    sealed({
      key: `neel:hoodie:B17:transit:${j}`,
      merchant: 'neel',
      product: 'neelHoodie',
      batch: 'B17',
      capturedDaysAgo: 3,
      inTransit: { lastScanDaysAgo: 1 },
    });

  // Neel's T-shirt: 80 delivered orders, and the watchdog's shipped order whose last scan was 4 days ago.
  const teeRanges = { T01: [60, 26, 27], T02: [30, 31, 27], T03: [15, 24, 26] } as const;
  for (const batch of ['T01', 'T02', 'T03'] as const) {
    const [from, span, count] = teeRanges[batch];
    for (let j = 0; j < count; j++)
      sealed({
        key: `neel:tee:${batch}:${j}`,
        merchant: 'neel',
        product: 'neelTee',
        batch,
        deliveredDaysAgo: from + (j % span),
      });
  }
  sealed({
    key: 'neel:tee:T03:watchdog',
    merchant: 'neel',
    product: 'neelTee',
    batch: 'T03',
    capturedDaysAgo: 7,
    inTransit: { lastScanDaysAgo: 4 },
  });

  // Original source: one earlier refund. Q9 retains the conflicting refund-ratio narrative.
  // Two earlier T-shirt orders at an old address, the first refunded, disputed and
  // decided in the store's favour, all before the 90-day report window; now a hoodie to a new address.
  const alexOld = [
    sealed({
      key: 'neel:alex:1',
      merchant: 'neel',
      product: 'neelTee',
      batch: 'T01',
      deliveredDaysAgo: 113,
      status: 'refunded',
    }),
    sealed({
      key: 'neel:alex:2',
      merchant: 'neel',
      product: 'neelTee',
      batch: 'T01',
      deliveredDaysAgo: 88,
      status: 'delivered',
    }),
  ];
  alexOld[0]!.refundedAt = t(95 * DAY);
  for (const o of alexOld) {
    o.buyer = 'alex';
    o.address = 'alex:old';
    o.verified = true;
  }

  // 18 hoodie orders captured in the last 3 days, not packed — the orders a B17 hold would cover. Alex's is one.
  for (let j = 0; j < 17; j++) captured(`neel:hoodie:open:${j}`, j % 3);
  const alexNow = captured('neel:alex:now', 1, 'alex', 'alex:new');
  alexNow.verified = true;

  // Indigo Loom: 24 delivered orders, sealed fast, tracking within hours, every one attested.
  for (let j = 0; j < 24; j++)
    sealed({
      key: `indigo:${j}`,
      merchant: 'indigo',
      product: j % 2 ? 'indigoHoodie' : 'indigoKurta',
      batch: j % 2 ? 'IL-H01' : 'IL-K01',
      deliveredDaysAgo: 10 + ((j * 3) % 71),
    });

  // QuickTees Outlet: one order per review; tracking pushed 100 hours after capture; four never arrived.
  const quickReviews = fixtures.reviews.filter((r) => r.merchant === 'quicktees-outlet');
  const quickOrders = new Map<string, OrderSpec>();
  for (const [j, review] of quickReviews.entries()) {
    const neverArrived = review.extracted !== undefined;
    const spec = sealed({
      key: `quicktees:${review.id}`,
      merchant: 'quicktees',
      product: j % 2 ? 'quickTee' : 'quickHoodie',
      batch: j % 2 ? 'QT-T01' : 'QT-H01',
      capturedDaysAgo: neverArrived ? 40 + j : 20 + ((j * 7) % 60),
      slowTracking: true,
      inTransit: neverArrived ? { lastScanDaysAgo: 36 + j } : undefined,
    });
    if (!neverArrived) {
      spec.deliveredAt = new Date(spec.shippedAt!.getTime() + 8 * DAY);
      spec.lastScanAt = spec.deliveredAt;
      spec.status = 'delivered';
    }
    spec.buyer = `review:${review.buyerRef}`;
    spec.address = `review:${review.buyerRef}`;
    quickOrders.set(review.id, spec);
  }

  // Each fixture complaint goes on a delivered order of its product, batch and carrier. A batch's complaints are
  // spread evenly over that batch's deliveries (section 19: the B17 seam complaints come from different weeks and
  // couriers), so the batch, not one ship week, is what they share.
  const sku = (p: ProductKey) => PRODUCTS[p].sku;
  const used = new Set<string>();
  const perBatch = new Map<string, number>();
  for (const c of fixtures.complaints) perBatch.set(c.batch, (perBatch.get(c.batch) ?? 0) + 1);
  const ordinal = new Map<string, number>();
  const complaintOrders = fixtures.complaints.map((c) => {
    const k = ordinal.get(c.batch) ?? 0;
    ordinal.set(c.batch, k + 1);
    const candidates = specs
      .filter(
        (o) =>
          o.merchant === 'neel' &&
          o.status === 'delivered' &&
          sku(o.product) === c.product &&
          o.batch === c.batch &&
          o.carrier === c.carrier &&
          !used.has(o.key),
      )
      .sort(
        (a, b) => b.deliveredAt!.getTime() - a.deliveredAt!.getTime() || a.key.localeCompare(b.key),
      );
    const order = candidates[Math.floor((k / perBatch.get(c.batch)!) * candidates.length)];
    if (!order) throw new Error(`Seed: no delivered order for complaint ${c.id}`);
    used.add(order.key);
    return { complaint: c, order };
  });

  // Neel's 60 reviews go on delivered T-shirt and B14–B16 orders that carry no complaint.
  const neelReviews = fixtures.reviews.filter((r) => r.merchant === 'neel-block-prints');
  const reviewable = specs.filter(
    (o) =>
      o.merchant === 'neel' && o.status === 'delivered' && o.batch !== 'B17' && !used.has(o.key),
  );
  const neelReviewOrders = neelReviews.map((review, j) => {
    const order = reviewable[(j * 5) % reviewable.length]!;
    if (used.has(order.key)) throw new Error('Seed: review order collision');
    used.add(order.key);
    order.buyer = `review:${review.buyerRef}`;
    order.address = `review:${review.buyerRef}`;
    return { review, order };
  });

  // The simulated network tier covers 10 Neel buyers (section 19), labelled SIMULATED by the table default.
  const networkBuyers = specs
    .filter((o) => o.merchant === 'neel' && o.batch === 'B16' && !used.has(o.key))
    .slice(0, 10)
    .map((o) => o.buyer);

  return {
    specs,
    alexOrderKey: alexNow.key,
    alexDisputeOrderKey: alexOld[0]!.key,
    complaintOrders,
    neelReviewOrders,
    quickReviewOrders: quickReviews.map((review) => ({
      review,
      order: quickOrders.get(review.id)!,
    })),
    networkBuyers,
  };
}

const NETWORK_ROWS = [
  [0, 0, 3],
  [0, 0, 5],
  [1, 0, 4],
  [0, 0, 2],
  [2, 1, 6],
  [0, 0, 7],
  [1, 1, 3],
  [0, 0, 4],
  [3, 2, 8],
  [0, 0, 1],
] as const;

export interface SeedSummary {
  seed: 'fairfold';
  orders: Record<MerchantKey, number>;
  complaints: number;
  reviews: number;
  hypothesis: {
    dimension: string;
    value: string;
    strength: string;
    k: number;
    n: number;
    rateRatio: number;
    p: number;
    q: number;
    unshipped: number;
  } | null;
  bands: Record<MerchantKey, string>;
  alexOrderId: string;
  paypalRequests: 0;
}

/**
 * Builds (or completes) the section 19 world. `now` anchors every date; `intelligence` runs the closing shared-cause
 * scan and the store reports (with no model configured, every model step uses its fixed fallback).
 */
export async function seedWorld(options: {
  db: Database;
  now: Date;
  intelligence: IntelRuntime;
}): Promise<SeedSummary> {
  const { db, now } = options;
  const fixtures = loadFixtures();
  const world = plan(now, fixtures);

  for (const key of Object.keys(MERCHANT_ROWS) as MerchantKey[]) {
    const row = MERCHANT_ROWS[key];
    if (key === 'neel')
      // setup:sandbox may have created Neel first, with its PayPal credentials: only fill what is missing.
      await db
        .insert(merchants)
        .values(row)
        .onConflictDoUpdate({
          target: merchants.id,
          set: {
            policy_urls: sql`case when ${merchants.policy_urls} = '[]'::jsonb then excluded.policy_urls else ${merchants.policy_urls} end`,
            domain_registered_at: sql`coalesce(${merchants.domain_registered_at}, excluded.domain_registered_at)`,
          },
        });
    else
      await db
        .insert(merchants)
        .values(row)
        .onConflictDoUpdate({
          target: merchants.id,
          set: {
            slug: row.slug,
            name: row.name,
            domain: row.domain,
            country: row.country,
            is_simulated: true,
            policy_urls: row.policy_urls,
            domain_registered_at: row.domain_registered_at,
          },
        });
  }

  const productIds = new Map<ProductKey, string>();
  for (const [key, p] of Object.entries(PRODUCTS) as Array<[ProductKey, ProductSpec]>) {
    const merchantId = SEED_MERCHANTS[p.merchant];
    await db
      .insert(products)
      .values({
        merchant_id: merchantId,
        sku: p.sku,
        name: p.name,
        description: p.description,
        colour: p.colour,
        size: p.size,
        listing_version: 'v1',
        unit_value: p.value,
        currency: 'USD',
      })
      .onConflictDoUpdate({
        // setup:sandbox creates the hoodie without colour or size; the shopper searches for "navy hoodie" (A13).
        target: [products.merchant_id, products.sku],
        set: {
          colour: sql`coalesce(${products.colour}, excluded.colour)`,
          size: sql`coalesce(${products.size}, excluded.size)`,
        },
      });
    const [row] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.merchant_id, merchantId), eq(products.sku, p.sku)));
    productIds.set(key, row!.id);
  }

  const sold = new Map<string, number>();
  for (const o of world.specs) if (o.batch) sold.set(o.batch, (sold.get(o.batch) ?? 0) + 1);
  for (const [code, b] of Object.entries(BATCHES)) {
    const product = PRODUCTS[b.product];
    await db
      .insert(inventory_batches)
      .values({
        merchant_id: SEED_MERCHANTS[product.merchant],
        product_id: productIds.get(b.product)!,
        batch_code: code,
        supplier: 'Synthetic supplier',
        received_at: new Date(now.getTime() - b.receivedDaysAgo * DAY),
        qty_received: (sold.get(code) ?? 0) + b.remaining,
        qty_remaining: b.remaining,
      })
      .onConflictDoNothing();
  }

  const buyerNames = new Map<string, string>([['alex', 'Alex R.']]);
  for (const o of world.specs)
    if (!buyerNames.has(o.buyer)) buyerNames.set(o.buyer, `Seed buyer ${buyerNames.size}`);
  const buyerCountry = new Map(world.specs.map((o) => [o.buyer, o.country]));
  for (const [key, name] of buyerNames)
    await db
      .insert(buyers)
      .values({
        id: seedId(`buyer:${key}`),
        display_name: name,
        country: buyerCountry.get(key) ?? 'US',
      })
      .onConflictDoNothing();

  // Orders are independent (own ids, own ledger chain), so a few are written at a time; the result is the same.
  const specs = [...world.specs.entries()];
  for (let i = 0; i < specs.length; i += ORDER_CONCURRENCY)
    await Promise.all(
      specs.slice(i, i + ORDER_CONCURRENCY).map(([n, o]) => writeOrder(db, o, n, productIds)),
    );

  const alexDisputeOrder = seedId(`order:${world.alexDisputeOrderKey}`);
  const disputeOpened = new Date(now.getTime() - 110 * DAY);
  const disputeResolved = new Date(now.getTime() - 100 * DAY);
  const [dispute] = await db
    .insert(disputes)
    .values({
      id: 'SEED-PP-D-ALEX-1',
      merchant_id: SEED_MERCHANTS.neel,
      order_id: alexDisputeOrder,
      reason: 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED',
      status: 'RESOLVED',
      life_cycle_stage: 'CHARGEBACK',
      amount_value: PRODUCTS.neelTee.value,
      currency: 'USD',
      outcome_code: 'RESOLVED_SELLER_FAVOUR',
      resolved_at: disputeResolved,
      raw: { create_time: disputeOpened.toISOString(), synthetic: true },
      updated_at: disputeResolved,
    })
    .onConflictDoNothing()
    .returning({ id: disputes.id });
  if (dispute) {
    await createLedger(db, fixedClock(disputeOpened)).append(alexDisputeOrder, {
      type: 'dispute_opened',
      actor: 'paypal',
      payload: { disputeId: dispute.id, synthetic: true },
    });
    await createLedger(db, fixedClock(disputeResolved)).append(alexDisputeOrder, {
      type: 'resolved',
      actor: 'paypal',
      payload: { disputeId: dispute.id, outcomeCode: 'RESOLVED_SELLER_FAVOUR', synthetic: true },
    });
  }

  for (const { complaint, order } of world.complaintOrders) {
    const extracted: ComplaintExtraction = ComplaintExtractionSchema.parse(complaint.extracted);
    const afterDays = complaint.daysAfterDelivery || 0.25;
    await db
      .insert(complaints)
      .values({
        id: seedId(`complaint:${complaint.id}`),
        merchant_id: SEED_MERCHANTS.neel,
        order_id: seedId(`order:${order.key}`),
        order_item_id: seedId(`item:${order.key}`),
        product_id: productIds.get(order.product)!,
        buyer_id: seedId(`buyer:${order.buyer}`),
        source: 'buyer_report',
        source_ref: `seed-${complaint.id}`,
        text: complaint.text,
        extracted,
        created_at: new Date(order.deliveredAt!.getTime() + afterDays * DAY),
      })
      .onConflictDoNothing();
  }

  const reviewRows = [
    ...world.neelReviewOrders.map((r) => ({ ...r, merchant: SEED_MERCHANTS.neel })),
    ...world.quickReviewOrders.map((r) => ({ ...r, merchant: SEED_MERCHANTS.quicktees })),
  ];
  for (const [j, { review, order, merchant }] of reviewRows.entries()) {
    const reviewId = seedId(`review:${review.id}`);
    const createdAt = order.deliveredAt
      ? new Date(order.deliveredAt.getTime() + (2 + (j % 6)) * DAY)
      : new Date(order.shippedAt!.getTime() + 25 * DAY);
    await db
      .insert(reviews)
      .values({
        id: reviewId,
        merchant_id: merchant,
        order_id: seedId(`order:${order.key}`),
        buyer_id: seedId(`buyer:${order.buyer}`),
        rating: review.rating,
        text: review.text,
        merchant_reply: review.merchantReply,
        created_at: createdAt,
      })
      .onConflictDoNothing();
    // A never-arrived review is also an unanswered not_received complaint, stored pre-read (no Reader call).
    if (review.extracted !== undefined)
      await db
        .insert(complaints)
        .values({
          id: seedId(`complaint:${review.id}`),
          merchant_id: merchant,
          order_id: seedId(`order:${order.key}`),
          order_item_id: seedId(`item:${order.key}`),
          product_id: productIds.get(order.product)!,
          buyer_id: seedId(`buyer:${order.buyer}`),
          source: 'review',
          source_ref: reviewId,
          text: review.text,
          extracted: ComplaintExtractionSchema.parse(review.extracted),
          created_at: createdAt,
        })
        .onConflictDoNothing();
  }

  for (const [j, buyer] of world.networkBuyers.entries()) {
    const [filed, lost, stores] = NETWORK_ROWS[j]!;
    await db
      .insert(buyer_network_simulated)
      .values({
        buyer_id: seedId(`buyer:${buyer}`),
        disputes_filed_12m: filed,
        disputes_lost_by_buyer_12m: lost,
        merchants_transacted_12m: stores,
      })
      .onConflictDoNothing();
  }

  // Section 19: the seed ends with one shared-cause scan for Neel; then each store's report.
  const [found] = await runSharedCauseScanWith(options.intelligence, SEED_MERCHANTS.neel);
  const bands = {} as Record<MerchantKey, string>;
  for (const key of Object.keys(SEED_MERCHANTS) as MerchantKey[])
    bands[key] = (await buildStoreReportWith(options.intelligence, SEED_MERCHANTS[key])).band;

  const count = (merchant: MerchantKey) =>
    world.specs.filter((o) => o.merchant === merchant).length;
  return {
    seed: 'fairfold',
    orders: { neel: count('neel'), indigo: count('indigo'), quicktees: count('quicktees') },
    complaints:
      world.complaintOrders.length +
      world.quickReviewOrders.filter((r) => r.review.extracted).length,
    reviews: reviewRows.length,
    hypothesis: found
      ? {
          dimension: found.dimension,
          value: found.value,
          strength: found.strength,
          k: found.stats.primary.k,
          n: found.stats.primary.n,
          rateRatio: found.stats.primary.rateRatio,
          p: found.stats.primary.p,
          q: found.stats.primary.q,
          unshipped: found.affected.unshipped.length,
        }
      : null,
    bands,
    alexOrderId: seedId(`order:${world.alexOrderKey}`),
    paypalRequests: 0,
  };
}

/** One order with its item and, once sealed, its shipment, packing photo, seed attestation and ledger chain. */
async function writeOrder(
  db: Database,
  o: OrderSpec,
  n: number,
  productIds: Map<ProductKey, string>,
) {
  const product = PRODUCTS[o.product];
  const merchantId = SEED_MERCHANTS[o.merchant];
  const orderId = seedId(`order:${o.key}`);
  const itemId = seedId(`item:${o.key}`);
  const merchantActor = `merchant:${merchantId}`;
  const ref = orderId.replaceAll('-', '').slice(0, 16).toUpperCase();
  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(orders)
      .values({
        id: orderId,
        merchant_id: merchantId,
        buyer_id: seedId(`buyer:${o.buyer}`),
        paypal_order_id: `SEED-ORDER-${ref}`,
        paypal_capture_id: `SEED-CAPTURE-${ref}`,
        invoice_id: `FF-${orderId}`,
        status: o.status,
        amount_value: product.value,
        currency: 'USD',
        ship_to_country: o.country,
        ship_to_hash: createHash('sha256').update(`seed-address:${o.address}`).digest('hex'),
        payer_account_status: o.verified ? 'VERIFIED' : 'UNVERIFIED',
        seller_protection_status: 'ELIGIBLE',
        created_at: o.capturedAt,
        captured_at: o.capturedAt,
        sealed_at: o.sealedAt,
        shipped_at: o.shippedAt,
        delivered_at: o.deliveredAt,
      })
      .onConflictDoNothing()
      .returning({ id: orders.id });
    if (!created) return;
    await tx.insert(order_items).values({
      id: itemId,
      order_id: orderId,
      product_id: productIds.get(o.product)!,
      sku: product.sku,
      name: product.name,
      quantity: 1,
      unit_value: product.value,
      listing_version: 'v1',
      batch_code: o.batch,
      packed_by: o.packer,
      packed_at: o.sealedAt,
    });
    const append = (at: Date, entry: Parameters<ReturnType<typeof createLedger>['append']>[1]) =>
      createLedger(tx, fixedClock(at)).append(orderId, entry);
    await append(o.capturedAt, {
      type: 'captured',
      actor: 'paypal',
      payload: {
        paypalOrderId: `SEED-ORDER-${ref}`,
        paypalCaptureId: `SEED-CAPTURE-${ref}`,
        amount: { currency_code: 'USD', value: product.value },
        synthetic: true,
      },
    });
    if (!o.sealedAt || !o.shippedAt || !o.trackingAt || !o.carrier) return;

    const trackingNumber = `SEED${ref.slice(0, 12)}`;
    const [shipment] = await tx
      .insert(shipments)
      .values({
        order_id: orderId,
        carrier: o.carrier,
        carrier_name_other: o.carrier === 'OTHER' ? 'India Post' : null,
        tracking_number: trackingNumber,
        paypal_tracker_id: `SEED-TRACKER-${ref}`,
        status: o.deliveredAt ? 'delivered' : 'in_transit',
        last_scan_at: o.lastScanAt,
      })
      .returning({ id: shipments.id });
    const photoAt = new Date(o.sealedAt.getTime() - 15 * 60_000);
    const sha256 = await createBlobStore(tx, fixedClock(photoAt)).put(packingPhoto(n), 'image/png');
    await append(photoAt, {
      type: 'photo',
      actor: merchantActor,
      blob_sha256: sha256,
      payload: { label: 'item', synthetic: true },
    });
    const result: AttestationResult = {
      items: [
        {
          orderItemId: itemId,
          seen: {
            itemType: product.name.toLowerCase(),
            colour: product.colour,
            sizeLabel: product.size,
            quantity: 1,
          },
          matches: true,
          confidence: 0.95,
          notes: '',
        },
      ],
      batchLabelText: o.batch,
      shippingLabel: { visible: true, trackingNumberText: trackingNumber },
      defects: [],
      inspection: null,
      couldNotVerify: [],
      confidence: 0.95,
    };
    const attestedAt = new Date(o.sealedAt.getTime() - 10 * 60_000);
    const [attestation] = await tx
      .insert(attestations)
      .values({
        order_id: orderId,
        batch_code: o.batch,
        step: 'pack',
        photo_shas: [sha256],
        photo_labels: ['item'],
        model: 'seed',
        result,
        status: 'match',
        confidence: 0.95,
        created_at: attestedAt,
      })
      .returning({ id: attestations.id });
    await append(attestedAt, {
      type: 'attestation',
      payload: { attestationId: attestation!.id, status: 'match', synthetic: true },
    });
    await append(o.sealedAt, {
      type: 'sealed',
      actor: merchantActor,
      payload: {
        batchCodes: { [itemId]: o.batch },
        carrier: o.carrier,
        trackingNumber,
        shipmentId: shipment!.id,
        packer: o.packer,
        synthetic: true,
      },
    });
    await append(o.trackingAt, {
      type: 'tracking_pushed',
      payload: { carrier: o.carrier, trackingNumber, synthetic: true },
    });
    if (o.deliveredAt)
      await append(o.deliveredAt, {
        type: 'delivered',
        actor: 'paypal',
        payload: { carrier: o.carrier, trackingNumber, synthetic: true },
      });
    if (o.refundedAt)
      await append(o.refundedAt, {
        type: 'refund',
        actor: 'paypal',
        payload: { amount: { currency_code: 'USD', value: product.value }, synthetic: true },
      });
  });
}
