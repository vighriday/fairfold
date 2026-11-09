import { describe, expect, it } from 'vitest';
import { createDisputeActionOperations } from '../src/index.js';
import { operationFixture } from './operation-fixture.js';

// Synthetic only. No evidence/message/offer/refund is sent to PayPal.
const id = 'PP-D-SYNTHETIC-ACTION';
const opts = { requestId: 'ff-action-synthetic-only' };
const money = { currency_code: 'USD', value: '12.30' };
const file = () => ({
  filename: 'synthetic-evidence.pdf',
  mime: 'application/pdf',
  bytes: Buffer.from('%PDF-1.7\nSYNTHETIC\x00\xff', 'latin1'),
});
const evidence = () => [
  {
    evidence_type: 'OTHER',
    documents: [{ name: file().filename }],
    notes: 'Synthetic reviewed evidence',
  },
];
function response() {
  return {
    links: [
      {
        rel: 'self',
        href: `https://api-m.sandbox.paypal.com/v1/customer/disputes/${id}`,
        method: 'GET',
      },
    ],
  };
}
describe('H2 dispute action bindings', () => {
  it('maps non-upload methods to vendor fields and source request headers', async () => {
    const f = operationFixture();
    const actions = createDisputeActionOperations(f.transport);
    for (let index = 0; index < 8; index++) f.respond(response());
    await actions.makeOffer(
      id,
      {
        note: 'Synthetic offer',
        offerType: 'REFUND',
        offerAmount: money,
        invoiceId: 'FF-synthetic',
      },
      opts,
    );
    await actions.makeOffer(
      id,
      { note: 'Synthetic replacement', offerType: 'REFUND_WITH_REPLACEMENT', offerAmount: money },
      opts,
    );
    await actions.makeOffer(
      id,
      { note: 'Synthetic replacement', offerType: 'REPLACEMENT_WITHOUT_REFUND' },
      opts,
    );
    await actions.acceptClaim(id, { note: 'Synthetic default full refund' }, opts);
    await actions.acceptClaim(
      id,
      { note: 'Synthetic partial', acceptClaimType: 'PARTIAL_REFUND', refundAmount: money },
      opts,
    );
    await actions.sendMessage(id, 'Synthetic message with spaces', opts);
    await actions.sandboxAdjudicate(id, 'BUYER_FAVOR', opts);
    await actions.sandboxRequireEvidence(id, 'SELLER_EVIDENCE', opts);
    expect(f.calls.map((call) => call.url.pathname.split('/').at(-1))).toEqual([
      'make-offer',
      'make-offer',
      'make-offer',
      'accept-claim',
      'accept-claim',
      'send-message',
      'adjudicate',
      'require-evidence',
    ]);
    expect(f.calls[0]!.body).toEqual({
      note: 'Synthetic offer',
      offer_type: 'REFUND',
      offer_amount: money,
      invoice_id: 'FF-synthetic',
    });
    expect(f.calls[2]!.body).not.toHaveProperty('offer_amount');
    expect(f.calls[3]!.body).toEqual({ note: 'Synthetic default full refund' });
    expect(f.calls[4]!.body).toMatchObject({
      accept_claim_type: 'PARTIAL_REFUND',
      refund_amount: money,
    });
    expect(f.calls[5]!.body).toEqual({ message: 'Synthetic message with spaces' });
    expect(f.calls[6]!.body).toEqual({ adjudication_outcome: 'BUYER_FAVOR' });
    expect(f.calls[7]!.body).toEqual({ action: 'SELLER_EVIDENCE' });
    for (const call of f.calls) {
      expect(call.headers.get('paypal-request-id')).toBe(opts.requestId);
      expect(call.headers.get('prefer')).toBe('return=representation');
    }
  });
  it('blocks Q2 return-address branches before OAuth without inventing a field', () => {
    const f = operationFixture();
    const actions = createDisputeActionOperations(f.transport);
    for (const run of [
      () =>
        actions.makeOffer(
          id,
          { note: 'Synthetic return', offerType: 'REFUND_WITH_RETURN', offerAmount: money },
          opts,
        ),
      () =>
        actions.acceptClaim(
          id,
          { note: 'Synthetic return', acceptClaimType: 'REFUND_WITH_RETURN' },
          opts,
        ),
    ])
      expect(run).toThrowError(
        expect.objectContaining({ code: 'PAYPAL_RETURN_ADDRESS_REVIEW_REQUIRED' }),
      );
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it.each([
    'no-amount',
    'zero',
    'replacement-amount',
    'partial-missing',
    'full-amount',
    'empty-note',
    'bad-message',
    'unknown-field',
  ])('rejects invalid fields before OAuth: %s', (reason) => {
    const f = operationFixture();
    const actions = createDisputeActionOperations(f.transport);
    const run = () => {
      if (reason === 'no-amount')
        return actions.makeOffer(id, { note: 'Synthetic', offerType: 'REFUND' }, opts);
      if (reason === 'zero')
        return actions.makeOffer(
          id,
          { note: 'Synthetic', offerType: 'REFUND', offerAmount: { ...money, value: '0' } },
          opts,
        );
      if (reason === 'replacement-amount')
        return actions.makeOffer(
          id,
          { note: 'Synthetic', offerType: 'REPLACEMENT_WITHOUT_REFUND', offerAmount: money },
          opts,
        );
      if (reason === 'partial-missing')
        return actions.acceptClaim(
          id,
          { note: 'Synthetic', acceptClaimType: 'PARTIAL_REFUND' },
          opts,
        );
      if (reason === 'full-amount')
        return actions.acceptClaim(
          id,
          { note: 'Synthetic', acceptClaimType: 'REFUND', refundAmount: money },
          opts,
        );
      if (reason === 'empty-note') return actions.acceptClaim(id, { note: '' }, opts);
      if (reason === 'bad-message') return actions.sendMessage(id, 'x'.repeat(2001), opts);
      const extra = {
        note: 'Synthetic',
        offerType: 'REFUND' as const,
        offerAmount: money,
        return_shipping_address: 'synthetic-unreviewed',
      };
      return actions.makeOffer(id, extra, opts);
    };
    expect(run).toThrowError(expect.objectContaining({ code: 'INVALID_PAYPAL_REQUEST' }));
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it('sends binary-exact multipart input/file1 parts with original filenames and MIME types', async () => {
    const f = operationFixture();
    f.respond(response());
    await createDisputeActionOperations(f.transport).provideEvidence(
      id,
      evidence(),
      [file()],
      opts,
    );
    const call = f.calls[0]!;
    const boundary = call.headers.get('content-type')!.split('boundary=')[1]!;
    const wire = call.body as Buffer;
    expect(wire.toString('latin1')).toContain(
      `--${boundary}\r\nContent-Disposition: form-data; name="input"\r\nContent-Type: application/json\r\n\r\n`,
    );
    expect(wire.toString('utf8')).toContain(JSON.stringify({ evidences: evidence() }));
    expect(wire.toString('latin1')).toContain('name="file1"; filename="synthetic-evidence.pdf"');
    expect(wire.includes(file().bytes)).toBe(true);
    expect(wire.subarray(-boundary.length - 6).toString()).toBe(`--${boundary}--\r\n`);
  });
  it('reuses exact multipart bytes, boundary and request ID on rate limiting', async () => {
    const f = operationFixture();
    f.respond({ name: 'RATE_LIMIT_REACHED' }, 429);
    f.respond(response());
    await createDisputeActionOperations(f.transport).provideEvidence(
      id,
      evidence(),
      [file()],
      opts,
    );
    expect(f.calls[1]!.body).toEqual(f.calls[0]!.body);
    expect(f.calls[1]!.headers.get('content-type')).toBe(f.calls[0]!.headers.get('content-type'));
    expect(f.sleep).toHaveBeenCalledTimes(1);
  });
  it.each([
    'filename',
    'mime',
    'magic',
    'empty',
    'limit',
    'duplicate',
    'aggregate',
    'document',
    'json',
  ])('rejects invalid evidence before OAuth: %s', async (reason) => {
    const f = operationFixture();
    const upload = file();
    let files = [upload];
    const input = evidence();
    if (reason === 'filename') upload.filename = 'bad\r\nInjected.pdf';
    if (reason === 'mime') upload.mime = 'text/html';
    if (reason === 'magic') upload.bytes = Buffer.from('not-pdf');
    if (reason === 'empty') upload.bytes = Buffer.alloc(0);
    if (reason === 'limit') upload.bytes = Buffer.alloc(10_000_000);
    if (reason === 'duplicate') files.push(file());
    if (reason === 'aggregate') {
      const bytes = Buffer.alloc(9_000_000);
      bytes.write('%PDF-');
      files = Array.from({ length: 6 }, (_, index) => ({
        filename: `synthetic-${index}.pdf`,
        mime: 'application/pdf',
        bytes,
      }));
      delete (input[0] as { documents?: unknown }).documents;
    }
    if (reason === 'document') input[0]!.documents[0]!.name = 'missing.pdf';
    if (reason === 'json') Object.assign(input[0]!, { nonJson: new Date() });
    await expect(
      createDisputeActionOperations(f.transport).provideEvidence(id, input, files, opts),
    ).rejects.toMatchObject({ code: 'INVALID_PAYPAL_REQUEST' });
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it('does not replay a non-idempotent action after 5xx or expose upstream free text', async () => {
    const f = operationFixture();
    f.respond({ name: 'INTERNAL_SERVER_ERROR', message: 'SYNTHETIC-PRIVATE-TEXT' }, 500);
    await expect(
      createDisputeActionOperations(f.transport).sendMessage(id, 'SYNTHETIC-PRIVATE-MESSAGE', opts),
    ).rejects.toMatchObject({ outcomeUnknown: true });
    expect(f.calls).toHaveLength(1);
    expect(f.sleep).not.toHaveBeenCalled();
    const logs = JSON.stringify(f.logger.warn.mock.calls);
    expect(logs).not.toContain('SYNTHETIC-PRIVATE');
    expect(logs).toContain('synthetic-operation-debug');
  });
});
