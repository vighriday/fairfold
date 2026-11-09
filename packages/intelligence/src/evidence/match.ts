// Code-side matching for the Evidence Agent (section 10): the model describes, code decides.
import type { AttestationResult, AttestInput } from '@fairfold/contracts';

export type AttestationStatus = 'match' | 'mismatch' | 'could_not_verify';

export const MIN_ITEM_CONFIDENCE = 0.7;

/** Canonical colour → phrases that mean it. Longer phrases are tried first. */
const COLOUR_SYNONYMS: Record<string, string[]> = {
  navy: ['navy blue', 'dark blue', 'midnight blue', 'navy'],
  indigo: ['indigo', 'blue violet', 'blue-violet'],
  ochre: [
    'mustard yellow',
    'yellow ochre',
    'golden yellow',
    'dark yellow',
    'mustard',
    'ochre',
    'ocher',
    'gold',
  ],
  white: ['off white', 'off-white', 'ivory', 'cream', 'white'],
  grey: ['charcoal', 'grey', 'gray'],
  black: ['jet black', 'black'],
  red: ['maroon', 'burgundy', 'crimson', 'red'],
  green: ['olive', 'green'],
  blue: ['sky blue', 'light blue', 'royal blue', 'blue'],
};

const COLOUR_LOOKUP: Array<[string, string]> = Object.entries(COLOUR_SYNONYMS)
  .flatMap(([canonical, phrases]) => phrases.map((p): [string, string] => [p, canonical]))
  .sort((a, b) => b[0].length - a[0].length);

export function normaliseColour(s: string): string {
  const text = ` ${s
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
  // The garment's main colour is the first one named ("navy with light blue print" → navy);
  // at the same position the longest phrase wins ("navy blue" over "navy").
  let best: { at: number; canonical: string } | null = null;
  for (const [phrase, canonical] of COLOUR_LOOKUP) {
    const at = text.indexOf(` ${phrase} `);
    if (at >= 0 && (best === null || at < best.at)) best = { at, canonical };
  }
  return best ? best.canonical : text.trim();
}

const SIZE_WORDS: Record<string, string> = {
  'EXTRA SMALL': 'XS',
  'X-SMALL': 'XS',
  XS: 'XS',
  SMALL: 'S',
  S: 'S',
  MEDIUM: 'M',
  M: 'M',
  LARGE: 'L',
  L: 'L',
  'EXTRA LARGE': 'XL',
  'X-LARGE': 'XL',
  XL: 'XL',
  XXL: 'XXL',
  '2XL': 'XXL',
  'XX-LARGE': 'XXL',
  XXXL: 'XXXL',
  '3XL': 'XXXL',
};

export function normaliseSize(s: string | null): string | null {
  if (s === null) return null;
  const t = s
    .toUpperCase()
    .replace(/^\s*SIZE\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t === '') return null;
  return SIZE_WORDS[t] ?? t;
}

/**
 * Recomputes every item's `matches` from normalised colour, size and quantity, ignoring the model's own flag.
 * Unreadable fields go into couldNotVerify as `<field>:<orderItemId>`; order items the model omitted become `item:<id>`.
 */
export function applyItemMatching(input: AttestInput, raw: AttestationResult): AttestationResult {
  const couldNotVerify = [...raw.couldNotVerify];
  const note = (entry: string) => {
    if (!couldNotVerify.includes(entry)) couldNotVerify.push(entry);
  };

  const items = input.items.map((expected) => {
    const seenItem = raw.items.find((i) => i.orderItemId === expected.orderItemId);
    if (!seenItem) {
      note(`item:${expected.orderItemId}`);
      return {
        orderItemId: expected.orderItemId,
        seen: { itemType: 'not reported', colour: '', sizeLabel: null, quantity: 0 },
        matches: false,
        confidence: 0,
        notes: 'The model did not report this order item.',
      };
    }
    const { seen } = seenItem;
    const colourOk =
      expected.colour === null || normaliseColour(seen.colour) === normaliseColour(expected.colour);
    let sizeOk = true;
    if (expected.size !== null && seen.quantity > 0) {
      const seenSize = normaliseSize(seen.sizeLabel);
      if (seenSize === null) {
        note(`sizeLabel:${expected.orderItemId}`);
        sizeOk = false;
      } else {
        sizeOk = seenSize === normaliseSize(expected.size);
      }
    }
    const quantityOk = seen.quantity === expected.quantity;
    return { ...seenItem, matches: colourOk && sizeOk && quantityOk };
  });

  return { ...raw, items, couldNotVerify };
}

/** Status per section 10. A definite contradiction or a functional/safety defect outranks an unreadable field. */
export function deriveStatus(r: AttestationResult): AttestationStatus {
  const seriousDefect = r.defects.some(
    (d) => d.severity === 'functional' || d.severity === 'safety',
  );
  const unreadableFor = (id: string) => r.couldNotVerify.some((c) => c.endsWith(`:${id}`));
  const definiteMismatch = r.items.some((i) => !i.matches && !unreadableFor(i.orderItemId));
  if (seriousDefect || definiteMismatch) return 'mismatch';
  if (r.couldNotVerify.length > 0 || r.items.some((i) => i.confidence < MIN_ITEM_CONFIDENCE))
    return 'could_not_verify';
  return 'match';
}
