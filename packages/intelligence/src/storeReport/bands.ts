// Store band (section 10), checked in this order: new → caution → verified → standard. No model.
import type { StoreReport } from '@fairfold/contracts';

export type StoreBand = StoreReport['band'];

export function storeBand(f: StoreReport['fulfilment']): StoreBand {
  if (f.ordersSealed90d < 10) return 'new';
  if (f.pctTrackingWithin72h < 0.5 || f.disputeRate90d > 0.03 || f.unansweredNotReceived >= 3)
    return 'caution';
  if (
    f.ordersSealed90d >= 20 &&
    f.pctWithPackingEvidence >= 0.9 &&
    f.pctTrackingWithin72h >= 0.9 &&
    f.disputeRate90d < 0.015
  )
    return 'verified';
  return 'standard';
}
