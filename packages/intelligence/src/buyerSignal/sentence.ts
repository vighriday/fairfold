// One plain sentence explaining a Buyer Signal (section 10). The model sees reason codes and labels only —
// never names, emails or addresses — and a template takes over if it fails.
import { z } from 'zod';
import { generateStructured, type LanguageModel } from '@fairfold/ai';
import type { ScoredSignal } from './points.js';

const SentenceSchema = z.object({ sentence: z.string().min(1).max(240) });

const SYSTEM = [
  'You explain a buyer risk signal to a small online merchant in exactly one plain sentence.',
  'Use only the band and reasons given. Do not add facts, numbers, names or advice of your own.',
  'Never suggest cancelling the order. Say "simulated network data" if a reason is marked simulated.',
].join(' ');

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function templateSentence(s: ScoredSignal): string {
  const labels = s.reasons.map((r) => lowerFirst(r.label));
  if (s.band === 'grey') {
    return labels.length
      ? `This buyer has no earlier orders with your store, so the signal is grey; we noted: ${labels.join('; ')}.`
      : 'This buyer has no earlier orders with your store, so the signal is grey.';
  }
  if (!labels.length) return `The signal is ${s.band} with no reasons from your store history.`;
  return `The signal is ${s.band} because: ${labels.join('; ')}.`;
}

export async function explainSignal(s: ScoredSignal, model?: LanguageModel): Promise<string> {
  const reasons = s.reasons.length
    ? s.reasons.map((r) => `- ${r.code} (${r.points >= 0 ? '+' : ''}${r.points}): ${r.label}`)
    : ['- none'];
  const user = [
    `Band: ${s.band}`,
    `Recommended action: ${s.recommendation}`,
    'Reasons:',
    ...reasons,
  ].join('\n');
  const out = await generateStructured({
    schema: SentenceSchema,
    system: SYSTEM,
    user,
    kind: 'text',
    component: 'buyer_signal',
    fallback: () => ({ sentence: templateSentence(s) }),
    model,
  });
  return out.value.sentence.trim();
}
