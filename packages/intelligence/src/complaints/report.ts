// Endpoint 32 (section 9 stage 1, source buyer_report): a buyer reports a problem with their own paid order, with
// up to 4 photos stored through blobs.put (validated, re-encoded, deduplicated). The complaint is then read.
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { AppError } from '@fairfold/contracts';
import { orders } from '@fairfold/db';
import { createBlobStore } from '@fairfold/ledger';
import type { IntelRuntime } from '../runtime.js';
import { MAX_COMPLAINT_PHOTOS } from '../sharedCause/reader.js';
import { upsertComplaint } from './create.js';

const REPORTABLE = new Set(['captured', 'packing', 'sealed', 'shipped', 'delivered', 'refunded']);

export async function reportProblem(
  rt: IntelRuntime,
  buyerId: string,
  orderId: string,
  text: string,
  photos: Array<{ bytes: Buffer; mime: string }>,
): Promise<{ complaintId: string }> {
  const [order] = await rt.db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order not found', 404);
  if (order.buyer_id !== buyerId)
    throw new AppError('FORBIDDEN', 'This order belongs to another account', 403);
  if (!order.captured_at || !REPORTABLE.has(order.status))
    throw new AppError('ORDER_NOT_CAPTURED', 'Only a paid order can be reported', 409);
  if (photos.length > MAX_COMPLAINT_PHOTOS)
    throw new AppError('TOO_MANY_PHOTOS', `At most ${MAX_COMPLAINT_PHOTOS} photos`, 400, {
      max: MAX_COMPLAINT_PHOTOS,
    });

  const blobs = createBlobStore(rt.db, rt.clock);
  const imageShas: string[] = [];
  for (const photo of photos) imageShas.push(await blobs.put(photo.bytes, photo.mime));

  // The complaint and its complaint.created job commit together, so a stored complaint is always read.
  const complaintId = await rt.db.transaction(async (tx) => {
    const { id } = await upsertComplaint(
      rt,
      {
        merchantId: order.merchant_id,
        orderId,
        buyerId,
        source: 'buyer_report',
        sourceRef: randomUUID(),
        text,
        imageShas: [...new Set(imageShas)],
      },
      tx,
    );
    await rt.jobs.publish('complaint.created', { complaintId: id }, { tx });
    return id;
  });
  return { complaintId };
}
