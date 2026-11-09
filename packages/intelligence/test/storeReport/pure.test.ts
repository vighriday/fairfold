import { describe, expect, it } from 'vitest';
import { storeBand } from '../../src/storeReport/bands.js';
import { computeFulfilment, type FulfilmentInput } from '../../src/storeReport/metrics.js';
import { reviewAverage, weightReviews } from '../../src/storeReport/reviews.js';

const now = new Date('2026-11-09T12:00:00Z');
const h = (hours: number) => new Date(now.getTime() - hours * 3600_000);

function sealed(n: number, over: Partial<FulfilmentInput['orders'][number]> = {}) {
  return Array.from({ length: n }, () => ({
    capturedAt: h(100),
    sealedAt: h(80),
    trackingPushedAt: h(79),
    packAttestationStatus: 'match' as string | null,
    ...over,
  }));
}

const input = (over: Partial<FulfilmentInput> = {}): FulfilmentInput => ({
  orders: sealed(20),
  disputes: [],
  capturedInWindow: 100,
  proactiveFixes: 0,
  notReceivedComplaints: [],
  ...over,
});

describe('computeFulfilment (90-day window)', () => {
  it('counts sealed orders in the window and the median hours from capture to seal', () => {
    const f = computeFulfilment(
      input({
        orders: [
          ...sealed(2),
          {
            capturedAt: h(30),
            sealedAt: h(10),
            trackingPushedAt: null,
            packAttestationStatus: null,
          },
        ],
      }),
      now,
    );
    expect(f.ordersSealed90d).toBe(3);
    expect(f.medianHoursCaptureToSeal).toBe(20);
  });
  it('ignores orders sealed outside the window', () => {
    const old = {
      capturedAt: h(24 * 120),
      sealedAt: h(24 * 95),
      trackingPushedAt: h(24 * 95),
      packAttestationStatus: 'match',
    };
    expect(computeFulfilment(input({ orders: [...sealed(1), old] }), now).ordersSealed90d).toBe(1);
  });
  it('tracking within 72 hours of capture and packing evidence are shares of sealed orders', () => {
    const late = sealed(1, { trackingPushedAt: h(20), capturedAt: h(100) }); // 80h after capture
    const noMatch = sealed(1, { packAttestationStatus: 'mismatch' });
    const f = computeFulfilment(input({ orders: [...sealed(2), ...late, ...noMatch] }), now);
    expect(f.pctTrackingWithin72h).toBe(0.75);
    expect(f.pctWithPackingEvidence).toBe(0.75);
  });
  it('dispute rate counts only not-as-described and not-received disputes opened in the window', () => {
    const f = computeFulfilment(
      input({
        capturedInWindow: 100,
        disputes: [
          { reason: 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED', openedAt: h(24) },
          { reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED', openedAt: h(48) },
          { reason: 'UNAUTHORISED', openedAt: h(48) },
          { reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED', openedAt: h(24 * 100) },
        ],
      }),
      now,
    );
    expect(f.disputeRate90d).toBe(0.02);
  });
  it('unanswered not-received complaints must be older than 72 hours and unanswered', () => {
    const f = computeFulfilment(
      input({
        notReceivedComplaints: [
          { createdAt: h(100), answered: false },
          { createdAt: h(100), answered: true },
          { createdAt: h(10), answered: false },
        ],
      }),
      now,
    );
    expect(f.unansweredNotReceived).toBe(1);
  });
  it('no sealed orders and no captures give zeros, never NaN', () => {
    const f = computeFulfilment(input({ orders: [], capturedInWindow: 0 }), now);
    expect(f).toMatchObject({
      ordersSealed90d: 0,
      medianHoursCaptureToSeal: null,
      pctTrackingWithin72h: 0,
      pctWithPackingEvidence: 0,
      disputeRate90d: 0,
    });
  });
});

describe('storeBand (checked in order: new, caution, verified, standard)', () => {
  const good = computeFulfilment(input(), now);
  it('9 sealed orders is new; 10 is not', () => {
    expect(storeBand({ ...good, ordersSealed90d: 9 })).toBe('new');
    expect(storeBand({ ...good, ordersSealed90d: 10 })).toBe('standard');
  });
  it('49.9% tracking within 72h is caution', () => {
    expect(storeBand({ ...good, pctTrackingWithin72h: 0.499 })).toBe('caution');
    expect(storeBand({ ...good, pctTrackingWithin72h: 0.5 })).not.toBe('caution');
  });
  it('a dispute rate above 3% is caution', () => {
    expect(storeBand({ ...good, disputeRate90d: 0.031 })).toBe('caution');
    expect(storeBand({ ...good, disputeRate90d: 0.03 })).not.toBe('caution');
  });
  it('3 unanswered not-received complaints is caution', () => {
    expect(storeBand({ ...good, unansweredNotReceived: 3 })).toBe('caution');
    expect(storeBand({ ...good, unansweredNotReceived: 2 })).toBe('verified');
  });
  it('verified needs 20 sealed, both shares at least 90% and disputes below 1.5%', () => {
    expect(storeBand(good)).toBe('verified');
    expect(storeBand({ ...good, ordersSealed90d: 19 })).toBe('standard');
    expect(storeBand({ ...good, pctWithPackingEvidence: 0.89 })).toBe('standard');
    expect(storeBand({ ...good, disputeRate90d: 0.015 })).toBe('standard');
  });
});

describe('weightReviews', () => {
  const r = (id: string, buyerId: string, day: number, rating = 5) => ({
    id,
    buyerId,
    rating,
    createdAt: new Date(Date.UTC(2026, 9, day)),
  });
  it('half weight for single-store reviewer', () => {
    const out = weightReviews(
      [r('a', 'b1', 1), r('b', 'b2', 2)],
      new Map([
        ['b1', 1],
        ['b2', 3],
      ]),
    );
    expect(out.map((x) => x.weight)).toEqual([0.5, 1]);
  });
  it('fourth review from the same buyer ignored', () => {
    const reviews = [r('a', 'b1', 4), r('b', 'b1', 1), r('c', 'b1', 2), r('d', 'b1', 3)];
    const out = weightReviews(reviews, new Map([['b1', 2]]));
    expect(out.find((x) => x.id === 'a')!.weight).toBe(0);
    expect(
      out
        .filter((x) => x.weight > 0)
        .map((x) => x.id)
        .sort(),
    ).toEqual(['b', 'c', 'd']);
  });
  it('a buyer with no recorded purchases elsewhere still counts at half weight', () => {
    expect(weightReviews([r('a', 'b9', 1)], new Map())[0]!.weight).toBe(0.5);
  });
  it('the average is weighted and ignores zero-weight reviews; empty gives null', () => {
    expect(
      reviewAverage([
        { rating: 5, weight: 1 },
        { rating: 2, weight: 0.5 },
        { rating: 1, weight: 0 },
      ]),
    ).toBe(4);
    expect(reviewAverage([])).toBeNull();
  });
});
