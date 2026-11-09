// Synthetic sandbox HTTP boundary. No external PayPal request is made.
import { randomBytes, randomUUID } from 'node:crypto';
import { vi, expect } from 'vitest';
import { encryptSecret, fixedClock } from '@fairfold/contracts';
import { merchants, products, type createDatabase } from '@fairfold/db';
import { type Jobs } from '@fairfold/jobs';
import {
  createCheckoutClientFactory,
  databaseCredentials,
  type OrderRecording,
} from '@fairfold/paypal';
import { createCheckoutService } from '../src/checkout/service.js';
import { SandboxHoodie } from '../src/checkout/setup-sandbox.js';

export const checkoutClock = fixedClock('2026-11-09T16:40:00.123Z');
export async function checkoutFixture(
  database: ReturnType<typeof createDatabase>,
  jobs: Pick<Jobs, 'publish'>,
  options: { sourceMerchant?: boolean; recording?: OrderRecording } = {},
) {
  const key = randomBytes(32);
  const [merchant] = await database.db
    .insert(merchants)
    .values({
      ...(options.sourceMerchant ? { id: SandboxHoodie.merchantId } : {}),
      slug: options.sourceMerchant ? SandboxHoodie.slug : 'checkout-flow-' + randomUUID(),
      name: options.sourceMerchant ? SandboxHoodie.name : 'Synthetic flow merchant',
      domain: options.sourceMerchant ? SandboxHoodie.domain : 'flow.example.invalid',
      country: options.sourceMerchant ? SandboxHoodie.country : 'US',
      paypal_client_id: 'synthetic-flow-client',
      paypal_client_secret_enc: encryptSecret('synthetic-flow-secret', key),
    })
    .returning();
  const [product] = await database.db
    .insert(products)
    .values({
      merchant_id: merchant!.id,
      sku: options.sourceMerchant ? SandboxHoodie.sku : 'SYNTHETIC-HOODIE',
      name: options.sourceMerchant ? SandboxHoodie.productName : 'Synthetic hoodie',
      description: 'Synthetic source listing',
      unit_value: '38.00',
      currency: 'USD',
      listing_version: 'v-flow',
    })
    .returning();
  const payerId = 'P' + randomUUID().replaceAll('-', '').toUpperCase();
  const captureId = 'C' + randomUUID().replaceAll('-', '').toUpperCase();
  const state = {
    captured: false,
    status: 'COMPLETED',
    postFailure: '',
    amount: '38.00',
    currency: 'USD',
  };
  let paypalOrderId = '';
  let unit: Record<string, unknown> = {};
  const calls: Array<{ method: string; path: string; requestId: string | null; body: unknown }> =
    [];
  const logger = { warn: vi.fn() };
  function body() {
    return {
      id: paypalOrderId,
      status: state.captured ? 'COMPLETED' : 'APPROVED',
      payment_source: {
        paypal: {
          account_id: payerId,
          account_status: 'VERIFIED',
          email_address: 'synthetic-buyer@example.invalid',
          name: { given_name: 'Synthetic', surname: 'Buyer' },
        },
      },
      purchase_units: [
        {
          ...unit,
          shipping: {
            name: { full_name: 'Excluded Recipient' },
            address: {
              address_line_1: '10 Synthetic Street',
              address_line_2: 'Suite 2',
              country_code: 'US',
              postal_code: '12345',
            },
          },
          ...(state.captured
            ? {
                payments: {
                  captures: [
                    {
                      id: captureId,
                      status: state.status,
                      amount: { currency_code: state.currency, value: state.amount },
                      seller_protection: {
                        status: 'ELIGIBLE',
                        dispute_categories: ['ITEM_NOT_RECEIVED'],
                      },
                    },
                  ],
                },
              }
            : {}),
        },
      ],
    };
  }
  const fetcher = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = new URL(String(input));
    expect(url.origin).toBe('https://api-m.sandbox.paypal.com');
    if (url.pathname === '/v1/oauth2/token')
      return Response.json({
        access_token: 'SYNTHETIC-FLOW-TOKEN',
        token_type: 'Bearer',
        expires_in: 3600,
      });
    const request = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({
      method: init!.method!,
      path: url.pathname,
      requestId: new Headers(init?.headers).get('PayPal-Request-Id'),
      body: request,
    });
    if (init?.method === 'POST' && url.pathname === '/v2/checkout/orders') {
      unit = request.purchase_units[0];
      paypalOrderId = 'O' + String(unit.reference_id).replaceAll('-', '').toUpperCase();
      return Response.json(
        {
          id: paypalOrderId,
          status: 'CREATED',
          links: [
            {
              rel: 'payer-action',
              method: 'GET',
              href: 'https://www.sandbox.paypal.com/checkoutnow?token=' + paypalOrderId,
            },
          ],
        },
        { status: 201 },
      );
    }
    if (init?.method === 'GET' && url.pathname === '/v2/checkout/orders/' + paypalOrderId)
      return Response.json(body());
    if (
      init?.method === 'POST' &&
      url.pathname === '/v2/checkout/orders/' + paypalOrderId + '/capture'
    ) {
      if (state.postFailure === 'declined')
        return Response.json(
          {
            name: 'UNPROCESSABLE_ENTITY',
            details: [
              {
                issue: 'INSTRUMENT_DECLINED',
                description: 'Excluded synthetic email@example.invalid',
              },
            ],
          },
          { status: 422 },
        );
      if (state.postFailure === 'network-before-commit')
        throw new Error('Synthetic uncertain request');
      state.captured = true;
      if (state.postFailure === 'network-after-commit')
        throw new Error('Synthetic lost response after capture');
      if (state.postFailure === 'already-captured')
        return Response.json(
          { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] },
          { status: 422 },
        );
      return Response.json(body(), { status: 201 });
    }
    throw new Error('Unexpected synthetic checkout operation');
  });
  const actualFactory = createCheckoutClientFactory({
    credentials: databaseCredentials(database.db),
    encryptionKey: key,
    logger,
    fetch: fetcher,
    clock: checkoutClock,
    sleep: async () => {},
    recording: options.recording,
  });
  const forMerchant = vi.fn(actualFactory);
  const service = createCheckoutService({ database, jobs, forMerchant, clock: checkoutClock });
  const input = { merchantId: merchant!.id, items: [{ sku: product!.sku, quantity: 1 }] };
  return {
    service,
    merchant: merchant!,
    product: product!,
    input,
    state,
    calls,
    logger,
    forMerchant,
    payerId,
    captureId,
    fetcher,
  };
}
