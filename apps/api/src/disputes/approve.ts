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
import { redactDisputeText } from '@fairfold/paypal';
import { canonicalJson } from '@fairfold/ledger';

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
  const parsed = CoreRequests.approvePack.safeParse(input);
  if (!parsed.success)
    throw new AppError('INVALID_DISPUTE_APPROVAL', 'Approval input is invalid', 400);
  const value = parsed.data;
  const allowed = ['recommendation', 'offerType', 'acceptClaimType', 'amount', 'note'];
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new AppError('INVALID_DISPUTE_APPROVAL', 'Approval edit is not supported', 400);
  const result = value as ApprovalEdits;
  if (result.offerType === 'REFUND_WITH_RETURN' || result.acceptClaimType === 'REFUND_WITH_RETURN')
    throw new AppError('PAYPAL_RETURN_ADDRESS_REVIEW_REQUIRED', 'Return-based action requires Q2 review', 409);
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

function actionParamsNote(current: Record<string, unknown>, override: ApprovalEdits): boolean {
  const note = override.note ?? current.note;
  return typeof note === 'string' && note.trim().length > 0 && [...note].length <= 2000;
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
        if (pack.recommendation === 'inspect_first')
          throw new AppError(
            'PACK_NOT_ACTIONABLE',
            'Inspection must complete before approval',
            409,
          );
        const recommendation = override.recommendation ?? pack.recommendation;
        if (!actionable.has(recommendation))
          throw new AppError('PACK_NOT_ACTIONABLE', 'Choose an actionable recommendation', 409);
        if (
          pack.recommendation !== 'merchant_decides' &&
          override.recommendation !== undefined &&
          override.recommendation !== pack.recommendation
        )
          throw new AppError(
            'PACK_NOT_ACTIONABLE',
            'A different recommendation requires a rebuilt pack',
            409,
          );
        const approvedRecommendation = recommendation as ActionRecommendation;
        const current = object(pack.action_params);
        const offerType = override.offerType ?? current.offerType;
        const acceptClaimType = override.acceptClaimType ?? current.acceptClaimType ?? 'REFUND';
        if (offerType === 'REFUND_WITH_RETURN' || acceptClaimType === 'REFUND_WITH_RETURN')
          throw new AppError(
            'PAYPAL_RETURN_ADDRESS_REVIEW_REQUIRED',
            'Return-based action requires Q2 review',
            409,
          );
        if (
          recommendation === 'make_offer' &&
          (typeof offerType !== 'string' || !offerTypes.has(offerType))
        )
          throw new AppError('INVALID_DISPUTE_APPROVAL', 'Offer type is required', 400);
        if (
          recommendation === 'accept_claim' &&
          (typeof acceptClaimType !== 'string' || !claimTypes.has(acceptClaimType))
        )
          throw new AppError('INVALID_DISPUTE_APPROVAL', 'Claim type is invalid', 400);
        const representations = [current.amount, current.offerAmount, current.refundAmount].filter(
          (v) => v !== undefined,
        );
        if (
          representations.some((v) => !MoneySchema.safeParse(v).success) ||
          new Set(representations.map(canonicalJson)).size > 1
        )
          throw new AppError(
            'INVALID_DISPUTE_APPROVAL',
            'Conflicting or invalid draft amounts',
            400,
          );
        const amount = override.amount ?? representations[0];
        const needsAmount =
          (recommendation === 'make_offer' && offerType !== 'REPLACEMENT_WITHOUT_REFUND') ||
          (recommendation === 'accept_claim' && acceptClaimType === 'PARTIAL_REFUND');
        if ((needsAmount && !amount) || (!needsAmount && override.amount !== undefined))
          throw new AppError(
            'INVALID_DISPUTE_APPROVAL',
            'Amount does not match the chosen operation',
            400,
          );
        if (amount) {
          const parsed = MoneySchema.safeParse(amount);
          if (
            !parsed.success ||
            parsed.data.currency_code !== dispute.currency ||
            !dispute.amount_value ||
            minor(parsed.data.value) <= 0n ||
            minor(parsed.data.value) > minor(dispute.amount_value)
          )
            throw new AppError(
              'INVALID_DISPUTE_APPROVAL',
              'Approval amount is outside the dispute amount',
              400,
            );
        }
        if (recommendation !== 'provide_evidence' && !actionParamsNote(current, override))
          throw new AppError('INVALID_DISPUTE_APPROVAL', 'Action note is required', 400);
        if (
          (recommendation !== 'make_offer' && override.offerType !== undefined) ||
          (recommendation !== 'accept_claim' && override.acceptClaimType !== undefined)
        )
          throw new AppError(
            'INVALID_DISPUTE_APPROVAL',
            'Action fields do not match the recommendation',
            400,
          );
        const note = override.note ?? current.note;
        const actionParams = {
          ...(typeof note === 'string' ? { note: redactDisputeText(note) } : {}),
          ...(recommendation === 'make_offer'
            ? { offerType, ...(needsAmount ? { offerAmount: amount } : {}) }
            : {}),
          ...(recommendation === 'accept_claim'
            ? { acceptClaimType, ...(needsAmount ? { refundAmount: amount } : {}) }
            : {}),
        };
        const now = new Date(clock.now());
        if (!Number.isFinite(now.getTime())) throw new Error('Invalid approval clock');
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
