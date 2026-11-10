import { describe, expect, it } from 'vitest';
import { AppError } from '@fairfold/contracts';
import { newBuyerMessages, sanitizeDisputeDetail } from '../src/dispute-policy.js';

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
        messages: [{ posted_by: 'BUYER', time_posted: '2026-11-10T10:00:00Z', content: 'Ship to: 4 Main Road' }],
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
      { ...base, messages: [{ posted_by: 'BUYER', time_posted: '2026-11-10T10:00:00Z', content: 'bad\u0000' }] },
      { ...base, messages: Array.from({ length: 1001 }, () => base.messages[0]) },
    ])
      expect(() => sanitizeDisputeDetail(value)).toThrowError(AppError);
  });
});
