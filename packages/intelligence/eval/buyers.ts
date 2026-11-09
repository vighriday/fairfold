// Buyer Signal eval (section 10 row "buyers", acceptance A8): 30 profiles, expected bands. No model involved.
import { readFile } from 'node:fs/promises';
import { scoreBuyer, type BuyerFeatures } from '../src/buyerSignal/points.js';

interface Profile {
  id: string;
  features: BuyerFeatures;
  expectedBand: string;
}

export async function runBuyerEval() {
  const { profiles } = JSON.parse(
    await readFile(new URL('./fixtures/buyers.json', import.meta.url), 'utf8'),
  ) as { profiles: Profile[] };
  const wrong = profiles
    .filter((p) => scoreBuyer(p.features).band !== p.expectedBand)
    .map((p) => p.id);
  const correct = profiles.length - wrong.length;
  const summary =
    `${correct} of ${profiles.length} bands as expected` +
    (wrong.length ? ` (wrong: ${wrong.join(', ')})` : '');
  return { total: profiles.length, correct, wrong, summary };
}
