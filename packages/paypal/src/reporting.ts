import { AppError, type PayPalClient } from '@fairfold/contracts';
import { type PayPalTransport } from './transport.js';
import {
  array,
  inputText,
  invalidInput,
  invalidResponse,
  object,
  resourceId,
} from './validation.js';

const pageSize = 500;
const maximumPages = 100; // Local guard: fail explicitly and request a narrower date window.
const maximumWindow = 31 * 24 * 60 * 60 * 1000;

function instant(input: string): Date {
  inputText(input, 'reporting date', 64);
  const match =
    /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(
      input,
    );
  if (!match) return invalidInput('reporting date');
  const calendar = new Date(match[1] + 'T00:00:00Z');
  const result = new Date(input);
  if (
    !Number.isFinite(calendar.getTime()) ||
    calendar.toISOString().slice(0, 10) !== match[1] ||
    !Number.isFinite(result.getTime())
  )
    return invalidInput('reporting date');
  return result;
}

function integer(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 2_147_483_647
  )
    return invalidResponse();
  return value;
}

interface Page {
  page: number;
  pages: number;
  total: number;
  rows: Record<string, unknown>[];
}

function parsePage(body: unknown, expectedPage: number): Page {
  const response = object(body);
  const page = integer(response.page);
  const pages = integer(response.total_pages);
  const total = integer(response.total_items);
  const rows = array(response.transaction_details).map(object);
  if (total === 0) {
    if (expectedPage !== 1 || ![0, 1].includes(page) || ![0, 1].includes(pages) || rows.length)
      return invalidResponse();
  } else if (
    page !== expectedPage ||
    pages !== Math.ceil(total / pageSize) ||
    page > pages ||
    rows.length !== Math.min(pageSize, total - (page - 1) * pageSize)
  )
    return invalidResponse();
  return { page, pages, total, rows };
}

export function createReportingOperations(transport: PayPalTransport): PayPalClient['reporting'] {
  return {
    async searchTransactions(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input))
        return invalidInput('reporting request');
      const start = instant(input.startDate);
      const end = instant(input.endDate);
      const span = end.getTime() - start.getTime();
      if (span <= 0 || span > maximumWindow)
        return invalidInput('reporting window (maximum 31 days)');
      if (input.transactionId !== undefined) {
        resourceId(input.transactionId, 'transaction ID', 19);
        if (input.transactionId.length < 17) return invalidInput('transaction ID');
      }
      const params = new URLSearchParams({
        start_date: start.toISOString(),
        end_date: end.toISOString(),
        fields: 'all',
        page_size: pageSize.toString(),
        ...(input.transactionId !== undefined ? { transaction_id: input.transactionId } : {}),
      });
      let expectedPages = 1;
      let expectedTotal: number | undefined;
      const results: unknown[] = [];
      for (let page = 1; page <= expectedPages; page++) {
        params.set('page', page.toString());
        const result = await transport.requestValidated(
          {
            method: 'GET',
            path: '/v1/reporting/transactions?' + params.toString(),
          },
          (body) => {
            const parsed = parsePage(body, page);
            if (
              expectedTotal !== undefined &&
              (parsed.total !== expectedTotal || parsed.pages !== expectedPages)
            )
              return invalidResponse();
            return parsed;
          },
        );
        if (result.pages > maximumPages)
          throw new AppError(
            'PAYPAL_REPORTING_PAGE_LIMIT',
            'Use a narrower reporting date window',
            502,
          );
        expectedPages = result.pages;
        expectedTotal = result.total;
        results.push(...result.rows);
      }
      // Keep every row. PayPal documents that a transaction ID need not be unique here.
      return results;
    },
  };
}
