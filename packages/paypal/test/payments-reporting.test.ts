import { describe, expect, it } from 'vitest';
import { createPaymentOperations, createReportingOperations } from '../src/index.js';
import { operationFixture } from './operation-fixture.js';

// Synthetic refund/reporting responses only. No refund or real history request is made.
const captureId = 'SYNTHETICCAPTURE';
const opts = { requestId: 'ff-refund-synthetic-order-action' };
const dates = { startDate: '2026-10-01T00:00:00Z', endDate: '2026-11-01T00:00:00Z' };
function row() {
  return { transaction_info: { transaction_id: 'SYNTHETICTXN000001', transaction_status: 'S' } };
}
function page(index = 1, total = 1) {
  return {
    page: index,
    total_items: total,
    total_pages: Math.ceil(total / 500),
    transaction_details: Array.from(
      { length: Math.min(500, Math.max(0, total - (index - 1) * 500)) },
      row,
    ),
  };
}

describe('H2 refund binding', () => {
  it('sends an empty object for full refund and preserves an actual pending status', async () => {
    const f = operationFixture();
    f.respond({ id: 'SYNTHETICREFUND', status: 'PENDING' }, 201);
    await expect(createPaymentOperations(f.transport).refund(captureId, {}, opts)).resolves.toEqual(
      { refundId: 'SYNTHETICREFUND', status: 'PENDING' },
    );
    expect(f.calls[0]!.url.pathname).toBe(`/v2/payments/captures/${captureId}/refund`);
    expect(f.calls[0]!.body).toEqual({});
    expect(f.calls[0]!.headers.get('paypal-request-id')).toBe(opts.requestId);
  });

  it('maps an exact partial amount, note and invoice with the same body/request ID on a documented retry', async () => {
    const f = operationFixture();
    f.respond({ name: 'INTERNAL_SERVER_ERROR' }, 503);
    f.respond({ id: 'SYNTHETICREFUND', status: 'COMPLETED' });
    await createPaymentOperations(f.transport).refund(
      captureId,
      {
        amount: { currency_code: 'USD', value: '12.1' },
        noteToPayer: 'Synthetic approved refund note',
        invoiceId: 'SYNTHETIC-INVOICE',
      },
      opts,
    );
    expect(f.calls).toHaveLength(2);
    expect(f.calls[0]!.body).toEqual({
      amount: { currency_code: 'USD', value: '12.10' },
      note_to_payer: 'Synthetic approved refund note',
      invoice_id: 'SYNTHETIC-INVOICE',
    });
    expect(f.calls[1]!.body).toEqual(f.calls[0]!.body);
    expect(f.calls[1]!.headers.get('paypal-request-id')).toBe(opts.requestId);
  });

  it.each(['zero', 'negative', 'precision', 'note', 'invoice', 'capture'])(
    'rejects invalid %s refund input before HTTP',
    async (failure) => {
      const f = operationFixture();
      const amount = {
        currency_code: failure === 'precision' ? 'JPY' : 'USD',
        value:
          failure === 'zero'
            ? '0.00'
            : failure === 'negative'
              ? '-1.00'
              : failure === 'precision'
                ? '1.01'
                : '1.00',
      };
      await expect(
        createPaymentOperations(f.transport).refund(
          failure === 'capture' ? 'SEED-CAPTURE' : captureId,
          {
            amount,
            ...(failure === 'note' ? { noteToPayer: 'x'.repeat(256) } : {}),
            ...(failure === 'invoice' ? { invoiceId: 'x'.repeat(128) } : {}),
          },
          opts,
        ),
      ).rejects.toMatchObject({ code: 'INVALID_PAYPAL_REQUEST' });
      expect(f.fetcher).not.toHaveBeenCalled();
    },
  );

  it('treats a malformed refund success as ambiguous and excludes private vendor text from errors', async () => {
    const f = operationFixture();
    f.respond({ id: '', status: 'COMPLETED', note_to_payer: 'SYNTHETIC PRIVATE NOTE' }, 201);
    const error = await createPaymentOperations(f.transport)
      .refund(captureId, {}, opts)
      .catch((error: unknown) => error);
    expect(error).toMatchObject({
      code: 'PAYPAL_INVALID_RESPONSE',
      outcomeUnknown: true,
      debugId: 'synthetic-operation-debug',
    });
    expect(f.calls).toHaveLength(1);
    expect(JSON.stringify([error, f.logger.warn.mock.calls])).not.toContain(
      'SYNTHETIC PRIVATE NOTE',
    );
  });
});

describe('H2 bounded Transaction Search binding', () => {
  it('uses fields=all and fixed local pagination, preserving duplicate transaction IDs and ignoring vendor next links', async () => {
    const f = operationFixture();
    f.respond({
      ...page(1, 501),
      links: [{ rel: 'next', href: 'https://untrusted.example/history' }],
    });
    f.respond(page(2, 501));
    const results = await createReportingOperations(f.transport).searchTransactions({
      ...dates,
      transactionId: 'SYNTHETICTXN000001',
    });
    expect(results).toHaveLength(501);
    expect(results.every((value) => JSON.stringify(value) === JSON.stringify(row()))).toBe(true);
    expect(f.calls).toHaveLength(2);
    for (const [index, call] of f.calls.entries()) {
      expect(call.url.pathname).toBe('/v1/reporting/transactions');
      expect(call.url.searchParams.get('fields')).toBe('all');
      expect(call.url.searchParams.get('page_size')).toBe('500');
      expect(call.url.searchParams.get('page')).toBe(String(index + 1));
      expect(call.url.searchParams.get('transaction_id')).toBe('SYNTHETICTXN000001');
      expect(call.url.searchParams.get('start_date')).toBe('2026-10-01T00:00:00.000Z');
    }
  });

  it('normalizes explicit timezone offsets and accepts an empty result with zero pagination', async () => {
    const f = operationFixture();
    f.respond({ page: 0, total_items: 0, total_pages: 0, transaction_details: [] });
    await expect(
      createReportingOperations(f.transport).searchTransactions({
        startDate: '2026-10-01T05:30:00+05:30',
        endDate: '2026-10-02T05:30:00+05:30',
      }),
    ).resolves.toEqual([]);
    expect(f.calls[0]!.url.searchParams.get('start_date')).toBe('2026-10-01T00:00:00.000Z');
    expect(f.calls[0]!.url.searchParams.get('end_date')).toBe('2026-10-02T00:00:00.000Z');
  });

  it.each(['long', 'equal', 'reversed', 'calendar', 'timezone', 'fraction', 'transaction'])(
    'rejects an invalid %s reporting request before credentials/HTTP',
    async (failure) => {
      const f = operationFixture();
      const input = {
        ...dates,
        ...(failure === 'long' ? { endDate: '2026-11-01T00:00:00.001Z' } : {}),
        ...(failure === 'equal' ? { endDate: dates.startDate } : {}),
        ...(failure === 'reversed' ? { startDate: dates.endDate, endDate: dates.startDate } : {}),
        ...(failure === 'calendar' ? { startDate: '2026-02-30T00:00:00Z' } : {}),
        ...(failure === 'timezone' ? { startDate: '2026-10-01T00:00:00' } : {}),
        ...(failure === 'fraction' ? { startDate: '2026-10-01T00:00:00.0001Z' } : {}),
        ...(failure === 'transaction' ? { transactionId: 'SEED-TRANSACTION' } : {}),
      };
      await expect(
        createReportingOperations(f.transport).searchTransactions(input),
      ).rejects.toMatchObject({ code: 'INVALID_PAYPAL_REQUEST' });
      expect(f.fetcher).not.toHaveBeenCalled();
    },
  );

  it.each(['page', 'total', 'pages', 'short', 'rows'])(
    'refuses inconsistent %s metadata instead of returning incomplete history',
    async (failure) => {
      const f = operationFixture();
      const response = page();
      if (failure === 'page') response.page = 2;
      if (failure === 'total') response.total_items = -1;
      if (failure === 'pages') response.total_pages = 2;
      if (failure === 'short') response.transaction_details = [];
      f.respond(failure === 'rows' ? { ...response, transaction_details: [null] } : response);
      await expect(
        createReportingOperations(f.transport).searchTransactions(dates),
      ).rejects.toMatchObject({ code: 'PAYPAL_INVALID_RESPONSE', outcomeUnknown: false });
      expect(f.calls).toHaveLength(1);
    },
  );

  it('rejects changing pagination totals and later-page failures without returning the earlier partial data', async () => {
    const f = operationFixture();
    f.respond(page(1, 501));
    f.respond(page(2, 502));
    await expect(
      createReportingOperations(f.transport).searchTransactions(dates),
    ).rejects.toMatchObject({ code: 'PAYPAL_INVALID_RESPONSE' });
    const failed = operationFixture();
    failed.respond(page(1, 501));
    failed.respond({ name: 'NOT_AUTHORIZED' }, 403);
    await expect(
      createReportingOperations(failed.transport).searchTransactions(dates),
    ).rejects.toMatchObject({ upstreamStatus: 403 });
  });

  it('fails explicitly at the local page budget instead of silently truncating the result', async () => {
    const f = operationFixture();
    f.respond(page(1, 50_001));
    await expect(
      createReportingOperations(f.transport).searchTransactions(dates),
    ).rejects.toMatchObject({ code: 'PAYPAL_REPORTING_PAGE_LIMIT' });
    expect(f.calls).toHaveLength(1);
  });
});
