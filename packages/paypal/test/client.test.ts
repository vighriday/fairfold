import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { DemoSubjects, encryptSecret, fixedClock, type ForMerchant } from '@fairfold/contracts';
import { createPayPalClientFactory, type MerchantCredentials } from '../src/index.js';

// All HTTP, credentials, identities and signature results are synthetic.
const orderId = 'SYNTHETICFULLORDER';
const captureId = 'SYNTHETICFULLCAPTURE';
const disputeId = 'PP-D-SYNTHETIC-FULL';
const clock = fixedClock('2026-11-09T12:00:00.000Z');
const opts = (name: string) => ({ requestId: 'ff-synthetic-full-' + name });
const signatureHeaders = {
  'paypal-auth-algo': 'SHA256withRSA',
  'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-SYNTHETIC',
  'paypal-transmission-id': 'synthetic-full-transmission',
  'paypal-transmission-sig': Buffer.from('synthetic-full-signature').toString('base64'),
  'paypal-transmission-time': '2026-11-09T12:00:00Z',
};
function fixture() {
  const key = randomBytes(32);
  const credentials = new Map<string, MerchantCredentials>([
    [
      DemoSubjects.merchant,
      {
        clientId: 'synthetic-first-client',
        secretEncrypted: encryptSecret('synthetic-first-secret', key),
        simulated: false,
      },
    ],
    [
      DemoSubjects.admin,
      {
        clientId: 'synthetic-second-client',
        secretEncrypted: encryptSecret('synthetic-second-secret', key),
        simulated: false,
      },
    ],
  ]);
  let grants = 0;
  const calls: Array<{ path: string; method: string; bearer: string; requestId: string | null }> =
    [];
  const fetcher = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = new URL(String(input));
    expect(url.origin).toBe('https://api-m.sandbox.paypal.com');
    const headers = new Headers(init?.headers);
    if (url.pathname === '/v1/oauth2/token') {
      grants++;
      const decoded = Buffer.from(headers.get('authorization')!.slice(6), 'base64').toString();
      expect(
        decoded.startsWith('synthetic-first-client:') ||
          decoded.startsWith('synthetic-second-client:'),
      ).toBe(true);
      return Response.json({
        access_token: 'SYNTHETIC-FULL-TOKEN-' + grants,
        expires_in: 3600,
        token_type: 'Bearer',
      });
    }
    calls.push({
      path: url.pathname,
      method: init!.method!,
      bearer: headers.get('authorization')!,
      requestId: headers.get('paypal-request-id'),
    });
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    if (url.pathname === '/v2/checkout/orders')
      return Response.json({
        id: orderId,
        status: 'CREATED',
        links: [
          {
            rel: 'approve',
            method: 'GET',
            href: 'https://www.sandbox.paypal.com/checkoutnow?token=' + orderId,
          },
        ],
      });
    if (url.pathname === '/v2/checkout/orders/' + orderId)
      return Response.json({ id: orderId, status: 'APPROVED', purchase_units: [{}] });
    if (url.pathname.endsWith('/capture'))
      return Response.json({
        id: orderId,
        status: 'COMPLETED',
        purchase_units: [
          {
            payments: {
              captures: [
                {
                  id: captureId,
                  status: 'COMPLETED',
                  amount: { currency_code: 'USD', value: '38.00' },
                },
              ],
            },
          },
        ],
      });
    if (url.pathname.endsWith('/track'))
      return Response.json({
        id: orderId,
        purchase_units: [{ shipping: { trackers: [{ id: captureId + '-SYNTHETICTRACK' }] } }],
      });
    if (url.pathname.endsWith('/refund'))
      return Response.json({ id: 'SYNTHETICFULLREFUND', status: 'COMPLETED' });
    if (url.pathname === '/v1/reporting/transactions')
      return Response.json({ page: 1, total_pages: 0, total_items: 0, transaction_details: [] });
    if (url.pathname === '/v1/customer/disputes') return Response.json({ items: [], links: [] });
    if (url.pathname === '/v1/customer/disputes/' + disputeId)
      return Response.json({ dispute_id: disputeId, status: 'OPEN' });
    if (url.pathname.startsWith('/v1/customer/disputes/')) return Response.json({ links: [] });
    if (url.pathname.endsWith('/verify-webhook-signature'))
      return Response.json({ verification_status: 'SUCCESS' });
    if (url.pathname === '/v1/notifications/webhooks')
      return Response.json({ id: 'SYNTHETICFULLWEBHOOK', ...body });
    throw new Error('Unexpected synthetic full-client operation');
  });
  const options = {
    credentials: { lookup: async (id: string) => credentials.get(id) ?? null },
    encryptionKey: key,
    logger: { warn: vi.fn() },
    fetch: fetcher,
    clock,
    sleep: async () => {},
    apiBase: 'https://api-m.sandbox.paypal.com',
  };
  const forMerchant = createPayPalClientFactory(options);
  const contract: ForMerchant = forMerchant; // Compile-time proof, without a cast or stub.
  return {
    forMerchant,
    contract,
    credentials,
    options,
    key,
    fetcher,
    calls,
    get grants() {
      return grants;
    },
  };
}
describe('complete H2 PayPalClient and ForMerchant', () => {
  it('performs every shared method with one merchant token and no eager vendor action', async () => {
    const f = fixture();
    const client = await f.contract(DemoSubjects.merchant);
    expect(f.fetcher).not.toHaveBeenCalled();
    const created = await client.orders.create(
      {
        referenceId: 'synthetic-reference',
        customId: 'synthetic-merchant',
        invoiceId: 'FF-synthetic-reference',
        items: [
          {
            name: 'Synthetic hoodie',
            sku: 'SYNTHETIC-HOODIE',
            quantity: 1,
            unitAmount: { currency_code: 'USD', value: '38.00' },
          },
        ],
      },
      opts('create'),
    );
    expect(created.id).toBe(orderId);
    await client.orders.get(orderId);
    expect((await client.orders.capture(orderId, opts('capture'))).captureId).toBe(captureId);
    await client.orders.addTracking(
      orderId,
      { captureId, trackingNumber: 'SYNTHETICTRACK', carrier: 'DHL', notifyPayer: false },
      opts('track'),
    );
    expect((await client.payments.refund(captureId, {}, opts('refund'))).refundId).toBe(
      'SYNTHETICFULLREFUND',
    );
    expect(await client.disputes.list({})).toEqual({ items: [], nextPageToken: null });
    await client.disputes.get(disputeId);
    await client.disputes.provideEvidence(
      disputeId,
      [{ evidence_type: 'OTHER', notes: 'Synthetic evidence' }],
      [],
      opts('evidence'),
    );
    await client.disputes.makeOffer(
      disputeId,
      {
        note: 'Synthetic offer',
        offerType: 'REFUND',
        offerAmount: { currency_code: 'USD', value: '1.00' },
      },
      opts('offer'),
    );
    await client.disputes.acceptClaim(
      disputeId,
      { note: 'Synthetic full refund', acceptClaimType: 'REFUND' },
      opts('accept'),
    );
    await client.disputes.sendMessage(disputeId, 'Synthetic message', opts('message'));
    await client.disputes.sandboxAdjudicate(disputeId, 'SELLER_FAVOR', opts('adjudicate'));
    await client.disputes.sandboxRequireEvidence(disputeId, 'BUYER_EVIDENCE', opts('require'));
    expect(
      await client.webhooks.verify(
        signatureHeaders,
        '{"id":"WH-SYNTHETIC"}',
        'SYNTHETICFULLWEBHOOK',
      ),
    ).toBe(true);
    await client.webhooks.register(
      'https://fairfold.example.invalid/api/webhooks/paypal/merchant',
      ['PAYMENT.CAPTURE.COMPLETED'],
    );
    expect(
      await client.reporting.searchTransactions({
        startDate: '2026-11-08T00:00:00Z',
        endDate: '2026-11-09T00:00:00Z',
      }),
    ).toEqual([]);
    expect(client.carriers.toDisputeCarrier('INDIA_POST')).toEqual({
      carrier_name: 'IN_INDIAPOST',
    });
    expect(f.grants).toBe(1);
    expect(f.calls).toHaveLength(16);
    expect(new Set(f.calls.map((call) => call.bearer))).toEqual(
      new Set(['Bearer SYNTHETIC-FULL-TOKEN-1']),
    );
    expect(f.calls.filter((call) => call.method === 'POST').every((call) => !!call.requestId)).toBe(
      true,
    );
  });
  it('coalesces concurrent grants across different method groups and supports authoritative recovery', async () => {
    const f = fixture();
    const client = await f.forMerchant(DemoSubjects.merchant);
    await Promise.all([
      client.orders.get(orderId),
      client.disputes.get(disputeId),
      client.reporting.searchTransactions({
        startDate: '2026-11-08T00:00:00Z',
        endDate: '2026-11-09T00:00:00Z',
      }),
      client.webhooks.verify(signatureHeaders, '{}', 'SYNTHETICFULLWEBHOOK'),
    ]);
    expect(f.grants).toBe(1);
    expect(await client.readCapture(orderId)).toBeNull();
    expect(f.grants).toBe(1);
  });
  it('keeps merchant tokens isolated even when an older client is reused', async () => {
    const f = fixture();
    const first = await f.forMerchant(DemoSubjects.merchant);
    const second = await f.forMerchant(DemoSubjects.admin);
    await first.orders.get(orderId);
    await second.disputes.get(disputeId);
    await first.orders.get(orderId);
    expect(f.grants).toBe(2);
    expect(f.calls.map((call) => call.bearer)).toEqual([
      'Bearer SYNTHETIC-FULL-TOKEN-1',
      'Bearer SYNTHETIC-FULL-TOKEN-2',
      'Bearer SYNTHETIC-FULL-TOKEN-1',
    ]);
  });
  it('observes credential rotation/removal/simulation across method groups without reusing rejected access', async () => {
    const f = fixture();
    const client = await f.forMerchant(DemoSubjects.merchant);
    await client.orders.get(orderId);
    const credentials = f.credentials.get(DemoSubjects.merchant)!;
    credentials.secretEncrypted = encryptSecret('synthetic-rotated-secret', f.key);
    await client.disputes.get(disputeId);
    expect(f.grants).toBe(2);
    credentials.simulated = true;
    await expect(client.payments.refund(captureId, {}, opts('blocked'))).rejects.toMatchObject({
      code: 'PAYPAL_NOT_CONFIGURED',
    });
    f.credentials.delete(DemoSubjects.merchant);
    await expect(client.orders.get(orderId)).rejects.toMatchObject({
      code: 'PAYPAL_NOT_CONFIGURED',
    });
    expect(f.calls).toHaveLength(2);
  });
  it('rejects invalid merchant IDs and live origins before OAuth', async () => {
    const f = fixture();
    await expect(f.forMerchant('not-a-uuid')).rejects.toMatchObject({
      code: 'INVALID_MERCHANT_ID',
    });
    expect(() =>
      createPayPalClientFactory({ ...f.options, apiBase: 'https://api-m.paypal.com' }),
    ).toThrowError(expect.objectContaining({ code: 'PAYPAL_SANDBOX_REQUIRED' }));
    expect(f.fetcher).not.toHaveBeenCalled();
  });
});
