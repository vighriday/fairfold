// Dispute Agent (task I5): builds the evidence pack draft for a dispute. Code decides; the model only writes the
// narrative from a fact list. Shared-cause context goes in sharedContext for the merchant, never into evidence.
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import {
  AppError,
  EvidencePackDraftSchema,
  type AttestationResult,
  type EvidencePackDraft,
} from '@fairfold/contracts';
import {
  attestations,
  complaints,
  disputes,
  evidence_packs,
  hypotheses,
  merchants,
  order_items,
  orders,
  products,
  shipments,
} from '@fairfold/db';
import { createBlobStore, createLedger } from '@fairfold/ledger';
import { getIntelRuntime, type IntelRuntime } from '../runtime.js';
import { toDisputeCarrier } from './carriers.js';
import { decide, type Decision, type DisputeFacts } from './decide.js';
import { buildEvidences } from './evidenceJson.js';
import { narrativeFacts, writeNarrative } from './narrative.js';
import { buildEvidencePdf, type EvidencePdfData } from './pdf.js';

export type EvidencePackResult = EvidencePackDraft & { packId: string };

const PolicySchema = z.object({ kind: z.string(), url: z.string() });

type Ledger = Awaited<ReturnType<ReturnType<typeof createLedger>['verify']>>;

async function linkedHypothesis(rt: IntelRuntime, disputeId: string) {
  const [complaint] = await rt.db
    .select()
    .from(complaints)
    .where(and(eq(complaints.source, 'dispute'), eq(complaints.source_ref, disputeId)));
  if (!complaint?.cluster_id) return { complaint: complaint ?? null, hypothesis: null };
  const rows = await rt.db
    .select()
    .from(hypotheses)
    .where(
      and(
        eq(hypotheses.cluster_id, complaint.cluster_id),
        inArray(hypotheses.status, ['open', 'confirmed']),
      ),
    )
    .orderBy(desc(hypotheses.created_at));
  const hypothesis = rows.find((h) => h.status === 'confirmed') ?? rows[0] ?? null;
  return { complaint, hypothesis };
}

/** At most this many of the buyer's own photos go into the evidence PDF. */
export const MAX_BUYER_PHOTOS_IN_PDF = 6;

/** What the Evidence Agent's buyer_photo check means, in the merchant's rationale and in the PDF. */
const BUYER_PHOTO_CHECK: Record<string, string> = {
  match: "The buyer's photos show the item that was ordered.",
  mismatch:
    "The buyer's photos may show a different item from the one ordered (its colour or size label differs); " +
    "the evidence PDF shows them beside the packing photos, and PayPal's reviewer decides.",
  could_not_verify: "The buyer's photos could not be checked against the order.",
};

/**
 * The buyer's own photos of the order — from every complaint on it (problem reports, low reviews) — and the
 * Evidence Agent's latest check of them (step buyer_photo).
 */
async function buyerPhotoEvidence(rt: IntelRuntime, orderId: string) {
  const rows = await rt.db
    .select({ shas: complaints.image_shas })
    .from(complaints)
    .where(eq(complaints.order_id, orderId))
    .orderBy(asc(complaints.created_at), asc(complaints.id));
  const shas = [...new Set(rows.flatMap((r) => r.shas))].slice(0, MAX_BUYER_PHOTOS_IN_PDF);
  const [check] = await rt.db
    .select({ status: attestations.status })
    .from(attestations)
    .where(and(eq(attestations.order_id, orderId), eq(attestations.step, 'buyer_photo')))
    .orderBy(desc(attestations.created_at), desc(attestations.id))
    .limit(1);
  return { shas, check: check ? (BUYER_PHOTO_CHECK[check.status] ?? null) : null };
}

function exifFlag(payload: unknown): string | null {
  const p = (payload ?? {}) as { exifOutsideWindow?: boolean; exifUnreadable?: boolean };
  if (p.exifOutsideWindow) return 'photo EXIF time is more than 15 minutes from the upload time';
  if (p.exifUnreadable) return 'photo EXIF data could not be read';
  return null;
}

interface PackingPhoto {
  sha256: string;
  label: string;
  serverTime: Date | null;
  /** Section 12 evidence-integrity flags, in plain words; empty when the photo raises none. */
  flags: string[];
}

/**
 * The attested packing photos with their section 12 integrity flags: an EXIF capture time outside the upload window
 * (recorded on the photo's ledger entry when it was stored) and the same photo — by SHA-256 — recorded for another
 * order of this store (H1's merchant-local reuse lookup). Flags inform the merchant and PayPal's reviewer; they never
 * change the recommendation.
 */
async function packingPhotos(
  blobs: ReturnType<typeof createBlobStore>,
  order: typeof orders.$inferSelect,
  attestation: typeof attestations.$inferSelect | undefined,
  entries: Ledger['entries'],
): Promise<PackingPhoto[]> {
  if (!attestation) return [];
  const photoEntries = new Map(
    entries.filter((e) => e.type === 'photo' && e.blob_sha256).map((e) => [e.blob_sha256!, e]),
  );
  const photos: PackingPhoto[] = [];
  for (const [i, sha256] of attestation.photo_shas.entries()) {
    const entry = photoEntries.get(sha256);
    const flags: string[] = [];
    const exif = exifFlag(entry?.payload);
    if (exif) flags.push(exif);
    const others = (await blobs.photoUsedByMerchant(sha256, order.merchant_id)).filter(
      (id) => id !== order.id,
    ).length;
    if (others)
      flags.push(
        `the same photo is recorded for ${others} other order${others === 1 ? '' : 's'} of this store`,
      );
    photos.push({
      sha256,
      label: attestation.photo_labels[i] ?? 'photo',
      serverTime: entry?.server_time ?? null,
      flags,
    });
  }
  return photos;
}

/** One rationale line per flagged packing photo, e.g. `Packing photo "item": …; ….` */
const integrityRationale = (photos: PackingPhoto[]) =>
  photos
    .filter((p) => p.flags.length)
    .map((p) => `Packing photo "${p.label}": ${p.flags.join('; ')}.`);

function confidenceOf(d: Decision, attestationConfidence: number | null): number {
  if (d.weakCaseWarning) return 0.4;
  if (d.recommendation === 'provide_evidence')
    return d.evidenceType === 'OTHER' ? (attestationConfidence ?? 0.5) : 0.9;
  return 0.8;
}

export async function buildEvidencePackWith(
  rt: IntelRuntime,
  disputeId: string,
): Promise<EvidencePackResult> {
  const [dispute] = await rt.db.select().from(disputes).where(eq(disputes.id, disputeId));
  if (!dispute) throw new AppError('DISPUTE_NOT_FOUND', 'Dispute not found', 404);
  const blobs = createBlobStore(rt.db, rt.clock);

  const [order] = dispute.order_id
    ? await rt.db.select().from(orders).where(eq(orders.id, dispute.order_id))
    : [];
  const [shipment] = order
    ? await rt.db.select().from(shipments).where(eq(shipments.order_id, order.id))
    : [];
  const ledger: Ledger | null = order ? await createLedger(rt.db, rt.clock).verify(order.id) : null;
  const entries = ledger?.entries ?? [];
  const [attestation] = order
    ? await rt.db
        .select()
        .from(attestations)
        .where(and(eq(attestations.order_id, order.id), eq(attestations.step, 'pack')))
        .orderBy(desc(attestations.created_at))
        .limit(1)
    : [];
  const result = attestation?.result as AttestationResult | undefined;
  const { hypothesis } = await linkedHypothesis(rt, disputeId);
  const buyerPhotos = order ? await buyerPhotoEvidence(rt, order.id) : { shas: [], check: null };
  const photos = order ? await packingPhotos(blobs, order, attestation, entries) : [];

  const amount = {
    currency_code: dispute.currency ?? order?.currency ?? 'USD',
    value: dispute.amount_value ?? order?.amount_value ?? '0.00',
  };
  const trackingPushed = entries.some((e) => e.type === 'tracking_pushed');
  const deliveredAt =
    order?.delivered_at ?? entries.find((e) => e.type === 'delivered')?.server_time ?? null;
  const facts: DisputeFacts = {
    reason: dispute.reason,
    status: dispute.status,
    lifeCycleStage: dispute.life_cycle_stage,
    dueAt: dispute.seller_response_due_date,
    attestation: attestation
      ? { status: attestation.status, defects: result?.defects.length ?? 0 }
      : null,
    tracking: {
      pushed: trackingPushed,
      delivered: shipment?.status === 'delivered' || deliveredAt !== null,
      shippedToTxnAddress: Boolean(order?.sealed_at && shipment),
    },
    linkedHypothesis: hypothesis
      ? {
          id: hypothesis.id,
          status: hypothesis.status as 'open' | 'confirmed',
          summary: hypothesis.explanation,
        }
      : null,
    amount,
  };
  const decision = decide(facts, rt.clock.now());

  const narrative = await writeNarrative(
    narrativeFacts({
      reason: dispute.reason,
      amount,
      invoiceId: order?.invoice_id ?? null,
      capturedAt: order?.captured_at ?? null,
      sealedAt: order?.sealed_at ?? null,
      shipment: shipment
        ? { carrier: shipment.carrier, trackingNumber: shipment.tracking_number, deliveredAt }
        : null,
      attestation: attestation
        ? { status: attestation.status, photoCount: attestation.photo_shas.length }
        : null,
      ledger: ledger ? { verified: ledger.verified, entries: entries.length } : null,
    }),
    rt.models.text,
  );
  const evidences = buildEvidences(
    decision.evidenceType,
    shipment
      ? {
          carrier: shipment.carrier,
          carrierNameOther: shipment.carrier_name_other,
          trackingNumber: shipment.tracking_number,
        }
      : null,
    narrative.text,
    toDisputeCarrier,
  );

  const files: EvidencePackDraft['files'] = [];
  if (order && (decision.includePdf || decision.recommendation === 'merchant_decides')) {
    const pdf = await buildEvidencePdf(
      await pdfData(rt, blobs, {
        dispute,
        order,
        shipment: shipment ?? null,
        ledger: ledger!,
        attestation,
        result,
        photos,
        buyerPhotos,
        amount,
      }),
    );
    const sha256 = await blobs.put(Buffer.from(pdf), 'application/pdf');
    files.push({
      sha256,
      filename: `fairfold-evidence-${dispute.id}.pdf`,
      mime: 'application/pdf',
    });
  }

  const draft = EvidencePackDraftSchema.parse({
    recommendation: decision.recommendation,
    rationale: [
      ...decision.rationale,
      ...integrityRationale(photos),
      ...(buyerPhotos.check ? [buyerPhotos.check] : []),
    ],
    evidences,
    files,
    actionParams: decision.actionParams,
    narrative: narrative.text,
    sharedContext: hypothesis
      ? { hypothesisId: hypothesis.id, status: hypothesis.status, summary: hypothesis.explanation }
      : null,
    confidence: confidenceOf(decision, attestation?.confidence ?? null),
  });

  const packId = await rt.db.transaction(async (tx) => {
    await tx
      .update(evidence_packs)
      .set({ status: 'superseded' })
      .where(and(eq(evidence_packs.dispute_id, disputeId), eq(evidence_packs.status, 'draft')));
    const [row] = await tx
      .insert(evidence_packs)
      .values({
        dispute_id: disputeId,
        status: 'draft',
        recommendation: draft.recommendation,
        action_params: draft.actionParams,
        evidences: draft.evidences,
        files: draft.files,
        narrative: draft.narrative,
        hypothesis_id: hypothesis?.id ?? null,
        confidence: draft.confidence,
        created_at: rt.clock.now(),
      })
      .returning({ id: evidence_packs.id });
    return row!.id;
  });
  return { ...draft, packId };
}

async function pdfData(
  rt: IntelRuntime,
  blobs: ReturnType<typeof createBlobStore>,
  s: {
    dispute: typeof disputes.$inferSelect;
    order: typeof orders.$inferSelect;
    shipment: typeof shipments.$inferSelect | null;
    ledger: Ledger;
    attestation: typeof attestations.$inferSelect | undefined;
    result: AttestationResult | undefined;
    photos: PackingPhoto[];
    buyerPhotos: { shas: string[]; check: string | null };
    amount: { currency_code: string; value: string };
  },
): Promise<EvidencePdfData> {
  const bytesOf = async (sha256: string) => {
    try {
      return new Uint8Array((await blobs.get(sha256)).bytes!);
    } catch {
      return null; // purged or missing bytes: the photo is listed in the ledger but cannot be shown
    }
  };
  const packing: EvidencePdfData['packingPhotos'] = [];
  for (const photo of s.photos) {
    const bytes = await bytesOf(photo.sha256);
    if (bytes) packing.push({ ...photo, bytes });
  }
  const buyerPhotos: EvidencePdfData['buyerPhotos'] = [];
  for (const sha256 of s.buyerPhotos.shas) {
    const bytes = await bytesOf(sha256);
    if (bytes) buyerPhotos.push({ sha256, bytes });
  }

  const items = await rt.db
    .select({ item: order_items, product: products })
    .from(order_items)
    .innerJoin(products, eq(products.id, order_items.product_id))
    .where(eq(order_items.order_id, s.order.id));
  const [merchant] = await rt.db
    .select()
    .from(merchants)
    .where(eq(merchants.id, s.order.merchant_id));
  const policies = z.array(z.unknown()).parse(merchant?.policy_urls ?? []);
  const returns = policies
    .map((p) => PolicySchema.safeParse(p))
    .find((p) => p.success && p.data.kind === 'returns');

  const first = items[0];
  return {
    dispute: {
      id: s.dispute.id,
      reason: s.dispute.reason,
      status: s.dispute.status,
      amount: s.amount,
    },
    order: {
      id: s.order.id,
      invoiceId: s.order.invoice_id,
      capturedAt: s.order.captured_at,
      sealedAt: s.order.sealed_at,
      shippedAt: s.order.shipped_at,
      deliveredAt: s.order.delivered_at,
    },
    timeline: s.ledger.entries.map((e) => ({
      seq: e.seq,
      type: e.type,
      serverTime: e.server_time,
      actor: e.actor,
    })),
    packingPhotos: packing,
    buyerPhotos,
    buyerPhotoCheck: s.buyerPhotos.check,
    attestation:
      s.attestation && s.result
        ? {
            status: s.attestation.status,
            confidence: s.attestation.confidence,
            model: s.attestation.model,
            batchLabelText: s.result.batchLabelText,
            trackingNumberText: s.result.shippingLabel.trackingNumberText,
            items: s.result.items.map((seen) => {
              const ordered = items.find((i) => i.item.id === seen.orderItemId);
              return {
                name: ordered?.item.name ?? seen.seen.itemType,
                expected: ordered
                  ? `${ordered.product.colour ?? '-'} ${ordered.product.size ?? '-'} x${ordered.item.quantity}`
                  : '-',
                seen: `${seen.seen.colour} ${seen.seen.sizeLabel ?? '-'} x${seen.seen.quantity}`,
                matches: seen.matches,
              };
            }),
            defects: s.result.defects.map(
              (d) => `${d.component}: ${d.description} (${d.severity})`,
            ),
          }
        : null,
    ledger: {
      verified: s.ledger.verified,
      brokenAtSeq: s.ledger.brokenAtSeq,
      entries: s.ledger.entries.length,
    },
    listing: first
      ? { name: first.product.name, sku: first.product.sku, description: first.product.description }
      : null,
    returnPolicyUrl: returns?.success ? returns.data.url : null,
    shipment: s.shipment
      ? {
          carrier: s.shipment.carrier,
          trackingNumber: s.shipment.tracking_number,
          status: s.shipment.status,
        }
      : null,
  };
}

/** Section 15: buildEvidencePack(disputeId). */
export async function buildEvidencePack(disputeId: string): Promise<EvidencePackDraft> {
  const { packId: _packId, ...draft } = await buildEvidencePackWith(getIntelRuntime(), disputeId);
  return draft;
}
