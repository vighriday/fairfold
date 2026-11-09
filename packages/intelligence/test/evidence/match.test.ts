import { describe, expect, it } from 'vitest';
import type { AttestationResult, AttestInput } from '@fairfold/contracts';
import {
  applyItemMatching,
  deriveStatus,
  normaliseColour,
  normaliseSize,
} from '../../src/evidence/match.js';

const input: AttestInput = {
  orderId: 'o1',
  hypothesisId: null,
  step: 'pack',
  items: [
    {
      orderItemId: 'i1',
      name: 'Block-print cotton hoodie',
      sku: 'HD-IND-01',
      colour: 'navy',
      size: 'M',
      quantity: 1,
    },
  ],
  batchCodes: { i1: 'B17' },
  photos: [{ sha256: 'a', label: 'item', mime: 'image/jpeg' }],
  inspectionRule: null,
  expectedTrackingNumber: 'FF100000001',
};

function raw(
  over: Partial<AttestationResult> = {},
  item: Partial<AttestationResult['items'][number]> = {},
): AttestationResult {
  return {
    items: [
      {
        orderItemId: 'i1',
        seen: { itemType: 'hoodie', colour: 'navy', sizeLabel: 'M', quantity: 1 },
        matches: false,
        confidence: 0.9,
        notes: '',
        ...item,
      },
    ],
    batchLabelText: 'B17',
    shippingLabel: { visible: true, trackingNumberText: 'FF100000001' },
    defects: [],
    inspection: null,
    couldNotVerify: [],
    confidence: 0.9,
    ...over,
  };
}

const status = (r: AttestationResult) => deriveStatus(applyItemMatching(input, r));

describe('normaliseColour', () => {
  it('navy equals dark blue', () => {
    expect(normaliseColour('Dark Blue')).toBe(normaliseColour('navy'));
  });
  it('finds the colour inside a longer description', () => {
    expect(normaliseColour('navy with light blue block print')).toBe('navy');
    expect(normaliseColour('mustard yellow')).toBe('ochre');
    expect(normaliseColour('Off-white')).toBe('white');
  });
  it('keeps indigo distinct from navy', () => {
    expect(normaliseColour('indigo')).not.toBe(normaliseColour('navy'));
  });
  it('returns unknown colours lower-cased and trimmed', () => {
    expect(normaliseColour('  Teal ')).toBe('teal');
  });
});

describe('normaliseSize', () => {
  it('maps words and prefixes to letter sizes', () => {
    expect(normaliseSize('Medium')).toBe('M');
    expect(normaliseSize('size l')).toBe('L');
    expect(normaliseSize('X-Large')).toBe('XL');
    expect(normaliseSize('2XL')).toBe('XXL');
    expect(normaliseSize(' 42 ')).toBe('42');
    expect(normaliseSize(null)).toBeNull();
    expect(normaliseSize('  ')).toBeNull();
  });
});

describe('status rules (section 10)', () => {
  it('a clean, confident read is match', () => {
    expect(status(raw())).toBe('match');
  });

  it('ignores the model’s own matches flag and decides in code', () => {
    expect(
      status(
        raw(
          {},
          {
            matches: true,
            seen: { itemType: 'hoodie', colour: 'ochre', sizeLabel: 'M', quantity: 1 },
          },
        ),
      ),
    ).toBe('mismatch');
  });

  it('item confidence 0.69 is not match', () => {
    expect(status(raw({}, { confidence: 0.69 }))).toBe('could_not_verify');
    expect(status(raw({}, { confidence: 0.7 }))).toBe('match');
  });

  it('cosmetic defect still match', () => {
    expect(
      status(
        raw({ defects: [{ component: 'hem', description: 'loose thread', severity: 'cosmetic' }] }),
      ),
    ).toBe('match');
  });

  it('functional defect is mismatch', () => {
    expect(
      status(
        raw({ defects: [{ component: 'front', description: 'hole', severity: 'functional' }] }),
      ),
    ).toBe('mismatch');
  });

  it('safety defect is mismatch', () => {
    expect(
      status(
        raw({ defects: [{ component: 'zip', description: 'sharp edge', severity: 'safety' }] }),
      ),
    ).toBe('mismatch');
  });

  it('unreadable size label is could_not_verify', () => {
    const r = applyItemMatching(
      input,
      raw({}, { seen: { itemType: 'hoodie', colour: 'navy', sizeLabel: null, quantity: 1 } }),
    );
    expect(r.couldNotVerify).toContain('sizeLabel:i1');
    expect(deriveStatus(r)).toBe('could_not_verify');
  });

  it('anything the model could not read blocks match', () => {
    expect(status(raw({ couldNotVerify: ['batch label'] }))).toBe('could_not_verify');
  });

  it('quantity 2 seen 1 is mismatch', () => {
    const two: AttestInput = { ...input, items: [{ ...input.items[0]!, quantity: 2 }] };
    expect(deriveStatus(applyItemMatching(two, raw()))).toBe('mismatch');
  });

  it('wrong size is mismatch', () => {
    expect(
      status(
        raw({}, { seen: { itemType: 'hoodie', colour: 'navy', sizeLabel: 'L', quantity: 1 } }),
      ),
    ).toBe('mismatch');
  });

  it('a definite mismatch outranks an unreadable field', () => {
    const r = raw(
      { couldNotVerify: ['batch label'] },
      { seen: { itemType: 'hoodie', colour: 'ochre', sizeLabel: 'M', quantity: 1 } },
    );
    expect(status(r)).toBe('mismatch');
  });

  it('an item the model reports as not visible (quantity 0) is mismatch', () => {
    expect(
      status(raw({}, { seen: { itemType: 'none', colour: '', sizeLabel: null, quantity: 0 } })),
    ).toBe('mismatch');
  });

  it('an order item missing from the model output is could_not_verify', () => {
    const r = applyItemMatching(input, raw({ items: [] }));
    expect(r.items).toHaveLength(1);
    expect(r.items[0]?.matches).toBe(false);
    expect(r.couldNotVerify).toContain('item:i1');
    expect(deriveStatus(r)).toBe('could_not_verify');
  });

  it('drops model items that are not on the order', () => {
    const r = applyItemMatching(
      input,
      raw({ items: [...raw().items, { ...raw().items[0]!, orderItemId: 'ghost' }] }),
    );
    expect(r.items.map((i) => i.orderItemId)).toEqual(['i1']);
  });

  it('an order item without a colour or size on file is matched on what is known', () => {
    const plain: AttestInput = {
      ...input,
      items: [{ ...input.items[0]!, colour: null, size: null }],
    };
    expect(
      deriveStatus(
        applyItemMatching(
          plain,
          raw({}, { seen: { itemType: 'hoodie', colour: 'red', sizeLabel: null, quantity: 1 } }),
        ),
      ),
    ).toBe('match');
  });
});
