import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Attestation } from '../src/evidence/attest.ts';
import { photoEvalConfigured, runPhotoEval, scorePhotoSet, type PhotoSetTruth } from '../eval/photos.ts';
import { mockModel } from './helpers/mockModel.ts';

const truth = (over: Partial<PhotoSetTruth> = {}): PhotoSetTruth => ({
  id: 'set-01', deliberatelyWrong: null, enteredBatchCode: 'B17', expectedBatchLabel: 'B17', expectedStatus: 'match', ...over,
});

function att(status: Attestation['status'], batchLabelText: string | null): Attestation {
  return { items: [], batchLabelText, shippingLabel: { visible: true, trackingNumberText: null }, defects: [], inspection: null,
    couldNotVerify: [], confidence: 0.9, status, model: 'm' };
}

beforeEach(() => { vi.spyOn(process.stdout, 'write').mockImplementation(() => true); });

describe('scorePhotoSet', () => {
  it('a correct set is handled when it matches and the tag agrees with the entered code', () => {
    expect(scorePhotoSet(truth(), att('match', 'b 17'))).toEqual({ handled: true, batchRead: true });
  });
  it('a correct set flagged as mismatch is a false alarm', () => {
    expect(scorePhotoSet(truth(), att('mismatch', 'B17')).handled).toBe(false);
  });
  it('a wrong set is caught by a non-match status', () => {
    expect(scorePhotoSet(truth({ deliberatelyWrong: 'wrong_colour', expectedStatus: 'mismatch' }), att('mismatch', 'B17')).handled).toBe(true);
    expect(scorePhotoSet(truth({ deliberatelyWrong: 'wrong_colour', expectedStatus: 'mismatch' }), att('could_not_verify', 'B17')).handled).toBe(true);
  });
  it('the wrong-batch-tag set is caught when the tag read differs from the entered code', () => {
    const t = truth({ deliberatelyWrong: 'wrong_batch_tag', expectedBatchLabel: 'B18' });
    expect(scorePhotoSet(t, att('match', 'B18'))).toEqual({ handled: true, batchRead: true });
    expect(scorePhotoSet(t, att('match', 'B17'))).toEqual({ handled: false, batchRead: false });
  });
  it('an unreadable tag is not a batch read', () => {
    expect(scorePhotoSet(truth(), att('match', null)).batchRead).toBe(false);
  });
});

describe('runPhotoEval', () => {
  it('attests all 20 sets and the inspection photo and reports both metrics', async () => {
    const { model, calls } = mockModel([{
      items: [], batchLabelText: 'B17', shippingLabel: { visible: true, trackingNumberText: 'FF100000001' },
      defects: [], inspection: { instruction: 'x', defectVisible: true, matchesCluster: true }, couldNotVerify: [], confidence: 0.9,
    }]);
    const out = await runPhotoEval({ model });
    expect(calls).toHaveLength(21);
    expect(out.total).toBe(20);
    expect(out.inspectionDefectVisible).toBe(true);
    expect(out.summary).toMatch(/^\d+ of 20; \d+ of 20 batch labels read; open stitch (seen|missed) \(synthetic photos\)$/);
  });

  it('is configured only when a provider and its key are set', () => {
    expect(photoEvalConfigured({})).toBe(false);
    expect(photoEvalConfigured({ AI_PROVIDER: 'xai', AI_MODEL_VISION: 'grok', XAI_API_KEY: 'k' })).toBe(true);
    expect(photoEvalConfigured({ AI_PROVIDER: 'xai', AI_MODEL_VISION: 'grok' })).toBe(false);
  });
});
