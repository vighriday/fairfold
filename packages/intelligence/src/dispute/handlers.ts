// dispute.synced and evidence.rebuild (section 8), plus the merchant-scoped services behind endpoints 19 and 20.
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { AppError, type JobPayload } from '@fairfold/contracts';
import { complaints, disputes, evidence_packs, orders } from '@fairfold/db';
import { createBlobStore } from '@fairfold/ledger';
import { upsertComplaint } from '../complaints/create.js';
import type { IntelRuntime } from '../runtime.js';
import { buildEvidencePackWith, FROZEN_PACK_CODES, type EvidencePackResult } from './build.js';

/** Builds the pack, or returns null when the dispute's pack is final (resolved, or a pack approved or submitted). */
async function rebuildUnlessFrozen(
  rt: IntelRuntime,
  disputeId: string,
): Promise<EvidencePackResult | null> {
  try {
    return await buildEvidencePackWith(rt, disputeId);
  } catch (err) {
    if (err instanceof AppError && FROZEN_PACK_CODES.has(err.code)) return null;
    throw err;
  }
}

// Lenient readers for PayPal's dispute payload: a field of an unexpected shape is skipped, never thrown on.
const obj = (x: unknown): Record<string, unknown> =>
  x !== null && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const words = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim() : null);

/** The customer-provided product and service details (descriptions and the customer's note). */
const issueDetails = (x: unknown) => [
  words(obj(obj(x).product_details).description),
  words(obj(obj(x).service_details).description),
  words(obj(obj(x).service_details).note),
];

/**
 * Every place PayPal's dispute object (customer-disputes v1) carries the buyer's own words, in this order: the
 * customer-provided issue details (merchandise, and credit-not-processed billing), item-level notes and details,
 * supporting info and evidence notes with source SUBMITTED_BY_BUYER, messages posted by the BUYER (a message without
 * posted_by is excluded) and offer-history notes by the BUYER. Seller and arbiter text is left out; a
 * repeated text is kept once.
 */
export function buyerTexts(raw: unknown): string[] {
  const d = obj(raw);
  const ext = obj(d.extensions);
  const found = [
    ...issueDetails(ext.merchandize_dispute_properties),
    ...issueDetails(obj(ext.billing_dispute_properties).credit_not_processed),
    ...arr(d.disputed_transactions).flatMap((t) =>
      arr(obj(t).items).flatMap((item) => [words(obj(item).notes), ...issueDetails(item)]),
    ),
    ...arr(d.supporting_info)
      .filter((i) => obj(i).source === 'SUBMITTED_BY_BUYER')
      .map((i) => words(obj(i).notes)),
    ...arr(d.evidences)
      .filter((e) => obj(e).source === 'SUBMITTED_BY_BUYER')
      .map((e) => words(obj(e).notes)),
    ...arr(d.messages)
      .filter((m) => obj(m).posted_by === 'BUYER')
      .map((m) => words(obj(m).content)),
    ...arr(obj(d.offer).history)
      .filter((h) => obj(h).actor === 'BUYER')
      .map((h) => words(obj(h).notes)),
  ];
  return [...new Set(found.filter((t): t is string => t !== null))];
}

/**
 * One complaint per dispute (source 'dispute', source_ref = dispute id): the reason and everything the buyer wrote in
 * the dispute (`buyerTexts` of the stored payload, plus the job's new buyer messages). On later syncs, buyer text not
 * yet in the complaint is appended (DECISIONS.md I-D3), whether or not the job listed it. A new complaint and its complaint.created job commit together; then the pack is built,
 * unless the dispute is resolved or a pack was already approved or submitted (null).
 */
export async function syncDispute(
  rt: IntelRuntime,
  p: JobPayload<'dispute.synced'>,
): Promise<EvidencePackResult | null> {
  const [dispute] = await rt.db.select().from(disputes).where(eq(disputes.id, p.disputeId));
  if (!dispute) throw new AppError('DISPUTE_NOT_FOUND', 'Dispute not found', 404);
  const said = [
    ...new Set([
      ...buyerTexts(dispute.raw),
      ...p.newBuyerMessages.map((m) => m.trim()).filter(Boolean),
    ]),
  ];
  const [existing] = await rt.db
    .select({ id: complaints.id, text: complaints.text })
    .from(complaints)
    .where(and(eq(complaints.source, 'dispute'), eq(complaints.source_ref, dispute.id)));

  if (!existing) {
    const [order] = dispute.order_id
      ? await rt.db
          .select({ buyerId: orders.buyer_id })
          .from(orders)
          .where(eq(orders.id, dispute.order_id))
      : [];
    const text = [`PayPal dispute reason: ${dispute.reason}.`, ...said].join('\n\n');
    await rt.db.transaction(async (tx) => {
      const created = await upsertComplaint(
        rt,
        {
          merchantId: dispute.merchant_id,
          orderId: dispute.order_id,
          buyerId: order?.buyerId ?? null,
          source: 'dispute',
          sourceRef: dispute.id,
          text,
        },
        tx,
      );
      await rt.jobs.publish('complaint.created', { complaintId: created.id }, { tx });
    });
  } else {
    const fresh = said.filter((t) => !existing.text.includes(t));
    if (fresh.length)
      await upsertComplaint(rt, {
        merchantId: dispute.merchant_id,
        orderId: dispute.order_id,
        buyerId: null,
        source: 'dispute',
        sourceRef: dispute.id,
        text: fresh.join('\n\n'),
      });
  }
  return rebuildUnlessFrozen(rt, dispute.id);
}

/** evidence.rebuild: each dispute's pack, except those that are final. */
export async function rebuildPacks(
  rt: IntelRuntime,
  p: JobPayload<'evidence.rebuild'>,
): Promise<void> {
  const ids = 'disputeIds' in p ? p.disputeIds : [p.disputeId];
  for (const id of ids) await rebuildUnlessFrozen(rt, id);
}

async function ownedDispute(rt: IntelRuntime, merchantId: string, disputeId: string) {
  const [dispute] = await rt.db.select().from(disputes).where(eq(disputes.id, disputeId));
  if (!dispute) throw new AppError('DISPUTE_NOT_FOUND', 'Dispute not found', 404);
  if (dispute.merchant_id !== merchantId)
    throw new AppError('FORBIDDEN', 'This dispute belongs to another store', 403);
  return dispute;
}

/** Endpoint 19: rebuild the pack now. */
export async function rebuildPackForMerchant(
  rt: IntelRuntime,
  merchantId: string,
  disputeId: string,
) {
  await ownedDispute(rt, merchantId, disputeId);
  return buildEvidencePackWith(rt, disputeId);
}

/** Endpoint 20: the pack's evidence PDF bytes. */
export async function packPdfForMerchant(
  rt: IntelRuntime,
  merchantId: string,
  disputeId: string,
  packId: string,
): Promise<{ filename: string; bytes: Buffer }> {
  await ownedDispute(rt, merchantId, disputeId);
  const [pack] = await rt.db
    .select()
    .from(evidence_packs)
    .where(and(eq(evidence_packs.id, packId), eq(evidence_packs.dispute_id, disputeId)));
  if (!pack) throw new AppError('PACK_NOT_FOUND', 'Evidence pack not found', 404);
  const files = z
    .array(z.object({ sha256: z.string(), filename: z.string(), mime: z.string() }))
    .parse(pack.files);
  const pdf = files.find((f) => f.mime === 'application/pdf');
  if (!pdf) throw new AppError('PDF_NOT_FOUND', 'This pack has no evidence PDF', 404);
  const blob = await createBlobStore(rt.db, rt.clock).get(pdf.sha256);
  return { filename: pdf.filename, bytes: blob.bytes! };
}
