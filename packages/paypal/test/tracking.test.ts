import { describe, expect, it } from 'vitest';
import { type PayPalClient } from '@fairfold/contracts';
import { carriers, createOrderOperations } from '../src/index.js';
import { operationFixture } from './operation-fixture.js';

// Synthetic shipment data only; no tracking notification is sent by these tests.
const id = 'SYNTHETICORDER2026';
const opts = { requestId: 'ff-track-synthetic-order' };
function input() {
  return {
    captureId: 'SYNTHETICCAPTURE',
    trackingNumber: 'SYNTHETICTRACKING',
    carrier: 'DHL',
    notifyPayer: true,
  };
}
function tracked(trackerIds = ['SYNTHETICCAPTURE-SYNTHETICTRACKING']) {
  return { id, purchase_units: [{ shipping: { trackers: trackerIds.map((id) => ({ id })) } }] };
}

describe('H2 tracking and dispute-carrier bindings', () => {
  it('completes the exact Orders contract and sends the flat tracking body with payer notification', async () => {
    const f = operationFixture();
    f.respond(tracked(), 201);
    const orders: PayPalClient['orders'] = createOrderOperations(f.transport);
    await expect(orders.addTracking(id, input(), opts)).resolves.toEqual({
      trackerId: 'SYNTHETICCAPTURE-SYNTHETICTRACKING',
    });
    expect(f.calls[0]!.url.pathname).toBe(`/v2/checkout/orders/${id}/track`);
    expect(f.calls[0]!.headers.get('paypal-request-id')).toBe(opts.requestId);
    expect(f.calls[0]!.body).toEqual({
      capture_id: 'SYNTHETICCAPTURE',
      tracking_number: 'SYNTHETICTRACKING',
      carrier: 'DHL',
      notify_payer: true,
    });
  });

  it('preserves an explicitly named OTHER carrier and false notification choice', async () => {
    const f = operationFixture();
    f.respond(tracked(['OPAQUETRACKER']));
    await expect(
      createOrderOperations(f.transport).addTracking(
        id,
        { ...input(), carrier: 'OTHER', carrierNameOther: 'Synthetic courier', notifyPayer: false },
        opts,
      ),
    ).resolves.toEqual({ trackerId: 'OPAQUETRACKER' });
    expect(f.calls[0]!.body).toMatchObject({
      carrier: 'OTHER',
      carrier_name_other: 'Synthetic courier',
      notify_payer: false,
    });
    expect(carriers.toDisputeCarrier('Synthetic courier')).toEqual({
      carrier_name: 'OTHER',
      carrier_name_other: 'Synthetic courier',
    });
  });

  it.each([
    ['DHL', 'DHL'],
    ['FedEx', 'FEDEX'],
    ['UPS', 'UPS'],
    ['INDIA_POST', 'IN_INDIAPOST'],
    ['India Post', 'IN_INDIAPOST'],
    ['IND_DELHIVERY', 'IND_DELHIVERY'],
    ['Delhivery', 'IND_DELHIVERY'],
    ['Blue Dart', 'BLUEDART'],
  ])('maps source carrier %s to dispute carrier %s', (tracking, evidence) => {
    expect(carriers.toDisputeCarrier(tracking!)).toEqual({ carrier_name: evidence });
  });

  it.each(['', 'OTHER', 'other', 'synthetic\ncarrier', 'x'.repeat(2001)])(
    'refuses a missing/unsafe OTHER identity: %s',
    (carrier) => {
      expect(() => carriers.toDisputeCarrier(carrier)).toThrow();
    },
  );

  it.each(['capture', 'tracking', 'carrier', 'missingOther', 'unexpectedOther', 'longOther'])(
    'rejects invalid %s tracking input before any HTTP call',
    async (failure) => {
      const f = operationFixture();
      const value: Parameters<PayPalClient['orders']['addTracking']>[1] = input();
      if (failure === 'capture') value.captureId = 'SEED-CAPTURE';
      if (failure === 'tracking') value.trackingNumber = 'x'.repeat(65);
      if (failure === 'carrier') value.carrier = 'invalid carrier';
      if (failure === 'missingOther') value.carrier = 'OTHER';
      if (failure === 'unexpectedOther') value.carrierNameOther = 'Synthetic';
      if (failure === 'longOther') {
        value.carrier = 'OTHER';
        value.carrierNameOther = 'x'.repeat(65);
      }
      await expect(
        createOrderOperations(f.transport).addTracking(id, value, opts),
      ).rejects.toMatchObject({ code: 'INVALID_PAYPAL_REQUEST' });
      expect(f.fetcher).not.toHaveBeenCalled();
    },
  );

  it('selects the matching returned tracker rather than an older first tracker', async () => {
    const f = operationFixture();
    f.respond(tracked(['OLDERTRACKER', 'SYNTHETICCAPTURE-SYNTHETICTRACKING']));
    await expect(
      createOrderOperations(f.transport).addTracking(id, input(), opts),
    ).resolves.toEqual({ trackerId: 'SYNTHETICCAPTURE-SYNTHETICTRACKING' });
  });

  it.each(['missing', 'ambiguous', 'empty', 'wrongOrder'])(
    'refuses %s tracking responses without inventing a tracker ID',
    async (failure) => {
      const f = operationFixture();
      const response =
        failure === 'missing'
          ? { id, purchase_units: [] }
          : failure === 'ambiguous'
            ? tracked(['FIRSTOPAQUE', 'SECONDOPAQUE'])
            : failure === 'empty'
              ? tracked([''])
              : { ...tracked(), id: 'DIFFERENTORDER' };
      f.respond(response);
      await expect(
        createOrderOperations(f.transport).addTracking(id, input(), opts),
      ).rejects.toMatchObject({ code: 'PAYPAL_INVALID_RESPONSE', outcomeUnknown: true });
      expect(f.calls).toHaveLength(1);
    },
  );

  it('does not replay tracking on 5xx while retaining the request ID and ambiguous outcome', async () => {
    const f = operationFixture();
    f.respond({ name: 'INTERNAL_SERVER_ERROR' }, 500);
    await expect(
      createOrderOperations(f.transport).addTracking(id, input(), opts),
    ).rejects.toMatchObject({ upstreamStatus: 500, outcomeUnknown: true });
    expect(f.calls).toHaveLength(1);
    expect(f.sleep).not.toHaveBeenCalled();
    expect(f.calls[0]!.headers.get('paypal-request-id')).toBe(opts.requestId);
  });

  it('retries a 429 rejection with unchanged tracking data and request ID', async () => {
    const f = operationFixture();
    f.respond({ name: 'RATE_LIMIT_REACHED' }, 429);
    f.respond(tracked());
    await createOrderOperations(f.transport).addTracking(id, input(), opts);
    expect(f.calls).toHaveLength(2);
    expect(f.calls[1]!.body).toEqual(f.calls[0]!.body);
    expect(f.calls[1]!.headers.get('paypal-request-id')).toBe(opts.requestId);
  });
});
