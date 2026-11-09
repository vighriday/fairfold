import { and, eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';
import exifReader from 'exif-reader';
import { AppError, systemClock, type Clock } from '@fairfold/contracts';
import { evidence_blobs, ledger_entries, orders } from '@fairfold/db';
import type { DatabaseExecutor } from './ledger.js';
import { sha256 } from './canonical.js';

export const MaxPhotoBytes = 12 * 1024 * 1024;
export const MaxImageDimension = 2048;

export async function inspectImage(bytes: Buffer, mime: string, clock: Clock = systemClock) {
  if (mime !== 'image/jpeg' && mime !== 'image/png')
    throw new AppError('UNSUPPORTED_IMAGE', 'Only JPEG and PNG photos are accepted', 415);
  if (bytes.length > MaxPhotoBytes)
    throw new AppError('FILE_TOO_LARGE', 'Photo exceeds 12 MB', 413);
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
  try {
    metadata = await sharp(bytes).metadata();
  } catch {
    throw new AppError('INVALID_IMAGE', 'Photo cannot be decoded', 400);
  }
  if (
    (mime === 'image/jpeg' && metadata.format !== 'jpeg') ||
    (mime === 'image/png' && metadata.format !== 'png')
  ) {
    throw new AppError('IMAGE_TYPE_MISMATCH', 'Photo bytes do not match the declared type', 415);
  }
  let capturedAt: Date | null = null;
  let exifUnreadable = false;
  if (metadata.exif) {
    try {
      const exif = exifReader(metadata.exif);
      const timestamp =
        exif.Photo?.DateTimeOriginal ?? exif.Photo?.DateTimeDigitized ?? exif.Image?.DateTime;
      if (timestamp instanceof Date && Number.isFinite(timestamp.getTime())) capturedAt = timestamp;
    } catch {
      exifUnreadable = true;
    }
  }
  const exifOutsideWindow =
    capturedAt !== null && Math.abs(clock.now().getTime() - capturedAt.getTime()) > 15 * 60 * 1000;
  return { metadata, capturedAt, exifOutsideWindow, exifUnreadable };
}

export function createBlobStore(database: DatabaseExecutor, clock: Clock = systemClock) {
  return {
    async put(bytes: Buffer, mime: string): Promise<string> {
      let stored = bytes;
      let storedMime = mime;
      let width: number | null = null;
      let height: number | null = null;
      if (mime.startsWith('image/')) {
        await inspectImage(bytes, mime, clock);
        const normalized = await sharp(bytes)
          .rotate()
          .resize({
            width: MaxImageDimension,
            height: MaxImageDimension,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: 85 })
          .toBuffer({ resolveWithObject: true });
        stored = normalized.data;
        storedMime = 'image/jpeg';
        width = normalized.info.width;
        height = normalized.info.height;
      } else if (mime !== 'application/pdf' || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
        throw new AppError(
          'UNSUPPORTED_BLOB',
          'Only packing images and generated PDFs are accepted',
          415,
        );
      }
      const hash = sha256(stored);
      await database
        .insert(evidence_blobs)
        .values({
          sha256: hash,
          mime: storedMime,
          bytes: stored,
          width,
          height,
          created_at: clock.now(),
        })
        .onConflictDoUpdate({
          target: evidence_blobs.sha256,
          set: { bytes: stored, purged_at: null },
        });
      return hash;
    },
    async get(hash: string) {
      if (!/^[a-f0-9]{64}$/.test(hash))
        throw new AppError('INVALID_BLOB_HASH', 'Invalid evidence identifier', 400);
      const [blob] = await database
        .select()
        .from(evidence_blobs)
        .where(eq(evidence_blobs.sha256, hash));
      if (!blob) throw new AppError('BLOB_NOT_FOUND', 'Evidence not found', 404);
      if (!blob.bytes) throw new AppError('BLOB_PURGED', 'Evidence bytes have expired', 410);
      if (sha256(blob.bytes) !== hash)
        throw new AppError('BLOB_INTEGRITY_FAILED', 'Evidence integrity check failed', 409);
      return blob;
    },
    async photoUsedByMerchant(hash: string, merchantId: string) {
      const matches = await database
        .select({ orderId: orders.id })
        .from(ledger_entries)
        .innerJoin(orders, eq(ledger_entries.order_id, orders.id))
        .where(
          and(
            eq(orders.merchant_id, merchantId),
            eq(ledger_entries.blob_sha256, hash),
            inArray(ledger_entries.type, ['photo', 'inspection']),
          ),
        );
      return [...new Set(matches.map((row) => row.orderId))];
    },
  };
}
