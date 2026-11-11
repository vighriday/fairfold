// Store Report fulfilment metrics over a 90-day window (section 10). Shares and rates are fractions 0–1.
import type { StoreReport } from '@fairfold/contracts';

export const WINDOW_DAYS = 90;
const HOUR_MS = 3600_000;
const DAY_MS = 24 * HOUR_MS;

/** Disputes that count towards the dispute rate. */
export const RATE_REASONS = new Set([
  'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED',
  'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
]);

export interface FulfilmentInput {
  orders: Array<{
    capturedAt: Date | null;
    sealedAt: Date | null;
    /** server_time of the order's tracking_pushed ledger entry. */
    trackingPushedAt: Date | null;
    /** Status of the latest pack attestation, if any. */
    packAttestationStatus: string | null;
  }>;
  disputes: Array<{ reason: string; openedAt: Date }>;
  capturedInWindow: number;
  proactiveFixes: number;
  notReceivedComplaints: Array<{ createdAt: Date; answered: boolean }>;
}

export type Fulfilment = StoreReport['fulfilment'];

const round = (x: number, places = 4) => Math.round(x * 10 ** places) / 10 ** places;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function computeFulfilment(input: FulfilmentInput, now: Date): Fulfilment {
  const since = now.getTime() - WINDOW_DAYS * DAY_MS;
  const inWindow = (d: Date | null) =>
    d !== null && d.getTime() >= since && d.getTime() <= now.getTime();

  const sealed = input.orders.filter((o) => inWindow(o.sealedAt));
  const n = sealed.length;
  const hoursToSeal = sealed
    .filter((o) => o.capturedAt !== null)
    .map((o) => (o.sealedAt!.getTime() - o.capturedAt!.getTime()) / HOUR_MS);
  const tracked = sealed.filter(
    (o) =>
      o.capturedAt !== null &&
      o.trackingPushedAt !== null &&
      o.trackingPushedAt.getTime() - o.capturedAt.getTime() <= 72 * HOUR_MS,
  ).length;
  const evidenced = sealed.filter((o) => o.packAttestationStatus === 'match').length;
  const counted = input.disputes.filter(
    (d) => RATE_REASONS.has(d.reason) && inWindow(d.openedAt),
  ).length;
  const med = median(hoursToSeal);

  return {
    ordersSealed90d: n,
    medianHoursCaptureToSeal: med === null ? null : round(med, 1),
    pctTrackingWithin72h: n ? round(tracked / n) : 0,
    pctWithPackingEvidence: n ? round(evidenced / n) : 0,
    disputeRate90d: input.capturedInWindow ? round(counted / input.capturedInWindow) : 0,
    proactiveFixes90d: input.proactiveFixes,
    unansweredNotReceived: input.notReceivedComplaints.filter(
      (c) => !c.answered && now.getTime() - c.createdAt.getTime() > 72 * HOUR_MS,
    ).length,
  };
}
