import { and, desc, eq, inArray, lt, or, type SQL } from 'drizzle-orm';
import {
  AppError,
  DisputeDetailSchema,
  DisputeRowSchema,
  ListQuerySchema,
  UuidSchema,
  type DisputeDetail,
  type DisputeRow,
} from '@fairfold/contracts';
import { disputes, evidence_packs, orders, type Database } from '@fairfold/db';
import { createLedger } from '@fairfold/ledger';
import { redactDisputeText } from '@fairfold/paypal';
import { type AuthContext } from '../auth.js';

type Dispute = typeof disputes.$inferSelect;
type RawDetail = {
  messages?: Array<{ posted_by?: string; time_posted?: string; content?: string }>;
  evidences?: Array<{
    evidence_type?: string;
    source?: string;
    date?: string;
    item_id?: string;
  }>;
  allowed_response_options?: {
    make_offer?: { offer_types?: string[] };
    accept_claim?: { accept_claim_types?: string[] };
  };
};

function merchantContext(auth: AuthContext | null): AuthContext & { role: 'merchant' } {
  if (!auth) throw new AppError('UNAUTHENTICATED', 'A valid bearer token is required', 401);
  if (auth.role !== 'merchant')
    throw new AppError('FORBIDDEN', 'This role cannot access disputes', 403);
  if (!UuidSchema.safeParse(auth.subjectId).success)
    throw new AppError('UNAUTHENTICATED', 'A valid bearer token is required', 401);
  return { ...auth, role: 'merchant' };
}

function rawDetail(dispute: Dispute): RawDetail {
  if (!dispute.raw || typeof dispute.raw !== 'object' || Array.isArray(dispute.raw))
    throw new AppError('STORED_DISPUTE_INVALID', 'Stored dispute detail is invalid', 500);
  return dispute.raw as RawDetail;
}

function latestPacks(rows: Array<typeof evidence_packs.$inferSelect>) {
  const result = new Map<string, typeof evidence_packs.$inferSelect>();
  for (const pack of rows) {
    const previous = result.get(pack.dispute_id);
    if (!previous || pack.created_at > previous.created_at) result.set(pack.dispute_id, pack);
  }
  return result;
}

function row(dispute: Dispute, pack?: typeof evidence_packs.$inferSelect): DisputeRow {
  return DisputeRowSchema.parse({
    id: dispute.id,
    orderId: dispute.order_id,
    reason: dispute.reason,
    status: dispute.status,
    lifeCycleStage: dispute.life_cycle_stage,
    dueAt: dispute.seller_response_due_date?.toISOString() ?? null,
    latestPack: pack
      ? { id: pack.id, status: pack.status, recommendation: pack.recommendation }
      : null,
  });
}

export function createDisputeReads(database: Database) {
  async function owned(auth: AuthContext & { role: 'merchant' }, id: string) {
    const [dispute] = await database
      .select()
      .from(disputes)
      .where(and(eq(disputes.id, id), eq(disputes.merchant_id, auth.subjectId)));
    if (!dispute) throw new AppError('DISPUTE_NOT_FOUND', 'Dispute was not found', 404);
    return dispute;
  }
  async function packs(ids: string[]) {
    if (!ids.length) return new Map<string, typeof evidence_packs.$inferSelect>();
    return latestPacks(
      await database.select().from(evidence_packs).where(inArray(evidence_packs.dispute_id, ids)),
    );
  }
  return {
    async list(authInput: AuthContext | null, query: unknown): Promise<DisputeRow[]> {
      const auth = merchantContext(authInput);
      const parsed = ListQuerySchema.safeParse(query);
      if (!parsed.success || parsed.data.limit > 100)
        throw new AppError('INVALID_DISPUTE_QUERY', 'Dispute query is invalid', 400);
      const { limit, cursor } = parsed.data;
      let after: SQL | undefined;
      if (cursor !== undefined) {
        const [anchor] = await database
          .select({ id: disputes.id, updatedAt: disputes.updated_at })
          .from(disputes)
          .where(and(eq(disputes.id, cursor), eq(disputes.merchant_id, auth.subjectId)));
        if (!anchor) throw new AppError('INVALID_CURSOR', 'Dispute cursor is invalid', 400);
        after = or(
          lt(disputes.updated_at, anchor.updatedAt),
          and(eq(disputes.updated_at, anchor.updatedAt), lt(disputes.id, anchor.id)),
        );
      }
      const rows = await database
        .select()
        .from(disputes)
        .where(and(eq(disputes.merchant_id, auth.subjectId), after))
        .orderBy(desc(disputes.updated_at), desc(disputes.id))
        .limit(limit);
      const latest = await packs(rows.map((item) => item.id));
      return rows.map((item) => row(item, latest.get(item.id)));
    },
    async detail(authInput: AuthContext | null, id: string) {
      const auth = merchantContext(authInput);
      const dispute = await owned(auth, id);
      const latest = (await packs([id])).get(id);
      const raw = rawDetail(dispute);
      const detail: DisputeDetail = DisputeDetailSchema.parse({
        ...row(dispute, latest),
        amount:
          dispute.amount_value && dispute.currency
            ? { currency_code: dispute.currency, value: dispute.amount_value }
            : null,
        outcomeCode: dispute.outcome_code,
        messages: (raw.messages ?? []).map((message) => ({
          postedBy: message.posted_by,
          timePosted: message.time_posted,
          content: message.content,
        })),
        evidences: (raw.evidences ?? []).map((evidence) => ({
          evidenceType: evidence.evidence_type,
          source: evidence.source,
          date: evidence.date ?? null,
          itemId: evidence.item_id ?? null,
        })),
        allowedResponseOptions: raw.allowed_response_options
          ? {
              makeOffer: raw.allowed_response_options.make_offer
                ? { offerTypes: raw.allowed_response_options.make_offer.offer_types ?? [] }
                : undefined,
              acceptClaim: raw.allowed_response_options.accept_claim
                ? {
                    acceptClaimTypes:
                      raw.allowed_response_options.accept_claim.accept_claim_types ?? [],
                  }
                : undefined,
            }
          : null,
      });
      const packRows = await database
        .select()
        .from(evidence_packs)
        .where(eq(evidence_packs.dispute_id, id))
        .orderBy(desc(evidence_packs.created_at), desc(evidence_packs.id));
      const [order] = dispute.order_id
        ? await database
            .select({
              id: orders.id,
              status: orders.status,
              paypalOrderId: orders.paypal_order_id,
              paypalCaptureId: orders.paypal_capture_id,
              amountValue: orders.amount_value,
              currency: orders.currency,
            })
            .from(orders)
            .where(and(eq(orders.id, dispute.order_id), eq(orders.merchant_id, auth.subjectId)))
        : [];
      return {
        dispute: detail,
        order: order ?? null,
        packs: packRows.map((pack) => ({
          id: pack.id,
          status: pack.status,
          recommendation: pack.recommendation,
          actionParams: pack.action_params,
          evidences: pack.evidences,
          files: pack.files,
          narrative: redactDisputeText(pack.narrative),
          confidence: pack.confidence,
          approvedBy: pack.approved_by,
          approvedAt: pack.approved_at?.toISOString() ?? null,
          submittedAt: pack.submitted_at?.toISOString() ?? null,
          createdAt: pack.created_at.toISOString(),
        })),
        timeline: order ? (await createLedger(database).verify(order.id)).entries : [],
      };
    },
  };
}
