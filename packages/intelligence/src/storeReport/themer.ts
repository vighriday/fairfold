// Review Themer (section 10): the model names themes and cites review ids; code keeps only real ids,
// drops themes with fewer than 2 reviews and counts them. Review text is untrusted third-party data.
// Themes are reused while the reviews the themer would read are unchanged, so a report refresh triggered by an
// order or a dispute spends no model call.
import { z } from 'zod';
import { generateStructured, hashInput, type LanguageModel } from '@fairfold/ai';
import type { StoreReport } from '@fairfold/contracts';

export type Theme = StoreReport['reviews']['themes'][number];
export const MIN_THEME_REVIEWS = 2;
export const MAX_THEMED_REVIEWS = 100;

const ThemesSchema = z.object({
  themes: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(60),
        tone: z.enum(['positive', 'negative']),
        reviewIds: z.array(z.string()),
      }),
    )
    .max(8),
});

const SYSTEM = [
  'You group verified-purchase customer reviews of one online store into at most 6 themes.',
  'A theme is a specific thing several reviews mention, such as print quality or delivery time.',
  'Give each theme a short neutral label (at most 5 words), its tone, and the ids of every review that mentions it.',
  'Use only review ids that appear in the input. Do not rate or judge the store.',
].join(' ');

export function cleanThemes(
  raw: Array<{ label: string; tone: Theme['tone']; reviewIds: string[] }>,
  validIds: Set<string>,
): Theme[] {
  return raw
    .map((t) => {
      const ids = [...new Set(t.reviewIds.filter((id) => validIds.has(id)))];
      return { label: t.label.trim(), tone: t.tone, count: ids.length, reviewIds: ids };
    })
    .filter((t) => t.count >= MIN_THEME_REVIEWS);
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
