// Stage 4 — Localise (section 9). Tests every value of every dimension against the rest of the population with
// exposure-based rates, applies Benjamini–Hochberg and picks the primary hypothesis. Pure.
import type { Dimension, HypothesisStats, ValueTest } from '@fairfold/contracts';
import { TRANSIT_CATEGORIES } from './grouping.js';
import {
  benjaminiHochberg,
  classify,
  rateTest,
  wilson95,
  type SharedCauseConfig,
} from './stats.js';

const DAY_MS = 86_400_000;
export const POPULATION_DAYS = 60;
export const NOT_RECEIVED_HORIZON_DAYS = 30;
export const MIN_ORDERS_PER_SIDE = 5;
export const ALTERNATIVE_MAX_Q = 0.2;

export interface PopulationOrder {
  orderId: string;
  productId: string | null;
  status: string;
  batchCode: string | null;
  listingVersion: string | null;
  packer: string | null;
  carrier: string | null;
  shipToCountry: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
}

export const PRODUCT_DIMENSIONS: Dimension[] = [
  'batch_code',
  'listing_version',
  'packer',
  'ship_week',
];
export const TRANSIT_DIMENSIONS: Dimension[] = ['carrier', 'ship_to_country', 'ship_week'];
const ALL_DIMENSIONS: Dimension[] = [
  ...PRODUCT_DIMENSIONS,
  ...TRANSIT_DIMENSIONS.filter((d) => !PRODUCT_DIMENSIONS.includes(d)),
];

/** ISO 8601 week, e.g. 2026-W43. */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const weekday = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function valueOf(o: PopulationOrder, dimension: Dimension): string | null {
  switch (dimension) {
    case 'batch_code':
      return o.batchCode;
    case 'listing_version':
      return o.listingVersion;
    case 'packer':
      return o.packer;
    case 'carrier':
      return o.carrier;
    case 'ship_to_country':
      return o.shipToCountry;
    case 'ship_week':
      return o.shippedAt ? isoWeek(o.shippedAt) : null;
  }
}

export interface ClusterSpec {
  category: string;
  /** null for transit clusters */
  productId: string | null;
}

export interface Localisation {
  primary: ValueTest;
  strength: 'strong' | 'possible';
  alternatives: ValueTest[];
  tests: ValueTest[];
  stats: HypothesisStats;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};
const round = (x: number, places = 2) => Math.round(x * 10 ** places) / 10 ** places;

export function horizonFor(category: string, cfg: SharedCauseConfig): number {
  return category === 'not_received' ? NOT_RECEIVED_HORIZON_DAYS : cfg.horizonDays;
}

export function localise(
  cluster: ClusterSpec,
  orders: PopulationOrder[],
  complaints: Array<{ orderId: string; createdAt: Date }>,
  now: Date,
  cfg: SharedCauseConfig,
): Localisation | null {
  const transit = TRANSIT_CATEGORIES.has(cluster.category);
  const H = horizonFor(cluster.category, cfg);
  const anchorOf = (o: PopulationOrder) => (transit ? o.shippedAt : o.deliveredAt);
  const since = now.getTime() - POPULATION_DAYS * DAY_MS;

  const population = orders.filter((o) => {
    const anchor = anchorOf(o);
    if (!anchor || anchor.getTime() < since || anchor.getTime() > now.getTime()) return false;
    return transit || o.productId === cluster.productId;
  });

  const exposure = new Map<string, number>();
  const daysSince = new Map<string, number>();
  for (const o of population) {
    const days = (now.getTime() - anchorOf(o)!.getTime()) / DAY_MS;
    daysSince.set(o.orderId, days);
    exposure.set(o.orderId, Math.min(H, days));
  }
  const byId = new Map(population.map((o) => [o.orderId, o]));
  const complained = new Set<string>();
  for (const c of complaints) {
    const o = byId.get(c.orderId);
    if (!o) continue;
    const anchor = anchorOf(o)!.getTime();
    if (c.createdAt.getTime() - anchor <= H * DAY_MS) complained.add(o.orderId);
  }

  const dimensions = transit ? TRANSIT_DIMENSIONS : PRODUCT_DIMENSIONS;
  const raw: Array<Omit<ValueTest, 'q'>> = [];
  for (const dimension of dimensions) {
    const values = new Set(
      population.map((o) => valueOf(o, dimension)).filter((v): v is string => v !== null),
    );
    for (const value of [...values].sort()) {
      const inValue = population.filter((o) => valueOf(o, dimension) === value);
      const rest = population.filter((o) => valueOf(o, dimension) !== value);
      const E = inValue.reduce((s, o) => s + exposure.get(o.orderId)!, 0);
      const ERest = rest.reduce((s, o) => s + exposure.get(o.orderId)!, 0);
      if (
        inValue.length < MIN_ORDERS_PER_SIDE ||
        rest.length < MIN_ORDERS_PER_SIDE ||
        E <= 0 ||
        ERest <= 0
      )
        continue;
      const k = inValue.filter((o) => complained.has(o.orderId)).length;
      const kRest = rest.filter((o) => complained.has(o.orderId)).length;
      const { p, rateRatio } = rateTest({ k, E, kRest, ERest });
      raw.push({
        dimension,
        value,
        n: inValue.length,
        k,
        exposureDays: round(E),
        nRest: rest.length,
        kRest,
        exposureDaysRest: round(ERest),
        rateRatio,
        p,
        wilson95: wilson95(k, inValue.length),
        wilson95Rest: wilson95(kRest, rest.length),
      });
    }
  }
  const qs = benjaminiHochberg(raw.map((t) => t.p));
  const tests: ValueTest[] = raw.map((t, i) => ({ ...t, q: qs[i]! }));

  let primary: ValueTest | null = null;
  let strength: 'strong' | 'possible' | null = null;
  for (const t of tests) {
    const s = classify(t, cfg);
    if (!s) continue;
    if (!primary || t.q < primary.q || (t.q === primary.q && t.rateRatio > primary.rateRatio)) {
      primary = t;
      strength = s;
    }
  }
  if (!primary || !strength) return null;

  const inPrimary = population.filter((o) => valueOf(o, primary!.dimension) === primary!.value);
  const restPrimary = population.filter((o) => valueOf(o, primary!.dimension) !== primary!.value);
  // Spread covers every dimension, not just the tested set: section 9's B17 example reports "4 different couriers".
  const spread = ALL_DIMENSIONS.filter((d) => d !== primary!.dimension).map((dimension) => {
    const counts = new Map<string, number>();
    for (const o of inPrimary) {
      const v = valueOf(o, dimension);
      if (v !== null) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const total = [...counts.values()].reduce((s, n) => s + n, 0);
    return {
      dimension,
      distinctValues: counts.size,
      topShare: total ? round(Math.max(...counts.values()) / total, 3) : 0,
    };
  });
  const dominant = (list: PopulationOrder[]) => {
    const counts = new Map<string, number>();
    for (const o of list)
      if (o.listingVersion) counts.set(o.listingVersion, (counts.get(o.listingVersion) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  const coincidesWithListingChange =
    !transit &&
    (primary.dimension === 'listing_version' ||
      (dominant(inPrimary) !== null &&
        dominant(restPrimary) !== null &&
        dominant(inPrimary) !== dominant(restPrimary)));

  return {
    primary,
    strength,
    alternatives: tests.filter((t) => t !== primary && t.q <= ALTERNATIVE_MAX_Q),
    tests,
    stats: {
      horizonDays: H,
      testsRun: tests.length,
      primary,
      confounders: {
        medianDaysSinceDelivery: {
          value: round(median(inPrimary.map((o) => daysSince.get(o.orderId)!)), 1),
          rest: round(median(restPrimary.map((o) => daysSince.get(o.orderId)!)), 1),
        },
        spread,
        coincidesWithListingChange,
      },
    },
  };
}
