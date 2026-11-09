// Stage 3 — Group (section 9). Incremental, deterministic clustering: complaints from the last 60 days,
// bucketed by (product, category) — transit categories by category alone — joined to the most similar
// cluster at cosine ≥ threshold, else a new cluster. Assigned complaints never move, so ids stay stable.
import type { ComplaintCategory } from '@fairfold/contracts';

export const GROUPING_WINDOW_DAYS = 60;
export const TRANSIT_CATEGORIES: ReadonlySet<string> = new Set([
  'not_received',
  'late',
  'damaged_in_transit',
]);

export interface GroupingComplaint {
  id: string;
  orderId: string | null;
  productId: string | null;
  category: ComplaintCategory;
  createdAt: Date;
  embedding: number[] | null;
  clusterId: string | null;
}

export interface ClusterState {
  id: string;
  /** null for transit clusters */
  productId: string | null;
  category: ComplaintCategory;
  centroid: number[];
  memberCount: number;
}

export function normalise(v: number[]): number[] {
  const len = Math.hypot(...v);
  return len === 0 ? v.map(() => 0) : v.map((x) => x / len);
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  const la = Math.hypot(...a);
  const lb = Math.hypot(...b);
  if (la === 0 || lb === 0) return 0;
  return a.reduce((s, x, i) => s + x * b[i]!, 0) / (la * lb);
}

const isTransit = (category: string) => TRANSIT_CATEGORIES.has(category);
const bucketOf = (c: { productId: string | null; category: string }) =>
  isTransit(c.category) ? `transit|${c.category}` : `${c.productId}|${c.category}`;

export function assignClusters(
  complaints: GroupingComplaint[],
  existing: ClusterState[],
  threshold: number,
  now: Date,
  newId: () => string,
): { assignments: Map<string, string>; clusters: ClusterState[] } {
  const clusters = existing.map((c) => ({ ...c, centroid: [...c.centroid] }));
  const assignments = new Map<string, string>();
  const since = now.getTime() - GROUPING_WINDOW_DAYS * 86_400_000;

  const pending = complaints
    .filter(
      (c) =>
        c.clusterId === null &&
        c.category !== 'other' &&
        c.embedding !== null &&
        c.createdAt.getTime() >= since &&
        (isTransit(c.category) || c.productId !== null),
    )
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));

  for (const c of pending) {
    const vector = normalise(c.embedding!);
    const bucket = bucketOf(c);
    let best: ClusterState | null = null;
    let bestScore = -Infinity;
    for (const cluster of clusters) {
      if (bucketOf(cluster) !== bucket) continue;
      const score = cosine(cluster.centroid, vector);
      if (score >= threshold && score > bestScore) {
        best = cluster;
        bestScore = score;
      }
    }
    if (best) {
      best.centroid = normalise(best.centroid.map((x, i) => x * best!.memberCount + vector[i]!));
      best.memberCount += 1;
    } else {
      best = {
        id: newId(),
        productId: isTransit(c.category) ? null : c.productId,
        category: c.category,
        centroid: vector,
        memberCount: 1,
      };
      clusters.push(best);
    }
    assignments.set(c.id, best.id);
  }
  return { assignments, clusters };
}

/** Clusters with at least three distinct orders move on to localisation. */
export function eligibleClusters(
  members: Array<{ clusterId: string; orderId: string | null }>,
  minOrders = 3,
): string[] {
  const orders = new Map<string, Set<string>>();
  for (const m of members) {
    if (!m.orderId) continue;
    const set = orders.get(m.clusterId) ?? new Set<string>();
    set.add(m.orderId);
    orders.set(m.clusterId, set);
  }
  return [...orders].filter(([, set]) => set.size >= minOrders).map(([id]) => id);
}
