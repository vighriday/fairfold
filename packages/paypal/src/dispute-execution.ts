import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import {
  AppError,
  systemClock,
  type Clock,
  type ForMerchant,
  type Money,
} from '@fairfold/contracts';
import { alerts, disputes, evidence_packs, schema, type createDatabase } from '@fairfold/db';
import { type Jobs } from '@fairfold/jobs';
import { createBlobStore, createLedger } from '@fairfold/ledger';
import { assertDisputeActionAvailable } from './dispute-guards.js';
import { PayPalError } from './errors.js';

type Pack = typeof evidence_packs.$inferSelect;
type ActionParams = {
  note?: string;
  offerType?: 'REFUND' | 'REFUND_WITH_REPLACEMENT' | 'REPLACEMENT_WITHOUT_REFUND';
  offerAmount?: Money;
  invoiceId?: string;
  acceptClaimType?: 'REFUND' | 'PARTIAL_REFUND';
  refundAmount?: Money;
};
type EvidenceFile = { sha256: string; filename: string; mime: string };
type Evidence = Record<string, unknown>;

const hash = /^[a-f0-9]{64}$/;
const filename = /^[^\\/\r\n\0]{1,255}$/u;
const mime = /^[\w.+-]+\/[\w.+-]+$/u;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function params(value: unknown): ActionParams {
  const input = object(value);
  const result: ActionParams = {};
  if (typeof input.note === 'string') result.note = input.note;
  if (typeof input.offerType === 'string')
    result.offerType = input.offerType as ActionParams['offerType'];
  if (typeof input.offerAmount === 'object' && input.offerAmount !== null)
    result.offerAmount = input.offerAmount as Money;
  if (typeof input.invoiceId === 'string') result.invoiceId = input.invoiceId;
  if (typeof input.acceptClaimType === 'string')
    result.acceptClaimType = input.acceptClaimType as ActionParams['acceptClaimType'];
  if (typeof input.refundAmount === 'object' && input.refundAmount !== null)
    result.refundAmount = input.refundAmount as Money;
  return result;
}

function files(value: unknown): EvidenceFile[] {
  if (!Array.isArray(value) || value.length > 6)
    throw new AppError('EVIDENCE_PACK_INVALID', 'Approved evidence files are invalid', 409);
  return value.map((item) => {
    const row = object(item);
    if (
      typeof row.sha256 !== 'string' ||
      !hash.test(row.sha256) ||
      typeof row.filename !== 'string' ||
      !filename.test(row.filename) ||
      typeof row.mime !== 'string' ||
      !mime.test(row.mime)
    )
      throw new AppError('EVIDENCE_PACK_INVALID', 'Approved evidence file is invalid', 409);
    return { sha256: row.sha256, filename: row.filename, mime: row.mime };
  });
}

function evidence(value: unknown): Evidence[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100)
    throw new AppError('EVIDENCE_PACK_INVALID', 'Approved evidence is invalid', 409);
  return value.map((item) => {
    const row = object(item);
    if (typeof row.evidence_type !== 'string' || !/^[A-Z_]+$/u.test(row.evidence_type))
      throw new AppError('EVIDENCE_PACK_INVALID', 'Approved evidence type is invalid', 409);
    return row;
  });
}

function requestId(packId: string): string {
  return `fairfold-evidence-${packId}`;
}

function safeResponse(value: unknown, disputeId: string, operation: string) {
  const row = object(value);
  const summary: Record<string, unknown> = {
    operation,
    disputeId,
    outcome: 'submitted',
  };
  if (typeof row.dispute_id === 'string' && row.dispute_id === disputeId)
    summary.paypalDisputeId = row.dispute_id;
  if (typeof row.status === 'string' && /^[A-Z][A-Z0-9_]{0,127}$/u.test(row.status))
    summary.paypalStatus = row.status;
  return summary;
}

function failureSummary(
  disputeId: string,
  operation: string,
  outcome: 'failed' | 'outcome_unknown',
  error: unknown,
) {
  const summary: Record<string, unknown> = {
    operation,
    disputeId,
    outcome,
  };
  if (error instanceof PayPalError) {
    if (error.upstreamStatus !== null) summary.upstreamStatus = error.upstreamStatus;
    if (error.debugId) summary.debugId = error.debugId;
    if (error.paypalName) summary.paypalName = error.paypalName;
    if (error.issues.length) summary.issues = error.issues;
  } else if (error instanceof AppError) {
    summary.errorCode = error.code;
  }
  return summary;
}

function actionFor(pack: Pack, disputeId: string) {
  const actionParams = params(pack.action_params);
  if (pack.recommendation === 'provide_evidence') {
    return {
      operation: 'provide_evidence' as const,
      evidences: evidence(pack.evidences),
      files: files(pack.files),
      actionParams,
    };
  }
  if (pack.recommendation === 'make_offer') {
    if (!actionParams.offerType)
      throw new AppError('EVIDENCE_PACK_INVALID', 'Approved offer type is missing', 409);
    return { operation: 'make_offer' as const, actionParams, disputeId };
  }
  if (pack.recommendation === 'accept_claim') {
    return { operation: 'accept_claim' as const, actionParams, disputeId };
  }
  throw new AppError('PACK_NOT_ACTIONABLE', 'Evidence pack recommendation is not actionable', 409);
}

export function createEvidenceSubmitHandler(options: {
  database: Pick<ReturnType<typeof createDatabase>, 'db' | 'pool'>;
  jobs: Pick<Jobs, 'publish'>;
  forMerchant: ForMerchant;
  clock?: Clock;
}) {
  const clock = options.clock ?? systemClock;
  return async ({ packId }: { packId: string }) => {
    const [initial] = await options.database.db
      .select({ pack: evidence_packs, dispute: disputes })
      .from(evidence_packs)
      .innerJoin(disputes, eq(evidence_packs.dispute_id, disputes.id))
      .where(eq(evidence_packs.id, packId));
    if (!initial) throw new AppError('PACK_NOT_FOUND', 'Evidence pack was not found', 404);
    if (initial.pack.status === 'submitted') return;
    if (initial.pack.status !== 'approved')
      throw new AppError('PACK_NOT_ACTIONABLE', 'Only an approved pack may execute', 409);

    const client = await options.database.pool.connect();
    let claimed: { pack: Pack; dispute: typeof disputes.$inferSelect };
    try {
      claimed = await drizzle(client, { schema }).transaction(async (tx) => {
        const [row] = await tx
          .select({ pack: evidence_packs, dispute: disputes })
          .from(evidence_packs)
          .innerJoin(disputes, eq(evidence_packs.dispute_id, disputes.id))
          .where(eq(evidence_packs.id, packId))
          .for('update');
        if (!row) throw new AppError('PACK_NOT_FOUND', 'Evidence pack was not found', 404);
        if (row.pack.status === 'submitted')
          throw new AppError('PACK_ALREADY_SUBMITTED', 'Evidence pack is already submitted', 409);
        if (row.pack.status !== 'approved')
          throw new AppError('PACK_NOT_ACTIONABLE', 'Only an approved pack may execute', 409);
        if (!row.pack.approved_by || !row.pack.approved_at)
          throw new AppError('PACK_NOT_APPROVED', 'A recorded human approval is required', 409);
        if (row.pack.paypal_response !== null)
          throw new AppError(
            'EVIDENCE_RECONCILIATION_REQUIRED',
            'A claimed action requires reconciliation before retry',
            409,
          );
        const now = new Date(clock.now());
        if (!Number.isFinite(now.getTime())) throw new Error('Invalid execution clock');
        const blobStore = createBlobStore(tx, clock);
        const approvedAction = actionFor(row.pack, row.dispute.id);
        if (approvedAction.operation === 'provide_evidence') {
          for (const file of approvedAction.files) {
            const blob = await blobStore.get(file.sha256);
            if (
              !blob.bytes ||
              createHash('sha256').update(blob.bytes).digest('hex') !== file.sha256 ||
              blob.mime !== file.mime
            )
              throw new AppError(
                'EVIDENCE_BLOB_MISMATCH',
                'Approved evidence MIME differs from stored evidence',
                409,
              );
          }
        }
        const [updated] = await tx
          .update(evidence_packs)
          .set({
            status: 'approved',
            paypal_response: {
              operation: approvedAction.operation,
              disputeId: row.dispute.id,
              outcome: 'outcome_unknown',
              observedAt: now.toISOString(),
              requestId: requestId(packId),
            },
          })
          .where(and(eq(evidence_packs.id, packId), eq(evidence_packs.status, 'approved')))
          .returning();
        if (!updated)
          throw new AppError('PACK_ALREADY_SUBMITTED', 'Evidence pack is already submitted', 409);
        return { pack: updated, dispute: row.dispute };
      });
    } finally {
      client.release();
    }

    const action = actionFor(claimed.pack, claimed.dispute.id);
    let vendorCompleted = false;
    let attempted = false;
    try {
      const paypal = await options.forMerchant(claimed.dispute.merchant_id);
      const fresh = await paypal.disputes.get(claimed.dispute.id);
      assertDisputeActionAvailable(fresh, {
        disputeId: claimed.dispute.id,
        operation: action.operation,
        variant:
          action.operation === 'make_offer'
            ? action.actionParams.offerType
            : action.operation === 'accept_claim'
              ? action.actionParams.acceptClaimType
              : undefined,
      });
      let response: unknown;
      if (action.operation === 'provide_evidence') {
        const blobs = files(claimed.pack.files);
        const stored = await Promise.all(
          blobs.map(async (file) => {
            const blob = await createBlobStore(options.database.db, clock).get(file.sha256);
            if (!blob.bytes) throw new AppError('BLOB_PURGED', 'Evidence bytes have expired', 410);
            return { filename: file.filename, mime: file.mime, bytes: blob.bytes };
          }),
        );
        attempted = true;
        response = await paypal.disputes.provideEvidence(
          claimed.dispute.id,
          evidence(claimed.pack.evidences),
          stored,
          { requestId: requestId(packId) },
        );
      } else if (action.operation === 'make_offer') {
        response = await paypal.disputes.makeOffer(
          claimed.dispute.id,
          {
            note: action.actionParams.note ?? '',
            offerType: action.actionParams.offerType!,
            offerAmount: action.actionParams.offerAmount,
            invoiceId: action.actionParams.invoiceId,
          },
          { requestId: requestId(packId) },
        );
      } else {
        response = await paypal.disputes.acceptClaim(
          claimed.dispute.id,
          {
            note: action.actionParams.note ?? '',
            acceptClaimType: action.actionParams.acceptClaimType,
            refundAmount: action.actionParams.refundAmount,
          },
          { requestId: requestId(packId) },
        );
      }
      vendorCompleted = true;
      const summary = {
        ...safeResponse(response, claimed.dispute.id, action.operation),
        packId,
        requestId: requestId(packId),
        observedAt: clock.now().toISOString(),
      };
      const client = await options.database.pool.connect();
      try {
        await drizzle(client, { schema }).transaction(async (tx) => {
          await tx
            .update(evidence_packs)
            .set({ status: 'submitted', submitted_at: clock.now(), paypal_response: summary })
            .where(eq(evidence_packs.id, packId));
          if (claimed.dispute.order_id) {
            const type =
              action.operation === 'provide_evidence'
                ? 'evidence_submitted'
                : action.operation === 'make_offer'
                  ? 'offer_made'
                  : 'claim_accepted';
            await createLedger(tx, clock).append(claimed.dispute.order_id, {
              type,
              actor: 'merchant:' + claimed.dispute.merchant_id,
              payload: {
                disputeId: claimed.dispute.id,
                packId,
                operation: action.operation,
                outcome: 'submitted',
              },
            });
          }
        });
      } finally {
        client.release();
      }
    } catch (error) {
      const unknown =
        vendorCompleted ||
        (attempted &&
          (!(error instanceof AppError) || (error instanceof PayPalError && error.outcomeUnknown)));
      const summary = {
        ...failureSummary(
          claimed.dispute.id,
          action.operation,
          unknown ? 'outcome_unknown' : 'failed',
          error,
        ),
        packId,
        requestId: requestId(packId),
        observedAt: clock.now().toISOString(),
      };
      const client = await options.database.pool.connect();
      try {
        await drizzle(client, { schema }).transaction(async (tx) => {
          await tx
            .update(evidence_packs)
            .set({ status: 'failed', paypal_response: summary })
            .where(eq(evidence_packs.id, packId));
          await tx
            .insert(alerts)
            .values({
              merchant_id: claimed.dispute.merchant_id,
              order_id: claimed.dispute.order_id,
              type: 'evidence_submit_failed',
              ref_id: packId,
              message: unknown
                ? 'PayPal action outcome requires reconciliation; do not resubmit'
                : 'Approved dispute action failed; review before approving a rebuilt pack',
              created_at: clock.now(),
            });
          if (
            !unknown &&
            !(await options.jobs.publish(
              'evidence.rebuild',
              { disputeId: claimed.dispute.id },
              { db: { executeSql: (query, values) => client.query(query, values) } },
            ))
          )
            throw new AppError(
              'EVIDENCE_REBUILD_QUEUE_FAILED',
              'Evidence rebuild could not be queued',
              503,
            );
        });
      } finally {
        client.release();
      }
      if (error instanceof AppError && error.code === 'STAGE_CHANGED') throw error;
    }
  };
}
