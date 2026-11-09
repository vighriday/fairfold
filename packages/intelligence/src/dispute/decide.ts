// Dispute Agent decision table (section 10): code decides, first match wins, then the stage guards.
import type { EvidencePackDraft, Money, Recommendation } from '@fairfold/contracts';

export const NAD = 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED';
export const INR = 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED';
export const UNAUTHORISED = 'UNAUTHORISED';
export const DEFAULT_OFFER = 'REFUND_WITH_REPLACEMENT';
const INSPECT_WINDOW_MS = 48 * 3_600_000;

export interface DisputeFacts {
  reason: string;
  status: string;
  lifeCycleStage: string | null;
  dueAt: Date | null;
  attestation: { status: string; defects: number } | null;
  tracking: { pushed: boolean; delivered: boolean; shippedToTxnAddress: boolean };
  linkedHypothesis: { id: string; status: 'open' | 'confirmed'; summary: string } | null;
  amount: Money;
}

export type EvidenceType = 'PROOF_OF_FULFILLMENT' | 'OTHER';

export interface Decision {
  recommendation: Recommendation;
  evidenceType: EvidenceType | null;
  includePdf: boolean;
  actionParams: EvidencePackDraft['actionParams'];
  rationale: string[];
  weakCaseWarning: boolean;
  /** provide_evidence can be filed now (status WAITING_FOR_SELLER_RESPONSE); otherwise the pack waits. */
  submittable: boolean;
}

type Row = Pick<Decision, 'recommendation' | 'evidenceType' | 'includePdf' | 'weakCaseWarning'> & {
  why: string;
  acceptClaimType?: string;
};

const row = (
  recommendation: Recommendation,
  why: string,
  more: Partial<Omit<Row, 'recommendation' | 'why'>> = {},
): Row => ({
  recommendation,
  why,
  evidenceType: null,
  includePdf: false,
  weakCaseWarning: false,
  ...more,
});

function table(f: DisputeFacts, now: Date): Row {
  if (f.reason === NAD) {
    const h = f.linkedHypothesis;
    if (h?.status === 'confirmed')
      return row(
        'make_offer',
        `A shared fault was confirmed for this order's batch: ${h.summary}.`,
      );
    if (h?.status === 'open') {
      const dueLater = f.dueAt !== null && f.dueAt.getTime() - now.getTime() > INSPECT_WINDOW_MS;
      return dueLater
        ? row(
            'inspect_first',
            `A possible shared fault is under investigation (${h.summary}); inspect units before answering.`,
          )
        : row(
            'merchant_decides',
            `A possible shared fault is under investigation (${h.summary}) and the response is due within 48 hours.`,
          );
    }
    const a = f.attestation;
    if (a && a.status === 'match' && a.defects === 0)
      return row(
        'provide_evidence',
        'The packing photos were checked against the order and matched, with no defects seen.',
        {
          evidenceType: 'OTHER',
          includePdf: true,
        },
      );
    if (a)
      return row(
        'make_offer',
        'The packing check did not confirm a clean match, so the evidence would be weak.',
      );
    return row('make_offer', 'There is no packing evidence for this order.');
  }
  if (f.reason === INR) {
    if (f.tracking.pushed && f.tracking.delivered)
      return row(
        'provide_evidence',
        'Tracking was pushed to PayPal and the carrier shows a delivered scan.',
        {
          evidenceType: 'PROOF_OF_FULFILLMENT',
          includePdf: true,
        },
      );
    if (f.tracking.pushed)
      return row(
        'provide_evidence',
        'Tracking was pushed to PayPal but there is no delivered scan yet; this case is weak.',
        {
          evidenceType: 'PROOF_OF_FULFILLMENT',
          weakCaseWarning: true,
        },
      );
    return row('accept_claim', 'There is no tracking for this order.', {
      acceptClaimType: 'REFUND',
    });
  }
  if (f.reason === UNAUTHORISED) {
    if (f.tracking.pushed && f.tracking.shippedToTxnAddress)
      return row(
        'provide_evidence',
        'The order was sealed and shipped with tracking to the address on the PayPal transaction.',
        {
          evidenceType: 'PROOF_OF_FULFILLMENT',
          includePdf: true,
        },
      );
    return row('accept_claim', 'There is no tracked shipment to the transaction address.', {
      acceptClaimType: 'REFUND',
    });
  }
  return row(
    'merchant_decides',
    `Fairfold has no rule for the reason ${f.reason}; the choice is yours.`,
  );
}

export function decide(f: DisputeFacts, now: Date): Decision {
  const r = table(f, now);
  const rationale = [r.why];
  let recommendation = r.recommendation;
  let actionParams: Decision['actionParams'] = null;

  if (recommendation === 'make_offer' && f.lifeCycleStage !== 'INQUIRY') {
    recommendation = 'accept_claim';
    rationale.push(
      'Offers are only possible in the inquiry stage, so the claim is accepted with a return instead.',
    );
    actionParams = {
      acceptClaimType: 'REFUND_WITH_RETURN',
      amount: f.amount,
      note: 'Refund on return of the item.',
    };
  } else if (recommendation === 'make_offer') {
    actionParams = {
      offerType: DEFAULT_OFFER,
      amount: f.amount,
      note: 'We are sorry about this. We will refund you and send a replacement.',
    };
  } else if (recommendation === 'accept_claim') {
    actionParams = {
      acceptClaimType: r.acceptClaimType ?? 'REFUND',
      amount: f.amount,
      note: 'Refund issued.',
    };
  }

  const submittable =
    recommendation === 'provide_evidence' && f.status === 'WAITING_FOR_SELLER_RESPONSE';
  if (recommendation === 'provide_evidence' && !submittable)
    rationale.push(
      `PayPal only accepts evidence while waiting for the seller (status now ${f.status}); the pack is rebuilt on the next dispute update.`,
    );
  if (r.weakCaseWarning)
    rationale.push('Warning: without a delivered scan PayPal may still decide for the buyer.');

  return {
    recommendation,
    evidenceType: recommendation === 'provide_evidence' ? r.evidenceType : null,
    includePdf: recommendation === 'provide_evidence' && r.includePdf,
    actionParams,
    rationale,
    weakCaseWarning: r.weakCaseWarning,
    submittable,
  };
}
