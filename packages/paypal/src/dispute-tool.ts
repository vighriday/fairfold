import { eq } from 'drizzle-orm';
import { AppError, UuidSchema } from '@fairfold/contracts';
import { disputes, evidence_packs, type Database } from '@fairfold/db';
import { type Jobs } from '@fairfold/jobs';
import { canonicalJson } from '@fairfold/ledger';

type ToolInput = {
  dispute_id: string;
  evidences: unknown[];
  files: Array<{ sha256: string; filename: string; mime: string }>;
};

function hash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function validInput(input: unknown): ToolInput {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new AppError('INVALID_DISPUTE_TOOL_INPUT', 'Dispute evidence input is invalid', 400);
  const value = input as Record<string, unknown>;
  if (
    typeof value.dispute_id !== 'string' ||
    !value.dispute_id ||
    !Array.isArray(value.evidences) ||
    !Array.isArray(value.files) ||
    value.files.length > 6
  )
    throw new AppError('INVALID_DISPUTE_TOOL_INPUT', 'Dispute evidence input is invalid', 400);
  const files = value.files.map((file) => {
    if (!file || typeof file !== 'object' || Array.isArray(file))
      throw new AppError('INVALID_DISPUTE_TOOL_INPUT', 'Dispute file is invalid', 400);
    const row = file as Record<string, unknown>;
    if (
      !hash(row.sha256) ||
      typeof row.filename !== 'string' ||
      !/^[^\\/\r\n\0]{1,255}$/u.test(row.filename) ||
      typeof row.mime !== 'string' ||
      !/^[\w.+-]+\/[\w.+-]+$/u.test(row.mime)
    )
      throw new AppError('INVALID_DISPUTE_TOOL_INPUT', 'Dispute file is invalid', 400);
    return { sha256: row.sha256, filename: row.filename, mime: row.mime };
  });
  return { dispute_id: value.dispute_id, evidences: value.evidences, files };
}

export function createProvideDisputeEvidenceTool(options: {
  database: Database;
  jobs: Pick<Jobs, 'publish'>;
}) {
  return async (merchantId: string, input: unknown) => {
    if (!UuidSchema.safeParse(merchantId).success)
      throw new AppError('MERCHANT_NOT_FOUND', 'Merchant was not found', 404);
    const value = validInput(input);
    const [dispute] = await options.database
      .select({ id: disputes.id, merchantId: disputes.merchant_id })
      .from(disputes)
      .where(eq(disputes.id, value.dispute_id));
    if (!dispute || dispute.merchantId !== merchantId)
      throw new AppError('DISPUTE_NOT_FOUND', 'Dispute was not found', 404);
    const packs = await options.database
      .select()
      .from(evidence_packs)
      .where(eq(evidence_packs.dispute_id, value.dispute_id));
    const pack = packs.find(
      (candidate) =>
        candidate.status === 'approved' &&
        canonicalJson(candidate.evidences) === canonicalJson(value.evidences) &&
        canonicalJson(candidate.files) === canonicalJson(value.files),
    );
    if (!pack)
      throw new AppError(
        'APPROVED_EVIDENCE_PACK_REQUIRED',
        'The tool may use only an exact already-approved evidence pack',
        409,
      );
    const jobId = await options.jobs.publish('evidence.submit', { packId: pack.id });
    if (!jobId)
      throw new AppError('EVIDENCE_APPROVAL_QUEUE_FAILED', 'Evidence could not be queued', 503);
    return { status: 'queued' as const, dispute_id: value.dispute_id, pack_id: pack.id };
  };
}
