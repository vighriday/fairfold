import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { affectedOrders } from '../../src/sharedCause/affected.js';
import {
  assignClusters,
  eligibleClusters,
  type GroupingComplaint,
} from '../../src/sharedCause/grouping.js';
import { isoWeek, localise, type PopulationOrder } from '../../src/sharedCause/localise.js';
import { sharedCauseConfig } from '../../src/sharedCause/stats.js';

interface FixtureOrder {
  orderId: string;
  productId: string;
  batchCode: string;
  listingVersion: string;
  packer: string;
  carrier: string;
  shipToCountry: string;
  shippedAt: string;
  deliveredAt: string;
  shipWeek: string;
}
interface Fixture {
  now: string;
  orders: FixtureOrder[];
  complaints: Array<{ orderId: string; createdAt: string; category: string }>;
  expected: Record<string, unknown> & { hypothesis?: null };
}
const load = (name: string) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')) as Fixture;
const toPopulation = (o: FixtureOrder): PopulationOrder => ({
  orderId: o.orderId,
  productId: o.productId,
  status: 'delivered',
  batchCode: o.batchCode,
  listingVersion: o.listingVersion,
  packer: o.packer,
  carrier: o.carrier,
  shipToCountry: o.shipToCountry,
  shippedAt: new Date(o.shippedAt),
  deliveredAt: new Date(o.deliveredAt),
});
const cfg = sharedCauseConfig({});

describe('localise', () => {
  it('A2 full fixture → primary batch_code=B17, testsRun=12, exact section 9 numbers', () => {
    const fx = load('sharedcause-b17.json');
    const out = localise(
      { category: 'product_defect', productId: 'HD-IND-01' },
      fx.orders.map(toPopulation),
      fx.complaints.map((c) => ({ orderId: c.orderId, createdAt: new Date(c.createdAt) })),
      new Date(fx.now),
      cfg,
    );
    expect(out).not.toBeNull();
    const p = out!.primary;
    expect({ dimension: p.dimension, value: p.value }).toEqual({
      dimension: 'batch_code',
      value: 'B17',
    });
    expect(out!.stats.testsRun).toBe(12);
    expect(p).toMatchObject({
      n: 40,
      k: 6,
      exposureDays: 560,
      nRest: 200,
      kRest: 1,
      exposureDaysRest: 2800,
    });
    expect(p.rateRatio).toBeCloseTo(30, 6);
    expect(Math.abs(p.p - 0.000129) / 0.000129).toBeLessThan(0.01);
    expect(Math.abs(p.q - 0.00154) / 0.00154).toBeLessThan(0.01);
    expect(p.wilson95[0]).toBeCloseTo(0.07, 2);
    expect(p.wilson95Rest[1]).toBeCloseTo(0.028, 3);
    expect(out!.strength).toBe('strong');
    expect(out!.stats.horizonDays).toBe(14);
    const spread = out!.stats.confounders.spread;
    expect(spread.map((s) => s.dimension).sort()).toEqual([
      'carrier',
      'listing_version',
      'packer',
      'ship_to_country',
      'ship_week',
    ]);
    // section 9: the confounders show how many couriers the complaining batch went through
    expect(spread.find((s) => s.dimension === 'carrier')!.distinctValues).toBeGreaterThan(1);
    expect(out!.stats.confounders.medianDaysSinceDelivery.value).toBeGreaterThan(14);
  });

  it('A3 null fixture → no hypothesis', () => {
    const fx = load('sharedcause-null.json');
    const out = localise(
      { category: 'product_defect', productId: 'HD-IND-01' },
      fx.orders.map(toPopulation),
      fx.complaints.map((c) => ({ orderId: c.orderId, createdAt: new Date(c.createdAt) })),
      new Date(fx.now),
      cfg,
    );
    expect(out).toBeNull();
  });

  it('older batch is not penalised for longer exposure', () => {
    const now = new Date('2026-11-09T00:00:00Z');
    const day = (d: number) => new Date(now.getTime() - d * 86_400_000);
    const orders: PopulationOrder[] = [];
    const mk = (id: string, batch: string, deliveredDaysAgo: number) =>
      orders.push({
        orderId: id,
        productId: 'P',
        status: 'delivered',
        batchCode: batch,
        listingVersion: 'v1',
        packer: 'a',
        carrier: 'DHL',
        shipToCountry: 'US',
        shippedAt: day(deliveredDaysAgo + 3),
        deliveredAt: day(deliveredDaysAgo),
      });
    for (let i = 0; i < 40; i++) mk(`old-${i}`, 'B10', 55);
    for (let i = 0; i < 40; i++) mk(`new-${i}`, 'B11', 20);
    // the old batch's complaints all arrived 30+ days after delivery: outside the 14-day horizon
    const complaints = Array.from({ length: 6 }, (_, i) => ({
      orderId: `old-${i}`,
      createdAt: day(20),
    }));
    expect(
      localise({ category: 'product_defect', productId: 'P' }, orders, complaints, now, cfg),
    ).toBeNull();
    // exposure is capped at H = 14 for both batches
    const withNew = [
      ...complaints,
      ...Array.from({ length: 6 }, (_, i) => ({ orderId: `new-${i}`, createdAt: day(15) })),
    ];
    const out = localise({ category: 'product_defect', productId: 'P' }, orders, withNew, now, cfg);
    expect(out?.primary).toMatchObject({
      value: 'B11',
      exposureDays: 560,
      exposureDaysRest: 560,
      k: 6,
      kRest: 0,
    });
  });

  it('a transit cluster tests carrier, ship-to country and ship week over every product', () => {
    const now = new Date('2026-11-09T00:00:00Z');
    const day = (d: number) => new Date(now.getTime() - d * 86_400_000);
    const orders: PopulationOrder[] = Array.from({ length: 60 }, (_, i) => ({
      orderId: `o${i}`,
      productId: i % 2 ? 'P1' : 'P2',
      status: 'shipped',
      batchCode: null,
      listingVersion: 'v1',
      packer: null,
      carrier: i < 20 ? 'SLOWPOST' : 'DHL',
      shipToCountry: 'US',
      shippedAt: day(35),
      deliveredAt: null,
    }));
    const complaints = Array.from({ length: 6 }, (_, i) => ({
      orderId: `o${i}`,
      createdAt: day(10),
    }));
    const out = localise(
      { category: 'not_received', productId: null },
      orders,
      complaints,
      now,
      cfg,
    );
    expect(out?.primary).toMatchObject({ dimension: 'carrier', value: 'SLOWPOST', k: 6, kRest: 0 });
    expect(out?.stats.horizonDays).toBe(30);
    expect(out?.tests.map((t) => t.dimension)).not.toContain('batch_code');
  });

  it('isoWeek follows ISO 8601', () => {
    expect(isoWeek(new Date('2026-10-21T10:00:00Z'))).toBe('2026-W43');
    expect(isoWeek(new Date('2027-01-01T00:00:00Z'))).toBe('2026-W53');
    expect(isoWeek(new Date('2024-12-30T00:00:00Z'))).toBe('2025-W01');
  });
});

const vec = (...xs: number[]) => xs;
const complaint = (over: Partial<GroupingComplaint> & { id: string }): GroupingComplaint => ({
  orderId: `order-${over.id}`,
  productId: 'P',
  category: 'product_defect',
  createdAt: new Date('2026-11-01T00:00:00Z'),
  embedding: vec(1, 0, 0),
  clusterId: null,
  ...over,
});

describe('grouping', () => {
  const now = new Date('2026-11-09T00:00:00Z');
  let n = 0;
  const newId = () => `cl-${++n}`;

  it('similar complaints join one cluster; a different failure starts another', () => {
    n = 0;
    const out = assignClusters(
      [
        complaint({ id: 'a', embedding: vec(1, 0, 0) }),
        complaint({
          id: 'b',
          embedding: vec(0.95, 0.1, 0),
          createdAt: new Date('2026-11-02T00:00:00Z'),
        }),
        complaint({
          id: 'c',
          embedding: vec(0, 1, 0),
          createdAt: new Date('2026-11-03T00:00:00Z'),
        }),
      ],
      [],
      0.8,
      now,
      newId,
    );
    expect(Object.fromEntries(out.assignments)).toEqual({ a: 'cl-1', b: 'cl-1', c: 'cl-2' });
    expect(out.clusters.find((c) => c.id === 'cl-1')!.memberCount).toBe(2);
  });

  it('the centroid is the normalised mean of its members (section 9 stage 3)', () => {
    n = 0;
    const members = [vec(1, 0), vec(0.8, 0.6), vec(0.6, 0.8)];
    const out = assignClusters(
      members.map((embedding, i) =>
        complaint({
          id: `m${i}`,
          embedding,
          createdAt: new Date(Date.UTC(2026, 10, 1 + i)),
        }),
      ),
      [],
      0.6,
      now,
      newId,
    );
    expect(new Set(out.assignments.values())).toEqual(new Set(['cl-1']));
    const sum = [1 + 0.8 + 0.6, 0 + 0.6 + 0.8];
    const length = Math.hypot(...sum);
    const centroid = out.clusters[0]!.centroid;
    expect(centroid[0]).toBeCloseTo(sum[0]! / length, 6);
    expect(centroid[1]).toBeCloseTo(sum[1]! / length, 6);
  });

  it('an existing cluster’s centroid is rebuilt from its members before new ones join', () => {
    n = 0;
    const stale = {
      id: 'kept',
      productId: 'P',
      category: 'product_defect' as const,
      centroid: vec(1, 0), // as stored by an earlier scan, not the mean of the members below
      memberCount: 2,
    };
    const out = assignClusters(
      [
        complaint({ id: 'a', clusterId: 'kept', embedding: vec(1, 0) }),
        complaint({ id: 'b', clusterId: 'kept', embedding: vec(0.6, 0.8) }),
        complaint({ id: 'c', embedding: vec(0.8, 0.6) }),
      ],
      [stale],
      0.6,
      now,
      newId,
    );
    expect(out.assignments.get('c')).toBe('kept');
    const kept = out.clusters.find((c) => c.id === 'kept')!;
    const sum = [1 + 0.6 + 0.8, 0 + 0.8 + 0.6];
    const length = Math.hypot(...sum);
    expect(kept.memberCount).toBe(3);
    expect(kept.centroid[0]).toBeCloseTo(sum[0]! / length, 6);
    expect(kept.centroid[1]).toBeCloseTo(sum[1]! / length, 6);
  });

  it('cluster ids stable across re-runs: assigned complaints never move', () => {
    n = 0;
    const existing = [
      {
        id: 'kept',
        productId: 'P',
        category: 'product_defect' as const,
        centroid: vec(1, 0, 0),
        memberCount: 3,
      },
    ];
    const out = assignClusters(
      [
        complaint({ id: 'old', clusterId: 'kept', embedding: vec(1, 0, 0) }),
        complaint({ id: 'new', embedding: vec(0.99, 0.05, 0) }),
      ],
      existing,
      0.8,
      now,
      newId,
    );
    expect(Object.fromEntries(out.assignments)).toEqual({ new: 'kept' });
    const again = assignClusters(
      [complaint({ id: 'old', clusterId: 'kept' }), complaint({ id: 'new', clusterId: 'kept' })],
      out.clusters,
      0.8,
      now,
      newId,
    );
    expect(again.assignments.size).toBe(0);
  });

  it('transit complaint ignores product', () => {
    n = 0;
    const out = assignClusters(
      [
        complaint({ id: 'x', productId: 'P1', category: 'not_received' }),
        complaint({ id: 'y', productId: 'P2', category: 'not_received' }),
        complaint({ id: 'z', productId: 'P2', category: 'product_defect' }),
      ],
      [],
      0.8,
      now,
      newId,
    );
    expect(out.assignments.get('x')).toBe(out.assignments.get('y'));
    expect(out.assignments.get('z')).not.toBe(out.assignments.get('x'));
    expect(out.clusters.find((c) => c.id === out.assignments.get('x'))!.productId).toBeNull();
  });

  it('skips category other, missing embeddings and complaints older than 60 days', () => {
    n = 0;
    const out = assignClusters(
      [
        complaint({ id: 'o', category: 'other' }),
        complaint({ id: 'e', embedding: null }),
        complaint({ id: 'old', createdAt: new Date('2026-08-01T00:00:00Z') }),
      ],
      [],
      0.8,
      now,
      newId,
    );
    expect(out.assignments.size).toBe(0);
  });

  it('eligibleClusters needs three distinct orders', () => {
    const members = [
      { clusterId: 'c1', orderId: 'o1' },
      { clusterId: 'c1', orderId: 'o1' },
      { clusterId: 'c1', orderId: 'o2' },
      { clusterId: 'c2', orderId: 'o3' },
      { clusterId: 'c2', orderId: 'o4' },
      { clusterId: 'c2', orderId: 'o5' },
    ];
    expect(eligibleClusters(members)).toEqual(['c2']);
  });
});

describe('affectedOrders', () => {
  const base = {
    productId: 'P',
    batchCode: 'B17',
    listingVersion: 'v1',
    packer: 'a',
    carrier: 'DHL',
    shipToCountry: 'US',
    shippedAt: null,
    deliveredAt: null,
  };
  const orders: PopulationOrder[] = [
    { ...base, orderId: 'u1', status: 'captured', batchCode: null },
    { ...base, orderId: 'u2', status: 'packing', batchCode: null },
    { ...base, orderId: 'u3', status: 'captured', batchCode: null, productId: 'OTHER' },
    { ...base, orderId: 't1', status: 'shipped' },
    { ...base, orderId: 't2', status: 'sealed' },
    { ...base, orderId: 't3', status: 'shipped', batchCode: 'B16' },
    { ...base, orderId: 'd1', status: 'delivered' },
    { ...base, orderId: 'd2', status: 'delivered' },
  ];
  it('lists unshipped (batch only, stock left), in transit, delivered without complaint and open disputes', () => {
    const a = affectedOrders({ dimension: 'batch_code', value: 'B17' }, 'P', orders, {
      complainedOrderIds: new Set(['d2']),
      openDisputeIds: ['PP-D-1'],
      batchHasStock: true,
    });
    expect(a).toEqual({
      unshipped: ['u1', 'u2'],
      inTransit: ['t1', 't2'],
      deliveredNoComplaint: ['d1'],
      openDisputes: ['PP-D-1'],
    });
  });
  it('no unshipped orders for a non-batch dimension or a batch with no stock left', () => {
    expect(
      affectedOrders({ dimension: 'packer', value: 'a' }, 'P', orders, {
        complainedOrderIds: new Set(),
        openDisputeIds: [],
        batchHasStock: true,
      }).unshipped,
    ).toEqual([]);
    expect(
      affectedOrders({ dimension: 'batch_code', value: 'B17' }, 'P', orders, {
        complainedOrderIds: new Set(),
        openDisputeIds: [],
        batchHasStock: false,
      }).unshipped,
    ).toEqual([]);
  });
});

describe('shared cause eval rows', () => {
  it('report B17 strong and no hypothesis for the null seed', async () => {
    const { runB17Eval, runNullEval } = await import('../../eval/sharedCause.js');
    expect(await runB17Eval()).toMatch(
      /^batch_code = B17, strong \(RR 30, p 0\.000129, q 0\.00154, 12 values tested; unit fixture\)$/,
    );
    expect(await runNullEval()).toBe('no hypothesis raised (unit fixture)');
  });
});
