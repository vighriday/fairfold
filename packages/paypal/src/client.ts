import { type CaptureResult, type ForMerchant, type PayPalClient } from '@fairfold/contracts';
import { createMerchantTransportFactory, type PayPalTransportOptions } from './transport.js';
import { type OrderRecording } from './recording.js';
import { createOrderOperations, readCapturedOrder } from './orders.js';
import { createPaymentOperations } from './payments.js';
import { createReportingOperations } from './reporting.js';
import { createDisputeReadOperations } from './dispute-reads.js';
import { createDisputeActionOperations } from './dispute-actions.js';
import { createWebhookOperations } from './webhooks.js';
import { carriers } from './carriers.js';

export interface PayPalMerchantClient extends PayPalClient {
  /** Private checkout recovery helper, in addition to the unchanged shared contract. */
  readCapture(orderId: string): Promise<CaptureResult | null>;
}
export type PayPalClientOptions = PayPalTransportOptions & { recording?: OrderRecording };

/** All shared operations, sharing one per-merchant credential-version token cache. */
export function createPayPalClientFactory(options: PayPalClientOptions) {
  const transportFor = createMerchantTransportFactory(options);
  const forMerchant = async (merchantId: string): Promise<PayPalMerchantClient> => {
    const transport = transportFor(merchantId);
    return {
      orders: createOrderOperations(transport, options.recording),
      payments: createPaymentOperations(transport),
      reporting: createReportingOperations(transport),
      carriers,
      disputes: {
        ...createDisputeReadOperations(transport, options.clock),
        ...createDisputeActionOperations(transport),
      },
      webhooks: createWebhookOperations(transport),
      readCapture: (orderId) => readCapturedOrder(transport, orderId, options.recording),
    };
  };
  return forMerchant satisfies ForMerchant;
}
