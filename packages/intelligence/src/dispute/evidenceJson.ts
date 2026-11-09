// The `evidences` array exactly as PayPal's provide-evidence call expects it (section 10 / I5).
// Shared-cause context never enters this structure.
import type { DisputeCarrier } from './carriers.js';
import type { EvidenceType } from './decide.js';

export interface TrackingFacts {
  carrier: string;
  carrierNameOther: string | null;
  trackingNumber: string;
}

export const MAX_NOTES = 2000;

export function buildEvidences(
  evidenceType: EvidenceType | null,
  tracking: TrackingFacts | null,
  notes: string,
  toDisputeCarrier: (carrier: string, other?: string | null) => DisputeCarrier,
): unknown[] {
  const trimmed = notes.slice(0, MAX_NOTES);
  if (evidenceType === 'OTHER') return [{ evidence_type: 'OTHER', notes: trimmed }];
  if (evidenceType === 'PROOF_OF_FULFILLMENT') {
    if (!tracking) throw new Error('PROOF_OF_FULFILLMENT needs a tracking number');
    return [
      {
        evidence_type: 'PROOF_OF_FULFILLMENT',
        evidence_info: {
          tracking_info: [
            {
              ...toDisputeCarrier(tracking.carrier, tracking.carrierNameOther),
              tracking_number: tracking.trackingNumber,
            },
          ],
        },
        notes: trimmed,
      },
    ];
  }
  return [];
}
