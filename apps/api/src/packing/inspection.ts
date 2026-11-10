import { and, eq } from 'drizzle-orm';
import { AppError, UuidSchema } from '@fairfold/contracts';
import { complaint_clusters, createDatabase, hypotheses, inspection_rules } from '@fairfold/db';
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
}) {
  return {
    async upload(
      auth: AuthContext,
      hypothesisId: string,
      batchCode: string,
      photos: InspectionPhoto[],
      labels: string[],
    ) {
      const merchant = merchantId(auth);
      UuidSchema.parse(hypothesisId);
      if (!batchCode.trim() || batchCode.length > 255)
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
      const [rule] = await options.database.db
        .select()
        .from(inspection_rules)
        .where(
          and(
            eq(inspection_rules.merchant_id, merchant),
            eq(inspection_rules.batch_code, batchCode.trim()),
            eq(inspection_rules.created_by_hypothesis_id, hypothesisId),
            eq(inspection_rules.active, true),
          ),
        );
      if (!rule)
        throw new AppError(
          'INSPECTION_RULE_NOT_FOUND',
          'No active inspection rule covers this hypothesis and batch',
          409,
        );
      const stored: string[] = [];
      await options.database.db.transaction(async (tx) => {
        const blobs = createBlobStore(tx);
        for (const [index, photo] of photos.entries()) {
          const label = labels[index]!.trim();
          if (!label || label.length > 255)
            throw new AppError('PHOTO_LABEL_INVALID', 'Inspection photo label is invalid', 400);
          const inspected = await inspectImage(photo.bytes, photo.mime);
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
          { hypothesisId, batchCode: batchCode.trim(), photoShas: stored },
          { db: { executeSql: (query, values) => options.database.pool.query(query, values) } },
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
