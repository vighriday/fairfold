import { describe, expect, it } from 'vitest';
import { CaptureResultSchema } from '@fairfold/contracts';
import { createOrderOperations, type PayPalTransport } from '../src/index.js';
import { readCapturedOrder } from '../src/orders.js';
import { readSandboxRecords } from '../../../scripts/support/sandbox-recordings.js';

// No synthetic fallback. These tests stay explicitly skipped until actual sanitized recordings exist.
const records = readSandboxRecords();
describe.skipIf(records.length === 0)('recorded sandbox response parser acceptance', () => {
  it('has a matching observed create and completed capture POST for at least one real order', () => {
    const creates = records.filter((record) => record.operation === 'create');
    const captures = records.filter((record) => {
      if (record.operation !== 'capture') return false;
      const units = record.body.purchase_units as Array<{
        payments: { captures: Array<{ status: string }> };
      }>;
      return units[0]!.payments.captures[0]!.status === 'COMPLETED';
    });
    expect(creates.length).toBeGreaterThan(0);
    expect(
      captures.some((record) => creates.some((created) => created.body.id === record.body.id)),
    ).toBe(true);
  });
  it.each(records)(
    'parses the sanitized $operation response using actual operation bindings',
    async (record) => {
      const transport: PayPalTransport = {
        request: async () => record.body,
        requestValidated: async (_input, parse) => parse(record.body),
      };
      const client = createOrderOperations(transport);
      const id = String(record.body.id);
      if (record.operation === 'create') {
        const result = await client.create(
          {
            referenceId: 'parser-only',
            customId: 'parser-only',
            invoiceId: 'parser-only',
            items: [
              {
                name: 'Parser only',
                sku: 'parser-only',
                quantity: 1,
                unitAmount: { currency_code: 'USD', value: '38.00' },
              },
            ],
          },
          { requestId: 'parser-only-no-network' },
        );
        expect(result.id).toBe(id);
        expect(new URL(result.approveUrl).hostname).toMatch(/(^|\.)sandbox\.paypal\.com$/);
      } else {
        const capture =
          record.operation === 'capture'
            ? await client.capture(id, { requestId: 'parser-only-no-network' })
            : await readCapturedOrder(transport, id);
        expect(CaptureResultSchema.safeParse(capture).success).toBe(true);
        expect(capture?.orderId).toBe(id);
      }
    },
  );
});
