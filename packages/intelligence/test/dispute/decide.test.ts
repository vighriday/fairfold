import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decide, type DisputeFacts } from '../../src/dispute/decide.js';

interface Case {
  id: string;
  facts: Omit<DisputeFacts, 'dueAt'> & { dueAt: string | null };
  expectedRecommendation: string;
  expectedEvidenceType: string | null;
  expectedOfferType?: string;
  expectedAcceptClaimType?: string;
}
const fixture = JSON.parse(
  readFileSync(new URL('../../eval/fixtures/disputes.json', import.meta.url), 'utf8'),
) as { now: string; cases: Case[] };
const NOW = new Date(fixture.now);
const toFacts = (c: Case['facts']): DisputeFacts => ({
  ...c,
  dueAt: c.dueAt ? new Date(c.dueAt) : null,
});

const base: DisputeFacts = {
  reason: 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED',
  status: 'WAITING_FOR_SELLER_RESPONSE',
  lifeCycleStage: 'INQUIRY',
  dueAt: new Date(NOW.getTime() + 7 * 86_400_000),
  attestation: { status: 'match', defects: 0 },
  tracking: { pushed: true, delivered: true, shippedToTxnAddress: true },
  linkedHypothesis: null,
  amount: { currency_code: 'USD', value: '38.00' },
};
const f = (over: Partial<DisputeFacts>) => ({ ...base, ...over });

describe('the 8 scripted dispute cases', () => {
  it.each(fixture.cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const d = decide(toFacts(c.facts), NOW);
    expect(d.recommendation).toBe(c.expectedRecommendation);
    expect(d.evidenceType).toBe(c.expectedEvidenceType);
    if (c.expectedOfferType) expect(d.actionParams?.offerType).toBe(c.expectedOfferType);
    if (c.expectedAcceptClaimType)
      expect(d.actionParams?.acceptClaimType).toBe(c.expectedAcceptClaimType);
  });
});

describe('decision table rows', () => {
  const hyp = (status: 'open' | 'confirmed') => ({ id: 'h', status, summary: 'Batch B17 seam' });
  it('exactly 48h due is merchant_decides; just over 48h is inspect_first', () => {
    const at48 = new Date(NOW.getTime() + 48 * 3_600_000);
    expect(decide(f({ linkedHypothesis: hyp('open'), dueAt: at48 }), NOW).recommendation).toBe(
      'merchant_decides',
    );
    const after = new Date(at48.getTime() + 60_000);
    expect(decide(f({ linkedHypothesis: hyp('open'), dueAt: after }), NOW).recommendation).toBe(
      'inspect_first',
    );
  });
  it('an open hypothesis with no due date is merchant_decides', () => {
    expect(decide(f({ linkedHypothesis: hyp('open'), dueAt: null }), NOW).recommendation).toBe(
      'merchant_decides',
    );
  });
  it('clean pack evidence gives provide_evidence OTHER with the PDF', () => {
    expect(decide(f({}), NOW)).toMatchObject({
      recommendation: 'provide_evidence',
      evidenceType: 'OTHER',
      includePdf: true,
    });
  });
  it('defects seen or no packing evidence give make_offer', () => {
    expect(decide(f({ attestation: { status: 'match', defects: 1 } }), NOW).recommendation).toBe(
      'make_offer',
    );
    expect(
      decide(f({ attestation: { status: 'could_not_verify', defects: 0 } }), NOW).recommendation,
    ).toBe('make_offer');
    expect(decide(f({ attestation: null }), NOW).recommendation).toBe('make_offer');
  });
  it('not received with tracking but no delivered scan is provide_evidence with a weak-case warning', () => {
    const d = decide(
      f({
        reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
        tracking: { pushed: true, delivered: false, shippedToTxnAddress: true },
      }),
      NOW,
    );
    expect(d).toMatchObject({
      recommendation: 'provide_evidence',
      evidenceType: 'PROOF_OF_FULFILLMENT',
      includePdf: false,
      weakCaseWarning: true,
    });
  });
  it('not received with a delivered scan includes the PDF', () => {
    expect(decide(f({ reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED' }), NOW)).toMatchObject({
      includePdf: true,
      weakCaseWarning: false,
    });
  });
  it('UNAUTHORISED without shipment → accept_claim', () => {
    const d = decide(
      f({
        reason: 'UNAUTHORISED',
        lifeCycleStage: 'CHARGEBACK',
        tracking: { pushed: false, delivered: false, shippedToTxnAddress: false },
      }),
      NOW,
    );
    expect(d.recommendation).toBe('accept_claim');
  });
  it('unknown reason → merchant_decides', () => {
    expect(decide(f({ reason: 'CREDIT_NOT_PROCESSED' }), NOW)).toMatchObject({
      recommendation: 'merchant_decides',
      evidenceType: null,
    });
  });
});

describe('stage guards', () => {
  it('make_offer outside INQUIRY becomes accept_claim (REFUND_WITH_RETURN)', () => {
    const d = decide(f({ attestation: null, lifeCycleStage: 'CHARGEBACK' }), NOW);
    expect(d.recommendation).toBe('accept_claim');
    expect(d.actionParams).toMatchObject({
      acceptClaimType: 'REFUND_WITH_RETURN',
      amount: { currency_code: 'USD', value: '38.00' },
    });
  });
  it('make_offer in INQUIRY defaults to REFUND_WITH_REPLACEMENT with the disputed amount', () => {
    expect(decide(f({ attestation: null }), NOW).actionParams).toMatchObject({
      offerType: 'REFUND_WITH_REPLACEMENT',
      amount: { currency_code: 'USD', value: '38.00' },
    });
  });
  it('provide_evidence is submittable only while WAITING_FOR_SELLER_RESPONSE', () => {
    expect(decide(f({}), NOW).submittable).toBe(true);
    const waiting = decide(f({ status: 'UNDER_REVIEW' }), NOW);
    expect(waiting).toMatchObject({ recommendation: 'provide_evidence', submittable: false });
    expect(waiting.rationale.join(' ')).toMatch(/next dispute update/);
  });
  it('every decision explains itself', () => {
    for (const c of fixture.cases)
      expect(decide(toFacts(c.facts), NOW).rationale.length).toBeGreaterThan(0);
  });
});

describe('runDisputeEval', () => {
  it('reports 8 of 8 for the eval table', async () => {
    const { runDisputeEval } = await import('../../eval/disputes.js');
    expect((await runDisputeEval()).summary).toBe('8 of 8');
  });
});
