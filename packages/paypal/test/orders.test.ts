import { describe, expect, it } from 'vitest';
import { CaptureResultSchema, type PayPalClient } from '@fairfold/contracts';
import { createOrderOperations } from '../src/index.js';
import { operationFixture } from './operation-fixture.js';

// Entirely synthetic: these are not recorded PayPal transactions or buyer data.
const id = 'SYNTHETICORDER2026';
const opts = { requestId: 'ff-create-synthetic-order' };
const approve = 'https://www.sandbox.paypal.com/checkoutnow?token=' + id;
function input() {
  return {
    referenceId: 'synthetic-reference',
    customId: 'synthetic-merchant',
    invoiceId: 'FF-synthetic-reference',
    items: [
      {
        name: 'Synthetic hoodie',
        sku: 'SYNTHETIC-SKU',
        quantity: 1,
        unitAmount: { currency_code: 'USD', value: '38.00' },
      },
    ],
  };
}
function created() {
  return { id, status: 'CREATED', links: [{ rel: 'approve', href: approve, method: 'GET' }] };
}
function captured() {
  return {
    id,
    status: 'COMPLETED',
    payment_source: {
      paypal: {
        account_id: 'SYNTHETICPAYER',
        account_status: 'VERIFIED',
        email_address: 'synthetic@example.invalid',
        name: { given_name: 'Synthetic', surname: 'Buyer' },
      },
    },
    purchase_units: [
      {
        payments: {
          captures: [
            {
              id: 'SYNTHETICCAPTURE',
              status: 'COMPLETED',
              seller_protection: {
                status: 'ELIGIBLE',
                dispute_categories: ['ITEM_NOT_RECEIVED', 'UNAUTHORIZED_TRANSACTION'],
              },
            },
          ],
        },
        shipping: {
          name: { full_name: 'Synthetic Recipient' },
          address: {
            address_line_1: 'SYNTHETIC ADDRESS',
            address_line_2: 'SYNTHETIC UNIT',
            admin_area_1: 'CA',
            admin_area_2: 'Synthetic city',
            postal_code: '00000',
            country_code: 'US',
          },
        },
      },
    ],
  };
}

describe('H2 Orders create/capture/get bindings', () => {
  it('creates one CAPTURE unit with exact item totals, stable identifiers and string quantities', async () => {
    const f = operationFixture();
    f.respond(created(), 201);
    const order = input();
    order.items = [
      { ...order.items[0]!, quantity: 3, unitAmount: { currency_code: 'USD', value: '0.10' } },
      {
        ...order.items[0]!,
        sku: 'SYNTHETIC-SECOND',
        quantity: 1,
        unitAmount: { currency_code: 'USD', value: '0.20' },
      },
    ];
    await expect(createOrderOperations(f.transport).create(order, opts)).resolves.toEqual({
      id,
      status: 'CREATED',
      approveUrl: approve,
    });
    expect(f.calls[0]!.body).toMatchObject({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: order.referenceId,
          custom_id: order.customId,
          invoice_id: order.invoiceId,
          amount: {
            currency_code: 'USD',
            value: '0.50',
            breakdown: { item_total: { currency_code: 'USD', value: '0.50' } },
          },
          items: [
            { quantity: '3', unit_amount: { value: '0.10' } },
            { quantity: '1', unit_amount: { value: '0.20' } },
          ],
        },
      ],
    });
    expect(f.calls[0]!.url.pathname).toBe('/v2/checkout/orders');
    expect(f.calls[0]!.headers.get('paypal-request-id')).toBe(opts.requestId);
    expect(f.calls[0]!.headers.get('prefer')).toBe('return=representation');
  });

  it('keeps the maximum valid decimal amount exact and rejects overflow before any HTTP call', async () => {
    const f = operationFixture();
    f.respond(created());
    const order = input();
    order.items[0]!.unitAmount.value = '9999999999.99';
    await createOrderOperations(f.transport).create(order, opts);
    expect(f.calls[0]!.body).toMatchObject({
      purchase_units: [{ amount: { value: '9999999999.99' } }],
    });
    const before = f.fetcher.mock.calls.length;
    order.items[0]!.quantity = 2;
    await expect(createOrderOperations(f.transport).create(order, opts)).rejects.toMatchObject({
      code: 'INVALID_PAYPAL_REQUEST',
    });
    expect(f.fetcher).toHaveBeenCalledTimes(before);
  });

  it('normalizes integral-currency zero fractions and maps only the allowed shipping fields', async () => {
    const f = operationFixture();
    f.respond(created());
    const order = input();
    order.items[0]!.unitAmount = { currency_code: 'JPY', value: '38.00' };
    await createOrderOperations(f.transport).create(
      {
        ...order,
        shipping: {
          fullName: 'Synthetic Recipient',
          address: {
            address_line_1: 'SYNTHETIC ADDRESS',
            address_line_2: 'SYNTHETIC UNIT',
            admin_area_1: 'CA',
            country_code: 'US',
          },
        },
      },
      opts,
    );
    expect(f.calls[0]!.body).toMatchObject({
      purchase_units: [
        {
          amount: { currency_code: 'JPY', value: '38' },
          items: [{ unit_amount: { value: '38' } }],
          shipping: {
            name: { full_name: 'Synthetic Recipient' },
            address: { address_line_2: 'SYNTHETIC UNIT', country_code: 'US' },
          },
        },
      ],
    });
  });

  it.each([
    'zero',
    'negative',
    'precision',
    'currency',
    'mixed',
    'quantity',
    'unsafe',
    'items',
    'name',
    'invoice',
    'country',
    'address',
  ])('rejects invalid %s input before acquiring merchant credentials', async (failure) => {
    const f = operationFixture();
    const order = input();
    if (failure === 'zero') order.items[0]!.unitAmount.value = '0.00';
    if (failure === 'negative') order.items[0]!.unitAmount.value = '-1.00';
    if (failure === 'precision')
      order.items[0]!.unitAmount = { currency_code: 'JPY', value: '1.01' };
    if (failure === 'currency') order.items[0]!.unitAmount.currency_code = 'INR';
    if (failure === 'mixed')
      order.items.push({ ...order.items[0]!, unitAmount: { currency_code: 'EUR', value: '1.00' } });
    if (failure === 'quantity') order.items[0]!.quantity = 10_000_000_000;
    if (failure === 'unsafe') order.items[0]!.quantity = Number.MAX_SAFE_INTEGER + 1;
    if (failure === 'items') order.items = [];
    if (failure === 'name') order.items[0]!.name = 'x'.repeat(128);
    if (failure === 'invoice') order.invoiceId = 'x'.repeat(128);
    const shipping: Parameters<PayPalClient['orders']['create']>[0]['shipping'] =
      failure === 'country'
        ? { fullName: 'Synthetic', address: { country_code: 'USA' } }
        : failure === 'address'
          ? { fullName: 'Synthetic', address: { country_code: 'US', arbitrary_field: 'rejected' } }
          : undefined;
    await expect(
      createOrderOperations(f.transport).create({ ...order, shipping }, opts),
    ).rejects.toMatchObject({ code: 'INVALID_PAYPAL_REQUEST' });
    expect(f.fetcher).not.toHaveBeenCalled();
  });

  it('prefers payer-action and keeps the same body/request ID during a documented create retry', async () => {
    const f = operationFixture();
    f.respond({ name: 'INTERNAL_SERVER_ERROR' }, 500);
    f.respond({
      ...created(),
      links: [
        ...created().links,
        { rel: 'payer-action', href: approve + '&action=pay', method: 'GET' },
      ],
    });
    await expect(createOrderOperations(f.transport).create(input(), opts)).resolves.toMatchObject({
      approveUrl: approve + '&action=pay',
    });
    expect(f.calls).toHaveLength(2);
    expect(f.calls[1]!.body).toEqual(f.calls[0]!.body);
    expect(f.calls[1]!.headers.get('paypal-request-id')).toBe(
      f.calls[0]!.headers.get('paypal-request-id'),
    );
    expect(f.sleep.mock.calls.map(([ms]) => ms)).toEqual([500]);
  });

  it.each(['live', 'external', 'credentials', 'method', 'missing', 'status'])(
    'rejects a %s approval response and logs only safe response diagnostics',
    async (failure) => {
      const f = operationFixture();
      const response = created();
      if (failure === 'live') response.links[0]!.href = 'https://www.paypal.com/checkoutnow';
      if (failure === 'external') response.links[0]!.href = 'https://untrusted.example/checkout';
      if (failure === 'credentials')
        response.links[0]!.href = 'https://synthetic-secret@www.sandbox.paypal.com/checkoutnow';
      if (failure === 'method') response.links[0]!.method = 'POST';
      if (failure === 'missing') response.links = [];
      if (failure === 'status') response.status = '';
      f.respond(response, 201);
      await expect(createOrderOperations(f.transport).create(input(), opts)).rejects.toMatchObject({
        code: 'PAYPAL_INVALID_RESPONSE',
        debugId: 'synthetic-operation-debug',
        upstreamStatus: 201,
        outcomeUnknown: true,
      });
      expect(f.calls).toHaveLength(1);
      expect(f.logger.warn).toHaveBeenCalledOnce();
      expect(JSON.stringify(f.logger.warn.mock.calls)).not.toContain('synthetic-secret');
    },
  );

  it('parses the capture payment rather than order status, wallet identity and exact contract shipping fields', async () => {
    const f = operationFixture();
    const response = captured();
    response.purchase_units[0]!.payments.captures[0]!.status = 'PENDING';
    f.respond(response, 202);
    const result = await createOrderOperations(f.transport).capture(id, {
      requestId: 'ff-capture-synthetic',
    });
    expect(CaptureResultSchema.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({
      orderId: id,
      captureId: 'SYNTHETICCAPTURE',
      status: 'PENDING',
      sellerProtection: {
        status: 'ELIGIBLE',
        disputeCategories: ['ITEM_NOT_RECEIVED', 'UNAUTHORIZED_TRANSACTION'],
      },
      payerAccountStatus: 'VERIFIED',
      payerId: 'SYNTHETICPAYER',
      payerEmail: 'synthetic@example.invalid',
      payerName: 'Synthetic Buyer',
      shipping: {
        fullName: 'Synthetic Recipient',
        address: { address_line_1: 'SYNTHETIC ADDRESS', country_code: 'US' },
      },
    });
    expect(result.shipping!.address).not.toHaveProperty('address_line_2');
    expect(result.raw).toEqual(response);
    expect(f.calls[0]!.body).toEqual({});
    expect(f.calls[0]!.headers.get('paypal-request-id')).toBe('ff-capture-synthetic');
  });

  it('falls back to legacy payer fields and leaves genuinely absent fields null', async () => {
    const f = operationFixture();
    f.respond({
      id,
      purchase_units: [
        { payments: { captures: [{ id: 'SYNTHETICCAPTURE', status: 'COMPLETED' }] } },
      ],
      payer: {
        payer_id: 'SYNTHETICPAYER',
        email_address: 'synthetic@example.invalid',
        name: { given_name: 'Synthetic', surname: 'Legacy' },
      },
    });
    const result = await createOrderOperations(f.transport).capture(id, opts);
    expect(result).toMatchObject({
      sellerProtection: { status: null, disputeCategories: [] },
      payerAccountStatus: null,
      payerId: 'SYNTHETICPAYER',
      payerName: 'Synthetic Legacy',
      shipping: null,
    });
    f.respond({
      id,
      purchase_units: [
        { payments: { captures: [{ id: 'SYNTHETICCAPTURE', status: 'COMPLETED' }] } },
      ],
    });
    expect(await createOrderOperations(f.transport).capture(id, opts)).toMatchObject({
      payerAccountStatus: null,
      payerId: null,
      payerEmail: null,
      payerName: null,
      shipping: null,
    });
  });

  it.each(['id', 'units', 'captures', 'captureId', 'captureStatus', 'categories', 'identity'])(
    'refuses malformed/ambiguous capture %s without replaying a possibly completed payment',
    async (failure) => {
      const f = operationFixture();
      const response = captured();
      if (failure === 'id') response.id = 'DIFFERENTORDER';
      if (failure === 'units') response.purchase_units.push(response.purchase_units[0]!);
      if (failure === 'captures')
        response.purchase_units[0]!.payments.captures.push(
          response.purchase_units[0]!.payments.captures[0]!,
        );
      if (failure === 'captureId') response.purchase_units[0]!.payments.captures[0]!.id = '';
      if (failure === 'captureStatus')
        response.purchase_units[0]!.payments.captures[0]!.status = '';
      if (failure === 'categories')
        response.purchase_units[0]!.payments.captures[0]!.seller_protection.dispute_categories = [
          42 as unknown as string,
        ];
      f.respond(
        failure === 'identity' ? { ...response, payer: { payer_id: 'DIFFERENTPAYER' } } : response,
      );
      const error = await createOrderOperations(f.transport)
        .capture(id, opts)
        .catch((error: unknown) => error);
      expect(error).toMatchObject({
        code: 'PAYPAL_INVALID_RESPONSE',
        debugId: 'synthetic-operation-debug',
        outcomeUnknown: true,
      });
      expect(f.calls).toHaveLength(1);
      expect(JSON.stringify([error, f.logger.warn.mock.calls])).not.toContain(
        'synthetic@example.invalid',
      );
    },
  );

  it('treats empty optional wallet fields as unknown rather than inventing buyer or protection data', async () => {
    const f = operationFixture();
    f.respond({
      id,
      payment_source: {
        paypal: {
          account_id: '',
          account_status: '',
          email_address: '',
          name: { given_name: '', surname: '' },
        },
      },
      purchase_units: [
        {
          payments: {
            captures: [
              { id: 'SYNTHETICCAPTURE', status: 'COMPLETED', seller_protection: { status: '' } },
            ],
          },
        },
      ],
    });
    expect(await createOrderOperations(f.transport).capture(id, opts)).toMatchObject({
      payerId: null,
      payerAccountStatus: null,
      payerEmail: null,
      payerName: null,
      sellerProtection: { status: null, disputeCategories: [] },
    });
  });

  it('returns validated raw order details without following vendor links', async () => {
    const f = operationFixture();
    const response = {
      ...created(),
      links: [{ rel: 'self', href: 'https://untrusted.example/raw', method: 'GET' }],
    };
    f.respond(response);
    await expect(createOrderOperations(f.transport).get(id)).resolves.toEqual(response);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.method).toBe('GET');
    f.respond({ id: 'DIFFERENTORDER', status: 'COMPLETED' });
    await expect(createOrderOperations(f.transport).get(id)).rejects.toMatchObject({
      code: 'PAYPAL_INVALID_RESPONSE',
      outcomeUnknown: false,
    });
  });

  it('rejects malformed order paths without making a request', async () => {
    const f = operationFixture();
    const operations = createOrderOperations(f.transport);
    for (const invalid of ['', 'SEED-ORDER', 'ORDER/../OTHER', 'x'.repeat(37)]) {
      await expect(operations.get(invalid)).rejects.toMatchObject({
        code: 'INVALID_PAYPAL_REQUEST',
      });
      await expect(operations.capture(invalid, opts)).rejects.toMatchObject({
        code: 'INVALID_PAYPAL_REQUEST',
      });
    }
    expect(f.fetcher).not.toHaveBeenCalled();
  });
});
