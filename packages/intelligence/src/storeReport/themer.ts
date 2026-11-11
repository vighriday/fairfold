// Review Themer (section 10): the model names themes and cites review ids; code keeps only real ids,
// drops themes with fewer than 2 reviews, counts them, cuts each label to 60 characters and keeps at most 8 themes
// (limits in code, not in the schema, so a long label costs no retry). A label must use neutral words only: a theme
// labelled with praise, disparagement or an accusation ("great", "poor", "scam") is not shown, because the report is
// the store's facts in neutral wording, never an AI adjective. Review text is untrusted third-party data.
// Themes are reused while the reviews the themer would read are unchanged, so a report refresh triggered by an
// order or a dispute spends no model call.
import { z } from 'zod';
import { generateStructured, hashInput, type LanguageModel } from '@fairfold/ai';
import type { StoreReport } from '@fairfold/contracts';
import { truncateText } from '../text.js';

export type Theme = StoreReport['reviews']['themes'][number];
export const MIN_THEME_REVIEWS = 2;
export const MAX_THEMED_REVIEWS = 100;
export const MAX_THEME_LABEL = 60;
export const MAX_THEMES = 8;

const ThemesSchema = z.object({
  themes: z.array(
    z.object({
      label: z.string().trim().min(1),
      tone: z.enum(['positive', 'negative']),
      reviewIds: z.array(z.string()),
    }),
  ),
});

const SYSTEM = [
  'You group verified-purchase customer reviews of one online store into at most 6 themes.',
  'A theme is a specific thing several reviews mention, such as print quality or delivery time.',
  'Give each theme a short neutral label (at most 5 words) that names the topic only, with no judging words such as',
  'great, poor or scam; then its tone, and the ids of every review that mentions it.',
  'Use only review ids that appear in the input. Do not rate or judge the store.',
].join(' ');

/** Words that judge or accuse rather than name a topic. A label containing any of them is not neutral. */
const NON_NEUTRAL = new Set([
  'amazing',
  'avoid',
  'awesome',
  'awful',
  'bad',
  'best',
  'beware',
  'brilliant',
  'cheat',
  'cheated',
  'cheating',
  'crap',
  'deceptive',
  'disappointed',
  'disappointing',
  'dishonest',
  'dreadful',
  'excellent',
  'fake',
  'fantastic',
  'fraud',
  'fraudulent',
  'garbage',
  'good',
  'great',
  'greatest',
  'horrible',
  'incompetent',
  'incredible',
  'junk',
  'legit',
  'liar',
  'liars',
  'lies',
  'love',
  'loved',
  'lovely',
  'lying',
  'misleading',
  'nice',
  'outstanding',
  'pathetic',
  'perfect',
  'poor',
  'poorly',
  'recommend',
  'recommended',
  'reliable',
  'ripoff',
  'rude',
  'scam',
  'scammer',
  'scammers',
  'scams',
  'scammy',
  'shady',
  'sketchy',
  'superb',
  'terrible',
  'trash',
  'trustworthy',
  'unreliable',
  'untrustworthy',
  'useless',
  'wonderful',
  'worse',
  'worst',
]);

/** Post-check: the label names a topic in neutral words ("Print quality", not "Amazing print" or "Scam store"). */
export function isNeutralLabel(label: string): boolean {
  if (/\brip[\s-]?off\b/i.test(label)) return false;
  return !label
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .some((w) => NON_NEUTRAL.has(w));
}

export function cleanThemes(
  raw: Array<{ label: string; tone: Theme['tone']; reviewIds: string[] }>,
  validIds: Set<string>,
): Theme[] {
  return raw
    .map((t) => {
      const ids = [...new Set(t.reviewIds.filter((id) => validIds.has(id)))];
      return {
        label: truncateText(t.label, MAX_THEME_LABEL),
        tone: t.tone,
        count: ids.length,
        reviewIds: ids,
      };
    })
    .filter((t) => t.count >= MIN_THEME_REVIEWS && isNeutralLabel(t.label))
    .slice(0, MAX_THEMES);
}

type ThemedReview = { id: string; rating: number; text: string };

/** Themes and the hash of the reviews they were made from; `inputHash` is null when the model fell back. */
export interface ThemesResult {
  themes: Theme[];
  inputHash: string | null;
}

/** Identifies exactly what the themer reads: the first MAX_THEMED_REVIEWS reviews' ids, ratings and texts. */
export function themerInputHash(reviews: ThemedReview[]): string {
  return hashInput([
    JSON.stringify(reviews.slice(0, MAX_THEMED_REVIEWS).map((r) => [r.id, r.rating, r.text])),
  ]);
}

async function runThemer(
  sample: ThemedReview[],
  model?: LanguageModel,
): Promise<{ themes: Theme[]; usedFallback: boolean }> {
  if (sample.length === 0) return { themes: [], usedFallback: false };
  const out = await generateStructured({
    schema: ThemesSchema,
    system: SYSTEM,
    user: `There are ${sample.length} reviews below, each prefixed with its id and star rating.`,
    untrusted: sample.map((r) => `id=${r.id} rating=${r.rating}\n${r.text}`),
    kind: 'text',
    component: 'review_themer',
    fallback: () => ({ themes: [] }),
    model,
  });
  return {
    themes: cleanThemes(out.value.themes, new Set(sample.map((r) => r.id))),
    usedFallback: out.usedFallback,
  };
}

export async function themeReviews(
  reviews: ThemedReview[],
  model?: LanguageModel,
): Promise<Theme[]> {
  return (await runThemer(reviews.slice(0, MAX_THEMED_REVIEWS), model)).themes;
}

/**
 * The previous themes when they were made from the same reviews (same ids, ratings and texts); otherwise one
 * themer call. A fallback is returned without a hash, so the next refresh asks the model again.
 */
export async function themesReusing(
  reviews: ThemedReview[],
  previous: ThemesResult | null,
  model?: LanguageModel,
): Promise<ThemesResult> {
  const inputHash = themerInputHash(reviews);
  if (previous?.inputHash === inputHash) return { themes: previous.themes, inputHash };
  const out = await runThemer(reviews.slice(0, MAX_THEMED_REVIEWS), model);
  return { themes: out.themes, inputHash: out.usedFallback ? null : inputHash };
}
