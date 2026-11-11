// Photo eval (section 10 row 1): runs the Evidence Agent over the 20 packing sets and the open-stitch inspection photo.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasModelConfig, type Env, type LanguageModel } from '@fairfold/ai';
import type { AttestInput } from '@fairfold/contracts';
import { attestPackingPhotosWith, type Attestation } from '../src/evidence/attest.js';

const PHOTOS = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'photos');

export interface PhotoSetTruth {
  id: string;
  deliberatelyWrong: string | null;
  enteredBatchCode: string;
  expectedBatchLabel: string;
  expectedStatus: string;
}

interface Garment {
  sku: string;
  name: string;
  colour: string;
  size: string;
}
interface ExpectedFile {
  synthetic: boolean;
  garments: Record<string, Garment>;
  files: string[];
  labels: string[];
  sets: Array<
    PhotoSetTruth & {
      order: Array<{ garment: string; colour: string; size: string; quantity: number }>;
    }
  >;
  inspection: {
    file: string;
    label: string;
    instruction: string;
    clusterLabel: string;
    expectedDefectVisible: boolean;
  };
}

const tag = (s: string | null) => (s === null ? null : s.toUpperCase().replace(/\s+/g, ''));

/**
 * handled: a correct set must match with the tag agreeing with the entered code (no false alarm);
 * a deliberately wrong set must be caught — status not match, or the tag read differs from the entered code.
 */
export function scorePhotoSet(
  t: PhotoSetTruth,
  a: Attestation,
): { handled: boolean; batchRead: boolean } {
  const read = tag(a.batchLabelText);
  const tagAgrees = read !== null && read === tag(t.enteredBatchCode);
  const handled =
    t.deliberatelyWrong === null
      ? a.status === 'match' && tagAgrees
      : a.status !== 'match' || !tagAgrees;
  return { handled, batchRead: read !== null && read === tag(t.expectedBatchLabel) };
}

export function photoEvalConfigured(env: Env = process.env): boolean {
  return hasModelConfig('vision', env);
}

/** Photos are addressed by the SHA-256 of their bytes, as blobs.put does in the app. */
async function photoLibrary() {
  const byPath = new Map<string, string>();
  const bytesBySha = new Map<string, Uint8Array>();
  return {
    async add(path: string): Promise<string> {
      const known = byPath.get(path);
      if (known) return known;
      const bytes = new Uint8Array(await readFile(path));
      const hash = createHash('sha256').update(bytes).digest('hex');
      byPath.set(path, hash);
      bytesBySha.set(hash, bytes);
      return hash;
    },
    async loadPhoto(hash: string) {
      const bytes = bytesBySha.get(hash);
      if (!bytes) throw new Error(`photo ${hash} was not loaded`);
      return { mime: 'image/jpeg', bytes };
    },
  };
}

/** Deterministic uuid per set and item, because order item ids are uuids in the contract. */
export function evalItemId(setIndex: number, itemIndex: number): string {
  return `00000000-0000-4000-8000-${(setIndex * 100 + itemIndex + 1).toString().padStart(12, '0')}`;
}

export async function runPhotoEval(opts: { model?: LanguageModel } = {}) {
  const expected = JSON.parse(
    await readFile(join(PHOTOS, 'expected.json'), 'utf8'),
  ) as ExpectedFile;
  const library = await photoLibrary();
  const loadPhoto = library.loadPhoto;
  let handled = 0;
  let batchRead = 0;
  let fellBack = 0;
  for (const [setIndex, set] of expected.sets.entries()) {
    const input: AttestInput = {
      orderId: null,
      hypothesisId: null,
      step: 'pack',
      items: set.order.map((o, n) => {
        const g = expected.garments[o.garment]!;
        return {
          orderItemId: evalItemId(setIndex, n),
          name: g.name,
          sku: g.sku,
          colour: o.colour,
          size: o.size,
          quantity: o.quantity,
        };
      }),
      batchCodes: {},
      photos: await Promise.all(
        expected.files.map(async (file, n) => ({
          sha256: await library.add(join(PHOTOS, set.id, file)),
          label: expected.labels[n]!,
          mime: 'image/jpeg',
        })),
      ),
      inspectionRule: null,
      expectedTrackingNumber: null,
    };
    const attestation = await attestPackingPhotosWith(input, { loadPhoto, model: opts.model });
    if (attestation.model === 'fallback') fellBack += 1;
    const score = scorePhotoSet(set, attestation);
    if (score.handled) handled += 1;
    if (score.batchRead) batchRead += 1;
  }

  const ins = expected.inspection;
  const inspection = await attestPackingPhotosWith(
    {
      orderId: null,
      hypothesisId: null,
      step: 'inspection',
      items: [],
      batchCodes: {},
      photos: [
        { sha256: await library.add(join(PHOTOS, ins.file)), label: ins.label, mime: 'image/jpeg' },
      ],
      inspectionRule: {
        instruction: ins.instruction,
        requiredPhotoLabel: ins.label,
        clusterLabel: ins.clusterLabel,
      },
      expectedTrackingNumber: null,
    },
    { loadPhoto, model: opts.model },
  );
  const inspectionDefectVisible = inspection.inspection?.defectVisible === true;
  if (inspection.model === 'fallback') fellBack += 1;

  const total = expected.sets.length;
  const calls = total + 1;
  // A fallback is not the model's answer: a run with any fallback is not a measurement (DECISIONS.md I-D15).
  const summary = fellBack
    ? `not measured: ${fellBack} of ${calls} model calls fell back (quota or errors); re-run to fill them from the cache`
    : `${handled} of ${total}; ${batchRead} of ${total} batch labels read; open stitch ${inspectionDefectVisible ? 'seen' : 'missed'}` +
      (expected.synthetic ? ' (synthetic photos)' : '');
  return { total, handled, batchRead, inspectionDefectVisible, fellBack, summary };
}
