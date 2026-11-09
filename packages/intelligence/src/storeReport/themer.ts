// Review Themer (section 10): the model names themes and cites review ids; code keeps only real ids,
// drops themes with fewer than 2 reviews and counts them. Review text is untrusted third-party data.
import { z } from 'zod';
import { generateStructured, type LanguageModel } from '@fairfold/ai';
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

export async function themeReviews(
  reviews: Array<{ id: string; rating: number; text: string }>,
  model?: LanguageModel,
): Promise<Theme[]> {
  const sample = reviews.slice(0, MAX_THEMED_REVIEWS);
  if (sample.length === 0) return [];
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
  return cleanThemes(out.value.themes, new Set(sample.map((r) => r.id)));
}
