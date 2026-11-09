// Shared Cause statistics (section 9 stage 4): the exact conditional test for two Poisson rates,
// Benjamini–Hochberg, Wilson intervals and a Fisher cross-check. Pure, deterministic, finite.
import type { Env } from '../runtime.js';

const logFactorials: number[] = [0];
function logFactorial(n: number): number {
  for (let i = logFactorials.length; i <= n; i++)
    logFactorials[i] = logFactorials[i - 1]! + Math.log(i);
  return logFactorials[n]!;
}
const logChoose = (n: number, k: number) => logFactorial(n) - logFactorial(k) - logFactorial(n - k);

function logSumExp(values: number[]): number {
  const max = Math.max(...values);
  if (max === -Infinity) return -Infinity;
  return max + Math.log(values.reduce((s, v) => s + Math.exp(v - max), 0));
}

/** P(X ≥ k) for X ~ Binomial(n, p), summed in log space. */
export function binomUpperTail(k: number, n: number, p: number): number {
  if (k <= 0) return 1;
  if (k > n || p <= 0) return 0;
  if (p >= 1) return 1;
  const terms: number[] = [];
  for (let i = k; i <= n; i++)
    terms.push(logChoose(n, i) + i * Math.log(p) + (n - i) * Math.log1p(-p));
  return Math.min(1, Math.exp(logSumExp(terms)));
}

/**
 * Exact conditional test: p = P(X ≥ k) with X ~ Binomial(k + kRest, E / (E + ERest)).
 * Rate ratio (k/E) / (kRest/ERest), using kRest = 0.5 when it is zero. Zero exposure is refused.
 */
export function rateTest(t: { k: number; E: number; kRest: number; ERest: number }): {
  p: number;
  rateRatio: number;
} {
  if (!(t.E > 0) || !(t.ERest > 0))
    throw new Error('rateTest needs positive exposure on both sides');
  if (t.k <= 0) return { p: 1, rateRatio: 0 };
  const p = binomUpperTail(t.k, t.k + t.kRest, t.E / (t.E + t.ERest));
  const rateRatio = t.k / t.E / ((t.kRest === 0 ? 0.5 : t.kRest) / t.ERest);
  return { p, rateRatio };
}

const Z95 = 1.959963984540054;

/** Wilson 95% interval for k successes out of n; [0, 0] when n is 0. */
export function wilson95(k: number, n: number): [number, number] {
  if (n <= 0) return [0, 0];
  const phat = k / n;
  const z2 = Z95 * Z95;
  const centre = phat + z2 / (2 * n);
  const margin = Z95 * Math.sqrt((phat * (1 - phat)) / n + z2 / (4 * n * n));
  const denom = 1 + z2 / n;
  return [Math.max(0, (centre - margin) / denom), Math.min(1, (centre + margin) / denom)];
}

/** Benjamini–Hochberg q-values, in the input order, monotone and capped at 1. */
export function benjaminiHochberg(ps: number[]): number[] {
  const m = ps.length;
  const order = ps.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const qs = new Array<number>(m);
  let running = 1;
  for (let rank = m; rank >= 1; rank--) {
    const { p, i } = order[rank - 1]!;
    running = Math.min(running, (p * m) / rank);
    qs[i] = Math.min(1, running);
  }
  return qs;
}

/** One-sided Fisher exact test P(X ≥ a) for the table [[a, b], [c, d]] (cross-check only). */
export function fisherExactGreater(a: number, b: number, c: number, d: number): number {
  const row = a + b;
  const col = a + c;
  const n = a + b + c + d;
  const max = Math.min(row, col);
  const terms: number[] = [];
  for (let x = a; x <= max; x++)
    terms.push(logChoose(row, x) + logChoose(n - row, col - x) - logChoose(n, col));
  return Math.min(1, Math.exp(logSumExp(terms)));
}

export interface SharedCauseConfig {
  horizonDays: number;
  minComplaints: number;
  minRateRatio: number;
  maxQ: number;
  clusterSimilarity: number;
}

function num(env: Env, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`${name} must be a positive number (got ${raw})`);
  return value;
}

/** Thresholds from the environment (section 3 / 14), with the documented defaults. */
export function sharedCauseConfig(env: Env): SharedCauseConfig {
  return {
    horizonDays: num(env, 'SHARED_CAUSE_HORIZON_DAYS', 14),
    minComplaints: num(env, 'SHARED_CAUSE_MIN_COMPLAINTS', 3),
    minRateRatio: num(env, 'SHARED_CAUSE_MIN_RATE_RATIO', 3),
    maxQ: num(env, 'SHARED_CAUSE_MAX_Q', 0.05),
    clusterSimilarity: num(env, 'CLUSTER_SIMILARITY', 0.8),
  };
}

export function classify(
  t: { k: number; rateRatio: number; q: number },
  cfg: SharedCauseConfig,
): 'strong' | 'possible' | null {
  if (t.k < cfg.minComplaints || t.rateRatio < cfg.minRateRatio || t.q > cfg.maxQ) return null;
  return t.k >= 5 && t.q <= 0.01 ? 'strong' : 'possible';
}
