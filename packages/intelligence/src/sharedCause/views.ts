// Merchant views of Shared Cause hypotheses: endpoints 22 (summaries) and 23 (detail), section 11.
import { and, asc, desc, eq, ne } from 'drizzle-orm';
import {
  AffectedOrdersSchema,
  AppError,
  ComplaintExtractionSchema,
  DimensionSchema,
  HypothesisDetailSchema,
  HypothesisStatsSchema,
  ValueTestSchema,
  type HypothesisDetail,
  type HypothesisSummary,
} from '@fairfold/contracts';
import { actions, complaint_clusters, complaints, hypotheses } from '@fairfold/db';
import type { IntelRuntime } from '../runtime.js';
import { headline } from './wording.js';

export type HypothesisRow = typeof hypotheses.$inferSelect;

/** The hypothesis if it belongs to this merchant: 404 when missing, 403 for another store. */
export async function ownedHypothesis(
  rt: IntelRuntime,
  merchantId: string,
  hypothesisId: string,
): Promise<HypothesisRow> {
  const [h] = await rt.db.select().from(hypotheses).where(eq(hypotheses.id, hypothesisId));
  if (!h) throw new AppError('HYPOTHESIS_NOT_FOUND', 'Shared cause not found', 404);
  if (h.merchant_id !== merchantId)
    throw new AppError('FORBIDDEN', 'This shared cause belongs to another store', 403);
  return h;
}

async function clusterOf(rt: IntelRuntime, clusterId: string) {
  const [cluster] = await rt.db
    .select()
    .from(complaint_clusters)
    .where(eq(complaint_clusters.id, clusterId));
  return cluster!;
}

/** Endpoint 22: the merchant's hypotheses, newest first; superseded ones are history and are left out. */
export async function listHypotheses(
  rt: IntelRuntime,
  merchantId: string,
): Promise<HypothesisSummary[]> {
  const rows = await rt.db
    .select({ h: hypotheses, category: complaint_clusters.category })
    .from(hypotheses)
    .innerJoin(complaint_clusters, eq(complaint_clusters.id, hypotheses.cluster_id))
    .where(and(eq(hypotheses.merchant_id, merchantId), ne(hypotheses.status, 'superseded')))
    .orderBy(desc(hypotheses.created_at), asc(hypotheses.id));
  const members = await rt.db
    .select({ clusterId: complaints.cluster_id, orderId: complaints.order_id })
    .from(complaints)
    .where(eq(complaints.merchant_id, merchantId));
  const ordersIn = (clusterId: string) =>
    new Set(members.filter((m) => m.clusterId === clusterId && m.orderId).map((m) => m.orderId))
      .size;
  return rows.map(({ h, category }) => {
    const dimension = DimensionSchema.parse(h.dimension);
    return {
      id: h.id,
      headline: headline(h.status, category, dimension, h.value),
      status: h.status,
      strength: h.strength as HypothesisSummary['strength'],
      dimension,
      value: h.value,
      complaintCount: ordersIn(h.cluster_id),
      unshippedCount: AffectedOrdersSchema.parse(h.affected).unshipped.length,
      safetyFlag: h.safety_flag,
      createdAt: h.created_at.toISOString(),
    };
  });
}

/** Endpoint 23 (also the response of 26 and 27). A superseded hypothesis is no longer shown. */
export async function hypothesisDetail(
  rt: IntelRuntime,
  merchantId: string,
  hypothesisId: string,
): Promise<HypothesisDetail> {
  const h = await ownedHypothesis(rt, merchantId, hypothesisId);
  if (h.status === 'superseded')
    throw new AppError(
      'HYPOTHESIS_SUPERSEDED',
      'A newer hypothesis replaced this one; list shared causes again',
      409,
    );
  const cluster = await clusterOf(rt, h.cluster_id);
  const memberRows = await rt.db
    .select()
    .from(complaints)
    .where(eq(complaints.cluster_id, cluster.id))
    .orderBy(asc(complaints.created_at), asc(complaints.id));
  const actionRows = await rt.db
    .select()
    .from(actions)
    .where(eq(actions.hypothesis_id, h.id))
    .orderBy(asc(actions.created_at), asc(actions.id));
  const dimension = DimensionSchema.parse(h.dimension);
  return HypothesisDetailSchema.parse({
    id: h.id,
    status: h.status,
    strength: h.strength,
    headline: headline(h.status, cluster.category, dimension, h.value),
    explanation: h.explanation,
    cluster: {
      id: cluster.id,
      label: cluster.label,
      category: cluster.category,
      complaints: memberRows.flatMap((c) =>
        c.order_id
          ? [
              {
                id: c.id,
                orderId: c.order_id,
                summary:
                  ComplaintExtractionSchema.safeParse(c.extracted).data?.summary ??
                  c.text.slice(0, 140),
                createdAt: c.created_at.toISOString(),
                source: c.source,
              },
            ]
          : [],
      ),
    },
    stats: HypothesisStatsSchema.parse(h.stats),
    alternatives: ValueTestSchema.array().parse(h.alternatives),
    affected: AffectedOrdersSchema.parse(h.affected),
    actions: actionRows.map((a) => ({
      id: a.id,
      type: a.type,
      status: a.status,
      payload: a.payload,
    })),
    safetyFlag: h.safety_flag,
  });
}
