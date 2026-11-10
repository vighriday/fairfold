// Buyer photos (task I2): photos a buyer attaches to a problem report are described by the Evidence Agent with step
// buyer_photo, so the merchant and PayPal's reviewer can see whether they show the item that was ordered (idea doc
// section 8: "compares the buyer's photos with the packing photos and flags differences — it does not decide").
// The attestation has no ledger entry: an order's ledger is the merchant's own packing evidence chain.
import { and, eq } from 'drizzle-orm';
import { attestations } from '@fairfold/db';
import type { IntelRuntime } from '../runtime.js';
import { attestPackingPhotosWith, MAX_PHOTOS } from './attest.js';
import { dbEvidenceStore } from './store.js';

export const BUYER_PHOTO_LABEL = 'buyer_photo';

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((sha) => b.includes(sha));

/**
 * Describes the buyer's photos of `orderId` once per set of photos. `photoShas` must name stored blobs whose bytes
 * are still present (retention purges old bytes); the caller passes only the photos it could load.
 */
export async function attestBuyerPhotos(
  rt: IntelRuntime,
  orderId: string,
  photoShas: string[],
): Promise<void> {
  const shas = [...new Set(photoShas)].slice(0, MAX_PHOTOS);
  if (shas.length === 0) return;
  const described = await rt.db
    .select({ shas: attestations.photo_shas })
    .from(attestations)
    .where(and(eq(attestations.order_id, orderId), eq(attestations.step, 'buyer_photo')));
  if (described.some((a) => sameSet(a.shas, shas))) return;

  const store = dbEvidenceStore(rt);
  const { items } = await store.loadOrderForAttestation(orderId, []);
  const labels = shas.map(() => BUYER_PHOTO_LABEL);
  const a = await attestPackingPhotosWith(
    {
      orderId,
      hypothesisId: null,
      step: 'buyer_photo',
      items,
      batchCodes: {},
      photos: shas.map((sha256) => ({ sha256, label: BUYER_PHOTO_LABEL, mime: 'image/jpeg' })),
      inspectionRule: null,
      expectedTrackingNumber: null,
    },
    { loadPhoto: store.loadPhoto, model: rt.models.vision },
  );
  const { status, model, ...result } = a;
  await store.insertAttestation({
    orderId,
    hypothesisId: null,
    batchCode: null,
    step: 'buyer_photo',
    photoShas: shas,
    photoLabels: labels,
    model,
    result,
    status,
    confidence: a.confidence,
  });
}
