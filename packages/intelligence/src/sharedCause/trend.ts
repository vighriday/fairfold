// Endpoint 24 (section 9 "Confirmation and the fix"): weekly complaint rates for the hypothesis value and, for a
// batch, the later batches of the same product, computed the same way as stage 4 — complaints per order-day of
// exposure, with e = min(H, days since delivery) and only complaints filed within H days counted.
import { asc, eq } from 'drizzle-orm';
import { DimensionSchema } from '@fairfold/contracts';
import type { Trend } from '@fairfold/contracts/intel';
import { complaint_clusters, complaints, inventory_batches } from '@fairfold/db';
import type { IntelRuntime } from '../runtime.js';
import { TRANSIT_CATEGORIES } from './grouping.js';
import { horizonFor, POPULATION_DAYS, valueOf } from './localise.js';
import { clusterOrders, loadScanOrders } from './population.js';
import { sharedCauseConfig } from './stats.js';
import { ownedHypothesis } from './views.js';

const DAY_MS = 86_400_000;

/** Monday (UTC) of the ISO week containing `d`, as YYYY-MM-DD. */
export function weekStart(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() || 7) - 1));
  return t.toISOString().slice(0, 10);
}

export async function hypothesisTrend(
  rt: IntelRuntime,
  merchantId: string,
  hypothesisId: string,
): Promise<Trend> {
  const h = await ownedHypothesis(rt, merchantId, hypothesisId);
  const [cluster] = await rt.db
    .select()
    .from(complaint_clusters)
    .where(eq(complaint_clusters.id, h.cluster_id));
  const cfg = sharedCauseConfig(rt.env);
  const now = rt.clock.now();
  const dimension = DimensionSchema.parse(h.dimension);
  const transit = TRANSIT_CATEGORIES.has(cluster!.category);
  const H = horizonFor(cluster!.category, cfg);

  const values = [h.value];
  if (dimension === 'batch_code' && cluster!.product_id) {
    const batches = await rt.db
      .select({ code: inventory_batches.batch_code, receivedAt: inventory_batches.received_at })
      .from(inventory_batches)
      .where(eq(inventory_batches.product_id, cluster!.product_id))
      .orderBy(asc(inventory_batches.received_at), asc(inventory_batches.batch_code));
    const mine = batches.find((b) => b.code === h.value);
    if (mine)
      values.push(
        ...batches
          .filter((b) => b.receivedAt.getTime() > mine.receivedAt.getTime())
          .map((b) => b.code),
      );
  }

  const firstComplaint = new Map<string, number>();
  for (const c of await rt.db
    .select({ orderId: complaints.order_id, createdAt: complaints.created_at })
    .from(complaints)
    .where(eq(complaints.cluster_id, cluster!.id))) {
    if (!c.orderId) continue;
    const at = c.createdAt.getTime();
    firstComplaint.set(c.orderId, Math.min(at, firstComplaint.get(c.orderId) ?? at));
  }

  const since = now.getTime() - POPULATION_DAYS * DAY_MS;
  const buckets = new Map<
    string,
    { weekStart: string; value: string; n: number; k: number; E: number }
  >();
  for (const o of clusterOrders(await loadScanOrders(rt, merchantId), cluster!.product_id)) {
    const value = valueOf(o, dimension);
    if (value === null || !values.includes(value)) continue;
    const anchor = (transit ? o.shippedAt : o.deliveredAt)?.getTime();
    if (anchor === undefined || anchor < since || anchor > now.getTime()) continue;
    const week = weekStart(new Date(anchor));
    const key = `${week}|${value}`;
    const b = buckets.get(key) ?? { weekStart: week, value, n: 0, k: 0, E: 0 };
    b.n += 1;
    b.E += Math.min(H, (now.getTime() - anchor) / DAY_MS);
    const complained = firstComplaint.get(o.orderId);
    if (complained !== undefined && complained - anchor <= H * DAY_MS) b.k += 1;
    buckets.set(key, b);
  }

  return {
    weeks: [...buckets.values()]
      .sort(
        (a, b) =>
          a.weekStart.localeCompare(b.weekStart) ||
          values.indexOf(a.value) - values.indexOf(b.value),
      )
      .map((b) => ({
        weekStart: b.weekStart,
        value: b.value,
        rate: b.E > 0 ? Math.round((b.k / b.E) * 1e6) / 1e6 : 0,
        n: b.n,
        k: b.k,
      })),
  };
}
