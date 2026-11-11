// Over-long model text is cut by code instead of failing the schema (a schema failure costs a retry and then the
// fallback: a 141-character summary used to turn a seam complaint into category other).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { explainSignal } from '../src/buyerSignal/sentence.js';
import { writeNarrative } from '../src/dispute/narrative.js';
import { extractComplaint } from '../src/sharedCause/reader.js';
import { themeReviews } from '../src/storeReport/themer.js';
import { truncateSentences, truncateText } from '../src/text.js';
import { uid } from './helpers/ids.js';
import { mockModel } from './helpers/mockModel.js';

beforeEach(() => {
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

describe('truncateText and truncateSentences', () => {
  it('leaves text within the limit alone', () => {
    expect(truncateText('A short line.', 140)).toBe('A short line.');
    expect(truncateSentences('One. Two.', 9)).toBe('One. Two.');
  });
  it('cuts at a word boundary and ends with an ellipsis within the limit', () => {
    const out = truncateText('The left sleeve seam opened completely', 20);
    expect(out).toBe('The left sleeve…');
    expect(out.length).toBeLessThanOrEqual(20);
  });
  it('cuts one unbroken word when there is no earlier space', () => {
    expect(truncateText('x'.repeat(30), 10)).toBe(`${'x'.repeat(9)}…`);
  });
  it('keeps whole sentences when it can', () => {
    expect(truncateSentences('First one. Second one is longer.', 20)).toBe('First one.');
    expect(truncateSentences('A single sentence that is far too long', 20)).toBe(
      'A single sentence…',
    );
  });
});

describe('model text over the limit is truncated, not failed', () => {
  it('a 141-character complaint summary keeps the category instead of falling back to other', async () => {
    const summary =
      `${'The left sleeve seam came apart after one wear and the stitching is loose '.repeat(2)}`
        .slice(0, 141)
        .trimEnd()
        .padEnd(141, 'x');
    expect(summary).toHaveLength(141);
    const { model, calls } = mockModel([
      {
        category: 'product_defect',
        component: 'left sleeve seam',
        failureMode: 'stitching came apart',
        locationOnItem: 'left sleeve',
        severity: 'functional',
        summary,
        language: 'en',
      },
    ]);
    const { extraction } = await extractComplaint('The seam split.', [], model);
    expect(calls).toHaveLength(1);
    expect(extraction.category).toBe('product_defect');
    expect(extraction.summary.length).toBeLessThanOrEqual(140);
    expect(extraction.summary.endsWith('…')).toBe(true);
  });

  it('a theme label over 60 characters is cut and more than 8 themes are capped at 8', async () => {
    const ids = Array.from({ length: 20 }, (_, i) => uid(i + 1));
    const reviews = ids.map((id) => ({ id, rating: 5, text: 'Nice print.' }));
    const themes = Array.from({ length: 10 }, (_, i) => ({
      label:
        i === 0 ? 'Print quality that stays sharp after many washes in hot water' : `Theme ${i}`,
      tone: 'positive',
      reviewIds: [ids[2 * i]!, ids[2 * i + 1]!],
    }));
    const { model, calls } = mockModel([{ themes }]);
    const out = await themeReviews(reviews, model);
    expect(calls).toHaveLength(1);
    expect(out).toHaveLength(8);
    expect(out[0]!.label.length).toBeLessThanOrEqual(60);
    expect(out[0]!.label.startsWith('Print quality that stays sharp')).toBe(true);
  });

  it('a buyer-signal sentence over 240 characters is cut, not replaced by the template', async () => {
    const sentence = `The signal is yellow because this buyer has filed disputes with your store ${'and more '.repeat(30)}before.`;
    expect(sentence.length).toBeGreaterThan(240);
    const { model, calls } = mockModel([{ sentence }]);
    const out = await explainSignal(
      {
        band: 'yellow',
        points: 30,
        reasons: [{ code: 'OWN_DISPUTES_FILED', label: 'Filed disputes', points: 15 }],
        recommendation: 'Capture extra packing evidence and ship tracked',
        simulatedNetworkUsed: false,
      },
      model,
    );
    expect(calls).toHaveLength(1);
    expect(out.length).toBeLessThanOrEqual(240);
    expect(out.startsWith('The signal is yellow because this buyer has filed disputes')).toBe(true);
  });

  it('a narrative over 2,000 characters keeps its whole sentences up to the limit', async () => {
    const facts = ['Order FF-1 was paid on 2026-11-01.', 'The parcel was sealed on 2026-11-02.'];
    const narrative = Array.from({ length: 60 }, () => 'The parcel was sealed on 2026-11-02.').join(
      ' ',
    );
    expect(narrative.length).toBeGreaterThan(2000);
    const { model, calls } = mockModel([{ narrative }]);
    const out = await writeNarrative(facts, model);
    expect(calls).toHaveLength(1);
    expect(out.usedTemplate).toBe(false);
    expect(out.text.length).toBeLessThanOrEqual(2000);
    expect(out.text.endsWith('2026-11-02.')).toBe(true);
  });
});
