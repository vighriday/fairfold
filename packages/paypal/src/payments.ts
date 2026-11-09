import { type PayPalClient } from '@fairfold/contracts';
import { formatMoney, moneyMinor } from './money.js';
import { type PayPalTransport } from './transport.js';
import {
  inputText,
  invalidInput,
  invalidResponse,
  object,
  resourceId,
  responseText,
} from './validation.js';

export function createPaymentOperations(transport: PayPalTransport): PayPalClient['payments'] {
  return {
    async refund(captureId, input, opts) {
      resourceId(captureId, 'capture ID');
      if (!input || typeof input !== 'object' || Array.isArray(input))
        return invalidInput('refund');
      const body: Record<string, unknown> = {};
      if (input.amount !== undefined) {
        const minor = moneyMinor(input.amount);
        if (minor === 0n) return invalidInput('positive refund amount');
        body.amount = formatMoney(input.amount.currency_code, minor);
      }
      if (input.noteToPayer !== undefined)
        body.note_to_payer = inputText(input.noteToPayer, 'refund note', 255);
      if (input.invoiceId !== undefined)
        body.invoice_id = inputText(input.invoiceId, 'refund invoice ID', 127);
      return transport.requestValidated(
        {
          method: 'POST',
          path: `/v2/payments/captures/${captureId}/refund`,
          body,
          opts,
          retrySafe: true,
        },
        (response) => {
          const refund = object(response);
          const refundId = responseText(refund.id);
          if (!/^[A-Za-z0-9]{1,50}$/.test(refundId)) return invalidResponse();
          return { refundId, status: responseText(refund.status) };
        },
      );
    },
  };
}
