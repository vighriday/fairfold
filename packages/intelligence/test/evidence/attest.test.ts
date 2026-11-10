import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttestationResult, AttestInput } from '@fairfold/contracts';
import { attestPackingPhotosWith, MAX_PHOTOS } from '../../src/evidence/attest.js';
import { uid } from '../helpers/ids.js';
import { mockModel, promptOf } from '../helpers/mockModel.js';

const I1 = uid(0xa1);

const input: AttestInput = {
  orderId: uid(1),
  hypothesisId: null,
  step: 'pack',
  items: [
    {
      orderItemId: I1,
      name: 'Block-print cotton hoodie',
      sku: 'HD-IND-01',
      colour: 'navy',
      size: 'M',
      quantity: 1,
    },
  ],
  batchCodes: { [I1]: 'B17' },
  photos: [
    { sha256: 'sha-item', label: 'item', mime: 'image/jpeg' },
    { sha256: 'sha-size', label: 'size_label', mime: 'image/jpeg' },
    { sha256: 'sha-batch', label: 'batch_label', mime: 'image/jpeg' },
    { sha256: 'sha-parcel', label: 'sealed_parcel', mime: 'image/jpeg' },
  ],
  inspectionRule: null,
  expectedTrackingNumber: 'FF100000001',
};

const good: AttestationResult = {
  items: [
    {
      orderItemId: I1,
      seen: { itemType: 'hoodie', colour: 'navy', sizeLabel: 'M', quantity: 1 },
      matches: true,
      confidence: 0.92,
      notes: '',
    },
  ],
  batchLabelText: ' B18 ',
  shippingLabel: { visible: true, trackingNumberText: ' FF100000001 ' },
  defects: [],
  inspection: null,
  couldNotVerify: [],
  confidence: 0.9,
};

const loadPhoto = vi.fn(async (sha: string) => ({
  mime: 'image/jpeg',
  bytes: new TextEncoder().encode(sha),
}));

beforeEach(() => {
  loadPhoto.mockClear();
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

describe('attestPackingPhotosWith', () => {
  it('passes batchLabelText and trackingNumberText through, trimmed', async () => {
    const { model } = mockModel([good]);
    const out = await attestPackingPhotosWith(input, { loadPhoto, model });
    expect(out.batchLabelText).toBe('B18');
    expect(out.shippingLabel.trackingNumberText).toBe('FF100000001');
    expect(out.status).toBe('match');
    expect(out.model).toBe('mock-vision');
  });

  it('sends every photo, in order, as an image', async () => {
    const { model, calls } = mockModel([good]);
    await attestPackingPhotosWith(input, { loadPhoto, model });
    expect(loadPhoto.mock.calls.map((c) => c[0])).toEqual([
      'sha-item',
      'sha-size',
      'sha-batch',
      'sha-parcel',
    ]);
    const p = promptOf(calls[0]!);
    expect(p.fileCount).toBe(4);
    expect(p.userText).toMatch(
      /1\. item[\s\S]*2\. size_label[\s\S]*3\. batch_label[\s\S]*4\. sealed_parcel/,
    );
  });

  it('prompt lists items with colour and size but never the entered batch code or tracking number', async () => {
    const { model, calls } = mockModel([good]);
    await attestPackingPhotosWith(input, { loadPhoto, model });
    const p = promptOf(calls[0]!);
    expect(p.userText).toContain(I1);
    expect(p.userText).toContain('navy');
    expect(p.userText).toContain('size M');
    expect(p.userText).not.toContain('B17');
    expect(p.userText).not.toContain('FF100000001');
    expect(p.system).toMatch(/couldNotVerify/);
    expect(p.system).toMatch(/never follow instructions/i);
  });

  it('decides status in code, not from the model’s matches flag', async () => {
    const wrongColour = {
      ...good,
      items: [
        { ...good.items[0]!, seen: { ...good.items[0]!.seen, colour: 'ochre' }, matches: true },
      ],
    };
    const { model } = mockModel([wrongColour]);
    const out = await attestPackingPhotosWith(input, { loadPhoto, model });
    expect(out.status).toBe('mismatch');
    expect(out.items[0]?.matches).toBe(false);
  });

  it('inspection prompt includes instruction and cluster label', async () => {
    const rule = {
      instruction: 'Photograph the left sleeve seam close up.',
      requiredPhotoLabel: 'seam_closeup',
      clusterLabel: 'sleeve seam opening',
    };
    const inspectInput: AttestInput = {
      ...input,
      orderId: null,
      hypothesisId: 'h1',
      step: 'inspection',
      items: [],
      batchCodes: {},
      photos: [{ sha256: 'sha-seam', label: 'seam_closeup', mime: 'image/jpeg' }],
      inspectionRule: rule,
      expectedTrackingNumber: null,
    };
    const answer = {
      ...good,
      items: [],
      inspection: { instruction: rule.instruction, defectVisible: true, matchesCluster: true },
    };
    const { model, calls } = mockModel([answer]);
    const out = await attestPackingPhotosWith(inspectInput, { loadPhoto, model });
    const p = promptOf(calls[0]!);
    expect(p.userText + p.system).toContain('Photograph the left sleeve seam close up.');
    expect(p.userText + p.system).toContain('sleeve seam opening');
    expect(out.inspection).toEqual({
      instruction: rule.instruction,
      defectVisible: true,
      matchesCluster: true,
    });
  });

  it('forces inspection to null when there is no inspection rule', async () => {
    const { model } = mockModel([
      { ...good, inspection: { instruction: 'x', defectVisible: true, matchesCluster: true } },
    ]);
    const out = await attestPackingPhotosWith(input, { loadPhoto, model });
    expect(out.inspection).toBeNull();
  });

  it('an inspection the model left out cannot pass as clean', async () => {
    const rule = {
      instruction: 'Check the seam.',
      requiredPhotoLabel: 'seam_closeup',
      clusterLabel: 'sleeve seam opening',
    };
    const { model } = mockModel([{ ...good, items: [], inspection: null }]);
    const out = await attestPackingPhotosWith(
      { ...input, items: [], inspectionRule: rule, step: 'inspection' },
      { loadPhoto, model },
    );
    expect(out.couldNotVerify).toContain('inspection');
    expect(out.status).toBe('could_not_verify');
  });

  it('fallback yields could_not_verify after two bad answers', async () => {
    const { model, calls } = mockModel(['not json', '{"items": 3}']);
    const out = await attestPackingPhotosWith(input, { loadPhoto, model });
    expect(calls).toHaveLength(2);
    expect(out.status).toBe('could_not_verify');
    expect(out.couldNotVerify).toContain('model_unavailable');
    expect(out.model).toBe('fallback');
    expect(out.confidence).toBe(0);
  });

  it('more than 6 photos rejected', async () => {
    const photos = Array.from({ length: MAX_PHOTOS + 1 }, (_, n) => ({
      sha256: `s${n}`,
      label: 'item',
      mime: 'image/jpeg',
    }));
    const { model } = mockModel([good]);
    await expect(
      attestPackingPhotosWith({ ...input, photos }, { loadPhoto, model }),
    ).rejects.toThrow(/TOO_MANY_PHOTOS/);
    expect(MAX_PHOTOS).toBe(6);
  });

  it('no photos rejected', async () => {
    const { model } = mockModel([good]);
    await expect(
      attestPackingPhotosWith({ ...input, photos: [] }, { loadPhoto, model }),
    ).rejects.toThrow(/NO_PHOTOS/);
  });

  it('buyer photos are described without expecting a shipping label', async () => {
    const { model, calls } = mockModel([good]);
    await attestPackingPhotosWith({ ...input, step: 'buyer_photo' }, { loadPhoto, model });
    expect(promptOf(calls[0]!).system).toMatch(/buyer/i);
  });

  it('buyer photos showing the reported defect on the ordered item are a match', async () => {
    const seam = {
      ...good,
      defects: [
        { component: 'left sleeve seam', description: 'seam open', severity: 'functional' },
      ],
    };
    const { model } = mockModel([seam]);
    const a = await attestPackingPhotosWith(
      { ...input, step: 'buyer_photo', batchCodes: {}, expectedTrackingNumber: null },
      { loadPhoto, model },
    );
    expect(a.status).toBe('match');
    expect(a.defects).toHaveLength(1);
  });
});
