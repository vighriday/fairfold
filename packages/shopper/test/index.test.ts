import { describe, expect, it, vi } from 'vitest';
import { beginShopperRun, completeShopperRun, sanitizeTranscript } from '../src/index.js';

const item = (merchantId: string, storeBand: 'verified' | 'standard' | 'caution') => ({
  merchantId,
  sku: 'NAVY-HOODIE',
  name: 'Navy hoodie',
  price: { currency_code: 'USD', value: '40.00' },
  storeBand,
});
const report = (merchantId: string, band: 'verified' | 'standard' | 'caution') => ({
  merchantId,
  band,
  facts: { domain: `${merchantId}.example`, domainRegisteredAt: null, policies: [] },
  fulfilment: {
    ordersSealed90d: 2,
    medianHoursCaptureToSeal: 4,
    pctTrackingWithin72h: 1,
    pctWithPackingEvidence: 1,
    disputeRate90d: 0,
    proactiveFixes90d: 1,
    unansweredNotReceived: 0,
  },
  reviews: { count: 0, average: null, themes: [] },
  sources: [],
  computedAt: '2026-11-10T00:00:00.000Z',
});

describe('shopper policy loop', () => {
  it('skips caution stores and pauses before PayPal approval', async () => {
    const createOrder = vi.fn(async () => ({
      orderId: 'order-1',
      approvalUrl: 'https://paypal.test/approve',
    }));
    const run = await beginShopperRun(
      async (name, args) =>
        name === 'search_catalog'
          ? [
              item('00000000-0000-4000-8000-000000000001', 'caution'),
              item('00000000-0000-4000-8000-000000000002', 'verified'),
            ]
          : report(
              args.merchantId!,
              args.merchantId === '00000000-0000-4000-8000-000000000002' ? 'verified' : 'caution',
            ),
      { createOrder, capture: vi.fn() },
      { query: 'navy hoodie', maxPrice: '45.00' },
    );
    expect(run.status).toBe('awaiting_paypal_approval');
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: '00000000-0000-4000-8000-000000000002',
        context: { sandbox: true },
      }),
    );
    expect(run.transcript).toContainEqual({
      type: 'skip_store',
      merchantId: '00000000-0000-4000-8000-000000000001',
      reason: 'caution',
    });
  });

  it('requires explicit human approval and passes sandbox context to capture', async () => {
    const capture = vi.fn(async () => ({ status: 'captured' }));
    const run = {
      status: 'awaiting_paypal_approval' as const,
      orderId: 'order-1',
      approvalUrl: 'https://paypal.test/approve',
      merchantId: '00000000-0000-4000-8000-000000000002',
      item: item('00000000-0000-4000-8000-000000000002', 'verified'),
      transcript: [],
    };
    await expect(completeShopperRun({ createOrder: vi.fn(), capture }, run, [])).rejects.toThrow(
      'Human PayPal approval is required',
    );
    const complete = await completeShopperRun({ createOrder: vi.fn(), capture }, run, [
      'paypal-approved',
    ]);
    expect(capture).toHaveBeenCalledWith({ orderId: 'order-1', context: { sandbox: true } });
    expect(complete.status).toBe('captured');
    expect(sanitizeTranscript(complete.transcript)).toEqual(complete.transcript);
  });
});
