// Job handlers for the Evidence Agent (section 8 F2 step 3, F5 inspections).
// Storage goes through EvidenceStore so the handler logic does not depend on how packages/db is wired.
import type { LanguageModel } from '@fairfold/ai';
import { JobSchemas, type AttestationResult, type AttestInput } from '@fairfold/contracts';
import { attestPackingPhotos, MAX_PHOTOS } from './attest.js';
import type { AttestationStatus } from './match.js';

/** One row of the attestations table (section 7). */
export interface AttestationRow {
  orderId: string | null;
  hypothesisId: string | null;
  batchCode: string | null;
  step: AttestInput['step'];
  photoShas: string[];
  photoLabels: string[];
  model: string;
  result: AttestationResult;
  status: AttestationStatus;
  confidence: number;
}

export interface LedgerAttestationEntry {
  type: 'attestation';
  actor: 'system';
  payload: {
    attestationId: string;
    status: AttestationStatus;
    confidence: number;
    model: string;
    photoShas: string[];
  };
}

/** The photos and batch code of an order's latest pack attestation. */
export interface PriorPackPhotos {
  photoShas: string[];
  photoLabels: string[];
  batchCode: string | null;
}

export interface EvidenceStore {
  /** Order items with product colour and size, plus the active inspection rule covering any of the batch codes. */
  loadOrderForAttestation(
    orderId: string,
    batchCodes: string[],
  ): Promise<{ items: AttestInput['items']; inspectionRule: AttestInput['inspectionRule'] }>;
  /** The order's most recent pack attestation, or null before the first one. */
  loadLatestPackAttestation(orderId: string): Promise<PriorPackPhotos | null>;
  /** The inspection rule a hypothesis created for this batch, with its cluster label. */
  loadInspectionRule(
    hypothesisId: string,
    batchCode: string,
  ): Promise<NonNullable<AttestInput['inspectionRule']>>;
  loadPhoto(sha256: string): Promise<{ mime: string; bytes: Uint8Array }>;
  /**
   * Inserts the attestation row and, when given, appends its ledger entry (Hriday's ledger.append,
   * section 7 hashing rule) in the same transaction. Returns the attestation id.
   */
  insertAttestation(
    row: AttestationRow,
    ledgerEntry?: (attestationId: string) => LedgerAttestationEntry,
  ): Promise<string>;
}

export interface EvidenceDeps {
  store: EvidenceStore;
  model?: LanguageModel;
}

// Job payloads exactly as the H1 contract publishes them, plus one label per photo.
export const PackPhotosUploadedSchema = JobSchemas['pack.photos_uploaded'].refine(
  (p) => p.labels.length === p.photoShas.length,
  { message: 'labels must have one entry per photo', path: ['labels'] },
);

export const InspectionUploadedSchema = JobSchemas['inspection.uploaded'];

const JPEG = 'image/jpeg'; // blobs.put re-encodes every uploaded image to JPEG (section 12)

interface LabelledPhoto {
  sha256: string;
  label: string;
}

/**
 * The photos one pack attestation covers: this upload plus the photos the order's latest pack attestation already
 * covered, so photos taken one at a time at the packing table are judged together (F2: the seal checks the latest
 * attestation). An earlier photo whose label this upload shoots again is a retake and is replaced. The total stays
 * within the Evidence Agent's limit by dropping the oldest carried-over photos first.
 */
export function photosToAttest(
  upload: LabelledPhoto[],
  prior: PriorPackPhotos | null,
  max = MAX_PHOTOS,
): LabelledPhoto[] {
  const labels = new Set(upload.map((p) => p.label));
  const shas = new Set(upload.map((p) => p.sha256));
  const carried = (prior?.photoShas ?? [])
    .map((sha256, i) => ({ sha256, label: prior!.photoLabels[i] ?? 'photo' }))
    .filter((p) => !labels.has(p.label) && !shas.has(p.sha256));
  const room = Math.max(0, max - upload.length);
  return [...carried.slice(Math.max(0, carried.length - room)), ...upload];
}

export function createEvidenceHandlers({ store, model }: EvidenceDeps) {
  return {
    async 'pack.photos_uploaded'(payload: unknown): Promise<void> {
      const p = PackPhotosUploadedSchema.parse(payload);
      const prior = await store.loadLatestPackAttestation(p.orderId);
      const photos = photosToAttest(
        p.photoShas.map((sha256, i) => ({ sha256, label: p.labels[i]! })),
        prior,
      );
      const entered = [...new Set(Object.values(p.batchCodes))];
      // An upload that sends no batch codes keeps the batch entered with the earlier photos.
      const codes = entered.length ? entered : prior?.batchCode ? [prior.batchCode] : [];
      const order = await store.loadOrderForAttestation(p.orderId, codes);
      const input: AttestInput = {
        orderId: p.orderId,
        hypothesisId: null,
        step: 'pack',
        items: order.items,
        batchCodes: p.batchCodes,
        photos: photos.map((photo) => ({ ...photo, mime: JPEG })),
        inspectionRule: order.inspectionRule,
        expectedTrackingNumber: null,
      };
      const a = await attestPackingPhotos(input, { loadPhoto: store.loadPhoto, model });
      const { status, model: modelId, ...result } = a;
      const photoShas = photos.map((photo) => photo.sha256);
      await store.insertAttestation(
        {
          orderId: p.orderId,
          hypothesisId: null,
          batchCode: codes.length === 1 ? codes[0]! : null,
          step: 'pack',
          photoShas,
          photoLabels: photos.map((photo) => photo.label),
          model: modelId,
          result,
          status,
          confidence: a.confidence,
        },
        (attestationId) => ({
          type: 'attestation',
          actor: 'system',
          payload: {
            attestationId,
            status,
            confidence: a.confidence,
            model: modelId,
            photoShas,
          },
        }),
      );
    },

    async 'inspection.uploaded'(payload: unknown): Promise<void> {
      const p = InspectionUploadedSchema.parse(payload);
      const rule = await store.loadInspectionRule(p.hypothesisId, p.batchCode);
      const labels = p.photoShas.map(() => rule.requiredPhotoLabel);
      const input: AttestInput = {
        orderId: null,
        hypothesisId: p.hypothesisId,
        step: 'inspection',
        items: [],
        batchCodes: {},
        photos: p.photoShas.map((sha256, i) => ({ sha256, label: labels[i]!, mime: JPEG })),
        inspectionRule: rule,
        expectedTrackingNumber: null,
      };
      const a = await attestPackingPhotos(input, { loadPhoto: store.loadPhoto, model });
      const { status, model: modelId, ...result } = a;
      await store.insertAttestation({
        orderId: null,
        hypothesisId: p.hypothesisId,
        batchCode: p.batchCode,
        step: 'inspection',
        photoShas: p.photoShas,
        photoLabels: labels,
        model: modelId,
        result,
        status,
        confidence: a.confidence,
      });
    },
  };
}
