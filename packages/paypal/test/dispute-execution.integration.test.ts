import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  createDatabase,
  disputes,
  evidence_blobs,
  evidence_packs,
  ledger_entries,
  merchants,
  migrateDatabase,
  orders,
} from '@fairfold/db';
import { fixedClock, type ForMerchant, type PayPalClient } from '@fairfold/contracts';
import type { Jobs } from '@fairfold/jobs';
import { testDatabaseUrl } from '../../db/test/environment.js';
import { createEvidenceSubmitHandler } from '../src/dispute-execution.js';
import { createProvideDisputeEvidenceTool } from '../src/dispute-tool.js';
import { PayPalError } from '../src/errors.js';
import { provideDisputeEvidenceTool } from '../src/agentTools.js';

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
    const [order] = await database.db
      .insert(orders)
      .values({
        merchant_id: merchantId,
        paypal_order_id: 'O' + randomUUID().replaceAll('-', '').toUpperCase(),
        invoice_id: 'FF-' + randomUUID(),
        status: 'captured',
        amount_value: '38.00',
        currency: 'USD',
      })
      .returning();
    const disputeId = 'PP-D-EXEC-' + randomUUID().replaceAll('-', '').toUpperCase();
    await database.db.insert(disputes).values({
      id: disputeId,
      merchant_id: merchantId,
      order_id: order!.id,
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
        approved_by: merchantId,
        approved_at: clock.now(),
      })
      .returning();
    const detail: Record<string, unknown> = {
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
    const makeOffer = vi.fn<PayPalClient['disputes']['makeOffer']>(async () => ({
      dispute_id: disputeId,
      status: 'OFFERED',
    }));
    const acceptClaim = vi.fn<PayPalClient['disputes']['acceptClaim']>(async () => ({
      dispute_id: disputeId,
      status: 'ACCEPTED',
    }));
    const get = vi.fn<PayPalClient['disputes']['get']>(async () => structuredClone(detail));
    const forMerchant = vi.fn(async () => ({
      disputes: { get, provideEvidence, makeOffer, acceptClaim },
    })) as unknown as ForMerchant;
    const publish = vi.fn<Jobs['publish']>(async () => 'job-' + randomUUID());
    const handler = createEvidenceSubmitHandler({
      database,
      jobs: { publish } as Pick<Jobs, 'publish'>,
      forMerchant,
      clock,
    });
    return {
      merchantId,
      disputeId,
      order: order!,
      pack: pack!,
      sha256,
      bytes,
      detail,
      get,
      provideEvidence,
      makeOffer,
      acceptClaim,
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
    expect(pack?.paypal_response).toMatchObject({
      operation: 'provide_evidence',
      disputeId: f.disputeId,
      outcome: 'submitted',
      paypalDisputeId: f.disputeId,
      paypalStatus: 'UNDER_REVIEW',
    });
    expect(pack?.paypal_response).not.toHaveProperty('links');
    const ledger = await database.db
      .select()
      .from(ledger_entries)
      .where(eq(ledger_entries.order_id, f.order.id));
    expect(ledger.map((entry) => entry.type)).toContain('evidence_submitted');
  });

  it('rebuilds without a vendor POST when the fresh dispute stage is stale', async () => {
    const f = await fixture();
    f.detail.status = 'RESOLVED';
    await expect(f.handler({ packId: f.pack.id })).rejects.toMatchObject({ code: 'STAGE_CHANGED' });
    expect(f.provideEvidence).not.toHaveBeenCalled();
    expect(f.publish).toHaveBeenCalledWith(
      'evidence.rebuild',
      { disputeId: f.disputeId },
      expect.anything(),
    );
    const [pack] = await database.db
      .select({ status: evidence_packs.status })
      .from(evidence_packs)
      .where(eq(evidence_packs.id, f.pack.id));
    expect(pack?.status).toBe('failed');
  });

  it('records an uncertain outcome and never repeats the vendor POST on retry', async () => {
    const f = await fixture();
    f.provideEvidence.mockRejectedValueOnce(
      new PayPalError('PAYPAL_NETWORK_ERROR', null, null, null, [], true),
    );
    await f.handler({ packId: f.pack.id });
    await expect(f.handler({ packId: f.pack.id })).rejects.toMatchObject({
      code: 'PACK_NOT_ACTIONABLE',
    });
    expect(f.provideEvidence).toHaveBeenCalledTimes(1);
    const [pack] = await database.db
      .select()
      .from(evidence_packs)
      .where(eq(evidence_packs.id, f.pack.id));
    expect(pack?.status).toBe('failed');
    expect(pack?.paypal_response).toMatchObject({
      operation: 'provide_evidence',
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
      operation: 'provide_evidence',
      outcome: 'failed',
      upstreamStatus: 422,
      debugId: 'debug-synthetic',
      paypalName: 'VALIDATION_ERROR',
      issues: ['BAD_INPUT'],
    });
    expect(f.publish).toHaveBeenCalledWith(
      'evidence.rebuild',
      { disputeId: f.disputeId },
      expect.anything(),
    );
  });

  it('lets only the owning merchant queue the exact approved evidence pack', async () => {
    const f = await fixture();
    const tool = createProvideDisputeEvidenceTool({
      database: database.db,
      jobs: { publish: f.publish } as Pick<Jobs, 'publish'>,
    });
    const result = await tool(f.merchantId, {
      dispute_id: f.disputeId,
      evidences: f.pack.evidences,
      files: f.pack.files,
    });
    const descriptor = provideDisputeEvidenceTool(f.merchantId, {
      database: database.db,
      jobs: { publish: f.publish },
    });
    expect(descriptor.name).toBe('provide_dispute_evidence');
    await descriptor.execute({
      dispute_id: f.disputeId,
      evidences: f.pack.evidences as Record<string, unknown>[],
      files: [
        { filename: 'proof.pdf', mime: 'application/pdf', base64: f.bytes.toString('base64') },
      ],
    });
    await expect(
      descriptor.execute({
        dispute_id: f.disputeId,
        evidences: f.pack.evidences as Record<string, unknown>[],
        files: [{ filename: 'proof.pdf', mime: 'application/pdf', base64: 'not base64!' }],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_DISPUTE_TOOL_INPUT' });
    expect(result).toEqual({
      status: 'queued',
      dispute_id: f.disputeId,
      pack_id: f.pack.id,
    });
    await expect(
      tool(f.merchantId, {
        dispute_id: f.disputeId,
        evidences: f.pack.evidences,
        files: [{ ...(f.pack.files as Array<Record<string, unknown>>)[0], sha256: '0'.repeat(64) }],
      }),
    ).rejects.toMatchObject({ code: 'APPROVED_EVIDENCE_PACK_REQUIRED' });
    await expect(
      tool(randomUUID(), {
        dispute_id: f.disputeId,
        evidences: f.pack.evidences,
        files: f.pack.files,
      }),
    ).rejects.toMatchObject({ code: 'DISPUTE_NOT_FOUND' });
  });

  it('executes an approved offer and claim with the frozen operation-specific parameters', async () => {
    const offer = await fixture();
    await database.db
      .update(evidence_packs)
      .set({
        recommendation: 'make_offer',
        action_params: {
          note: 'Synthetic approved offer',
          offerType: 'REFUND',
          offerAmount: { currency_code: 'USD', value: '12.00' },
        },
      })
      .where(eq(evidence_packs.id, offer.pack.id));
    offer.detail.allowed_response_options = { make_offer: { offer_types: ['REFUND'] } };
    await offer.handler({ packId: offer.pack.id });
    expect(offer.makeOffer).toHaveBeenCalledWith(
      offer.disputeId,
      {
        note: 'Synthetic approved offer',
        offerType: 'REFUND',
        offerAmount: { currency_code: 'USD', value: '12.00' },
        invoiceId: undefined,
      },
      { requestId: `fairfold-evidence-${offer.pack.id}` },
    );

    const claim = await fixture();
    await database.db
      .update(evidence_packs)
      .set({
        recommendation: 'accept_claim',
        action_params: {
          note: 'Synthetic approved claim',
          acceptClaimType: 'PARTIAL_REFUND',
          refundAmount: { currency_code: 'USD', value: '10.00' },
        },
      })
      .where(eq(evidence_packs.id, claim.pack.id));
    claim.detail.allowed_response_options = {
      accept_claim: { accept_claim_types: ['PARTIAL_REFUND'] },
    };
    await claim.handler({ packId: claim.pack.id });
    expect(claim.acceptClaim).toHaveBeenCalledWith(
      claim.disputeId,
      {
        note: 'Synthetic approved claim',
        acceptClaimType: 'PARTIAL_REFUND',
        refundAmount: { currency_code: 'USD', value: '10.00' },
      },
      { requestId: `fairfold-evidence-${claim.pack.id}` },
    );
  });
});
