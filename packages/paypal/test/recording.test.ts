import { describe, expect, it, vi } from 'vitest';
import { fixedClock } from '@fairfold/contracts';
import { createOrderOperations, sanitizeOrderRecord, parseOrderRecord } from '../src/index.js';
import { readCapturedOrder } from '../src/orders.js';
import { operationFixture } from './operation-fixture.js';

// Entirely synthetic vendor responses. No real sandbox recording is supplied here.
const orderId = 'SYNTHETICRECORDORDER';
const reference = '8bcb3d1f-cf5f-4667-b0ce-4b73abe857d0';
const clock = fixedClock('2026-11-09T17:30:00.000Z');
const privateValue = 'PRIVATE-CONTACT-VALUE';
function created() {
  return {
    id: orderId,
    status: 'CREATED',
    secret: privateValue,
    links: [
      {
        rel: 'payer-action',
        method: 'GET',
        href: `https://www.sandbox.paypal.com/checkoutnow?token=${orderId}&email=${privateValue}#${privateValue}`,
      },
      { rel: 'self', href: 'https://private.invalid/' + privateValue },
    ],
  };
}
function captured() {
  const payer = {
    email_address: privateValue,
    name: { given_name: privateValue, surname: privateValue },
    phone: privateValue,
  };
  return {
    id: orderId,
    status: 'COMPLETED',
    arbitrary: privateValue,
    payer: { ...payer, payer_id: privateValue },
    payment_source: {
      paypal: {
        ...payer,
        account_id: privateValue,
        account_status: 'VERIFIED',
        tax_id: privateValue,
      },
    },
    purchase_units: [
      {
        reference_id: reference,
        custom_id: 'neel-block-prints',
        invoice_id: 'FF-' + reference,
        description: privateValue,
        payee: { email_address: privateValue },
        shipping: {
          name: { full_name: privateValue },
          phone_number: privateValue,
          address: {
            address_line_1: privateValue,
            address_line_2: privateValue,
            admin_area_1: privateValue,
            admin_area_2: privateValue,
            postal_code: privateValue,
            country_code: privateValue,
            extra: privateValue,
          },
        },
        payments: {
          captures: [
            {
              id: 'SYNTHETICRECORDCAPTURE',
              status: 'COMPLETED',
              amount: { currency_code: 'USD', value: '38.00' },
              seller_protection: { status: 'ELIGIBLE', dispute_categories: ['ITEM_NOT_RECEIVED'] },
              seller_receivable_breakdown: { private: privateValue },
              links: [{ href: privateValue }],
            },
          ],
        },
      },
    ],
  };
}
const input = {
  referenceId: reference,
  customId: 'neel-block-prints',
  invoiceId: 'FF-' + reference,
  items: [
    {
      name: 'Synthetic hoodie',
      sku: 'HD-IND-01',
      quantity: 1,
      unitAmount: { currency_code: 'USD', value: '38.00' },
    },
  ],
};
describe('in-memory sandbox recording boundary', () => {
  it('accepts only the exact sanitized envelope and rejects provenance, time and private-field edits', () => {
    const record = sanitizeOrderRecord('capture', captured(), clock);
    expect(parseOrderRecord(record)).toEqual(record);
    for (const change of [
      { version: 2 },
      { source: 'synthetic' },
      { operation: 'refund' },
      { observedAt: 'not-a-date' },
      { observedAt: '2026-11-09' },
      { raw: privateValue },
      { body: { ...record.body, secret: privateValue } },
    ])
      expect(() => parseOrderRecord({ ...record, ...change })).toThrow();
  });
  it('retains the observed create link relation while dropping non-allowlisted URL values', () => {
    const raw = created();
    const before = JSON.stringify(raw);
    const record = sanitizeOrderRecord('create', raw, clock);
    expect(record).toMatchObject({
      operation: 'create',
      observedAt: clock.now().toISOString(),
      body: {
        id: orderId,
        links: [
          {
            rel: 'payer-action',
            method: 'GET',
            href: `https://www.sandbox.paypal.com/checkoutnow?token=${orderId}`,
          },
        ],
      },
    });
    expect(JSON.stringify(record)).not.toContain(privateValue);
    expect(JSON.stringify(raw)).toBe(before);
  });
  it('replaces payer and all shipping values and excludes arbitrary nested response fields', () => {
    const raw = captured();
    const before = JSON.stringify(raw);
    const record = sanitizeOrderRecord('capture', raw, clock);
    expect(JSON.stringify(record)).not.toContain(privateValue);
    expect(record.body).toMatchObject({
      payer: { payer_id: 'FIXTUREPAYER', email_address: 'synthetic@example.invalid' },
      purchase_units: [
        { reference_id: reference, payments: { captures: [{ amount: { value: '38.00' } }] } },
      ],
    });
    expect(JSON.stringify(raw)).toBe(before);
  });
  it('preserves absent identity, protection and address fields instead of inventing observations', () => {
    const raw = captured();
    const minimal = {
      id: raw.id,
      status: raw.status,
      purchase_units: [
        {
          payments: {
            captures: [
              {
                id: 'SYNTHETICRECORDCAPTURE',
                status: 'COMPLETED',
                amount: { currency_code: 'USD', value: '38.00' },
              },
            ],
          },
        },
      ],
    };
    const record = sanitizeOrderRecord('capture-get', minimal, clock);
    expect(record.body).not.toHaveProperty('payer');
    expect(record.body).not.toHaveProperty('payment_source');
    expect(record.body).toEqual(minimal);
  });
  it.each(['origin', 'path', 'method', 'credentials'])(
    'rejects an unsafe create link: %s',
    (field) => {
      const raw = created();
      if (field === 'origin')
        raw.links[0]!.href = `https://www.paypal.com/checkoutnow?token=${orderId}`;
      if (field === 'path') raw.links[0]!.href = `https://www.sandbox.paypal.com/${privateValue}`;
      if (field === 'method') raw.links[0]!.method = 'POST';
      if (field === 'credentials')
        raw.links[0]!.href = `https://user:pass@www.sandbox.paypal.com/checkoutnow`;
      expect(() => sanitizeOrderRecord('create', raw, clock)).toThrow();
    },
  );
  it('records create, capture POST and captured GET through the actual operation parsers', async () => {
    const f = operationFixture();
    const write = vi.fn();
    const failed = vi.fn();
    const recording = { write, failed, clock };
    const client = createOrderOperations(f.transport, recording);
    f.respond(created());
    await client.create(input, { requestId: 'synthetic-create-record' });
    f.respond(captured());
    await client.capture(orderId, { requestId: 'synthetic-capture-record' });
    f.respond(captured());
    await readCapturedOrder(f.transport, orderId, recording);
    expect(write.mock.calls.map((call) => call[0].operation)).toEqual([
      'create',
      'capture',
      'capture-get',
    ]);
    expect(JSON.stringify(write.mock.calls)).not.toContain(privateValue);
    expect(failed).not.toHaveBeenCalled();
  });
  it('does not record an invalid parser result or an uncaptured recovery GET', async () => {
    const f = operationFixture();
    const recording = { write: vi.fn(), failed: vi.fn(), clock };
    f.respond({ id: 'WRONG', status: 'COMPLETED' });
    await expect(
      createOrderOperations(f.transport, recording).capture(orderId, {
        requestId: 'synthetic-invalid',
      }),
    ).rejects.toMatchObject({ code: 'PAYPAL_INVALID_RESPONSE' });
    f.respond({ id: orderId, status: 'APPROVED', purchase_units: [{}] });
    expect(await readCapturedOrder(f.transport, orderId, recording)).toBeNull();
    expect(recording.write).not.toHaveBeenCalled();
  });
  it('keeps successful payment semantics if sanitization, writing or the diagnostic callback fails', async () => {
    const f = operationFixture();
    const failed = vi.fn(() => {
      throw new Error(privateValue);
    });
    const write = vi.fn(async () => {
      throw new Error(privateValue);
    });
    const client = createOrderOperations(f.transport, { write, failed, clock });
    f.respond(captured());
    expect(
      (await client.capture(orderId, { requestId: 'synthetic-write-failure' })).captureId,
    ).toBe('SYNTHETICRECORDCAPTURE');
    const invalidRecord = captured();
    invalidRecord.purchase_units[0]!.reference_id = privateValue;
    f.respond(invalidRecord);
    expect(
      (await client.capture(orderId, { requestId: 'synthetic-redaction-failure' })).status,
    ).toBe('COMPLETED');
    expect(write).toHaveBeenCalledTimes(1);
    expect(failed).toHaveBeenCalledTimes(2);
    expect(f.calls).toHaveLength(2);
  });
});
