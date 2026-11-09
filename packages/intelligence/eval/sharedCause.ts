// Shared Cause eval rows "B17 seed" and "Null seed" (section 10), run on the unit fixtures that reproduce the
// section 9 worked example and the same-volume null scenario. No model involved.
import { readFile } from 'node:fs/promises';
import { localise, type PopulationOrder } from '../src/sharedCause/localise.js';
import { sharedCauseConfig } from '../src/sharedCause/stats.js';

interface Fixture {
  now: string;
  orders: Array<
    Omit<PopulationOrder, 'status' | 'shippedAt' | 'deliveredAt'> & {
      shippedAt: string;
      deliveredAt: string;
    }
  >;
  complaints: Array<{ orderId: string; createdAt: string }>;
}

export async function localiseFixture(name: 'sharedcause-b17.json' | 'sharedcause-null.json') {
  const fx = JSON.parse(
    await readFile(new URL(`../test/fixtures/${name}`, import.meta.url), 'utf8'),
  ) as Fixture;
  return localise(
    { category: 'product_defect', productId: 'HD-IND-01' },
    fx.orders.map((o) => ({
      ...o,
      status: 'delivered',
      shippedAt: new Date(o.shippedAt),
      deliveredAt: new Date(o.deliveredAt),
    })),
    fx.complaints.map((c) => ({ orderId: c.orderId, createdAt: new Date(c.createdAt) })),
    new Date(fx.now),
    sharedCauseConfig(process.env),
  );
}

export async function runB17Eval(): Promise<string> {
  const out = await localiseFixture('sharedcause-b17.json');
  if (!out) return 'no hypothesis (expected batch_code = B17, strong)';
  const p = out.primary;
  return `${p.dimension} = ${p.value}, ${out.strength} (RR ${p.rateRatio.toFixed(0)}, p ${p.p.toPrecision(3)}, q ${p.q.toPrecision(3)}, ${out.stats.testsRun} values tested; unit fixture)`;
}

export async function runNullEval(): Promise<string> {
  const out = await localiseFixture('sharedcause-null.json');
  return out
    ? `raised ${out.primary.dimension} = ${out.primary.value} (expected none)`
    : 'no hypothesis raised (unit fixture)';
}
