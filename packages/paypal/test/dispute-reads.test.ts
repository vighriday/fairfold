import { describe, expect, it } from 'vitest';
import { fixedClock } from '@fairfold/contracts';
import { createDisputeReadOperations } from '../src/index.js';
import { operationFixture } from './operation-fixture.js';

// Synthetic only. Does not create/poll/import a real dispute.
const clock = fixedClock('2026-11-09T12:00:00.000Z');
const id = 'PP-D-SYNTHETIC-123';
const href = 'https://api-m.sandbox.paypal.com/v1/customer/disputes';
function page(link?: string) {
  return {
    items: [{ dispute_id: id, status: 'OPEN' }],
    links: link ? [{ rel: 'next', href: link, method: 'GET' }] : [],
  };
}
describe('H2 dispute read bindings', () => {
  it('maps UTC filters, multiple states and source defaults without following vendor links', async () => {
    const f = operationFixture();
    f.respond(page(href + '?page=2&page_size=10'));
    const reads = createDisputeReadOperations(f.transport, clock);
    const result = await reads.list({
      updateTimeAfter: '2026-11-09T12:00:00+05:30',
      disputeState: 'REQUIRED_ACTION,OPEN_INQUIRIES',
    });
    expect(result.nextPageToken).toBe('page:2');
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.url.searchParams.get('update_time_after')).toBe('2026-11-09T06:30:00.000Z');
    expect(f.calls[0]!.url.searchParams.get('dispute_state')).toBe(
      'REQUIRED_ACTION,OPEN_INQUIRIES',
    );
    f.respond(page());
    expect((await reads.list({ nextPageToken: result.nextPageToken! })).nextPageToken).toBeNull();
    expect(f.calls[1]!.url.searchParams.get('page')).toBe('2');
  });
  it('supports the existing legacy token contract, including encoded plus/slash/equals', async () => {
    const f = operationFixture();
    f.respond(page(href + '?next_page_token=abc%2B%2F%3D'));
    const reads = createDisputeReadOperations(f.transport, clock);
    const result = await reads.list({});
    expect(result.nextPageToken).toBe('abc+/=');
    f.respond(page());
    await reads.list({ nextPageToken: result.nextPageToken! });
    expect(f.calls[1]!.url.searchParams.get('next_page_token')).toBe('abc+/=');
  });
  it.each([
    { pageSize: 0 },
    { pageSize: 51 },
    { pageSize: 1.5 },
    { disputeState: 'UNKNOWN' },
    { disputeState: 'RESOLVED,RESOLVED' },
    { startTime: '2026-02-30T00:00:00Z' },
    { updateTimeAfter: '2025-01-01T00:00:00Z' },
    { startTime: '2026-11-10T00:00:00Z' },
    { nextPageToken: 'page:1' },
    { nextPageToken: 'page:2147483648' },
    { nextPageToken: 'https://private.invalid/' },
  ])('rejects invalid search input before OAuth', async (input) => {
    const f = operationFixture();
    await expect(createDisputeReadOperations(f.transport, clock).list(input)).rejects.toMatchObject(
      { code: 'INVALID_PAYPAL_REQUEST' },
    );
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it.each([
    href.replace('sandbox.paypal.com', 'paypal.com') + '?page=2',
    'https://user:pass@api-m.sandbox.paypal.com/v1/customer/disputes?page=2',
    href + '?page=1',
    href + '?page=3',
    href + '?page=2&page=3',
    href + '?page=2&next_page_token=abc',
    href + '?page=2&secret=discard-me',
    href + '/WRONG?page=2',
    href + '?page=2#fragment',
  ])('fails closed on unsafe, conflicting or nonprogressing pagination', async (link) => {
    const f = operationFixture();
    f.respond(page(link));
    await expect(createDisputeReadOperations(f.transport, clock).list({})).rejects.toMatchObject({
      code: 'PAYPAL_INVALID_RESPONSE',
    });
    expect(f.calls).toHaveLength(1);
    expect(JSON.stringify(f.logger.warn.mock.calls)).not.toContain('discard-me');
  });
  it('gets a hyphenated PayPal dispute ID and rejects cross-resource or missing identity', async () => {
    const f = operationFixture();
    const reads = createDisputeReadOperations(f.transport, clock);
    f.respond({ dispute_id: id, status: 'WAITING_FOR_SELLER_RESPONSE', private: 'transient-only' });
    expect(await reads.get(id)).toMatchObject({ dispute_id: id });
    f.respond({ dispute_id: 'WRONG', status: 'OPEN' });
    await expect(reads.get(id)).rejects.toMatchObject({ code: 'PAYPAL_INVALID_RESPONSE' });
    expect(() => reads.get('../escape')).toThrow();
    expect(JSON.stringify(f.logger.warn.mock.calls)).not.toContain('transient-only');
  });
});
