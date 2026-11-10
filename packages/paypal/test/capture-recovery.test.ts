import { describe, expect, it } from 'vitest';
import { readCapturedOrder } from '../src/orders.js';
import { operationFixture } from './operation-fixture.js';

const orderId = 'SYNTHETICRECOVERY';
function response(status = 'COMPLETED') {
  return {
    id: orderId,
    status: 'COMPLETED',
    payment_source: { paypal: { account_id: 'SYNTHETICPAYER', account_status: 'VERIFIED' } },
    purchase_units: [
      {
        reference_id: 'synthetic',
        payments: {
          captures: [
            {
              id: 'SYNTHETICCAPTURE',
              status,
              amount: { currency_code: 'USD', value: '38.00' },
              seller_protection: { status: 'ELIGIBLE', dispute_categories: ['ITEM_NOT_RECEIVED'] },
            },
          ],
        },
      },
    ],
  };
}
describe('authoritative checkout capture recovery', () => {
  it.each(['CREATED', 'SAVED', 'APPROVED', 'PAYER_ACTION_REQUIRED'])(
    'returns no capture for an uncaptured %s order',
    async (status) => {
      const f = operationFixture();
      f.respond({ id: orderId, status, purchase_units: [{ reference_id: 'synthetic' }] });
      expect(await readCapturedOrder(f.transport, orderId)).toBeNull();
      expect(f.calls).toHaveLength(1);
      expect(f.calls[0]!.method).toBe('GET');
      expect(f.calls[0]!.url.searchParams.get('fields')).toBe('payment_source');
    },
  );
  it.each(['COMPLETED', 'PENDING', 'DECLINED'])(
    'returns the actual existing %s capture without a POST',
    async (status) => {
      const f = operationFixture();
      const body = response(status);
      f.respond(body);
      const result = await readCapturedOrder(f.transport, orderId);
      expect(result).toMatchObject({
        orderId,
        captureId: 'SYNTHETICCAPTURE',
        status,
        payerAccountStatus: 'VERIFIED',
      });
      expect(result?.raw).toEqual(body);
      expect(f.calls).toHaveLength(1);
      expect(f.calls[0]!.method).toBe('GET');
    },
  );
  it.each(['completed-without-capture', 'multiple-captures', 'wrong-order', 'multiple-units'])(
    'fails closed for %s without mutation or vendor body diagnostics',
    async (kind) => {
      const f = operationFixture();
      const body = response();
      if (kind === 'completed-without-capture') body.purchase_units[0]!.payments.captures = [];
      if (kind === 'multiple-captures')
        body.purchase_units[0]!.payments.captures.push(
          body.purchase_units[0]!.payments.captures[0]!,
        );
      if (kind === 'wrong-order') body.id = 'DIFFERENT';
      if (kind === 'multiple-units') body.purchase_units.push(body.purchase_units[0]!);
      f.respond(body);
      await expect(readCapturedOrder(f.transport, orderId)).rejects.toMatchObject({
        code: 'PAYPAL_INVALID_RESPONSE',
        outcomeUnknown: false,
      });
      expect(f.calls).toHaveLength(1);
      expect(f.calls[0]!.method).toBe('GET');
      expect(JSON.stringify(f.logger.warn.mock.calls)).not.toContain('purchase_units');
    },
  );
});
