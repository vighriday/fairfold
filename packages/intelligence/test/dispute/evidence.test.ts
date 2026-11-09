import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toDisputeCarrier } from '../../src/dispute/carriers.js';
import { buildEvidences } from '../../src/dispute/evidenceJson.js';
import {
  isGrounded,
  narrativeFacts,
  templateNarrative,
  writeNarrative,
} from '../../src/dispute/narrative.js';
import { buildEvidencePdf, MAX_PDF_BYTES, type EvidencePdfData } from '../../src/dispute/pdf.js';
import { sha } from '../helpers/ids.js';
import { mockModel } from '../helpers/mockModel.js';

beforeEach(() => {
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

const facts = [
  'Order FF-123 was paid on 2026-11-01 for USD 38.00.',
  'It was sealed on 2026-11-02 and shipped with DHL tracking number 1234567890.',
  'The packing photos matched the order items.',
];

describe('narrative', () => {
  it('narrative post-check rejects invented date', async () => {
    const { model } = mockModel([
      { narrative: 'The order was paid on 2026-11-01 and delivered on 2026-11-05.' },
    ]);
    const out = await writeNarrative(facts, model);
    expect(out.usedTemplate).toBe(true);
    expect(out.text).toBe(templateNarrative(facts));
  });
  it('a narrative using only the facts is kept', async () => {
    const text =
      'Order FF-123 was paid on 2026-11-01 (USD 38.00) and shipped with DHL tracking 1234567890; the packing photos matched.';
    const { model } = mockModel([{ narrative: text }]);
    expect(await writeNarrative(facts, model)).toEqual({ text, usedTemplate: false });
  });
  it('isGrounded compares numbers by value, so 5 and 05 are the same number', () => {
    expect(isGrounded('Shipped on day 2.', ['shipped on 2026-11-02'])).toBe(true);
    expect(isGrounded('Refund of 40.00', ['USD 38.00'])).toBe(false);
  });
  it('the template stays within 2,000 characters', () => {
    expect(
      templateNarrative(Array.from({ length: 200 }, () => 'A long fact sentence about the order.'))
        .length,
    ).toBeLessThanOrEqual(2000);
  });
  it('narrativeFacts lists order, shipping, packing and ledger facts and nothing about shared causes', () => {
    const list = narrativeFacts({
      reason: 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED',
      amount: { currency_code: 'USD', value: '38.00' },
      invoiceId: 'FF-123',
      capturedAt: new Date('2026-11-01T10:00:00Z'),
      sealedAt: new Date('2026-11-02T10:00:00Z'),
      shipment: {
        carrier: 'DHL',
        trackingNumber: '1234567890',
        deliveredAt: new Date('2026-11-06T10:00:00Z'),
      },
      attestation: { status: 'match', photoCount: 4 },
      ledger: { verified: true, entries: 7 },
    });
    expect(list.join(' ')).toContain('2026-11-01');
    expect(list.join(' ')).toContain('1234567890');
    expect(list.join(' ')).toMatch(/7 entries/);
    expect(list.join(' ')).not.toMatch(/hypothes|shared|batch issue/i);
  });
});

describe('evidence JSON', () => {
  it('PROOF_OF_FULFILLMENT JSON shape', () => {
    expect(
      buildEvidences(
        'PROOF_OF_FULFILLMENT',
        { carrier: 'DHL', carrierNameOther: null, trackingNumber: '1234567890' },
        'Shipped and delivered.',
        toDisputeCarrier,
      ),
    ).toEqual([
      {
        evidence_type: 'PROOF_OF_FULFILLMENT',
        evidence_info: { tracking_info: [{ carrier_name: 'DHL', tracking_number: '1234567890' }] },
        notes: 'Shipped and delivered.',
      },
    ]);
  });
  it('OTHER carries notes only; no evidence type gives no evidences', () => {
    expect(buildEvidences('OTHER', null, 'See the attached PDF.', toDisputeCarrier)).toEqual([
      { evidence_type: 'OTHER', notes: 'See the attached PDF.' },
    ]);
    expect(buildEvidences(null, null, 'x', toDisputeCarrier)).toEqual([]);
  });
  it('proof of fulfilment without a tracking number is refused', () => {
    expect(() => buildEvidences('PROOF_OF_FULFILLMENT', null, 'x', toDisputeCarrier)).toThrow(
      /tracking/,
    );
  });
  it('maps tracking carriers to the disputes carrier enum', () => {
    expect(toDisputeCarrier('INDIA_POST')).toEqual({ carrier_name: 'IN_INDIAPOST' });
    expect(toDisputeCarrier('FEDEX')).toEqual({ carrier_name: 'FEDEX' });
    expect(toDisputeCarrier('OTHER', 'Shree Maruti')).toEqual({
      carrier_name: 'OTHER',
      carrier_name_other: 'Shree Maruti',
    });
    expect(toDisputeCarrier('ACME_COURIER')).toEqual({
      carrier_name: 'OTHER',
      carrier_name_other: 'ACME_COURIER',
    });
  });
});

async function noisyJpeg(seed: number) {
  const w = 2048;
  const h = 1536;
  const raw = Buffer.alloc(w * h * 3);
  let x = seed * 2654435761;
  for (let i = 0; i < raw.length; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    raw[i] = x >>> 24;
  }
  return new Uint8Array(
    await sharp(raw, { raw: { width: w, height: h, channels: 3 } })
      .jpeg({ quality: 90 })
      .toBuffer(),
  );
}

describe('evidence PDF', () => {
  it(
    'pdf under 10MB with 6 photos, with every photo hash printed',
    { timeout: 60_000 },
    async () => {
      const photos = await Promise.all([1, 2, 3, 4, 5, 6].map(noisyJpeg));
      expect(photos.reduce((s, p) => s + p.length, 0)).toBeGreaterThan(MAX_PDF_BYTES);
      const data: EvidencePdfData = {
        dispute: {
          id: 'PP-D-1',
          reason: 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED',
          status: 'WAITING_FOR_SELLER_RESPONSE',
          amount: { currency_code: 'USD', value: '38.00' },
        },
        order: {
          id: 'o-1',
          invoiceId: 'FF-o-1',
          capturedAt: new Date('2026-11-01T10:00:00Z'),
          sealedAt: new Date('2026-11-02T10:00:00Z'),
          shippedAt: null,
          deliveredAt: null,
        },
        timeline: [
          {
            seq: 1,
            type: 'captured',
            serverTime: new Date('2026-11-01T10:00:00Z'),
            actor: 'system',
          },
        ],
        packingPhotos: photos.map((bytes, i) => ({
          sha256: sha(`p${i}`),
          label: 'item',
          serverTime: new Date('2026-11-02T09:00:00Z'),
          bytes,
          exifFlag: i === 0 ? 'EXIF time is more than 15 minutes from upload time' : null,
        })),
        buyerPhotos: [],
        attestation: {
          status: 'match',
          confidence: 0.92,
          model: 'grok',
          batchLabelText: 'B17',
          trackingNumberText: '123',
          items: [
            { name: 'Hoodie — navy “M”', expected: 'navy M x1', seen: 'navy M x1', matches: true },
          ],
          defects: [],
        },
        ledger: { verified: true, brokenAtSeq: null, entries: 7 },
        listing: {
          name: 'Block-print cotton hoodie',
          sku: 'HD-IND-01',
          description: 'Indigo hoodie ₹ → €',
        },
        returnPolicyUrl: 'https://neelblockprints.example/returns',
        shipment: { carrier: 'DHL', trackingNumber: '123', status: 'delivered' },
      };
      const pdf = await buildEvidencePdf(data);
      expect(pdf.length).toBeLessThan(MAX_PDF_BYTES);
      expect(Buffer.from(pdf.subarray(0, 5)).toString('ascii')).toBe('%PDF-');
      const doc = await PDFDocument.load(pdf);
      expect(doc.getPageCount()).toBeGreaterThanOrEqual(3);
    },
  );
});
