import { describe, expect, it } from 'vitest';
import { AppError } from '@fairfold/contracts';
import {
  newBuyerMessages,
  sanitizeDisputeDetail,
  redactDisputeText,
} from '../src/dispute-policy.js';

const base = {
  dispute_id: 'PP-D-SYNTHETIC',
  reason: 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED',
  status: 'WAITING_FOR_SELLER_RESPONSE',
  dispute_life_cycle_stage: 'INQUIRY',
  dispute_amount: { currency_code: 'USD', value: '12.50' },
  disputed_transactions: [{ seller_transaction_id: 'CAPTURE-1', ignored: 'drop' }],
  allowed_response_options: {
    make_offer: { offer_types: ['REFUND'], ignored: true },
    accept_claim: { accept_claim_types: ['REFUND'] },
  },
  messages: [
    {
      posted_by: 'BUYER',
      time_posted: '2026-11-10T10:00:00Z',
      content: 'The seam split. Email maya@example.invalid; address 10 Synthetic Street.',
      attachments: ['drop'],
    },
  ],
  private_contact: { email: 'drop' },
};

describe('approved dispute retention boundary', () => {
  it('retains only approved buyer-note leaves with the same redaction policy', () => {
    const safe = sanitizeDisputeDetail({
      ...base,
      messages: [],
      extensions: {
        merchandize_dispute_properties: {
          product_details: { description: 'Seam split. maya@example.invalid', private: 'drop' },
          email: 'drop',
        },
      },
      disputed_transactions: [
        {
          seller_transaction_id: 'CAPTURE-1',
          items: [{ notes: 'Photo at https://example.invalid/private', item_name: 'drop' }],
        },
      ],
      supporting_info: [
        { source: 'SUBMITTED_BY_BUYER', notes: 'Buyer note' },
        { source: 'SUBMITTED_BY_SELLER', notes: 'Drop seller note' },
      ],
      offer: {
        history: [
          { actor: 'BUYER', notes: 'Refund requested' },
          { actor: 'SELLER', notes: 'Drop seller offer' },
        ],
      },
    });
    expect(safe.extensions).toEqual({
      merchandize_dispute_properties: {
        product_details: { description: 'Seam split. [CONTACT_REDACTED]' },
      },
    });
    expect(safe.disputed_transactions[0]?.items).toEqual([{ notes: 'Photo at [LINK_REDACTED]' }]);
    expect(safe.supporting_info).toEqual([{ source: 'SUBMITTED_BY_BUYER', notes: 'Buyer note' }]);
    expect(safe.offer?.history).toEqual([{ actor: 'BUYER', notes: 'Refund requested' }]);
    expect(JSON.stringify(safe)).not.toContain('drop');
  });

  it('rejects overflowing or unresolved-contact buyer notes as a whole snapshot', () => {
    for (const supporting_info of [
      Array.from({ length: 101 }, () => ({ source: 'SUBMITTED_BY_BUYER', notes: 'text' })),
      Array.from({ length: 11 }, () => ({ source: 'SUBMITTED_BY_BUYER', notes: 'x'.repeat(2000) })),
      [{ source: 'SUBMITTED_BY_BUYER', notes: 'Address: uncertain private text' }],
    ])
      expect(() => sanitizeDisputeDetail({ ...base, messages: [], supporting_info })).toThrowError(
        expect.objectContaining({ code: 'DISPUTE_TEXT_REVIEW_REQUIRED' }),
      );
  });
  it('handles known street whitespace, safe marked clauses and complete URL tokens', () => {
    expect(
      redactDisputeText(
        'Ship to: 10  SYNTHETIC\nStreet. https://example.invalid/?buyer=maya@example.invalid',
        { knownStreetLines: ['10 Synthetic Street'] },
      ),
    ).toBe('Ship to: [CONTACT_REDACTED]. [LINK_REDACTED]');
    expect(() => redactDisputeText('Address: [CONTACT_REDACTED] apartment 12')).toThrowError(
      expect.objectContaining({ code: 'DISPUTE_TEXT_REVIEW_REQUIRED' }),
    );
  });

  it('emits an identical buyer tuple only once within a provider snapshot', () => {
    const value = sanitizeDisputeDetail(
      { ...base, messages: [base.messages[0], base.messages[0]] },
      { knownStreetLines: ['10 Synthetic Street'] },
    );
    expect(newBuyerMessages(value)).toHaveLength(1);
  });
  it('keeps only approved fields and redacts known and embedded contacts', () => {
    const value = sanitizeDisputeDetail(base, {
      knownEmails: ['maya@example.invalid'],
      knownStreetLines: ['10 Synthetic Street'],
    });
    expect(value).toMatchObject({
      dispute_id: base.dispute_id,
      disputed_transactions: [{ seller_transaction_id: 'CAPTURE-1' }],
      messages: [
        {
          posted_by: 'BUYER',
          content: 'The seam split. Email [CONTACT_REDACTED]; address [CONTACT_REDACTED].',
        },
      ],
    });
    expect(JSON.stringify(value)).not.toContain('ignored');
    expect(JSON.stringify(value)).not.toContain('maya@example');
  });

  it('fails unclear contact text without returning a sanitized fallback', () => {
    expect(() =>
      sanitizeDisputeDetail({
        ...base,
        messages: [
          {
            posted_by: 'BUYER',
            time_posted: '2026-11-10T10:00:00Z',
            content: 'Ship to: 4 Main Road',
          },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: 'DISPUTE_TEXT_REVIEW_REQUIRED' }));
  });

  it('deduplicates buyer messages using durable fingerprints', () => {
    const first = sanitizeDisputeDetail(base, {
      knownEmails: ['maya@example.invalid'],
      knownStreetLines: ['10 Synthetic Street'],
    });
    const second = sanitizeDisputeDetail(
      { ...base, _fairfold: { message_fingerprints: [first.messages[0]!.fingerprint] } },
      { knownEmails: ['maya@example.invalid'], knownStreetLines: ['10 Synthetic Street'] },
    );
    expect(newBuyerMessages(first)).toHaveLength(1);
    expect(newBuyerMessages(second)).toHaveLength(0);
  });

  it('rejects unsafe shape, control characters, and retention budget overflow', () => {
    for (const value of [
      { ...base, reason: 'lowercase' },
      {
        ...base,
        messages: [
          { posted_by: 'BUYER', time_posted: '2026-11-10T10:00:00Z', content: 'bad\u0000' },
        ],
      },
      { ...base, messages: Array.from({ length: 1001 }, () => base.messages[0]) },
    ])
      expect(() => sanitizeDisputeDetail(value)).toThrowError(AppError);
  });
});
