// Review rules (section 10): one review per captured payment (enforced by reviews.order_id unique);
// a reviewer whose only purchases are from this store counts at half weight; at most three reviews
// per buyer count (the earliest three, so a later review cannot displace an earlier one).

export const MAX_REVIEWS_PER_BUYER = 3;

export function weightReviews<R extends { id: string; buyerId: string; createdAt: Date }>(
  reviews: R[],
  /** Number of distinct stores each buyer has paid; missing means only this store. */
  storesByBuyer: Map<string, number>,
): Array<R & { weight: number }> {
  const counted = new Set<string>();
  const perBuyer = new Map<string, number>();
  for (const r of [...reviews].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const seen = perBuyer.get(r.buyerId) ?? 0;
    if (seen < MAX_REVIEWS_PER_BUYER) counted.add(r.id);
    perBuyer.set(r.buyerId, seen + 1);
  }
  return reviews.map((r) => ({
    ...r,
    weight: !counted.has(r.id) ? 0 : (storesByBuyer.get(r.buyerId) ?? 1) >= 2 ? 1 : 0.5,
  }));
}

export function reviewAverage(reviews: Array<{ rating: number; weight: number }>): number | null {
  const total = reviews.reduce((sum, r) => sum + r.weight, 0);
  if (total === 0) return null;
  const avg = reviews.reduce((sum, r) => sum + r.rating * r.weight, 0) / total;
  return Math.round(avg * 100) / 100;
}
