import { describe, expect, it } from 'vitest';
import {
  benjaminiHochberg,
  binomUpperTail,
  classify,
  fisherExactGreater,
  rateTest,
  sharedCauseConfig,
  wilson95,
} from '../../src/sharedCause/stats.js';

const within = (actual: number, expected: number, rel = 0.01) =>
  expect(Math.abs(actual - expected) / expected).toBeLessThanOrEqual(rel);

describe('binomUpperTail', () => {
  it('matches exact small cases', () => {
    expect(binomUpperTail(0, 10, 0.3)).toBe(1);
    expect(binomUpperTail(1, 1, 0.25)).toBeCloseTo(0.25, 12);
    expect(binomUpperTail(2, 2, 0.5)).toBeCloseTo(0.25, 12);
    expect(binomUpperTail(3, 2, 0.5)).toBe(0);
  });
  it('stays accurate for large n in log space', () => {
    // P(X >= 60) for Binomial(1000, 0.05) = 0.0867322 (exact, computed with rational arithmetic)
    within(binomUpperTail(60, 1000, 0.05), 0.0867322, 1e-5);
  });
});

describe('B17 fixture (section 9 worked example)', () => {
  const t = rateTest({ k: 6, E: 560, kRest: 1, ERest: 2800 });
  it('rate ratio 30 and p within 1% of 0.000129', () => {
    expect(t.rateRatio).toBeCloseTo(30, 10);
    within(t.p, 0.000129);
  });
  it('with 12 values tested, q within 1% of 0.00154, and strong', () => {
    const others = [0.31, 0.42, 0.55, 0.61, 0.7, 0.78, 0.83, 0.9, 0.95, 1, 1];
    const q = benjaminiHochberg([t.p, ...others])[0]!;
    within(q, 0.00154);
    expect(classify({ k: 6, rateRatio: t.rateRatio, q }, sharedCauseConfig({}))).toBe('strong');
  });
  it('Fisher exact on the same counts gives about 0.0001', () => {
    const p = fisherExactGreater(6, 34, 1, 199);
    expect(p).toBeGreaterThan(0.00005);
    expect(p).toBeLessThan(0.0002);
  });
});

describe('wilson95', () => {
  it('wilson 6/40 ≈ [0.07, 0.29]', () => {
    const [lo, hi] = wilson95(6, 40);
    expect(lo).toBeCloseTo(0.07, 2);
    expect(hi).toBeCloseTo(0.29, 2);
  });
  it('wilson 1/200 ≈ [0.001, 0.028]', () => {
    const [lo, hi] = wilson95(1, 200);
    expect(lo).toBeCloseTo(0.001, 3);
    expect(hi).toBeCloseTo(0.028, 3);
  });
  it('n = 0 gives [0, 0], never NaN', () => {
    expect(wilson95(0, 0)).toEqual([0, 0]);
  });
});

describe('seed numbers (section 19)', () => {
  it('k=5, E=546, kRest=1, ERest=2800 → p ≈ 0.0006', () => {
    within(rateTest({ k: 5, E: 546, kRest: 1, ERest: 2800 }).p, 0.0006, 0.05);
  });
});

describe('stats edge cases', () => {
  it('kRest = 0 uses 0.5 for the rate ratio and stays finite', () => {
    const t = rateTest({ k: 4, E: 100, kRest: 0, ERest: 1000 });
    expect(t.rateRatio).toBeCloseTo(4 / 100 / (0.5 / 1000), 10);
    expect(Number.isFinite(t.p)).toBe(true);
    expect(t.p).toBeGreaterThan(0);
  });
  it('k = 0 gives p = 1 and rate ratio 0', () => {
    expect(rateTest({ k: 0, E: 100, kRest: 3, ERest: 1000 })).toEqual({ p: 1, rateRatio: 0 });
  });
  it('zero exposure is refused rather than divided by', () => {
    expect(() => rateTest({ k: 1, E: 100, kRest: 0, ERest: 0 })).toThrow(/exposure/);
    expect(() => rateTest({ k: 1, E: 0, kRest: 0, ERest: 10 })).toThrow(/exposure/);
  });
});

describe('benjaminiHochberg', () => {
  it('BH monotone and capped at 1', () => {
    const ps = [0.04, 0.001, 0.03, 0.9, 0.5];
    const qs = benjaminiHochberg(ps);
    const order = ps.map((p, i) => [p, qs[i]!] as const).sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < order.length; i++)
      expect(order[i]![1]).toBeGreaterThanOrEqual(order[i - 1]![1]);
    expect(Math.max(...qs)).toBeLessThanOrEqual(1);
    expect(qs[1]).toBeCloseTo(0.005, 10);
    expect(benjaminiHochberg([])).toEqual([]);
  });
});

describe('classify', () => {
  const cfg = sharedCauseConfig({});
  it('needs k >= 3, RR >= 3 and q <= 0.05', () => {
    expect(classify({ k: 2, rateRatio: 50, q: 0.001 }, cfg)).toBeNull();
    expect(classify({ k: 3, rateRatio: 2.9, q: 0.001 }, cfg)).toBeNull();
    expect(classify({ k: 3, rateRatio: 3, q: 0.051 }, cfg)).toBeNull();
    expect(classify({ k: 3, rateRatio: 3, q: 0.05 }, cfg)).toBe('possible');
  });
  it('strong when k >= 5 and q <= 0.01', () => {
    expect(classify({ k: 5, rateRatio: 10, q: 0.01 }, cfg)).toBe('strong');
    expect(classify({ k: 4, rateRatio: 10, q: 0.001 }, cfg)).toBe('possible');
  });
  it('thresholds come from the environment', () => {
    expect(sharedCauseConfig({})).toEqual({
      horizonDays: 14,
      minComplaints: 3,
      minRateRatio: 3,
      maxQ: 0.05,
      clusterSimilarity: 0.8,
    });
    const strict = sharedCauseConfig({
      SHARED_CAUSE_MIN_COMPLAINTS: '4',
      CLUSTER_SIMILARITY: '0.85',
    });
    expect(strict).toMatchObject({ minComplaints: 4, clusterSimilarity: 0.85 });
    expect(classify({ k: 3, rateRatio: 10, q: 0.001 }, strict)).toBeNull();
    expect(() => sharedCauseConfig({ SHARED_CAUSE_MAX_Q: 'lots' })).toThrow(/SHARED_CAUSE_MAX_Q/);
  });
});
