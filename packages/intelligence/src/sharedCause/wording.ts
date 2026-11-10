// Code-written words for Shared Cause (section 9): cluster label, headline, explanation, inspection instruction
// and the hypothesis wording the Message Drafter receives. Every number comes from HypothesisStats; the
// component and failure mode come from the Complaint Reader's validated output and are sanitised here.
import type { ComplaintExtraction, Dimension, HypothesisStats } from '@fairfold/contracts';
import { TRANSIT_CATEGORIES } from './grouping.js';

export const DIMENSION_LABEL: Record<Dimension, string> = {
  batch_code: 'batch',
  listing_version: 'listing version',
  packer: 'packer',
  ship_week: 'ship week',
  carrier: 'carrier',
  ship_to_country: 'ship-to country',
};

const DIMENSION_PLURAL: Record<Dimension, string> = {
  batch_code: 'batches',
  listing_version: 'listing versions',
  packer: 'packers',
  ship_week: 'ship weeks',
  carrier: 'carriers',
  ship_to_country: 'ship-to countries',
};

const CATEGORY_LABEL: Record<ComplaintExtraction['category'], string> = {
  product_defect: 'product defect',
  wrong_item: 'wrong item',
  size_fit: 'size or fit',
  not_as_pictured: 'not as pictured',
  damaged_in_transit: 'damaged in transit',
  not_received: 'not received',
  late: 'late delivery',
  other: 'other',
};

/** Model-extracted phrases reach prompts and buyer messages, so keep them short plain words. */
export function cleanPhrase(s: string | null | undefined, max = 60): string | null {
  if (!s) return null;
  const clean = s
    .replace(/[^\p{L}\p{N} ,'/-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, max)
    .trim();
  return clean || null;
}

type Fault = Pick<ComplaintExtraction, 'category' | 'component' | 'failureMode'>;

/** "sleeve seam: stitching came apart", or the category when the reader found neither. */
export function clusterLabel(e: Fault): string {
  const parts = [cleanPhrase(e.component), cleanPhrase(e.failureMode)].filter(Boolean);
  return parts.length ? parts.join(': ') : CATEGORY_LABEL[e.category];
}

/** "stitching came apart at the sleeve seam" — the issue in buyer-facing words. */
export function issuePhrase(e: Fault): string {
  const component = cleanPhrase(e.component);
  const failure = cleanPhrase(e.failureMode);
  if (component && failure) return `${failure} at the ${component}`;
  return failure ?? component ?? `a ${CATEGORY_LABEL[e.category]} problem`;
}

export function headline(
  status: string,
  category: string,
  dimension: Dimension,
  value: string,
): string {
  const kind = TRANSIT_CATEGORIES.has(category) ? 'delivery' : 'product';
  const prefix = status === 'confirmed' ? 'Confirmed' : 'Possible';
  return `${prefix} shared ${kind} issue: ${DIMENSION_LABEL[dimension]} ${value}`;
}

const listOf = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
const sig = (x: number) => (x < 0.000001 ? '< 0.000001' : String(Number(x.toPrecision(2))));
const ratio = (x: number) => (x >= 10 ? String(Math.round(x)) : String(Math.round(x * 10) / 10));

/** The merchant-facing explanation, written by code from the stats only. */
export function explanation(category: string, label: string, stats: HypothesisStats): string {
  const t = stats.primary;
  const anchor = TRANSIT_CATEGORIES.has(category) ? 'shipping' : 'delivery';
  const dim = DIMENSION_LABEL[t.dimension];
  const sentences = [
    `${t.k} of ${t.n} orders with ${dim} ${t.value} had a "${label}" complaint within ${stats.horizonDays} days of ${anchor}, ` +
      `against ${t.kRest} of ${t.nRest} other orders.`,
    `Per order-day of exposure that is ${ratio(t.rateRatio)} times the rate of the rest ` +
      `(exact conditional test p = ${sig(t.p)}, q = ${sig(t.q)} after ${stats.testsRun} values were tested).`,
    `Median days since ${anchor}: ${stats.confounders.medianDaysSinceDelivery.value} for ${t.value}, ` +
      `${stats.confounders.medianDaysSinceDelivery.rest} for the rest.`,
  ];
  const spread = stats.confounders.spread
    .filter((s) => s.distinctValues > 1)
    .map((s) => `${s.distinctValues} ${DIMENSION_PLURAL[s.dimension]}`);
  if (spread.length)
    sentences.push(`The complaining value spans ${listOf(spread)}, so those do not explain it.`);
  if (stats.confounders.coincidesWithListingChange)
    sentences.push('It coincides with a listing change, which may also explain it.');
  return sentences.join(' ');
}

export function inspectionInstruction(batchCode: string, e: Fault): string {
  const component = cleanPhrase(e.component) ?? 'affected area';
  const failure = cleanPhrase(e.failureMode) ?? 'the reported fault';
  return `Photograph a close-up of the ${component} on each unit of batch ${batchCode} and check for: ${failure}.`;
}

/** Words that end a component's head noun phrase: "print on the front panel" is about the print. */
const PREPOSITIONS = new Set([
  'on',
  'of',
  'at',
  'in',
  'near',
  'by',
  'along',
  'around',
  'under',
  'over',
  'with',
  'from',
  'inside',
  'behind',
]);

/**
 * The label of the photo an inspection rule requires (F2's INSPECTION_REQUIRED), named after the faulty part so the
 * Pack Station asks for the right close-up: "left sleeve seam" → `seam_closeup`, "drawstring eyelet" →
 * `eyelet_closeup`. The part is the last word before any preposition; `defect_closeup` when none is usable.
 */
export function inspectionPhotoLabel(e: Pick<ComplaintExtraction, 'component'>): string {
  const words = (cleanPhrase(e.component) ?? '').split(/[\s,/-]+/).filter(Boolean);
  const cut = words.findIndex((w) => PREPOSITIONS.has(w));
  const head = (cut < 0 ? words : words.slice(0, cut)).at(-1) ?? '';
  const part = head.replace(/[^a-z0-9]/g, '').slice(0, 24);
  return `${part || 'defect'}_closeup`;
}

/** The approved wording the Message Drafter receives (section 10): no buyer, no statistics. */
export function buyerWording(level: 'suspected' | 'confirmed', dimension: Dimension, e: Fault) {
  const issue = issuePhrase(e);
  if (level === 'suspected') return `possibly ${issue}`;
  return dimension === 'batch_code'
    ? `a fault in one production batch (${issue})`
    : `a fault affecting some recent orders (${issue})`;
}
