// Every place PayPal's dispute object carries the buyer's own words (customer-disputes v1 schema): buyer messages,
// buyer-submitted supporting info and evidence notes, buyer offer notes, the customer-provided issue details and
// item notes. Seller and arbiter text is left out.
import { describe, expect, it } from 'vitest';
import { buyerTexts } from '../../src/dispute/handlers.js';

const raw = {
  reason: 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED',
  extensions: {
    merchandize_dispute_properties: {
      issue_type: 'PRODUCT',
      product_details: {
        description: 'Hoodie seam split on the left sleeve.',
        product_received: 'YES',
      },
      service_details: { description: 'n/a service', note: 'Customer service never answered.' },
    },
    billing_dispute_properties: {
      credit_not_processed: { service_details: { note: 'Refund promised but not received.' } },
    },
  },
  disputed_transactions: [
    {
      seller_transaction_id: '3BC38643YC807283D',
      items: [
        {
          item_name: 'Block-print cotton hoodie',
          item_description: 'Indigo hoodie (the store’s own listing text)',
          notes: 'The stitching came apart after one wash.',
        },
      ],
    },
  ],
  supporting_info: [
    { source: 'SUBMITTED_BY_BUYER', notes: 'Photo of the open seam attached.' },
    { source: 'SUBMITTED_BY_SELLER', notes: 'Packed and checked on 2 Nov.' },
  ],
  evidences: [
    { source: 'SUBMITTED_BY_BUYER', notes: 'Second photo, sleeve close-up.' },
    { source: 'SUBMITTED_BY_SELLER', notes: 'Tracking DHL123.' },
  ],
  messages: [
    { posted_by: 'BUYER', content: 'The left sleeve seam opened after one wash.' },
    { posted_by: 'SELLER', content: 'Sorry to hear that, can you send a photo?' },
    { posted_by: 'BUYER', content: 'Sent the photo. I want a refund.' },
    { posted_by: 'ARBITER', content: 'PayPal is reviewing the case.' },
  ],
  offer: {
    history: [
      { actor: 'SELLER', notes: 'We offer a replacement.' },
      { actor: 'BUYER', notes: 'I would rather have my money back.' },
    ],
  },
};

describe('buyerTexts', () => {
  it("takes the buyer's words from every field that carries them, in a fixed order, and nothing else", () => {
    expect(buyerTexts(raw)).toEqual([
      'Hoodie seam split on the left sleeve.',
      'n/a service',
      'Customer service never answered.',
      'Refund promised but not received.',
      'The stitching came apart after one wash.',
      'Photo of the open seam attached.',
      'Second photo, sleeve close-up.',
      'The left sleeve seam opened after one wash.',
      'Sent the photo. I want a refund.',
      'I would rather have my money back.',
    ]);
  });

  it('a message without posted_by counts as the buyer’s; repeated and blank texts are dropped', () => {
    expect(
      buyerTexts({
        messages: [
          { content: '  Same words.  ' },
          { posted_by: 'BUYER', content: 'Same words.' },
          { posted_by: 'BUYER', content: '   ' },
        ],
      }),
    ).toEqual(['Same words.']);
  });

  it('a malformed payload yields what it can, never throws', () => {
    expect(buyerTexts(null)).toEqual([]);
    expect(
      buyerTexts({ messages: 'x', supporting_info: [null, 3], offer: { history: {} } }),
    ).toEqual([]);
    expect(
      buyerTexts({ messages: [{ posted_by: 'BUYER', content: 42 }, { content: 'Kept.' }] }),
    ).toEqual(['Kept.']);
  });
});
