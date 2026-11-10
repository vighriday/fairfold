import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  createDatabase,
  disputes,
  evidence_blobs,
  evidence_packs,
  merchants,
  migrateDatabase,
} from '@fairfold/db';
import { fixedClock, type ForMerchant, type PayPalClient } from '@fairfold/contracts';
import type { Jobs } from '@fairfold/jobs';
import { testDatabaseUrl } from '../../db/test/environment.js';
import { createEvidenceSubmitHandler } from '../src/dispute-execution.js';
import { PayPalError } from '../src/errors.js';

const url = testDatabaseUrl();
const clock = fixedClock('2026-11-10T02:03:04.005Z');

describe.skipIf(!url)('H4 approved dispute action execution', () => {
  let database: ReturnType<typeof createDatabase>;

  beforeAll(async () => {
    database = createDatabase(url!);
    await migrateDatabase(database.db);
  });
  afterAll(async () => {
    await database?.close();
  });

  async function fixture() {
    const merchantId = randomUUID();
    await database.db.insert(merchants).values({
      id: merchantId,
      slug: 'h4-execution-' + merchantId,
      name: 'Synthetic execution merchant',
      domain: 'execution.invalid',
      country: 'US',
    });
    const disputeId = 'PP-D-EXEC-' + randomUUID().replaceAll('-', '').toUpperCase();
    await database.db.insert(disputes).values({
      id: disputeId,
      merchant_id: merchantId,
      reason: 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED',
      status: 'WAITING_FOR_SELLER_RESPONSE',
      life_cycle_stage: 'INQUIRY',
      amount_value: '38.00',
      currency: 'USD',
      raw: {},
    });
    const bytes = Buffer.from('%PDF-1.7\nsynthetic evidence', 'ascii');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    await database.db
      .insert(evidence_blobs)
      .values({
        sha256,
        mime: 'application/pdf',
        bytes,
      })
      .onConflictDoNothing();
    const [pack] = await database.db
      .insert(evidence_packs)
      .values({
        dispute_id: disputeId,
        recommendation: 'provide_evidence',
        action_params: null,
        evidences: [{ evidence_type: 'OTHER', documents: [{ name: 'proof.pdf' }] }],
        files: [{ sha256, filename: 'proof.pdf', mime: 'application/pdf' }],
        narrative: 'Synthetic approved pack',
        confidence: 0.9,
        status: 'approved',
      })
      .returning();
    const detail = {
      dispute_id: disputeId,
      status: 'WAITING_FOR_SELLER_RESPONSE',
      dispute_life_cycle_stage: 'INQUIRY',
      allowed_response_options: {},
    };
    const provideEvidence = vi.fn<PayPalClient['disputes']['provideEvidence']>(async () => ({
      dispute_id: disputeId,
      status: 'UNDER_REVIEW',
      links: [],
    }));
    const get = vi.fn<PayPalClient['disputes']['get']>(async () => structuredClone(detail));
    const forMerchant = vi.fn(async () => ({
      disputes: { get, provideEvidence },
    })) as unknown as ForMerchant;
    const publish = vi.fn<Jobs['publish']>(async () => 'job-' + randomUUID());
    const handler = createEvidenceSubmitHandler({
      database,
      jobs: { publish } as Pick<Jobs, 'publish'>,
      forMerchant,
      clock,
    });
    return {
      disputeId,
      pack: pack!,
      sha256,
      bytes,
      detail,
      get,
      provideEvidence,
      publish,
      handler,
    };
  }

  it('submits exact approved evidence bytes and retains only a safe response summary', async () => {
    const f = await fixture();
    await f.handler({ packId: f.pack.id });
    expect(f.provideEvidence).toHaveBeenCalledWith(
      f.disputeId,
      [{ evidence_type: 'OTHER', documents: [{ name: 'proof.pdf' }] }],
      [{ filename: 'proof.pdf', mime: 'application/pdf', bytes: f.bytes }],
      { requestId: `fairfold-evidence-${f.pack.id}` },
    );
    const [pack] = await database.db
      .select()
      .from(evidence_packs)
      .where(eq(evidence_packs.id, f.pack.id));
    expect(pack?.status).toBe('submitted');
    expect(pack?.paypal_response).toEqual({
      operation: 'provide_evidence',
      disputeId: f.disputeId,
      outcome: 'submitted',
      paypalDisputeId: f.disputeId,
      paypalStatus: 'UNDER_REVIEW',
    });
    expect(pack?.paypal_response).not.toHaveProperty('links');
  });

  it('rebuilds without a vendor POST when the fresh dispute stage is stale', async () => {
    const f = await fixture();
    f.detail.status = 'RESOLVED';
    await expect(f.handler({ packId: f.pack.id })).rejects.toMatchObject({ code: 'STAGE_CHANGED' });
    expect(f.provideEvidence).not.toHaveBeenCalled();
    expect(f.publish).toHaveBeenCalledWith('evidence.rebuild', { disputeId: f.disputeId });
    const [pack] = await database.db
      .select({ status: evidence_packs.status })
      .from(evidence_packs)
      .where(eq(evidence_packs.id, f.pack.id));
    expect(pack?.status).toBe('approved');
  });

  it('records an uncertain outcome and never repeats the vendor POST on retry', async () => {
    const f = await fixture();
    f.provideEvidence.mockRejectedValueOnce(
      new PayPalError('PAYPAL_NETWORK_ERROR', null, null, null, [], true),
    );
    await f.handler({ packId: f.pack.id });
    await f.handler({ packId: f.pack.id });
    expect(f.provideEvidence).toHaveBeenCalledTimes(1);
    const [pack] = await database.db
      .select()
      .from(evidence_packs)
      .where(eq(evidence_packs.id, f.pack.id));
    expect(pack?.status).toBe('submitted');
    expect(pack?.paypal_response).toMatchObject({
      operation: 'dispute_action',
      outcome: 'outcome_unknown',
    });
  });

  it('marks a definitive provider rejection failed and requests a rebuild', async () => {
    const f = await fixture();
    f.provideEvidence.mockRejectedValueOnce(
      new PayPalError(
        'PAYPAL_HTTP_ERROR',
        422,
        'debug-synthetic',
        'VALIDATION_ERROR',
        ['BAD_INPUT'],
        false,
      ),
    );
    await f.handler({ packId: f.pack.id });
    const [pack] = await database.db
      .select()
      .from(evidence_packs)
      .where(eq(evidence_packs.id, f.pack.id));
    expect(pack?.status).toBe('failed');
    expect(pack?.paypal_response).toMatchObject({
      operation: 'dispute_action',
      outcome: 'failed',
      upstreamStatus: 422,
      debugId: 'debug-synthetic',
      paypalName: 'VALIDATION_ERROR',
      issues: ['BAD_INPUT'],
    });
    expect(f.publish).toHaveBeenCalledWith('evidence.rebuild', { disputeId: f.disputeId });
  });
});
