// dispute.synced and evidence.rebuild (section 8), plus the merchant-scoped services behind endpoints 19 and 20.
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { AppError, type JobPayload } from '@fairfold/contracts';
import { complaints, disputes, evidence_packs, orders } from '@fairfold/db';
import { createBlobStore } from '@fairfold/ledger';
import { upsertComplaint } from '../complaints/create.js';
import type { IntelRuntime } from '../runtime.js';
import { buildEvidencePackWith, type EvidencePackResult } from './build.js';

const RawMessages = z.object({
  messages: z
    .array(z.object({ posted_by: z.string().optional(), content: z.string().optional() }))
    .optional(),
});

/** The buyer's first message in PayPal's dispute payload, if any. */
export function firstBuyerMessage(raw: unknown): string | null {
  const parsed = RawMessages.safeParse(raw);
  const message = parsed.success
    ? parsed.data.messages?.find((m) => (m.posted_by ?? 'BUYER') === 'BUYER' && m.content?.trim())
    : undefined;
  return message?.content?.trim() ?? null;
}

/**
 * One complaint per dispute (source 'dispute', source_ref = dispute id). New buyer messages are appended to it
 * (DECISIONS.md I-D3). A new complaint and its complaint.created job commit together; then the pack is built.
 */
export async function syncDispute(
  rt: IntelRuntime,
  p: JobPayload<'dispute.synced'>,
): Promise<EvidencePackResult> {
  const [dispute] = await rt.db.select().from(disputes).where(eq(disputes.id, p.disputeId));
  if (!dispute) throw new AppError('DISPUTE_NOT_FOUND', 'Dispute not found', 404);
  const [existing] = await rt.db
    .select({ id: complaints.id })
    .from(complaints)
    .where(and(eq(complaints.source, 'dispute'), eq(complaints.source_ref, dispute.id)));

  if (!existing) {
    const [order] = dispute.order_id
      ? await rt.db
          .select({ buyerId: orders.buyer_id })
          .from(orders)
          .where(eq(orders.id, dispute.order_id))
      : [];
    const messages = p.newBuyerMessages.length
      ? p.newBuyerMessages
      : [firstBuyerMessage(dispute.raw)];
    const text = [
      `PayPal dispute reason: ${dispute.reason}.`,
      ...messages.filter((m): m is string => Boolean(m)),
    ].join('\n\n');
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
  } else if (p.newBuyerMessages.length) {
    await upsertComplaint(rt, {
      merchantId: dispute.merchant_id,
      orderId: dispute.order_id,
      buyerId: null,
      source: 'dispute',
      sourceRef: dispute.id,
      text: p.newBuyerMessages.join('\n\n'),
    });
  }
  return buildEvidencePackWith(rt, dispute.id);
}

export async function rebuildPacks(
  rt: IntelRuntime,
  p: JobPayload<'evidence.rebuild'>,
): Promise<void> {
  const ids = 'disputeIds' in p ? p.disputeIds : [p.disputeId];
  for (const id of ids) await buildEvidencePackWith(rt, id);
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
