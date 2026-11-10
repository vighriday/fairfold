// One plain sentence explaining a Buyer Signal (section 10). The model sees reason codes and labels only —
// never names, emails or addresses — and a template takes over if it fails or if its wording tells the merchant to
// cancel or refuse the order (the band recommends a fulfilment action and never "cancel").
import { z } from 'zod';
import { generateStructured, type LanguageModel } from '@fairfold/ai';
import { truncateSentences } from '../text.js';
import type { ScoredSignal } from './points.js';

export const MAX_SENTENCE = 240;
/** No length limit in the schema: code cuts a long answer (src/text.ts) instead of spending a retry. */
const SentenceSchema = z.object({ sentence: z.string().trim().min(1) });

const SYSTEM = [
  'You explain a buyer risk signal to a small online merchant in exactly one plain sentence.',
  'Use only the band and reasons given. Do not add facts, numbers, names or advice of your own.',
  'Never suggest cancelling the order. Say "simulated network data" if a reason is marked simulated.',
].join(' ');

/** cancel, cancelling, cancellation; "do not ship", "don't ship"; refuse, refusal. */
const CANCEL_WORDING = /\bcancel|\bdo\s+not\s+ship\b|\bdon['\u2019]?t\s+ship\b|\brefus/i;

/** Post-check: the sentence must not tell the merchant to cancel or refuse the order. */
export function sentenceAllowed(sentence: string): boolean {
  return !CANCEL_WORDING.test(sentence);
}

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
  const sentence = truncateSentences(out.value.sentence, MAX_SENTENCE);
  return sentenceAllowed(sentence) ? sentence : templateSentence(s);
}
