// Stage 2 — Understand (section 9 / 10 Complaint Reader). The model fills a ComplaintExtraction from the
// complaint text (untrusted) and up to 4 buyer photos; code embeds "category | component | failure_mode".
import { z } from 'zod';
import { generateStructured, type LanguageModel } from '@fairfold/ai';
import { ComplaintExtractionSchema, type ComplaintExtraction } from '@fairfold/contracts';
import { truncateText } from '../text.js';

export const MAX_COMPLAINT_PHOTOS = 4;
export const MAX_SUMMARY = 140;

/**
 * What the model fills: ComplaintExtraction without its length limits, which code applies after the call. A summary
 * one character too long would otherwise fail the schema, retry and fall back to category other.
 */
const ModelExtractionSchema = ComplaintExtractionSchema.extend({
  summary: z.string(),
  language: z.string(),
});

const SYSTEM = [
  'You read one customer complaint about an order from a small online clothing store.',
  'Classify it into exactly one category: product_defect (the item is faulty), wrong_item, size_fit, not_as_pictured,',
  'damaged_in_transit, not_received, late, or other.',
  'component is the part of the product involved in a few words (e.g. "left sleeve seam"), failureMode what went wrong',
  '(e.g. "stitching came apart"), locationOnItem where on the item; use null when not stated.',
  'severity is safety only for a risk of injury (burn, choking, cut, allergic reaction), functional when the item cannot',
  'be used as intended, otherwise cosmetic. summary is one neutral line of at most 140 characters. language is the',
  'ISO 639-1 code of the complaint.',
].join(' ');

function fallbackExtraction(text: string): ComplaintExtraction {
  const clean = text.replace(/\s+/g, ' ').trim();
  return {
    category: 'other',
    component: null,
    failureMode: null,
    locationOnItem: null,
    severity: 'cosmetic',
    summary: truncateText(clean, MAX_SUMMARY) || 'Complaint received',
    language: 'und',
  };
}

/** The contract's limits, applied by code: the summary is cut to 140 characters, a too-short language is 'und'. */
function withinLimits(
  raw: z.infer<typeof ModelExtractionSchema>,
  text: string,
): ComplaintExtraction {
  const language = raw.language.trim();
  return ComplaintExtractionSchema.parse({
    ...raw,
    summary: truncateText(raw.summary, MAX_SUMMARY) || fallbackExtraction(text).summary,
    language: language.length >= 2 ? language : 'und',
  });
}

export async function extractComplaint(
  text: string,
  photos: Array<{ mime: string; bytes: Uint8Array }>,
  model?: LanguageModel,
): Promise<{ extraction: ComplaintExtraction; model: string }> {
  const images = photos.slice(0, MAX_COMPLAINT_PHOTOS);
  const out = await generateStructured({
    schema: ModelExtractionSchema,
    system: SYSTEM,
    user: images.length
      ? `The complaint text is below. ${images.length} buyer photo(s) are attached.`
      : 'The complaint text is below.',
    untrusted: [text],
    images,
    kind: images.length ? 'vision' : 'text',
    component: 'complaint_reader',
    fallback: () => fallbackExtraction(text),
    model,
  });
  return { extraction: withinLimits(out.value, text), model: out.model };
}

export function embeddingText(
  e: Pick<ComplaintExtraction, 'category' | 'component' | 'failureMode'>,
): string {
  return `${e.category} | ${e.component ?? ''} | ${e.failureMode ?? ''}`;
}

// ---- local embedding: used only when no embedding provider is configured (DECISIONS.md I-D7) ----

export const LOCAL_EMBEDDING_DIM = 256;
const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'of',
  'and',
  'or',
  'to',
  'in',
  'on',
  'at',
  'after',
  'with',
  'is',
  'was',
  'it',
  'my',
  'its',
]);

function stem(word: string): string {
  for (const suffix of ['ing', 'es', 'ed', 's']) {
    if (word.length > suffix.length + 2 && word.endsWith(suffix))
      return word.slice(0, -suffix.length);
  }
  return word;
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Deterministic feature-hashed bag of stemmed words, unit length. */
export function localEmbedding(text: string): number[] {
  const v = new Array<number>(LOCAL_EMBEDDING_DIM).fill(0);
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t && !STOPWORDS.has(t))
    .map(stem);
  for (const t of new Set(tokens)) {
    const h = fnv1a(t);
    v[h % LOCAL_EMBEDDING_DIM]! += h & 0x80000000 ? -1 : 1;
  }
  const len = Math.hypot(...v);
  return len === 0 ? v : v.map((x) => x / len);
}

/**
 * Code sets the item: a single-item order directly; else the item named in the text (SKU, then the head noun of
 * the item name such as "hoodie", then any other word unique to one item); else the first item.
 */
export function itemForComplaint<I extends { name: string; sku: string }>(
  items: I[],
  text: string,
): I | null {
  if (items.length <= 1) return items[0] ?? null;
  const lower = text.toLowerCase();
  const words = (name: string) =>
    name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3);
  const bySku = items.find((i) => lower.includes(i.sku.toLowerCase()));
  if (bySku) return bySku;
  const byHead = items.find((i) => {
    const head = words(i.name).at(-1);
    return head !== undefined && lower.includes(head);
  });
  if (byHead) return byHead;
  const counts = new Map<string, number>();
  for (const i of items)
    for (const w of new Set(words(i.name))) counts.set(w, (counts.get(w) ?? 0) + 1);
  const byUnique = items.find((i) =>
    words(i.name).some((w) => counts.get(w) === 1 && lower.includes(w)),
  );
  return byUnique ?? items[0]!;
}
