import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  bandFor,
  RECOMMENDATIONS,
  scoreBuyer,
  type BuyerFeatures,
} from '../../src/buyerSignal/points.js';

const base: BuyerFeatures = {
  payerAccountStatus: null,
  priorOrders: 1,
  priorDelivered: 1,
  refundedOrders: 0,
  ownDisputesFiled12m: 0,
  ownDisputesLost12m: 0,
  ordersLast24h: 1,
  newAddress: false,
  amount: '38.00',
  merchantMedianAmount: '38.00',
  network: null,
};
const f = (over: Partial<BuyerFeatures>): BuyerFeatures => ({ ...base, ...over });
const codes = (over: Partial<BuyerFeatures>) => scoreBuyer(f(over)).reasons.map((r) => r.code);
const pointsOf = (over: Partial<BuyerFeatures>, code: string) =>
  scoreBuyer(f(over)).reasons.find((r) => r.code === code)?.points;

describe('points per reason code (section 10 as amended by I-D2)', () => {
  it('PAYER_UNVERIFIED +15 and PAYER_VERIFIED -5', () => {
    expect(pointsOf({ payerAccountStatus: 'UNVERIFIED' }, 'PAYER_UNVERIFIED')).toBe(15);
    expect(pointsOf({ payerAccountStatus: 'VERIFIED' }, 'PAYER_VERIFIED')).toBe(-5);
    expect(codes({ payerAccountStatus: null })).toEqual([]);
  });
  it('OWN_DISPUTES_FILED counts only disputes not lost, +10 each, capped at 30', () => {
    expect(pointsOf({ ownDisputesFiled12m: 2 }, 'OWN_DISPUTES_FILED')).toBe(20);
    expect(pointsOf({ ownDisputesFiled12m: 5 }, 'OWN_DISPUTES_FILED')).toBe(30);
    expect(codes({ ownDisputesFiled12m: 1, ownDisputesLost12m: 1 })).not.toContain(
      'OWN_DISPUTES_FILED',
    );
  });
  it('OWN_DISPUTES_LOST +15 each, capped at 30', () => {
    expect(pointsOf({ ownDisputesFiled12m: 1, ownDisputesLost12m: 1 }, 'OWN_DISPUTES_LOST')).toBe(
      15,
    );
    expect(pointsOf({ ownDisputesFiled12m: 3, ownDisputesLost12m: 3 }, 'OWN_DISPUTES_LOST')).toBe(
      30,
    );
  });
  it('OWN_REFUND_RATIO +10 needs 2 or more orders and more than half refunded', () => {
    expect(pointsOf({ priorOrders: 2, refundedOrders: 2 }, 'OWN_REFUND_RATIO')).toBe(10);
    expect(codes({ priorOrders: 2, refundedOrders: 1 })).not.toContain('OWN_REFUND_RATIO');
    expect(codes({ priorOrders: 1, refundedOrders: 1 })).not.toContain('OWN_REFUND_RATIO');
  });
  it('VELOCITY +15 at 3 or more orders in 24 hours', () => {
    expect(pointsOf({ ordersLast24h: 3 }, 'VELOCITY')).toBe(15);
    expect(codes({ ordersLast24h: 2 })).not.toContain('VELOCITY');
  });
  it('NEW_ADDRESS +5 only with an earlier order', () => {
    expect(pointsOf({ newAddress: true }, 'NEW_ADDRESS')).toBe(5);
    expect(codes({ priorOrders: 0, newAddress: true })).not.toContain('NEW_ADDRESS');
  });
  it('HIGH_VALUE +10 above 3 x the median, compared in cents', () => {
    expect(pointsOf({ amount: '114.01', merchantMedianAmount: '38.00' }, 'HIGH_VALUE')).toBe(10);
    expect(codes({ amount: '114.00', merchantMedianAmount: '38.00' })).not.toContain('HIGH_VALUE');
    expect(codes({ amount: '999.00', merchantMedianAmount: null })).not.toContain('HIGH_VALUE');
  });
  it('NETWORK_DISPUTES_LOST +20 at 2 or more and marks the simulated network as used', () => {
    const s = scoreBuyer(f({ network: { disputesLost12m: 2 } }));
    expect(s.reasons.find((r) => r.code === 'NETWORK_DISPUTES_LOST')?.points).toBe(20);
    expect(s.simulatedNetworkUsed).toBe(true);
    expect(scoreBuyer(f({ network: { disputesLost12m: 1 } })).simulatedNetworkUsed).toBe(false);
  });
  it('OWN_HISTORY_CLEAN -20 at 3 or more delivered orders and no disputes', () => {
    expect(pointsOf({ priorOrders: 3, priorDelivered: 3 }, 'OWN_HISTORY_CLEAN')).toBe(-20);
    expect(codes({ priorOrders: 3, priorDelivered: 3, ownDisputesFiled12m: 1 })).not.toContain(
      'OWN_HISTORY_CLEAN',
    );
  });
});

describe('bands and recommendations', () => {
  it('boundary 10 green, 11 yellow, 29 yellow, 30 red', () => {
    expect([bandFor(10), bandFor(11), bandFor(29), bandFor(30)]).toEqual([
      'green',
      'yellow',
      'yellow',
      'red',
    ]);
    expect(scoreBuyer(f({ ownDisputesFiled12m: 1 }))).toMatchObject({ points: 10, band: 'green' });
    expect(scoreBuyer(f({ payerAccountStatus: 'UNVERIFIED' }))).toMatchObject({
      points: 15,
      band: 'yellow',
    });
    expect(scoreBuyer(f({ ownDisputesFiled12m: 3 }))).toMatchObject({ points: 30, band: 'red' });
  });
  it('recommendations are the section 10 sentences, never "cancel"', () => {
    expect(RECOMMENDATIONS).toEqual({
      green: 'Ship normally',
      grey: 'Ship normally with standard packing evidence',
      yellow: 'Capture extra packing evidence and ship tracked',
      red: 'Ship with signature confirmation and full packing evidence; confirm the address with the buyer',
    });
    expect(scoreBuyer(f({})).recommendation).toBe(RECOMMENDATIONS.green);
    for (const r of Object.values(RECOMMENDATIONS)) expect(r.toLowerCase()).not.toContain('cancel');
  });
  it('new buyer with 40 points (the most a new buyer can score) is grey with escalated recommendation', () => {
    const s = scoreBuyer(
      f({
        priorOrders: 0,
        priorDelivered: 0,
        payerAccountStatus: 'UNVERIFIED',
        ordersLast24h: 3,
        amount: '200.00',
        network: null,
      }),
    );
    expect(s.points).toBe(40);
    expect(s.band).toBe('grey');
    expect(s.recommendation).toBe('Capture extra packing evidence and ship tracked');
  });
  it('a new buyer under 30 points is grey with the standard recommendation', () => {
    const s = scoreBuyer(f({ priorOrders: 0, priorDelivered: 0, payerAccountStatus: 'VERIFIED' }));
    expect(s).toMatchObject({
      band: 'grey',
      recommendation: 'Ship normally with standard packing evidence',
    });
  });
  it('a buyer with only a network record is banded by points, not grey', () => {
    const s = scoreBuyer(f({ priorOrders: 0, priorDelivered: 0, network: { disputesLost12m: 0 } }));
    expect(s.band).toBe('green');
  });
  it('every reason has a plain label', () => {
    const s = scoreBuyer(
      f({ payerAccountStatus: 'UNVERIFIED', ordersLast24h: 4, newAddress: true }),
    );
    for (const r of s.reasons) expect(r.label.length).toBeGreaterThan(5);
  });
});

interface Profile {
  id: string;
  name: string;
  features: BuyerFeatures;
  expectedBand: string;
  expectedPoints: number;
  expectedCodes: string[];
}
const profiles = (
  JSON.parse(readFileSync(new URL('../../eval/fixtures/buyers.json', import.meta.url), 'utf8')) as {
    profiles: Profile[];
  }
).profiles;

describe('eval profiles (A8)', () => {
  it('all 30 eval profiles match expected band, points and codes', () => {
    expect(profiles).toHaveLength(30);
    for (const p of profiles) {
      const s = scoreBuyer(p.features);
      expect({
        id: p.id,
        band: s.band,
        points: s.points,
        codes: s.reasons.map((r) => r.code).sort(),
      }).toEqual({
        id: p.id,
        band: p.expectedBand,
        points: p.expectedPoints,
        codes: [...p.expectedCodes].sort(),
      });
    }
  });
  it('Alex R. is yellow (25) with OWN_DISPUTES_LOST, OWN_REFUND_RATIO, NEW_ADDRESS', () => {
    const alex = profiles.find((p) => p.name === 'Alex R.')!;
    const s = scoreBuyer(alex.features);
    expect(s).toMatchObject({ band: 'yellow', points: 25 });
    expect(s.reasons.map((r) => r.code)).toEqual(
      expect.arrayContaining(['OWN_DISPUTES_LOST', 'OWN_REFUND_RATIO', 'NEW_ADDRESS']),
    );
  });
});

describe('runBuyerEval', () => {
  it('reports 30 of 30 for the eval table', async () => {
    const { runBuyerEval } = await import('../../eval/buyers.js');
    expect((await runBuyerEval()).summary).toBe('30 of 30 bands as expected');
  });
});
