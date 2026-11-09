import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { type ForMerchant, type PayPalClient } from '@fairfold/contracts';
import { createDisputesPoller } from '../src/disputes-poll.js';

function fixture() {
  let now = new Date('2026-11-10T03:04:05.006Z');
  const list = vi.fn<PayPalClient['disputes']['list']>(async () => ({
    items: [],
    nextPageToken: null,
  }));
  const syncDispute = vi.fn(async (_input: { merchantId: string; disputeId: string }) => {});
  const isRealMerchant = vi.fn(async () => true);
  const forMerchant = vi.fn(async () => ({ disputes: { list } })) as unknown as ForMerchant;
  const options = { forMerchant, syncDispute, isRealMerchant, clock: { now: () => new Date(now) } };
  return {
    list,
    syncDispute,
    isRealMerchant,
    options,
    poll: createDisputesPoller(options),
    merchantId: randomUUID(),
    advance: () => {
      now = new Date(now.getTime() + 60_000);
    },
  };
}
describe('H3 bounded dispute reconciliation (synthetic)', () => {
  it('uses updateTimeAfter, all pages and the same merchant/filters, passing IDs only to H4', async () => {
    const f = fixture();
    f.list.mockResolvedValueOnce({
      items: [{ dispute_id: 'PP-D-ONE', message: 'Excluded' }],
      nextPageToken: 'page:2',
    });
    f.list.mockResolvedValueOnce({ items: [{ id: 'PP-D-TWO' }], nextPageToken: null });
    await f.poll({ merchantId: f.merchantId });
    expect(f.list.mock.calls[1]![0]).toEqual({
      ...f.list.mock.calls[0]![0],
      nextPageToken: 'page:2',
    });
    expect(f.list.mock.calls[0]![0]).toEqual({
      updateTimeAfter: '2026-05-14T03:04:06.006Z',
      pageSize: 50,
    });
    expect(f.syncDispute.mock.calls.map((c) => c[0])).toEqual([
      { merchantId: f.merchantId, disputeId: 'PP-D-ONE' },
      { merchantId: f.merchantId, disputeId: 'PP-D-TWO' },
    ]);
  });
  it('advances only after success with two-minute overlap; restart replays full supported history', async () => {
    const f = fixture();
    await f.poll({ merchantId: f.merchantId });
    f.advance();
    await f.poll({ merchantId: f.merchantId });
    expect(f.list.mock.calls[1]![0].updateTimeAfter).toBe('2026-11-10T03:02:05.006Z');
    await createDisputesPoller(f.options)({ merchantId: f.merchantId });
    expect(f.list.mock.calls[2]![0].updateTimeAfter).toBe('2026-05-14T03:05:06.006Z');
  });
  it('retries the entire safe window after a failed later page', async () => {
    const f = fixture();
    f.list.mockResolvedValueOnce({ items: [{ dispute_id: 'PP-D-ONE' }], nextPageToken: 'page:2' });
    f.list.mockRejectedValueOnce(new Error('Synthetic read failure'));
    await expect(f.poll({ merchantId: f.merchantId })).rejects.toThrow();
    await f.poll({ merchantId: f.merchantId });
    expect(f.list.mock.calls[2]![0]).toEqual(f.list.mock.calls[0]![0]);
  });
  it('does not advance after a partially synchronized page', async () => {
    const f = fixture();
    f.list.mockResolvedValueOnce({
      items: [{ dispute_id: 'PP-D-ONE' }, { dispute_id: 'PP-D-TWO' }],
      nextPageToken: null,
    });
    f.syncDispute
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Synthetic sync failure'));
    await expect(f.poll({ merchantId: f.merchantId })).rejects.toThrow();
    await f.poll({ merchantId: f.merchantId });
    expect(f.list.mock.calls[1]![0]).toEqual(f.list.mock.calls[0]![0]);
  });
  it('rejects cursor loops and oversized/invalid pages', async () => {
    const f = fixture();
    f.list
      .mockResolvedValueOnce({ items: [], nextPageToken: 'page:2' })
      .mockResolvedValueOnce({ items: [], nextPageToken: 'page:2' });
    await expect(f.poll({ merchantId: f.merchantId })).rejects.toMatchObject({
      code: 'DISPUTES_POLL_CURSOR_LOOP',
    });
    f.list.mockResolvedValueOnce({
      items: Array.from({ length: 51 }, () => ({ dispute_id: 'PP-D-ONE' })),
      nextPageToken: null,
    });
    await expect(f.poll({ merchantId: f.merchantId })).rejects.toMatchObject({
      code: 'DISPUTES_POLL_PAGE_INVALID',
    });
    f.list.mockResolvedValueOnce({
      items: [{ email: 'excluded@example.invalid' }],
      nextPageToken: null,
    });
    await expect(f.poll({ merchantId: f.merchantId })).rejects.toMatchObject({
      code: 'DISPUTES_POLL_ITEM_INVALID',
    });
  });
  it('fails at its local 100-page budget rather than returning a truncated result', async () => {
    const f = fixture();
    let page = 1;
    f.list.mockImplementation(async () => ({ items: [], nextPageToken: 'page:' + ++page }));
    await expect(f.poll({ merchantId: f.merchantId })).rejects.toMatchObject({
      code: 'DISPUTES_POLL_PAGE_LIMIT',
    });
    expect(f.list).toHaveBeenCalledTimes(100);
  });
  it('coalesces overlapping runs per merchant and isolates other merchants', async () => {
    const f = fixture();
    await Promise.all(Array.from({ length: 10 }, () => f.poll({ merchantId: f.merchantId })));
    expect(f.list).toHaveBeenCalledTimes(1);
    await f.poll({ merchantId: randomUUID() });
    expect(f.list.mock.calls[1]![0].updateTimeAfter).toBe(f.list.mock.calls[0]![0].updateTimeAfter);
  });
  it('rejects unavailable/invalid merchants before vendor reads', async () => {
    const f = fixture();
    f.isRealMerchant.mockResolvedValue(false);
    await expect(f.poll({ merchantId: f.merchantId })).rejects.toThrow();
    await expect(f.poll({ merchantId: 'invalid' })).rejects.toThrow();
    expect(f.list).not.toHaveBeenCalled();
  });
  it('does not silently synchronize disputes when H4 is unavailable', async () => {
    const f = fixture();
    f.list.mockResolvedValueOnce({ items: [{ dispute_id: 'PP-D-ONE' }], nextPageToken: null });
    const poll = createDisputesPoller({ ...f.options, syncDispute: undefined });
    await expect(poll({ merchantId: f.merchantId })).rejects.toMatchObject({
      code: 'H4_DISPUTE_SYNC_PENDING',
    });
  });
});
