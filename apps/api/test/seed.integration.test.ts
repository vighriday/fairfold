// `pnpm seed` builds architecture section 19's demo world (the B17 story) deterministically: the counts the
// acceptance tests rely on, the A1 hypothesis and the A14 store bands, and nothing changes on a second run.
import { randomBytes } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DemoSubjects, fixedClock } from '@fairfold/contracts';
import {
  actions,
  attestations,
  buyer_network_simulated,
  complaints,
  createDatabase,
  disputes,
  hypotheses,
  inventory_batches,
  merchants,
  migrateDatabase,
  order_items,
  orders,
  products,
  reviews,
  shipments,
  store_reports,
} from '@fairfold/db';
import {
  computeBuyerSignalWith,
  createIntelRuntime,
  type IntelRuntime,
} from '@fairfold/intelligence';
import { createLedger } from '@fairfold/ledger';
import { testDatabaseUrl } from '../../../packages/db/test/environment.js';
import { provisionSandboxCheckout, SandboxHoodie } from '../src/checkout/setup-sandbox.js';
import { SEED_MERCHANTS, seedWorld } from '../src/seed/world.js';

const url = testDatabaseUrl();
const NOW = new Date('2026-11-11T06:00:00.000Z');
const DAY = 86_400_000;

/** Every table, children first; the seed test owns the database for its duration. */
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

describe.skipIf(!url)('pnpm seed: the section 19 demo world', () => {
  const database = createDatabase(url!);
  let intelligence: IntelRuntime;
  let first: Awaited<ReturnType<typeof seedWorld>>;

  const reset = () => database.db.execute(sql.raw(`truncate ${TABLES.join(', ')} cascade`));
  const count = async (table: PgTable) =>
    Number((await database.db.select({ n: sql<number>`count(*)` }).from(table))[0]!.n);

  beforeAll(async () => {
    await migrateDatabase(database.db);
    await reset();
    intelligence = createIntelRuntime({
      db: database.db,
      jobs: { publish: async () => null, publishDebounced: async () => null },
      clock: fixedClock(NOW),
      env: {},
    });
    first = await seedWorld({ db: database.db, now: NOW, intelligence });
  }, 600_000);

  afterAll(async () => {
    await reset();
    await database.close();
  });

  const neel = DemoSubjects.merchant;
  const hoodieOrders = async (where?: ReturnType<typeof and>) =>
    database.db
      .select({ order: orders, item: order_items })
      .from(orders)
      .innerJoin(order_items, eq(order_items.order_id, orders.id))
      .innerJoin(products, eq(products.id, order_items.product_id))
      .where(and(eq(orders.merchant_id, neel), eq(products.sku, 'HD-IND-01'), where));

  it('creates the three stores, Neel as the real sandbox merchant setup:sandbox expects', async () => {
    const rows = await database.db.select().from(merchants);
    expect(rows.map((m) => m.slug).sort()).toEqual([
      'indigo-loom',
      'neel-block-prints',
      'quicktees-outlet',
    ]);
    const [neelRow] = rows.filter((m) => m.id === neel);
    expect(neelRow).toMatchObject({
      slug: SandboxHoodie.slug,
      name: SandboxHoodie.name,
      domain: SandboxHoodie.domain,
      country: SandboxHoodie.country,
      is_simulated: false,
    });
    for (const m of rows) {
      expect((m.policy_urls as unknown[]).length).toBeGreaterThan(0);
      expect(m.domain_registered_at).not.toBeNull();
    }
    expect(
      rows
        .filter((m) => m.is_simulated)
        .map((m) => m.slug)
        .sort(),
    ).toEqual(['indigo-loom', 'quicktees-outlet']);
    expect(SEED_MERCHANTS.neel).toBe(neel);
    // setup:sandbox after the seed finds Neel and the hoodie as it expects (no conflict)
    await expect(
      provisionSandboxCheckout({
        database: database.db,
        clientId: 'synthetic-client',
        clientSecret: 'synthetic-secret',
        encryptionKey: randomBytes(32),
      }),
    ).resolves.toMatchObject({ merchantCreated: false, productCreated: false });
  });

  it('has the hoodie batches and orders of section 19', async () => {
    const batches = await database.db
      .select()
      .from(inventory_batches)
      .where(eq(inventory_batches.merchant_id, neel));
    const b17 = batches.find((b) => b.batch_code === 'B17')!;
    expect(b17).toMatchObject({ qty_received: 64, qty_remaining: 21 });
    expect(Math.round((NOW.getTime() - b17.received_at.getTime()) / DAY)).toBe(32);
    const delivered = await hoodieOrders(eq(orders.status, 'delivered'));
    expect(delivered).toHaveLength(239);
    expect(
      delivered.every((r) => NOW.getTime() - r.order.delivered_at!.getTime() >= 14 * DAY),
    ).toBe(true);
    const byBatch = (code: string) => delivered.filter((r) => r.item.batch_code === code).length;
    expect(byBatch('B14') + byBatch('B15') + byBatch('B16')).toBe(200);
    expect(byBatch('B17')).toBe(39);
    expect(await hoodieOrders(eq(orders.status, 'shipped'))).toHaveLength(4);
    const open = await hoodieOrders(eq(orders.status, 'captured'));
    expect(open).toHaveLength(18);
    expect(open.every((r) => NOW.getTime() - r.order.captured_at!.getTime() <= 3 * DAY)).toBe(true);
    expect(open.every((r) => r.item.batch_code === null && r.order.sealed_at === null)).toBe(true);
    const carriers = await database.db
      .selectDistinct({ carrier: shipments.carrier })
      .from(shipments)
      .innerJoin(orders, eq(orders.id, shipments.order_id))
      .where(eq(orders.merchant_id, neel));
    expect(carriers.map((c) => c.carrier).sort()).toEqual(['DHL', 'FEDEX', 'OTHER', 'UPS']);
  });

  it('gives every seeded sealed order a shipment, a seed match attestation and a verifying ledger', async () => {
    const sealed = await database.db
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(sql`${orders.sealed_at} is not null`);
    expect(sealed.length).toBeGreaterThan(300);
    const shipped = await database.db.select({ orderId: shipments.order_id }).from(shipments);
    expect(new Set(shipped.map((s) => s.orderId))).toEqual(new Set(sealed.map((o) => o.id)));
    const packs = await database.db
      .select()
      .from(attestations)
      .where(eq(attestations.step, 'pack'));
    expect(packs).toHaveLength(sealed.length);
    expect(packs.every((a) => a.model === 'seed' && a.status === 'match')).toBe(true);
    const ledger = createLedger(database.db, fixedClock(NOW));
    for (const o of sealed.slice(0, 25)) {
      const check = await ledger.verify(o.id);
      expect(check.verified).toBe(true);
      const types = check.entries.map((e) => e.type);
      expect(types.slice(0, 5)).toEqual([
        'captured',
        'photo',
        'attestation',
        'sealed',
        'tracking_pushed',
      ]);
      if (o.status === 'delivered') expect(types).toContain('delivered');
    }
    const ids = await database.db
      .select({ order: orders.paypal_order_id, capture: orders.paypal_capture_id })
      .from(orders);
    expect(ids.every((i) => i.order.startsWith('SEED-'))).toBe(true);
    expect(ids.every((i) => i.capture === null || i.capture.startsWith('SEED-'))).toBe(true);
    const disputeIds = await database.db.select({ id: disputes.id }).from(disputes);
    expect(disputeIds.every((d) => d.id.startsWith('SEED-'))).toBe(true);
  });

  it('stores the fixture complaints pre-read and the reviews of section 19', async () => {
    const rows = await database.db.select().from(complaints);
    expect(rows).toHaveLength(16); // 12 Neel complaints + 4 QuickTees never-arrived reviews
    expect(rows.every((c) => c.extracted !== null)).toBe(true);
    const neelReviews = await database.db
      .select()
      .from(reviews)
      .where(eq(reviews.merchant_id, neel));
    expect(neelReviews).toHaveLength(60);
    const avg = neelReviews.reduce((s, r) => s + r.rating, 0) / 60;
    expect(avg).toBeGreaterThanOrEqual(4.3);
    expect(neelReviews.filter((r) => r.rating <= 2 && r.merchant_reply)).toHaveLength(2);
    expect(
      await database.db
        .select()
        .from(reviews)
        .where(eq(reviews.merchant_id, SEED_MERCHANTS.quicktees)),
    ).toHaveLength(25);
    const network = await database.db.select().from(buyer_network_simulated);
    expect(network).toHaveLength(10);
    expect(network.every((n) => n.note.startsWith('SIMULATED'))).toBe(true);
    const watchdog = await database.db
      .select()
      .from(shipments)
      .innerJoin(orders, eq(orders.id, shipments.order_id))
      .where(and(eq(orders.status, 'shipped'), isNull(orders.delivered_at)));
    const stale = watchdog.filter(
      (w) =>
        w.orders.merchant_id === neel &&
        w.shipments.last_scan_at !== null &&
        Math.round((NOW.getTime() - w.shipments.last_scan_at.getTime()) / DAY) === 4,
    );
    expect(stale).toHaveLength(1);
  });

  it('A1: the seed ends with one open, strong B17 hypothesis listing the 18 unshipped orders', async () => {
    const rows = await database.db.select().from(hypotheses);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      merchant_id: neel,
      dimension: 'batch_code',
      value: 'B17',
      status: 'open',
      strength: 'strong',
    });
    const stats = rows[0]!.stats as { primary: { k: number; n: number; p: number; q: number } };
    expect(stats.primary).toMatchObject({ k: 5, n: 39 });
    expect(stats.primary.p).toBeLessThan(0.001);
    expect(stats.primary.q).toBeLessThan(0.01);
    expect((rows[0]!.affected as { unshipped: string[] }).unshipped).toHaveLength(18);
    expect(first.hypothesis).toMatchObject({ value: 'B17', strength: 'strong', unshipped: 18 });
    const proposed = await database.db
      .select({ type: actions.type })
      .from(actions)
      .where(eq(actions.hypothesis_id, rows[0]!.id));
    expect(proposed.map((a) => a.type).sort()).toEqual([
      'add_inspection_rule',
      'hold_orders',
      'send_buyer_messages',
    ]);
  });

  it('A14: Neel and Indigo are verified and QuickTees is caution', async () => {
    const reports = await database.db.select().from(store_reports);
    const band = (id: string) =>
      (reports.find((r) => r.merchant_id === id)!.report as { band: string }).band;
    expect(band(neel)).toBe('verified');
    expect(band(SEED_MERCHANTS.indigo)).toBe('verified');
    expect(band(SEED_MERCHANTS.quicktees)).toBe('caution');
    expect(first.bands).toEqual({ neel: 'verified', indigo: 'verified', quicktees: 'caution' });
  });

  it('Alex R. is yellow with OWN_DISPUTES_LOST, OWN_REFUND_RATIO and NEW_ADDRESS', async () => {
    const signal = await computeBuyerSignalWith(intelligence, first.alexOrderId);
    expect(signal.band).toBe('yellow');
    expect(signal.reasons.map((r) => r.code)).toEqual(
      expect.arrayContaining(['OWN_DISPUTES_LOST', 'OWN_REFUND_RATIO', 'NEW_ADDRESS']),
    );
    const [alexOrder] = await database.db
      .select()
      .from(orders)
      .where(eq(orders.id, first.alexOrderId));
    expect(alexOrder).toMatchObject({ merchant_id: neel, status: 'captured' });
  });

  it('a second run changes nothing', async () => {
    const tables = [
      merchants,
      products,
      inventory_batches,
      orders,
      order_items,
      shipments,
      attestations,
      complaints,
      reviews,
      disputes,
      hypotheses,
      actions,
    ];
    const before = await Promise.all(tables.map((t) => count(t)));
    const ledgerBefore = Number(
      (await database.db.execute(sql`select count(*)::int as n from ledger_entries`)).rows[0]!.n,
    );
    await seedWorld({ db: database.db, now: NOW, intelligence });
    expect(await Promise.all(tables.map((t) => count(t)))).toEqual(before);
    expect(
      Number(
        (await database.db.execute(sql`select count(*)::int as n from ledger_entries`)).rows[0]!.n,
      ),
    ).toBe(ledgerBefore);
  }, 600_000);
});
