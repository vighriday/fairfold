import { expect, it, vi } from 'vitest';
import type { OrderDetail, HypothesisDetail } from '@fairfold/contracts';
import { createActions } from '../src/actions.js';
import { ApiClient } from '../src/api.js';
import type { review, capturePhoto, downloadPdf } from '../src/interactions.js';
import type { PackState, DisputeRecord } from '../src/models.js';

function fixture() {
  const app = {
    api: new ApiClient(false, vi.fn()),
    order: undefined as OrderDetail | undefined,
    pack: undefined as PackState | undefined,
    dispute: undefined as DisputeRecord | undefined,
    hypothesis: undefined as HypothesisDetail | undefined,
    batch: 'B17',
    busy: false,
    loading: false,
    generation: 1,
    selectedOffer: 'REFUND',
    pollRemaining: 0,
    mutate: vi
      .fn<(path: string, body: object | FormData) => Promise<void>>()
      .mockResolvedValue(undefined),
    loadView: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    redraw: vi.fn(),
    fail: vi.fn(),
  };
  const dialogs = {
    review: vi.fn<typeof review>().mockResolvedValue(null),
    capturePhoto: vi.fn<typeof capturePhoto>().mockResolvedValue(null),
    downloadPdf: vi.fn<typeof downloadPdf>(),
  };
  return { app, dialogs, actions: createActions(app, dialogs) };
}
const order: OrderDetail = {
  id: '00000000-0000-4000-8000-000000000011',
  paypalOrderId: 'SEED-ORDER',
  paypalCaptureId: 'SEED-CAPTURE',
  status: 'captured',
  amount: { currency_code: 'USD', value: '38.00' },
  items: [
    {
      id: '00000000-0000-4000-8000-000000000012',
      sku: 'HD-IND-01',
      name: 'Hoodie',
      quantity: 1,
      batchCode: null,
    },
  ],
  buyer: null,
  sellerProtection: { status: null, disputeCategories: [] },
  buyerSignal: null,
  shipment: null,
  hold: null,
  ledger: { length: 1, verified: true },
  disputes: [],
  sharedCauses: [],
};
function dispute(): DisputeRecord {
  return {
    dispute: {
      id: 'SEED-DISPUTE',
      orderId: order.id,
      reason: 'TEST',
      status: 'WAITING',
      lifeCycleStage: 'INQUIRY',
      dueAt: null,
      latestPack: null,
      amount: order.amount,
      outcomeCode: null,
      messages: [],
      evidences: [],
      allowedResponseOptions: { makeOffer: { offerTypes: ['REFUND'] } },
    },
    packs: [
      {
        id: '00000000-0000-4000-8000-000000000013',
        status: 'draft',
        recommendation: 'make_offer',
        narrative: 'Controlled test pack',
        evidences: [],
        files: [],
        confidence: 0.8,
        actionParams: { offerType: 'REFUND', note: 'test', amount: order.amount },
      },
    ],
    timeline: [],
  };
}
it('cancelled camera review never uploads', async () => {
  const { app, dialogs, actions } = fixture();
  app.order = order;
  actions.shootPack('item');
  await vi.waitFor(() => expect(dialogs.review).toHaveBeenCalledOnce());
  expect(dialogs.capturePhoto).not.toHaveBeenCalled();
  expect(app.mutate).not.toHaveBeenCalled();
});
it('uploads actual camera bytes and batch mapping without inventing proof', async () => {
  const { app, dialogs, actions } = fixture();
  app.order = order;
  dialogs.review.mockResolvedValue({ [order.items[0]!.id]: 'B17' });
  dialogs.capturePhoto.mockResolvedValue(
    new Blob(['controlled-camera-bytes'], { type: 'image/jpeg' }),
  );
  actions.shootPack('item');
  await vi.waitFor(() => expect(app.mutate).toHaveBeenCalledOnce());
  const [path, body] = app.mutate.mock.calls[0]!;
  const form = body as FormData;
  expect(path).toBe(`/api/orders/${order.id}/pack/photos`);
  expect(form.get('labels')).toBe('item');
  expect(form.get('batchCodes')).toBe(JSON.stringify({ [order.items[0]!.id]: 'B17' }));
  expect(await (form.get('photos') as Blob).text()).toBe('controlled-camera-bytes');
});
it('waits for an exact pack review, rejects double clicks and preserves decimal money', async () => {
  const { app, dialogs, actions } = fixture();
  app.dispute = dispute();
  let accept!: (value: Record<string, string> | null) => void;
  dialogs.review.mockImplementation(
    () =>
      new Promise((resolve) => {
        accept = resolve;
      }),
  );
  actions.dispute();
  actions.dispute();
  expect(dialogs.review).toHaveBeenCalledOnce();
  expect(app.mutate).not.toHaveBeenCalled();
  expect(dialogs.review.mock.calls[0]![0].text).toContain('Controlled test pack');
  accept({ offerType: 'REFUND', amount: '38.00', note: 'approved in test' });
  await vi.waitFor(() => expect(app.mutate).toHaveBeenCalledOnce());
  expect(app.mutate.mock.calls[0]).toEqual([
    `/api/disputes/SEED-DISPUTE/packs/${app.dispute.packs[0]!.id}/approve`,
    { offerType: 'REFUND', amount: order.amount, note: 'approved in test' },
  ]);
});
it('rejects approval when its view changed during review', async () => {
  const { app, dialogs, actions } = fixture();
  app.dispute = dispute();
  dialogs.review.mockImplementation(async () => {
    app.generation++;
    return { offerType: 'REFUND' };
  });
  actions.dispute();
  await vi.waitFor(() => expect(app.fail).toHaveBeenCalledOnce());
  expect(app.mutate).not.toHaveBeenCalled();
});
it('never reapproves a submitted pack', async () => {
  const { app, dialogs, actions } = fixture();
  app.dispute = dispute();
  app.dispute.packs[0]!.status = 'submitted';
  dialogs.review.mockResolvedValue({});
  actions.dispute();
  await vi.waitFor(() => expect(dialogs.review).toHaveBeenCalledOnce());
  expect(app.mutate).not.toHaveBeenCalled();
});
it('building a missing draft does not approve it', async () => {
  const { app, actions } = fixture();
  app.dispute = dispute();
  app.dispute.packs = [];
  actions.dispute();
  await vi.waitFor(() => expect(app.mutate).toHaveBeenCalledOnce());
  expect(app.mutate.mock.calls[0]).toEqual(['/api/disputes/SEED-DISPUTE/packs', {}]);
});
