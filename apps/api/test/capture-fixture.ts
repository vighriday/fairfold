// Synthetic input only; never a recorded PayPal response.
import { type CaptureResult } from '@fairfold/contracts';

export function captureFixture(): CaptureResult {
  return {
    orderId: 'SYNTHETICORDER',
    captureId: 'SYNTHETICCAPTURE',
    status: 'COMPLETED',
    sellerProtection: { status: 'ELIGIBLE', disputeCategories: ['ITEM_NOT_RECEIVED'] },
    payerAccountStatus: 'VERIFIED',
    payerId: 'SYNTHETICPAYER',
    payerEmail: '  MA\u0301YA@example.invalid  ',
    payerName: 'Synthetic Buyer',
    shipping: { fullName: 'Excluded Recipient', address: { address_line_1: 'Ignored DTO street' } },
    raw: {
      id: 'SYNTHETICORDER',
      phone: 'excluded-phone',
      purchase_units: [
        {
          reference_id: 'synthetic-reference',
          custom_id: 'synthetic-store',
          invoice_id: 'synthetic-invoice',
          shipping: {
            name: { full_name: 'Excluded Recipient' },
            address: {
              address_line_1: '  10  Cafe\u0301\tRoad ',
              address_line_2: ' Suite\n 2 ',
              admin_area_2: ' Test  City ',
              admin_area_1: 'Region',
              postal_code: ' Ab  12 ',
              country_code: ' us ',
              phone: 'excluded-address-extra',
            },
          },
          payments: {
            captures: [
              {
                id: 'SYNTHETICCAPTURE',
                status: 'COMPLETED',
                amount: { currency_code: 'USD', value: '38.00' },
                private_extra: 'excluded-capture-extra',
              },
            ],
          },
        },
      ],
    },
  };
}

export function rawUnit(result: CaptureResult) {
  return (result.raw as { purchase_units: Array<Record<string, unknown>> }).purchase_units[0]!;
}
