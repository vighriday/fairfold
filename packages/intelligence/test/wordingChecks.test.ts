// Code checks the wording of model text shown to people: the Buyer Signal sentence never tells the merchant to
// cancel (submission: "recommended actions never include cancel"), and review-theme labels use neutral words only
// ("what we found", never an AI adjective about a store).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { explainSignal, templateSentence } from '../src/buyerSignal/sentence.js';
import { isNeutralLabel, themeReviews } from '../src/storeReport/themer.js';
import { uid } from './helpers/ids.js';
import { mockModel } from './helpers/mockModel.js';

beforeEach(() => {
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

const signal = {
  band: 'red' as const,
  points: 60,
  reasons: [
    { code: 'OWN_DISPUTES_LOST', label: 'Disputes decided in the store’s favour', points: 25 },
  ],
  recommendation: 'Ship with signature confirmation and full packing evidence',
  simulatedNetworkUsed: false,
};

describe('Buyer Signal sentence wording', () => {
  it.each([
    'This buyer is red; consider cancelling the order.',
    'Red band: you may want to cancel.',
    'The order was flagged red, so the cancellation is advised.',
    'Red: do not ship this order until you confirm the address.',
    "Red: don't ship it.",
    'Red: refuse this order.',
  ])(
    'a sentence telling the merchant to cancel is replaced by the template: %s',
    async (sentence) => {
      const { model, calls } = mockModel([{ sentence }]);
      const out = await explainSignal(signal, model);
      expect(calls).toHaveLength(1);
      expect(out).toBe(templateSentence(signal));
      expect(out).not.toMatch(/cancel/i);
    },
  );

  it('a sentence without such wording is kept', async () => {
    const sentence =
      'The signal is red because earlier disputes with your store were decided in its favour.';
    const { model } = mockModel([{ sentence }]);
    expect(await explainSignal(signal, model)).toBe(sentence);
  });
});

describe('review theme labels use neutral words only', () => {
  it.each([
    'Print quality',
    'Delivery time',
    'Sizing',
    'Seam opening after washing',
    'Colour accuracy',
  ])('neutral: %s', (label) => expect(isNeutralLabel(label)).toBe(true));
  it.each([
    'Scam store',
    'Fake product',
    'Terrible customer service',
    'Amazing print quality',
    'Best hoodie ever',
    'Poor stitching',
    'Unreliable seller',
    'Avoid this shop',
    'Rip-off prices',
  ])('not neutral: %s', (label) => expect(isNeutralLabel(label)).toBe(false));

  it('a theme with a non-neutral label is not shown; neutral ones are kept', async () => {
    const [A, B, C, D] = [uid(1), uid(2), uid(3), uid(4)];
    const reviews = [A, B, C, D].map((id) => ({ id, rating: 2, text: 'Never arrived.' }));
    const { model } = mockModel([
      {
        themes: [
          { label: 'Scam store', tone: 'negative', reviewIds: [A, B] },
          { label: 'Delivery time', tone: 'negative', reviewIds: [C, D] },
        ],
      },
    ]);
    expect(await themeReviews(reviews, model)).toEqual([
      { label: 'Delivery time', tone: 'negative', count: 2, reviewIds: [C, D] },
    ]);
  });
});
