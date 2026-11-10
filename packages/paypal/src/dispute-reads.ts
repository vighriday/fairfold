import { systemClock, type Clock, type PayPalClient } from '@fairfold/contracts';
import { type PayPalTransport, PAYPAL_SANDBOX_API } from './transport.js';
import {
  array,
  inputText,
  invalidInput,
  invalidResponse,
  object,
  responseText,
} from './validation.js';
import { dateTime, disputeId, inputObject } from './dispute-validation.js';

type Reads = Pick<PayPalClient['disputes'], 'list' | 'get'>;
const path = '/v1/customer/disputes';
const states = new Set([
  'REQUIRED_ACTION',
  'REQUIRED_OTHER_PARTY_ACTION',
  'UNDER_PAYPAL_REVIEW',
  'RESOLVED',
  'OPEN_INQUIRIES',
  'APPEALABLE',
]);
function page(value: string): number {
  if (!/^[1-9]\d{0,9}$/.test(value) || Number(value) > 2_147_483_647)
    return invalidInput('dispute page');
  return Number(value);
}
function token(value: string): string {
  inputText(value, 'dispute page token', 255);
  if (!/^[A-Za-z0-9+/=]+$/.test(value)) return invalidInput('dispute page token');
  return value;
}
function nextToken(
  body: Record<string, unknown>,
  query: URLSearchParams,
  currentPage: number,
): string | null {
  const links = body.links === undefined ? [] : array(body.links).map(object);
  const next = links.filter((link) => link.rel === 'next');
  if (next.length > 1) return invalidResponse();
  if (!next.length) return null;
  const link = next[0]!;
  if (link.method !== undefined && link.method !== 'GET') return invalidResponse();
  const url = new URL(responseText(link.href));
  if (
    !['https://api.sandbox.paypal.com', PAYPAL_SANDBOX_API].includes(url.origin) ||
    url.username ||
    url.password ||
    url.hash ||
    url.pathname !== path
  )
    return invalidResponse();
  for (const key of url.searchParams.keys()) {
    if (url.searchParams.getAll(key).length !== 1) return invalidResponse();
    if (
      !['page', 'next_page_token'].includes(key) &&
      (!query.has(key) || query.get(key) !== url.searchParams.get(key))
    )
      return invalidResponse();
  }
  const legacy = url.searchParams.get('next_page_token');
  const numbered = url.searchParams.get('page');
  if (legacy !== null && numbered !== null) return invalidResponse();
  if (legacy !== null) {
    token(legacy);
    if (legacy === query.get('next_page_token')) return invalidResponse();
    return legacy;
  }
  if (numbered === null || page(numbered) !== currentPage + 1) return invalidResponse();
  // Opaque local cursor for the vendor's current page parameter; no shared DTO change.
  return 'page:' + numbered;
}

export function createDisputeReadOperations(
  transport: PayPalTransport,
  clock: Clock = systemClock,
): Reads {
  return {
    async list(input) {
      inputObject(
        input,
        ['startTime', 'updateTimeAfter', 'disputeState', 'pageSize', 'nextPageToken'],
        'dispute search',
      );
      const query = new URLSearchParams();
      const now = clock.now().getTime();
      for (const [field, key] of [
        ['startTime', 'start_time'],
        ['updateTimeAfter', 'update_time_after'],
      ] as const) {
        if (input[field] === undefined) continue;
        const instant = dateTime(input[field]);
        if (instant.getTime() > now || now - instant.getTime() > 180 * 86_400_000)
          return invalidInput('dispute date window');
        query.set(key, instant.toISOString());
      }
      const size = input.pageSize ?? 10;
      if (!Number.isSafeInteger(size) || size < 1 || size > 50)
        return invalidInput('dispute page size');
      query.set('page_size', String(size));
      if (input.disputeState !== undefined) {
        inputText(input.disputeState, 'dispute state', 2000);
        const selected = input.disputeState.split(',');
        if (
          !selected.every((state) => states.has(state)) ||
          new Set(selected).size !== selected.length
        )
          return invalidInput('dispute state');
        query.set('dispute_state', selected.join(','));
      }
      let currentPage = 1;
      if (input.nextPageToken !== undefined) {
        inputText(input.nextPageToken, 'dispute cursor', 255);
        if (input.nextPageToken.startsWith('page:')) {
          currentPage = page(input.nextPageToken.slice(5));
          if (currentPage < 2) return invalidInput('dispute cursor');
          query.set('page', String(currentPage));
        } else query.set('next_page_token', token(input.nextPageToken));
      }
      return transport.requestValidated({ method: 'GET', path: path + '?' + query }, (body) => {
        const response = object(body);
        const items = array(response.items).map((item) => {
          const row = object(item);
          disputeId(responseText(row.dispute_id));
          return row;
        });
        if (items.length > size) return invalidResponse();
        return { items, nextPageToken: nextToken(response, query, currentPage) };
      });
    },
    get(id) {
      disputeId(id);
      return transport.requestValidated({ method: 'GET', path: path + '/' + id }, (body) => {
        const dispute = object(body);
        if (dispute.dispute_id !== id) return invalidResponse();
        responseText(dispute.status);
        return dispute;
      });
    },
  };
}
