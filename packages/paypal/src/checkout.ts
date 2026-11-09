import { createOrderOperations, readCapturedOrder } from './orders.js';
import { createMerchantTransportFactory, type PayPalTransportOptions } from './transport.js';
import { type OrderRecording } from './recording.js';

/** A real checkout subset; does not claim the unfinished full ForMerchant contract. */
export function createCheckoutClientFactory(
  options: PayPalTransportOptions & { recording?: OrderRecording },
) {
  const transportFor = createMerchantTransportFactory(options);
  return async (merchantId: string) => {
    const transport = transportFor(merchantId);
    return {
      orders: createOrderOperations(transport, options.recording),
      readCapture: (orderId: string) => readCapturedOrder(transport, orderId, options.recording),
    };
  };
}

export type CheckoutClient = Awaited<ReturnType<ReturnType<typeof createCheckoutClientFactory>>>;
