import { and, eq } from 'drizzle-orm';
import { AppError, UuidSchema, systemClock, type Clock } from '@fairfold/contracts';
import {
  complaint_clusters,
  createDatabase,
  hypotheses,
  inspection_rules,
  withTransaction,
} from '@fairfold/db';
import { createBlobStore, inspectImage } from '@fairfold/ledger';
import type { Jobs } from '@fairfold/jobs';
import type { AuthContext } from '../auth.js';

type InspectionPhoto = { bytes: Buffer; mime: string; label: string };

function merchantId(auth: AuthContext): string {
  if (auth.role !== 'merchant') throw new AppError('FORBIDDEN', 'Merchant access is required', 403);
  return UuidSchema.parse(auth.subjectId);
}

export function createInspectionService(options: {
  database: Pick<ReturnType<typeof createDatabase>, 'db' | 'pool'>;
  jobs: Pick<Jobs, 'publish'>;
  clock?: Clock;
}) {
  return {
    async upload(
      auth: AuthContext,
      hypothesisId: string,
      batchCode: string | undefined,
      photos: InspectionPhoto[],
      labels: string[],
    ) {
      const merchant = merchantId(auth);
      UuidSchema.parse(hypothesisId);
      if (batchCode !== undefined && (!batchCode.trim() || batchCode.length > 255))
        throw new AppError('BATCH_CODE_INVALID', 'Batch code is invalid', 400);
      if (photos.length < 1 || photos.length > 6 || photos.length !== labels.length)
        throw new AppError(
          'INSPECTION_PHOTO_COUNT_INVALID',
          'One to six labelled photos are required',
          400,
        );
      const [hypothesis] = await options.database.db
        .select({
          id: hypotheses.id,
          merchantId: hypotheses.merchant_id,
          clusterLabel: complaint_clusters.label,
        })
        .from(hypotheses)
        .innerJoin(complaint_clusters, eq(complaint_clusters.id, hypotheses.cluster_id))
        .where(and(eq(hypotheses.id, hypothesisId), eq(hypotheses.merchant_id, merchant)));
      if (!hypothesis) throw new AppError('HYPOTHESIS_NOT_FOUND', 'Hypothesis not found', 404);
      const rules = await options.database.db
        .select()
        .from(inspection_rules)
        .where(
          and(
            eq(inspection_rules.merchant_id, merchant),
            ...(batchCode ? [eq(inspection_rules.batch_code, batchCode.trim())] : []),
            eq(inspection_rules.created_by_hypothesis_id, hypothesisId),
            eq(inspection_rules.active, true),
          ),
        );
      if (!rules.length)
        throw new AppError(
          'INSPECTION_RULE_NOT_FOUND',
          'No active inspection rule covers this hypothesis and batch',
          409,
        );
      if (rules.length !== 1)
        throw new AppError('BATCH_CODE_REQUIRED', 'Select a batch when multiple inspection rules apply', 400);
      const rule = rules[0]!;
      const stored: string[] = [];
      await withTransaction(options.database, async (tx, queueDb) => {
        const clock = options.clock ?? systemClock;
        const blobs = createBlobStore(tx, clock);
        for (const [index, photo] of photos.entries()) {
          const label = labels[index]!.trim();
          if (label !== rule.required_photo_label || photo.label !== label)
            throw new AppError('PHOTO_LABEL_INVALID', 'Inspection photo label is invalid', 400);
          const inspected = await inspectImage(photo.bytes, photo.mime, clock);
          if (inspected.exifOutsideWindow)
            throw new AppError(
              'PHOTO_EXIF_STALE',
              'Inspection photo EXIF timestamp is outside the freshness window',
              422,
            );
          stored.push(await blobs.put(photo.bytes, photo.mime));
        }
        const jobId = await options.jobs.publish(
          'inspection.uploaded',
          { hypothesisId, batchCode: rule.batch_code, photoShas: stored },
          { db: queueDb },
        );
        if (!jobId)
          throw new AppError(
            'INSPECTION_JOB_NOT_CREATED',
            'Inspection attestation could not be queued',
            503,
          );
      });
      return { photoShas: stored, requiredPhotoLabel: rule.required_photo_label };
    },
  };
}
