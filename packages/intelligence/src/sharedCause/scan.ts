// Shared Cause Detection wiring (task I6; section 9 stages 2–5, F5 steps 1–2). The Complaint Reader extracts;
// code embeds, groups, tests, picks the affected orders and proposes actions. Nothing here executes an action:
// every hold, rule and message is a proposal the merchant approves and Hriday's module carries out.
import { randomUUID } from 'node:crypto';
import { and, eq, gt, inArray, isNotNull, isNull, ne } from 'drizzle-orm';
import { embed, getModel, hasModelConfig, logAi } from '@fairfold/ai';
import {
  AffectedOrdersSchema,
  AppError,
  ComplaintExtractionSchema,
  DimensionSchema,
  HypothesisStatsSchema,
  type ComplaintExtraction,
  type Hypothesis,
} from '@fairfold/contracts';
import {
  actions,
  complaint_clusters,
  complaints,
  disputes,
  hypotheses,
  inventory_batches,
  order_items,
} from '@fairfold/db';
import { createBlobStore, type DatabaseExecutor } from '@fairfold/ledger';
import { raiseAlertOnce } from '../alerts.js';
import { attestBuyerPhotos } from '../evidence/buyerPhotos.js';
import { getIntelRuntime, type IntelRuntime } from '../runtime.js';
import { draftBuyerMessagesWith } from './actions.js';
import { affectedOrders } from './affected.js';
import { assignClusters, eligibleClusters, type ClusterState } from './grouping.js';
import { localise } from './localise.js';
import { clusterOrders, loadScanOrders } from './population.js';
import {
  embeddingText,
  extractComplaint,
  itemForComplaint,
  localEmbedding,
  LOCAL_EMBEDDING_DIM,
  MAX_COMPLAINT_PHOTOS,
} from './reader.js';
import { sharedCauseConfig } from './stats.js';
import {
  cleanPhrase,
  clusterLabel,
  explanation,
  headline,
  inspectionInstruction,
  inspectionPhotoLabel,
} from './wording.js';

export const SCAN_DEBOUNCE_SECONDS = 60;

/** Embeds texts in one request (batched by the provider's limit), in input order. */
async function embedTexts(rt: IntelRuntime, texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const model =
    rt.models.embedding ??
    (hasModelConfig('embedding', rt.env) ? getModel('embedding', rt.env) : null);
  if (model) return embed(texts, { model, component: 'complaint_reader' });
  // DECISIONS.md I-D7: no embedding provider configured (xAI has none), so embed locally.
  logAi({
    event: 'ai_embed',
    component: 'complaint_reader',
    embedding: 'local',
    dimensions: LOCAL_EMBEDDING_DIM,
    count: texts.length,
  });
  return texts.map(localEmbedding);
}

async function embedOne(rt: IntelRuntime, text: string): Promise<number[]> {
  return (await embedTexts(rt, [text]))[0]!;
}

/**
 * complaint.created (F5 step 1): Complaint Reader → extraction; code sets the item and product (single-item
 * orders directly, else the item the text names, else the first), embeds "category | component | failure_mode",
 * saves, then schedules a debounced scan for the merchant. A complaint's cluster is never changed here.
 */
export async function readComplaintWith(
  rt: IntelRuntime,
  complaintId: string,
): Promise<ComplaintExtraction> {
  const [c] = await rt.db.select().from(complaints).where(eq(complaints.id, complaintId));
  if (!c) throw new AppError('COMPLAINT_NOT_FOUND', 'Complaint not found', 404);

  const blobs = createBlobStore(rt.db, rt.clock);
  const photos: Array<{ sha256: string; mime: string; bytes: Uint8Array }> = [];
  for (const sha256 of c.image_shas.slice(0, MAX_COMPLAINT_PHOTOS)) {
    try {
      const blob = await blobs.get(sha256);
      if (blob.bytes) photos.push({ sha256, mime: blob.mime, bytes: new Uint8Array(blob.bytes) });
    } catch {
      // purged by retention or missing: the text is still read
    }
  }
  const { extraction } = await extractComplaint(
    c.text,
    photos,
    photos.length ? rt.models.vision : rt.models.text,
  );

  let itemId = c.order_item_id;
  let productId = c.product_id;
  if (!itemId && c.order_id) {
    const items = await rt.db
      .select({
        id: order_items.id,
        productId: order_items.product_id,
        name: order_items.name,
        sku: order_items.sku,
      })
      .from(order_items)
      .where(eq(order_items.order_id, c.order_id));
    const item = itemForComplaint(items, c.text);
    if (item) {
      itemId = item.id;
      productId = item.productId;
    }
  }

  const embedding = await embedOne(rt, embeddingText(extraction));
  await rt.db.transaction(async (tx) => {
    await tx
      .update(complaints)
      .set({ extracted: extraction, embedding, order_item_id: itemId, product_id: productId })
      .where(eq(complaints.id, c.id));
    // Section 12: a safety complaint alerts the merchant at once, whether or not it ever joins a shared cause.
    if (extraction.severity === 'safety') {
      const component = cleanPhrase(extraction.component);
      await raiseAlertOnce(tx, {
        merchantId: c.merchant_id,
        type: 'safety_complaint',
        refId: c.id,
        orderId: c.order_id,
        message:
          `A buyer complaint reports a possible safety risk${component ? ` (${component})` : ''}. ` +
          'Review it now; product-safety reporting duties may apply.',
        now: rt.clock.now(),
      });
    }
  });
  // Task I2: the buyer's photos are also described against the order (step buyer_photo).
  if (c.order_id && photos.length)
    await attestBuyerPhotos(
      rt,
      c.order_id,
      photos.map((p) => p.sha256),
    );
  await rt.jobs.publishDebounced('sharedcause.scan', c.merchant_id, SCAN_DEBOUNCE_SECONDS);
  return extraction;
}

/** Section 15: readComplaint(complaintId) — extract and embed one complaint on the process runtime. */
export async function readComplaint(complaintId: string): Promise<void> {
  await readComplaintWith(getIntelRuntime(), complaintId);
}

type ComplaintRow = typeof complaints.$inferSelect;
type HypothesisRow = typeof hypotheses.$inferSelect;

function extractionOf(row: ComplaintRow): ComplaintExtraction | null {
  const parsed = ComplaintExtractionSchema.safeParse(row.extracted);
  return parsed.success ? parsed.data : null;
}

export function toHypothesis(row: HypothesisRow): Hypothesis {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    clusterId: row.cluster_id,
    dimension: DimensionSchema.parse(row.dimension),
    value: row.value,
    status: row.status as Hypothesis['status'],
    strength: row.strength as Hypothesis['strength'],
    stats: HypothesisStatsSchema.parse(row.stats),
    affected: AffectedOrdersSchema.parse(row.affected),
  };
}

/**
 * Read complaints without an embedding — the seed's pre-read rows (section 19 fixtures, model 'seed'), stored with
 * their extraction and no complaint.created — are embedded together in one request before grouping, so seeding
 * makes no Complaint Reader call and one embedding request. Category other never groups, so it is not embedded.
 */
async function embedMissing(rt: IntelRuntime, rows: ComplaintRow[]): Promise<ComplaintRow[]> {
  const missing = rows.flatMap((r) => {
    const e = r.embedding ? null : extractionOf(r);
    return e && e.category !== 'other' ? [{ id: r.id, text: embeddingText(e) }] : [];
  });
  if (!missing.length) return rows;
  const vectors = await embedTexts(
    rt,
    missing.map((m) => m.text),
  );
  const byId = new Map(missing.map((m, i) => [m.id, vectors[i]!]));
  await rt.db.transaction(async (tx) => {
    for (const [id, embedding] of byId)
      await tx
        .update(complaints)
        .set({ embedding })
        .where(and(eq(complaints.id, id), isNull(complaints.embedding)));
  });
  return rows.map((r) => (byId.has(r.id) ? { ...r, embedding: byId.get(r.id)! } : r));
}

/** Stage 3: place unassigned complaints; persist new clusters, moved centroids and the new assignments. */
async function groupComplaints(
  rt: IntelRuntime,
  merchantId: string,
  rows: ComplaintRow[],
  threshold: number,
) {
  const clusterRows = await rt.db
    .select()
    .from(complaint_clusters)
    .where(eq(complaint_clusters.merchant_id, merchantId));
  const memberCount = new Map<string, number>();
  for (const r of rows)
    if (r.cluster_id) memberCount.set(r.cluster_id, (memberCount.get(r.cluster_id) ?? 0) + 1);
  const existing: ClusterState[] = clusterRows.map((c) => ({
    id: c.id,
    productId: c.product_id,
    category: c.category as ClusterState['category'],
    centroid: c.centroid,
    memberCount: memberCount.get(c.id) ?? 0,
  }));

  const grouping = rows.flatMap((r) => {
    const e = extractionOf(r);
    return e
      ? [
          {
            id: r.id,
            orderId: r.order_id,
            productId: r.product_id,
            category: e.category,
            createdAt: r.created_at,
            embedding: r.embedding,
            clusterId: r.cluster_id,
          },
        ]
      : [];
  });
  const { assignments, clusters } = assignClusters(
    grouping,
    existing,
    threshold,
    rt.clock.now(),
    randomUUID,
  );
  if (!assignments.size) return { assignments, clusterRows };

  const byId = new Map(rows.map((r) => [r.id, r]));
  const firstMember = new Map<string, ComplaintRow>();
  for (const [complaintId, clusterId] of assignments)
    if (!firstMember.has(clusterId)) firstMember.set(clusterId, byId.get(complaintId)!);

  await rt.db.transaction(async (tx) => {
    for (const cluster of clusters) {
      const before = existing.find((c) => c.id === cluster.id);
      if (!before) {
        await tx.insert(complaint_clusters).values({
          id: cluster.id,
          merchant_id: merchantId,
          product_id: cluster.productId,
          category: cluster.category,
          label: clusterLabel(extractionOf(firstMember.get(cluster.id)!)!),
          centroid: cluster.centroid,
          updated_at: rt.clock.now(),
        });
      } else if (cluster.memberCount !== before.memberCount) {
        await tx
          .update(complaint_clusters)
          .set({ centroid: cluster.centroid, updated_at: rt.clock.now() })
          .where(eq(complaint_clusters.id, cluster.id));
      }
    }
    for (const [complaintId, clusterId] of assignments)
      await tx
        .update(complaints)
        .set({ cluster_id: clusterId })
        .where(and(eq(complaints.id, complaintId), isNull(complaints.cluster_id)));
  });
  return {
    assignments,
    clusterRows: await rt.db
      .select()
      .from(complaint_clusters)
      .where(eq(complaint_clusters.merchant_id, merchantId)),
  };
}

/** Proposes `type` once; a still-proposed action is updated in place, an approved or finished one is left alone. */
async function proposeOnce(
  tx: DatabaseExecutor,
  hypothesisId: string,
  type: 'hold_orders' | 'add_inspection_rule',
  payload: Record<string, unknown> | null,
  now: Date,
) {
  const rows = await tx
    .select()
    .from(actions)
    .where(and(eq(actions.hypothesis_id, hypothesisId), eq(actions.type, type)));
  const proposed = rows.find((r) => r.status === 'proposed');
  if (proposed) {
    if (payload) await tx.update(actions).set({ payload }).where(eq(actions.id, proposed.id));
    else await tx.delete(actions).where(eq(actions.id, proposed.id));
    return;
  }
  if (payload)
    await tx
      .insert(actions)
      .values({ hypothesis_id: hypothesisId, type, payload, created_at: now });
}

/** Orders already covered by an approved or finished hold for this hypothesis. */
async function alreadyHeld(tx: DatabaseExecutor, hypothesisId: string): Promise<Set<string>> {
  const rows = await tx
    .select({ payload: actions.payload })
    .from(actions)
    .where(
      and(
        eq(actions.hypothesis_id, hypothesisId),
        eq(actions.type, 'hold_orders'),
        ne(actions.status, 'proposed'),
      ),
    );
  return new Set(rows.flatMap((r) => (r.payload as { orderIds?: string[] }).orderIds ?? []));
}

/**
 * sharedcause.scan (F5 step 2): incremental grouping, statistics per eligible cluster, hypotheses upserted on
 * (cluster_id, dimension, value) with a replaced primary superseded, proposals for open hypotheses, alerts,
 * and a pack rebuild for disputes that now sit in a cluster with a live hypothesis. Re-running is idempotent.
 */
export async function runSharedCauseScanWith(
  rt: IntelRuntime,
  merchantId: string,
): Promise<Hypothesis[]> {
  const cfg = sharedCauseConfig(rt.env);
  const now = rt.clock.now();
  const rows = await embedMissing(
    rt,
    await rt.db
      .select()
      .from(complaints)
      .where(and(eq(complaints.merchant_id, merchantId), isNotNull(complaints.extracted))),
  );
  const { assignments, clusterRows } = await groupComplaints(
    rt,
    merchantId,
    rows,
    cfg.clusterSimilarity,
  );
  const clusterOf = (r: ComplaintRow) => r.cluster_id ?? assignments.get(r.id) ?? null;
  const members = rows.flatMap((r) => {
    const clusterId = clusterOf(r);
    return clusterId ? [{ ...r, clusterId }] : [];
  });
  const eligible = eligibleClusters(
    members.map((m) => ({ clusterId: m.clusterId, orderId: m.order_id })),
  );
  if (!eligible.length) return [];

  const allOrders = await loadScanOrders(rt, merchantId);
  const result: Hypothesis[] = [];
  const rebuild = new Set<string>();

  for (const clusterId of eligible) {
    const cluster = clusterRows.find((c) => c.id === clusterId)!;
    const inCluster = members.filter((m) => m.clusterId === clusterId);
    const orderRows = clusterOrders(allOrders, cluster.product_id);
    const loc = localise(
      { category: cluster.category, productId: cluster.product_id },
      orderRows,
      inCluster.flatMap((m) =>
        m.order_id ? [{ orderId: m.order_id, createdAt: m.created_at }] : [],
      ),
      now,
      cfg,
    );
    if (!loc) continue;

    const memberOrderIds = [...new Set(inCluster.flatMap((m) => (m.order_id ? [m.order_id] : [])))];
    const open = await rt.db
      .select({ id: disputes.id })
      .from(disputes)
      .where(
        and(
          eq(disputes.merchant_id, merchantId),
          inArray(disputes.order_id, memberOrderIds),
          isNull(disputes.resolved_at),
          ne(disputes.status, 'RESOLVED'),
        ),
      );
    const [stock] =
      loc.primary.dimension === 'batch_code' && cluster.product_id
        ? await rt.db
            .select({ id: inventory_batches.id })
            .from(inventory_batches)
            .where(
              and(
                eq(inventory_batches.merchant_id, merchantId),
                eq(inventory_batches.product_id, cluster.product_id),
                eq(inventory_batches.batch_code, loc.primary.value),
                gt(inventory_batches.qty_remaining, 0),
              ),
            )
        : [];
    const affected = affectedOrders(loc.primary, cluster.product_id, orderRows, {
      complainedOrderIds: new Set(memberOrderIds),
      openDisputeIds: open.map((d) => d.id).sort(),
      batchHasStock: Boolean(stock),
    });
    const extractions = inCluster.map(extractionOf).filter((e): e is ComplaintExtraction => !!e);
    const safety = extractions.some((e) => e.severity === 'safety');
    const fault = extractions[0]!;
    const words = explanation(cluster.category, cluster.label, loc.stats);

    const { row, isNew } = await rt.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(hypotheses)
        .where(
          and(
            eq(hypotheses.cluster_id, clusterId),
            eq(hypotheses.dimension, loc.primary.dimension),
            eq(hypotheses.value, loc.primary.value),
          ),
        );
      const fields = {
        strength: loc.strength,
        stats: loc.stats,
        alternatives: loc.alternatives,
        affected,
        safety_flag: safety,
        explanation: words,
      };
      const [saved] = existing
        ? await tx
            .update(hypotheses)
            .set({ ...fields, status: existing.status === 'superseded' ? 'open' : existing.status })
            .where(eq(hypotheses.id, existing.id))
            .returning()
        : await tx
            .insert(hypotheses)
            .values({
              ...fields,
              merchant_id: merchantId,
              cluster_id: clusterId,
              dimension: loc.primary.dimension,
              value: loc.primary.value,
              created_at: now,
            })
            .returning();
      await tx
        .update(hypotheses)
        .set({ status: 'superseded' })
        .where(
          and(
            eq(hypotheses.cluster_id, clusterId),
            ne(hypotheses.id, saved!.id),
            eq(hypotheses.status, 'open'),
          ),
        );

      if (saved!.status === 'open') {
        if (loc.primary.dimension === 'batch_code') {
          const held = await alreadyHeld(tx, saved!.id);
          const toHold = affected.unshipped.filter((id) => !held.has(id));
          await proposeOnce(
            tx,
            saved!.id,
            'hold_orders',
            toHold.length ? { orderIds: toHold } : null,
            now,
          );
          const [rule] = await tx
            .select({ id: actions.id })
            .from(actions)
            .where(
              and(eq(actions.hypothesis_id, saved!.id), eq(actions.type, 'add_inspection_rule')),
            );
          if (!rule)
            await proposeOnce(
              tx,
              saved!.id,
              'add_inspection_rule',
              {
                batchCode: loc.primary.value,
                instruction: inspectionInstruction(loc.primary.value, fault),
                requiredPhotoLabel: inspectionPhotoLabel(fault),
              },
              now,
            );
        }
        await raiseAlertOnce(tx, {
          merchantId,
          type: 'shared_cause',
          refId: saved!.id,
          message: `${headline('open', cluster.category, loc.primary.dimension, loc.primary.value)} — ${loc.primary.k} complaints about "${cluster.label}".`,
          now,
        });
        if (safety)
          await raiseAlertOnce(tx, {
            merchantId,
            type: 'safety_complaint',
            refId: saved!.id,
            message: `A complaint in "${cluster.label}" reports a safety risk. Product-safety reporting duties may apply.`,
            now,
          });
      }
      return { row: saved!, isNew: !existing || existing.status === 'superseded' };
    });

    // Drafts are written outside the transaction (one model call each); a safety flag means no drafts.
    if (row.status === 'open' && !safety) await draftBuyerMessagesWith(rt, row.id, 'suspected');

    if (row.status === 'open' || row.status === 'confirmed') {
      const openIds = new Set(affected.openDisputes);
      for (const m of inCluster)
        if (m.source === 'dispute' && openIds.has(m.source_ref) && (isNew || assignments.has(m.id)))
          rebuild.add(m.source_ref);
    }
    result.push(toHypothesis(row));
  }

  if (rebuild.size) await rt.jobs.publish('evidence.rebuild', { disputeIds: [...rebuild].sort() });
  return result;
}

/** Section 15: runSharedCauseScan(merchantId) on the process runtime. */
export function runSharedCauseScan(merchantId: string): Promise<Hypothesis[]> {
  return runSharedCauseScanWith(getIntelRuntime(), merchantId);
}

/** sharedcause.sweep (02:00 IST): the scan for every merchant with complaints. */
export async function sweepSharedCauses(rt: IntelRuntime): Promise<void> {
  const rows = await rt.db
    .selectDistinct({ merchantId: complaints.merchant_id })
    .from(complaints)
    .where(isNotNull(complaints.extracted));
  for (const { merchantId } of rows) await runSharedCauseScanWith(rt, merchantId);
}
