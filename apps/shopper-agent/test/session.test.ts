import { describe, expect, it, vi } from 'vitest';
import { runShopperSession } from '../src/session.js';

describe('terminal shopper approval boundaries', () => {
  const merchantId = '00000000-0000-4000-8000-000000000001';
  function setup(band: 'standard' | 'verified') {
    const checkout = {
      createOrder: vi.fn(async () => ({ orderId: 'SYNTHETIC', approvalUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=SYNTHETIC' })),
      capture: vi.fn(async () => ({ status: 'COMPLETED' })),
    };
    const tools = vi.fn(async (name: string) => name === 'search_catalog' ? [{
      merchantId, sku: 'HOODIE', name: 'Hoodie', price: { currency_code: 'USD', value: '40.00' }, storeBand: band,
    }] : { merchantId, band, facts: { domain: 'synthetic.example', domainRegisteredAt: null, policies: [] },
      fulfilment: { ordersSealed90d: 2, medianHoursCaptureToSeal: 4, pctTrackingWithin72h: 1,
        pctWithPackingEvidence: 1, disputeRate90d: 0, proactiveFixes90d: 1, unansweredNotReceived: 0 },
      reviews: { count: 0, average: null, themes: [] }, sources: [], computedAt: '2026-11-11T00:00:00.000Z' });
    return { checkout, tools, request: { query: 'hoodie', maxPrice: '45.00' }, onApprovalLink: vi.fn() };
  }
  it('does not create an order when store confirmation is declined', async () => {
    const options = setup('standard');
    const run = await runShopperSession({ ...options, confirm: async () => false });
    expect(run.status).toBe('awaiting_store_confirmation');
    expect(options.checkout.createOrder).not.toHaveBeenCalled();
  });
  it('does not capture until the separate PayPal confirmation', async () => {
    const options = setup('verified');
    const run = await runShopperSession({ ...options, confirm: async () => false });
    expect(run.status).toBe('awaiting_paypal_approval');
    expect(options.onApprovalLink).toHaveBeenCalledOnce();
    expect(options.checkout.capture).not.toHaveBeenCalled();
  });
});
