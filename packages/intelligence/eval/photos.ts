// Photo eval (section 10 row 1): runs the Evidence Agent over the 20 packing sets and the open-stitch inspection photo.
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasModelConfig, type Env, type LanguageModel } from '@fairfold/ai';
import type { AttestInput } from '../src/contracts.ts';
import { attestPackingPhotos, type Attestation } from '../src/evidence/attest.ts';

const PHOTOS = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'photos');

export interface PhotoSetTruth {
  id: string;
  deliberatelyWrong: string | null;
  enteredBatchCode: string;
  expectedBatchLabel: string;
  expectedStatus: string;
}

interface Garment { sku: string; name: string; colour: string; size: string }
interface ExpectedFile {
  synthetic: boolean;
  garments: Record<string, Garment>;
  files: string[];
  labels: string[];
  sets: Array<PhotoSetTruth & { order: Array<{ garment: string; colour: string; size: string; quantity: number }> }>;
  inspection: { file: string; label: string; instruction: string; clusterLabel: string; expectedDefectVisible: boolean };
}

const tag = (s: string | null) => (s === null ? null : s.toUpperCase().replace(/\s+/g, ''));

/**
 * handled: a correct set must match with the tag agreeing with the entered code (no false alarm);
 * a deliberately wrong set must be caught — status not match, or the tag read differs from the entered code.
 */
export function scorePhotoSet(t: PhotoSetTruth, a: Attestation): { handled: boolean; batchRead: boolean } {
  const read = tag(a.batchLabelText);
  const tagAgrees = read !== null && read === tag(t.enteredBatchCode);
  const handled = t.deliberatelyWrong === null ? a.status === 'match' && tagAgrees : a.status !== 'match' || !tagAgrees;
  return { handled, batchRead: read !== null && read === tag(t.expectedBatchLabel) };
}

export function photoEvalConfigured(env: Env = process.env): boolean {
  return hasModelConfig('vision', env);
}

async function loadPhoto(path: string) {
  return { mime: 'image/jpeg', bytes: new Uint8Array(await readFile(path)) };
}

export async function runPhotoEval(opts: { model?: LanguageModel } = {}) {
  const expected = JSON.parse(await readFile(join(PHOTOS, 'expected.json'), 'utf8')) as ExpectedFile;
  let handled = 0;
  let batchRead = 0;
  for (const set of expected.sets) {
    const input: AttestInput = {
      orderId: set.id, hypothesisId: null, step: 'pack',
      items: set.order.map((o, n) => {
        const g = expected.garments[o.garment]!;
        return { orderItemId: `${set.id}-item-${n + 1}`, name: g.name, sku: g.sku, colour: o.colour, size: o.size, quantity: o.quantity };
      }),
      batchCodes: {},
      photos: expected.files.map((file, n) => ({ sha256: join(PHOTOS, set.id, file), label: expected.labels[n]!, mime: 'image/jpeg' })),
      inspectionRule: null, expectedTrackingNumber: null,
    };
    const score = scorePhotoSet(set, await attestPackingPhotos(input, { loadPhoto, model: opts.model }));
    if (score.handled) handled += 1;
    if (score.batchRead) batchRead += 1;
  }

  const ins = expected.inspection;
  const inspection = await attestPackingPhotos({
    orderId: null, hypothesisId: 'eval', step: 'inspection', items: [], batchCodes: {},
    photos: [{ sha256: join(PHOTOS, ins.file), label: ins.label, mime: 'image/jpeg' }],
    inspectionRule: { instruction: ins.instruction, requiredPhotoLabel: ins.label, clusterLabel: ins.clusterLabel },
    expectedTrackingNumber: null,
  }, { loadPhoto, model: opts.model });
  const inspectionDefectVisible = inspection.inspection?.defectVisible === true;

  const total = expected.sets.length;
  const summary = `${handled} of ${total}; ${batchRead} of ${total} batch labels read; open stitch ${inspectionDefectVisible ? 'seen' : 'missed'}` +
    (expected.synthetic ? ' (synthetic photos)' : '');
  return { total, handled, batchRead, inspectionDefectVisible, summary };
}
