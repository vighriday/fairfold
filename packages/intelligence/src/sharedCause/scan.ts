// Shared Cause Detection wiring (task I6; section 9 stages 2–5, F5 steps 1–2). The Complaint Reader extracts;
// code embeds, groups, tests, picks the affected orders and proposes actions. Nothing here executes an action:
// every hold, rule and message is a proposal the merchant approves and Hriday's module carries out.
import { randomUUID } from 'node:crypto';
import { and, asc, eq, gt, inArray, isNotNull, isNull, lt, ne, notInArray, sql } from 'drizzle-orm';
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
  orders,
} from '@fairfold/db';
import { createBlobStore, type DatabaseExecutor } from '@fairfold/ledger';
import { raiseAlertOnce } from '../alerts.js';
import { attestBuyerPhotos } from '../evidence/buyerPhotos.js';
import { getIntelRuntime, type IntelRuntime } from '../runtime.js';
import { draftBuyerMessagesWith } from './actions.js';
import { RETIRED_REASON, withdrawAndProposeRelease, withdrawPendingRelease } from './lifecycle.js';
import { affectedOrders } from './affected.js';
import { assignClusters, eligibleClusters, type ClusterState } from './grouping.js';
import { localise } from './localise.js';
import { clusterOrders, loadScanOrders } from './population.js';
import {
  embeddingText,
  extractComplaint,
  itemForComplaint,
  MAX_COMPLAINT_PHOTOS,
} from './reader.js';
import { sharedCauseConfig } from './stats.js';
import {
  cleanPhrase,
  clusterLabel,
  DIMENSION_LABEL,
  explanation,
  headline,
  inspectionInstruction,
  inspectionPhotoLabel,
} from './wording.js';

export const SCAN_DEBOUNCE_SECONDS = 60;

/**
 * Embeds texts in one request (batched by the provider's limit), in input order. null when the request timed out or
 * was refused: packages/ai has logged it, and the complaints stay unembedded until the next scan embeds them.
 */
async function embedTexts(rt: IntelRuntime, texts: string[]): Promise<number[][] | null> {
  if (!texts.length) return [];
  const model =
    rt.models.embedding ??
    (hasModelConfig('embedding', rt.env) ? getModel('embedding', rt.env) : null);
  if (model) {
    try {
      return await embed(texts, { model, component: 'complaint_reader' });
    } catch {
      return null;
    }
  }
  // No substitute embedding algorithm is authorized in the normal runtime.
  logAi({
    event: 'ai_embed',
    component: 'complaint_reader',
    embedding: 'NOT_CONFIGURED',
    count: texts.length,
  });
  return null;
}

async function embedOne(rt: IntelRuntime, text: string): Promise<number[] | null> {
  return (await embedTexts(rt, [text]))?.[0] ?? null;
}

/**
 * complaint.created (F5 step 1): Complaint Reader → extraction; code sets the item and product (single-item
 * orders directly, else the item the text names, else the first), embeds "category | component | failure_mode",
 * saves, then schedules a debounced scan for the merchant. A complaint's cluster is never changed here. A failed
 * embedding request does not fail the job: the extraction is saved and the scan embeds the complaint later.
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
 * their extraction and no complaint.created, and reads whose embedding request failed — are embedded together in one
 * request before grouping, so seeding makes no Complaint Reader call and one embedding request. Category other never
 * groups, so it is not embedded. If the request fails, the scan goes on without them.
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
  if (!vectors) return rows;
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

/**
 * Orders this hypothesis holds now, or whose hold the merchant approved and Hriday has yet to carry out. A withdrawn
 * or released hold covers nothing, so a reopened hypothesis proposes those orders again.
 */
async function alreadyHeld(tx: DatabaseExecutor, hypothesisId: string): Promise<Set<string>> {
  const held = await tx
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.held_by_hypothesis_id, hypothesisId));
  const approved = await tx
    .select({ payload: actions.payload })
    .from(actions)
    .where(
      and(
        eq(actions.hypothesis_id, hypothesisId),
        eq(actions.type, 'hold_orders'),
        eq(actions.status, 'approved'),
      ),
    );
  return new Set([
    ...held.map((o) => o.id),
    ...approved.flatMap((r) => (r.payload as { orderIds?: string[] }).orderIds ?? []),
  ]);
}

/**
 * Open hypotheses of the merchant that this scan did not find again — their cluster is no longer eligible or no value
 * is significant any more — are retired (status superseded, so they reopen if they become significant again).
 */
async function retireStale(rt: IntelRuntime, merchantId: string, live: string[], now: Date) {
  const stale = await rt.db
    .select({ id: hypotheses.id })
    .from(hypotheses)
    .where(
      and(
        eq(hypotheses.merchant_id, merchantId),
        eq(hypotheses.status, 'open'),
        live.length ? notInArray(hypotheses.id, live) : undefined,
      ),
    );
  for (const { id } of stale)
    await rt.db.transaction(async (tx) => {
      const [retired] = await tx
        .update(hypotheses)
        .set({ status: 'superseded' })
        .where(and(eq(hypotheses.id, id), eq(hypotheses.status, 'open')))
        .returning({ id: hypotheses.id });
      if (retired)
        await withdrawAndProposeRelease(tx, id, 'hypothesis_retired', RETIRED_REASON, now);
    });
}

/**
 * sharedcause.scan (F5 step 2): incremental grouping, statistics per eligible cluster, hypotheses upserted on
 * (cluster_id, dimension, value) with a replaced primary superseded, proposals for open hypotheses, alerts,
 * and a pack rebuild for disputes that now sit in a cluster with a live hypothesis. Re-running is idempotent.
 */
export function runSharedCauseScanWith(
  rt: IntelRuntime,
  merchantId: string,
): Promise<Hypothesis[]> {
  return withScanLock(rt, merchantId, () => scanMerchant(rt, merchantId));
}

/**
 * One scan per merchant at a time: a debounced job, the sweep's job and a direct call can overlap, and two scans
 * reading the same complaints would each create clusters and hypotheses. A session-level advisory lock is held on a
 * dedicated connection for the whole scan, so the scan's own transactions stay short; a second scan waits, then
 * finds the first one's work and changes nothing.
 */
async function withScanLock<T>(
  rt: IntelRuntime,
  merchantId: string,
  run: () => Promise<T>,
): Promise<T> {
  const key = `fairfold:scan:${merchantId}`;
  const client = await rt.db.$client.connect();
  let broken = false;
  try {
    await client.query('select pg_advisory_lock(hashtextextended($1, 0))', [key]);
    try {
      return await run();
    } finally {
      // A connection that cannot unlock is destroyed, which ends its session and releases the lock.
      await client.query('select pg_advisory_unlock(hashtextextended($1, 0))', [key]).catch(() => {
        broken = true;
      });
    }
  } finally {
    client.release(broken);
  }
}

async function scanMerchant(rt: IntelRuntime, merchantId: string): Promise<Hypothesis[]> {
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
  if (!eligible.length) {
    await retireStale(rt, merchantId, [], now);
    return [];
  }

  const allOrders = await loadScanOrders(rt, merchantId);
  const result: Hypothesis[] = [];

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

    const row = await rt.db.transaction(async (tx) => {
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
            // Decided on the row's current status, so a Confirm or Dismiss committed meanwhile is never undone.
            .set({
              ...fields,
              status: sql`case when ${hypotheses.status} = 'superseded' then 'open' else ${hypotheses.status} end`,
            })
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
      // The cluster's earlier open primaries are superseded; their proposals are withdrawn and their holds and
      // inspection rule proposed for release.
      const superseded = await tx
        .update(hypotheses)
        .set({ status: 'superseded' })
        .where(
          and(
            eq(hypotheses.cluster_id, clusterId),
            ne(hypotheses.id, saved!.id),
            eq(hypotheses.status, 'open'),
          ),
        )
        .returning({ id: hypotheses.id });
      for (const s of superseded)
        await withdrawAndProposeRelease(
          tx,
          s.id,
          'hypothesis_superseded',
          `The shared cause now points to ${DIMENSION_LABEL[loc.primary.dimension]} ${loc.primary.value}.`,
          now,
        );
      if (existing?.status === 'superseded' && saved!.status === 'open')
        await withdrawPendingRelease(tx, saved!.id);

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
          // A withdrawn or failed rule proposal does not count: a reopened hypothesis proposes the rule again.
          const [rule] = await tx
            .select({ id: actions.id })
            .from(actions)
            .where(
              and(
                eq(actions.hypothesis_id, saved!.id),
                eq(actions.type, 'add_inspection_rule'),
                inArray(actions.status, ['proposed', 'approved', 'done']),
              ),
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
                // Stored by the executor in inspection_rules.product_id (batch codes are per merchant, not product).
                ...(cluster.product_id ? { productId: cluster.product_id } : {}),
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
      // Open disputes that now sit under a live hypothesis — all of them for a new one, else those that just
      // joined — get their packs rebuilt; the job commits with the hypothesis it reflects.
      if (saved!.status === 'open' || saved!.status === 'confirmed') {
        const isNew = !existing || existing.status === 'superseded';
        const openIds = new Set(affected.openDisputes);
        const rebuild = [
          ...new Set(
            inCluster
              .filter(
                (m) =>
                  m.source === 'dispute' &&
                  openIds.has(m.source_ref) &&
                  (isNew || assignments.has(m.id)),
              )
              .map((m) => m.source_ref),
          ),
        ].sort();
        if (rebuild.length)
          await rt.jobs.publish('evidence.rebuild', { disputeIds: rebuild }, { tx });
      }
      return saved!;
    });

    // The draft template is written outside the transaction (one model call); a safety flag means no drafts.
    if (row.status === 'open' && !safety) await draftBuyerMessagesWith(rt, row.id, 'suspected');
    result.push(toHypothesis(row));
  }
  await retireStale(
    rt,
    merchantId,
    result.map((h) => h.id),
    now,
  );
  return result;
}

/** Section 15: runSharedCauseScan(merchantId) on the process runtime. */
export function runSharedCauseScan(merchantId: string): Promise<Hypothesis[]> {
  return runSharedCauseScanWith(getIntelRuntime(), merchantId);
}

/** A complaint still unread this long after it was stored lost its complaint.created job; the sweep re-sends it. */
export const UNREAD_GRACE_HOURS = 1;

/**
 * sharedcause.sweep (02:00 IST): re-sends complaint.created for every complaint that was never read (stored more
 * than UNREAD_GRACE_HOURS ago, so a job still in the queue is not doubled), then queues a sharedcause.scan job for
 * every merchant with read complaints. The scans run as their own jobs, one merchant at a time each, instead of
 * one after another inside the sweep.
 */
export async function sweepSharedCauses(rt: IntelRuntime): Promise<void> {
  const cutoff = new Date(rt.clock.now().getTime() - UNREAD_GRACE_HOURS * 3_600_000);
  const unread = await rt.db
    .select({ id: complaints.id })
    .from(complaints)
    .where(and(isNull(complaints.extracted), lt(complaints.created_at, cutoff)))
    .orderBy(asc(complaints.created_at), asc(complaints.id));
  for (const { id } of unread) await rt.jobs.publish('complaint.created', { complaintId: id });

  const rows = await rt.db
    .selectDistinct({ merchantId: complaints.merchant_id })
    .from(complaints)
    .where(isNotNull(complaints.extracted));
  for (const { merchantId } of rows) await rt.jobs.publish('sharedcause.scan', { merchantId });
}
