import {
  createPayPalClientFactory,
  type PayPalClientOptions,
  type PayPalMerchantClient,
} from './client.js';

/** Compatibility projection for existing checkout callers; composition lives in the full client. */
export function createCheckoutClientFactory(options: PayPalClientOptions) {
  const forMerchant = createPayPalClientFactory(options);
  return async (merchantId: string) => {
    const client = await forMerchant(merchantId);
    return { orders: client.orders, readCapture: client.readCapture };
  };
}

export type CheckoutClient = Pick<PayPalMerchantClient, 'orders' | 'readCapture'>;
