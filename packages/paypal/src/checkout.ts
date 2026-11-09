import { createOrderOperations, readCapturedOrder } from './orders.js';
import { createMerchantTransportFactory, type PayPalTransportOptions } from './transport.js';

/** A real checkout subset; does not claim the unfinished full ForMerchant contract. */
export function createCheckoutClientFactory(options: PayPalTransportOptions) {
  const transportFor = createMerchantTransportFactory(options);
  return async (merchantId: string) => {
    const transport = transportFor(merchantId);
    return {
      orders: createOrderOperations(transport),
      readCapture: (orderId: string) => readCapturedOrder(transport, orderId),
    };
  };
}

export type CheckoutClient = Awaited<ReturnType<ReturnType<typeof createCheckoutClientFactory>>>;
