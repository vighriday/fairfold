import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import {
  AppError,
  CoreRequests,
  MoneySchema,
  UuidSchema,
  systemClock,
  type Clock,
} from '@fairfold/contracts';
import { disputes, evidence_packs, schema, type createDatabase } from '@fairfold/db';
import { type Jobs } from '@fairfold/jobs';
import { type AuthContext } from '../auth.js';

const actionable = new Set(['provide_evidence', 'make_offer', 'accept_claim']);
const offerTypes = new Set(['REFUND', 'REFUND_WITH_REPLACEMENT', 'REPLACEMENT_WITHOUT_REFUND']);
const claimTypes = new Set(['REFUND', 'PARTIAL_REFUND']);
type ActionRecommendation = 'provide_evidence' | 'make_offer' | 'accept_claim';
type ApprovalEdits = {
  recommendation?: string;
  offerType?: string;
  acceptClaimType?: string;
  amount?: { currency_code: string; value: string };
  note?: string;
};

function merchant(auth: AuthContext | null): AuthContext & { role: 'merchant' } {
  if (!auth) throw new AppError('UNAUTHENTICATED', 'A valid bearer token is required', 401);
  if (auth.role !== 'merchant')
    throw new AppError('FORBIDDEN', 'Only a merchant may approve a pack', 403);
  return { ...auth, role: 'merchant' };
}

function minor(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
}

function edits(input: unknown): ApprovalEdits {
  const parsed = CoreRequests.approveAction.safeParse(input);
  if (!parsed.success)
    throw new AppError('INVALID_DISPUTE_APPROVAL', 'Approval input is invalid', 400);
  const value = parsed.data.edits ?? {};
  const allowed = ['recommendation', 'offerType', 'acceptClaimType', 'amount', 'note'];
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new AppError('INVALID_DISPUTE_APPROVAL', 'Approval edit is not supported', 400);
  const result = value as ApprovalEdits;
  if (result.recommendation !== undefined && !actionable.has(result.recommendation))
    throw new AppError(
      'INVALID_DISPUTE_APPROVAL',
      'Approval recommendation is not actionable',
      400,
    );
  if (result.offerType !== undefined && !offerTypes.has(result.offerType))
    throw new AppError('INVALID_DISPUTE_APPROVAL', 'Approval offer type is invalid', 400);
  if (result.acceptClaimType !== undefined && !claimTypes.has(result.acceptClaimType))
    throw new AppError('INVALID_DISPUTE_APPROVAL', 'Approval claim type is invalid', 400);
  if (
    result.note !== undefined &&
    (typeof result.note !== 'string' || [...result.note].length > 2000)
  )
    throw new AppError('INVALID_DISPUTE_APPROVAL', 'Approval note is invalid', 400);
  return result;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function createDisputeApproval(options: {
  database: Pick<ReturnType<typeof createDatabase>, 'pool'>;
  jobs: Pick<Jobs, 'publish'>;
  clock?: Clock;
}) {
  const clock = options.clock ?? systemClock;
  return async (
    authInput: AuthContext | null,
    disputeId: string,
    packId: string,
    input: unknown,
  ) => {
    const auth = merchant(authInput);
    if (!UuidSchema.safeParse(packId).success)
      throw new AppError('PACK_NOT_FOUND', 'Evidence pack was not found', 404);
    const override = edits(input);
    const client = await options.database.pool.connect();
    try {
      return await drizzle(client, { schema }).transaction(async (tx) => {
        const [pack] = await tx
          .select()
          .from(evidence_packs)
          .where(eq(evidence_packs.id, packId))
          .for('update');
        if (!pack || pack.dispute_id !== disputeId)
          throw new AppError('PACK_NOT_FOUND', 'Evidence pack was not found', 404);
        const [dispute] = await tx
          .select()
          .from(disputes)
          .where(and(eq(disputes.id, disputeId), eq(disputes.merchant_id, auth.subjectId)))
          .for('update');
        if (!dispute) throw new AppError('DISPUTE_NOT_FOUND', 'Dispute was not found', 404);
        if (pack.status !== 'draft')
          throw new AppError(
            'PACK_NOT_ACTIONABLE',
            'Only a draft evidence pack may be approved',
            409,
          );
        const recommendation = override.recommendation ?? pack.recommendation;
        if (recommendation === 'inspect_first')
          throw new AppError(
            'PACK_NOT_ACTIONABLE',
            'Inspection must complete before approval',
            409,
          );
        if (recommendation === 'merchant_decides')
          throw new AppError(
            'PACK_NOT_ACTIONABLE',
            'Merchant must choose an actionable recommendation',
            409,
          );
        if (!actionable.has(recommendation))
          throw new AppError('INVALID_DISPUTE_APPROVAL', 'Approval recommendation is invalid', 400);
        const approvedRecommendation = recommendation as ActionRecommendation;
        const current = object(pack.action_params);
        const offerType =
          override.offerType ??
          (typeof current.offerType === 'string' ? current.offerType : undefined);
        const acceptClaimType =
          override.acceptClaimType ??
          (typeof current.acceptClaimType === 'string' ? current.acceptClaimType : undefined);
        const amount =
          override.amount ??
          (MoneySchema.safeParse(current.offerAmount).success
            ? current.offerAmount
            : MoneySchema.safeParse(current.refundAmount).success
              ? current.refundAmount
              : undefined);
        if (recommendation === 'make_offer') {
          if (!offerType || !offerTypes.has(offerType))
            throw new AppError('INVALID_DISPUTE_APPROVAL', 'Offer type is required', 400);
          if (offerType === 'REFUND_WITH_RETURN')
            throw new AppError(
              'PAYPAL_RETURN_ADDRESS_REVIEW_REQUIRED',
              'Return-based action requires Q2 review',
              409,
            );
        }
        if (
          recommendation === 'accept_claim' &&
          acceptClaimType &&
          !claimTypes.has(acceptClaimType)
        )
          throw new AppError('INVALID_DISPUTE_APPROVAL', 'Claim type is invalid', 400);
        if (recommendation === 'accept_claim' && acceptClaimType === 'PARTIAL_REFUND' && !amount)
          throw new AppError('INVALID_DISPUTE_APPROVAL', 'Partial claim amount is required', 400);
        if (amount) {
          const parsedAmount = MoneySchema.safeParse(amount);
          if (
            !parsedAmount.success ||
            parsedAmount.data.currency_code !== dispute.currency ||
            !dispute.amount_value ||
            minor(parsedAmount.data.value) <= 0n ||
            minor(parsedAmount.data.value) > minor(dispute.amount_value)
          )
            throw new AppError(
              'INVALID_DISPUTE_APPROVAL',
              'Approval amount is outside the dispute amount',
              400,
            );
        }
        const now = new Date(clock.now());
        if (!Number.isFinite(now.getTime())) throw new Error('Invalid approval clock');
        const actionParams = {
          ...current,
          ...(offerType ? { offerType } : {}),
          ...(acceptClaimType ? { acceptClaimType } : {}),
          ...(amount
            ? {
                ...(approvedRecommendation === 'make_offer'
                  ? { offerAmount: amount }
                  : { refundAmount: amount }),
              }
            : {}),
          ...(override.note !== undefined ? { note: override.note } : {}),
        };
        await tx
          .update(evidence_packs)
          .set({
            status: 'approved',
            recommendation: approvedRecommendation,
            action_params: actionParams,
            approved_by: auth.subjectId,
            approved_at: now,
          })
          .where(eq(evidence_packs.id, packId));
        const jobId = await options.jobs.publish(
          'evidence.submit',
          { packId },
          { db: { executeSql: (query, values) => client.query(query, values) } },
        );
        if (!jobId)
          throw new AppError(
            'EVIDENCE_APPROVAL_QUEUE_FAILED',
            'Approved evidence could not be queued',
            503,
          );
        return {
          packId,
          disputeId,
          status: 'approved' as const,
          recommendation: approvedRecommendation,
        };
      });
    } finally {
      client.release();
    }
  };
}
