import { PayPalTrackingInputSchema, type PayPalClient } from '@fairfold/contracts';
import { type PayPalTransport } from './transport.js';
import {
  array,
  inputText,
  invalidInput,
  invalidResponse,
  object,
  orderId,
  resourceId,
  responseText,
} from './validation.js';

export function createTrackingOperation(
  transport: PayPalTransport,
): PayPalClient['orders']['addTracking'] {
  return async (id, input, opts) => {
    orderId(id);
    const parsed = PayPalTrackingInputSchema.safeParse(input);
    if (!parsed.success) return invalidInput('tracking');
    const value = parsed.data;
    resourceId(value.captureId, 'capture ID');
    inputText(value.trackingNumber, 'tracking number', 64);
    if (!/^[A-Z0-9_]{1,64}$/.test(value.carrier)) return invalidInput('tracking carrier');
    if (value.carrier !== 'OTHER' && value.carrierNameOther !== undefined)
      return invalidInput('OTHER carrier name');
    const name =
      value.carrier === 'OTHER'
        ? inputText(value.carrierNameOther, 'OTHER carrier name', 64)
        : undefined;
    return transport.requestValidated(
      {
        method: 'POST',
        path: `/v2/checkout/orders/${id}/track`,
        opts,
        // The current tracking operation does not document PayPal-Request-Id idempotency.
        retrySafe: false,
        body: {
          capture_id: value.captureId,
          tracking_number: value.trackingNumber,
          carrier: value.carrier,
          notify_payer: value.notifyPayer,
          ...(name !== undefined ? { carrier_name_other: name } : {}),
        },
      },
      (body) => {
        const order = object(body);
        if (order.id !== id) return invalidResponse();
        const units = array(order.purchase_units);
        if (units.length !== 1) return invalidResponse();
        const trackers = array(object(object(units[0]).shipping).trackers).map(object);
        const trackerIds = trackers.map((tracker) => responseText(tracker.id));
        // Official examples use captureId-trackingNumber. Select an ID actually returned,
        // including when the response also contains older trackers; never invent an ID.
        const matching = trackerIds.filter(
          (trackerId) => trackerId === `${value.captureId}-${value.trackingNumber}`,
        );
        const trackerId =
          matching.length === 1 ? matching[0] : trackerIds.length === 1 ? trackerIds[0] : undefined;
        if (!trackerId) return invalidResponse();
        return { trackerId };
      },
    );
  };
}
