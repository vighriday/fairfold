// Evidence Agent (section 10, task I2): the model describes the photos; code decides match / mismatch / could_not_verify.
import { generateStructured, type LanguageModel } from '@fairfold/ai';
import type { AttestationResult, AttestInput } from '@fairfold/contracts';
import { AttestationResultSchema } from '@fairfold/contracts';
import { applyItemMatching, deriveStatus, type AttestationStatus } from './match.js';
import { getIntelRuntime } from '../runtime.js';
import { buildAttestPrompt } from './prompt.js';
import { dbEvidenceStore } from './store.js';

export const MAX_PHOTOS = 6;

export interface AttestDeps {
  loadPhoto(sha256: string): Promise<{ mime: string; bytes: Uint8Array }>;
  /** Injected in tests and evals; otherwise packages/ai builds the vision model from the environment. */
  model?: LanguageModel;
}

export interface Attestation extends AttestationResult {
  status: AttestationStatus;
  /** Model id that produced the description, or 'fallback'. Stored in attestations.model. */
  model: string;
}

function fallbackResult(): AttestationResult {
  return {
    items: [],
    batchLabelText: null,
    shippingLabel: { visible: false, trackingNumberText: null },
    defects: [],
    inspection: null,
    couldNotVerify: ['model_unavailable'],
    confidence: 0,
  };
}

const trimOrNull = (s: string | null) => (s === null || s.trim() === '' ? null : s.trim());

export async function attestPackingPhotosWith(
  input: AttestInput,
  deps: AttestDeps,
): Promise<Attestation> {
  if (input.photos.length === 0)
    throw new Error('NO_PHOTOS: an attestation needs at least one photo');
  if (input.photos.length > MAX_PHOTOS)
    throw new Error(`TOO_MANY_PHOTOS: at most ${MAX_PHOTOS} photos per attestation`);

  const images = await Promise.all(input.photos.map((p) => deps.loadPhoto(p.sha256)));
  const { system, user } = buildAttestPrompt(input);
  const out = await generateStructured<AttestationResult>({
    schema: AttestationResultSchema,
    system,
    user,
    images,
    kind: 'vision',
    component: 'evidence',
    fallback: fallbackResult,
    model: deps.model,
  });

  const raw: AttestationResult = {
    ...out.value,
    batchLabelText: trimOrNull(out.value.batchLabelText),
    shippingLabel: {
      ...out.value.shippingLabel,
      trackingNumberText: trimOrNull(out.value.shippingLabel.trackingNumberText),
    },
    inspection: input.inspectionRule ? out.value.inspection : null,
  };
  if (
    input.inspectionRule &&
    raw.inspection === null &&
    !raw.couldNotVerify.includes('inspection')
  ) {
    raw.couldNotVerify = [...raw.couldNotVerify, 'inspection'];
  }

  const checked = applyItemMatching(input, raw);
  return { ...checked, status: deriveStatus(checked, input.step), model: out.model };
}

/**
 * Section 15: attestPackingPhotos(input) on the process runtime — photos are read from the blob store by SHA-256 and
 * the vision model comes from the environment (or the runtime's injected model).
 */
export function attestPackingPhotos(input: AttestInput): Promise<Attestation> {
  const rt = getIntelRuntime();
  return attestPackingPhotosWith(input, {
    loadPhoto: dbEvidenceStore(rt).loadPhoto,
    model: rt.models.vision,
  });
}
