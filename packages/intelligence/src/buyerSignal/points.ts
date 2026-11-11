// Buyer Signal points model (original section 10). Code decides the band; no model.
// Ship-to country is never a feature.
import type { Band, BuyerSignal } from '@fairfold/contracts';

export interface BuyerFeatures {
  payerAccountStatus: 'VERIFIED' | 'UNVERIFIED' | null;
  /** This buyer's earlier orders with this merchant (excluding the current one). */
  priorOrders: number;
  priorDelivered: number;
  refundedOrders: number;
  /** All disputes this buyer filed with this merchant in the last 12 months. */
  ownDisputesFiled12m: number;
  /** The subset of those resolved in the seller's favour. */
  ownDisputesLost12m: number;
  /** Orders in the last 24 hours including this one: max of same buyer and same ship-to address. */
  ordersLast24h: number;
  /** The ship-to differs from every earlier order with this merchant. */
  newAddress: boolean;
  amount: string;
  merchantMedianAmount: string | null;
  /** SIMULATED network tier (buyer_network_simulated); null when there is no record. */
  network: { disputesLost12m: number } | null;
}

export type ScoredSignal = Omit<BuyerSignal, 'sentence'>;

export const RECOMMENDATIONS: Record<Band, string> = {
  green: 'Ship normally',
  grey: 'Ship normally with standard packing evidence',
  yellow: 'Capture extra packing evidence and ship tracked',
  red: 'Ship with signature confirmation and full packing evidence; confirm the address with the buyer',
};

const LABELS = {
  PAYER_UNVERIFIED: 'PayPal account is unverified',
  OWN_DISPUTES_FILED: 'Filed disputes with this store in the last 12 months',
  OWN_DISPUTES_LOST: 'Disputes with this store decided in the store’s favour',
  OWN_REFUND_RATIO: 'More than half of earlier orders were refunded',
  VELOCITY: 'Three or more orders in 24 hours from this buyer or address',
  NEW_ADDRESS: 'Shipping to an address not used on earlier orders',
  HIGH_VALUE: 'Order is more than three times this store’s median order',
  NETWORK_DISPUTES_LOST: 'Lost two or more disputes across stores (simulated network)',
  OWN_HISTORY_CLEAN: 'Three or more delivered orders with no disputes',
  PAYER_VERIFIED: 'PayPal account is verified',
} as const;
export type ReasonCode = keyof typeof LABELS;

/** Decimal string to integer cents, so money is never compared as a float. */
export function toCents(value: string): number {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m) throw new Error(`Invalid money value: ${value}`);
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

export function bandFor(points: number): Exclude<Band, 'grey'> {
  if (points <= 10) return 'green';
  if (points < 30) return 'yellow';
  return 'red';
}

export function scoreBuyer(f: BuyerFeatures): ScoredSignal {
  const reasons: BuyerSignal['reasons'] = [];
  const add = (code: ReasonCode, points: number) =>
    reasons.push({ code, label: LABELS[code], points });

  if (f.payerAccountStatus === 'UNVERIFIED') add('PAYER_UNVERIFIED', 15);
  const lost = Math.min(f.ownDisputesLost12m, f.ownDisputesFiled12m);
  if (f.ownDisputesFiled12m > 0)
    add('OWN_DISPUTES_FILED', Math.min(10 * f.ownDisputesFiled12m, 30));
  if (lost > 0) add('OWN_DISPUTES_LOST', Math.min(15 * lost, 30));
  if (f.priorOrders >= 2 && f.refundedOrders * 2 > f.priorOrders) add('OWN_REFUND_RATIO', 15);
  if (f.ordersLast24h >= 3) add('VELOCITY', 15);
  if (f.priorOrders >= 1 && f.newAddress) add('NEW_ADDRESS', 5);
  if (f.merchantMedianAmount !== null && toCents(f.amount) > 3 * toCents(f.merchantMedianAmount))
    add('HIGH_VALUE', 10);
  const networkUsed = f.network !== null && f.network.disputesLost12m >= 2;
  if (networkUsed) add('NETWORK_DISPUTES_LOST', 20);
  if (f.priorDelivered >= 3 && f.ownDisputesFiled12m === 0) add('OWN_HISTORY_CLEAN', -20);
  if (f.payerAccountStatus === 'VERIFIED') add('PAYER_VERIFIED', -5);

  const points = reasons.reduce((sum, r) => sum + r.points, 0);
  const isNew = f.priorOrders === 0 && f.network === null;
  const band: Band = isNew ? 'grey' : bandFor(points);
  const recommendation = isNew && points >= 30 ? RECOMMENDATIONS.yellow : RECOMMENDATIONS[band];
  return { band, points, reasons, recommendation, simulatedNetworkUsed: networkUsed };
}
