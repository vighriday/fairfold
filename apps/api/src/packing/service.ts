import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { AppError, UuidSchema, type Clock, systemClock } from '@fairfold/contracts';
import {
  attestations,
  inspection_rules,
  inventory_batches,
  ledger_entries,
  order_items,
  orders,
  shipments,
  type Database,
} from '@fairfold/db';
import { createBlobStore, inspectImage } from '@fairfold/ledger';
import { createLedger } from '@fairfold/ledger';
import type { Jobs } from '@fairfold/jobs';
import type { AuthContext } from '../auth.js';

const PhotoLabels = new Set(['item', 'size_label', 'batch_label', 'sealed_parcel', 'seam_closeup']);
const CarrierPattern = /^[A-Z0-9_]{1,64}$/;

type PhotoInput = {
  bytes: Buffer;
  mime: string;
  label: string;
};

function merchantId(auth: AuthContext): string {
  if (auth.role !== 'merchant') throw new AppError('FORBIDDEN', 'Merchant access is required', 403);
  return UuidSchema.parse(auth.subjectId);
}

function actor(id: string): `merchant:${string}` {
  return `merchant:${id}`;
}

function asJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AppError('INVALID_ATTESTATION', 'Attestation result is invalid', 409);
  return value as Record<string, unknown>;
}

function hasPassingInspection(
  latest: typeof attestations.$inferSelect | undefined,
  rule: typeof inspection_rules.$inferSelect | undefined,
): boolean {
  if (!latest || !rule || latest.step !== 'inspection' || latest.status !== 'match') return false;
  const result = asJsonObject(latest.result);
  const inspection = result.inspection;
  if (!inspection || typeof inspection !== 'object' || Array.isArray(inspection)) return false;
  return (
    (inspection as Record<string, unknown>).defectVisible === false &&
    latest.photo_labels.includes(rule.required_photo_label)
  );
}

export function createPackingService(options: {
  database: Pick<ReturnType<typeof import('@fairfold/db').createDatabase>, 'db' | 'pool'>;
  jobs: Pick<Jobs, 'publish'>;
  clock?: Clock;
}) {
  const clock = options.clock ?? systemClock;
  return {
    async get(auth: AuthContext, orderId: string) {
      const merchant = merchantId(auth);
      UuidSchema.parse(orderId);
      const [order] = await options.database.db
        .select()
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.merchant_id, merchant)));
      if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order not found', 404);
      const items = await options.database.db
        .select({
          id: order_items.id,
          productId: order_items.product_id,
          sku: order_items.sku,
          name: order_items.name,
          quantity: order_items.quantity,
          batchCode: order_items.batch_code,
        })
        .from(order_items)
        .where(eq(order_items.order_id, orderId));
      const photos = await options.database.db
        .select({
          sha256: ledger_entries.blob_sha256,
          label: sql<string>`(${ledger_entries.payload}->>'label')`,
          createdAt: ledger_entries.server_time,
        })
        .from(ledger_entries)
        .where(and(eq(ledger_entries.order_id, orderId), eq(ledger_entries.type, 'photo')))
        .orderBy(ledger_entries.seq)
        .then((rows) =>
          rows.filter((photo): photo is typeof photo & { sha256: string } => photo.sha256 !== null),
        );
      const [latest] = await options.database.db
        .select()
        .from(attestations)
        .where(eq(attestations.order_id, orderId))
        .orderBy(desc(attestations.created_at))
        .limit(1);
      const productIds = items.map((item) => item.productId);
      const batches = productIds.length
        ? await options.database.db
            .select({
              id: inventory_batches.id,
              batchCode: inventory_batches.batch_code,
              qtyRemaining: inventory_batches.qty_remaining,
              status: inventory_batches.status,
            })
            .from(inventory_batches)
            .where(
              and(
                eq(inventory_batches.merchant_id, merchant),
                inArray(inventory_batches.product_id, productIds),
                eq(inventory_batches.status, 'active'),
              ),
            )
        : [];
      const batchCodes = batches.map((batch) => batch.batchCode);
      const rules = batchCodes.length
        ? await options.database.db
            .select()
            .from(inspection_rules)
            .where(
              and(
                eq(inspection_rules.merchant_id, merchant),
                eq(inspection_rules.active, true),
                inArray(inspection_rules.batch_code, batchCodes),
              ),
            )
        : [];
      const rule = rules[0];
      const blockers = await this.blockers(order, latest, rule, false);
      const attestationStatus: 'match' | 'mismatch' | 'could_not_verify' | null = latest
        ? latest.status === 'match' ||
          latest.status === 'mismatch' ||
          latest.status === 'could_not_verify'
          ? latest.status
          : 'could_not_verify'
        : null;
      return {
        photos: photos.map((photo) => ({
          sha256: photo.sha256,
          label: photo.label,
          createdAt: photo.createdAt.toISOString(),
        })),
        attestation: latest
          ? {
              id: latest.id,
              status: attestationStatus!,
              confidence: latest.confidence,
              result: latest.result,
              createdAt: latest.created_at.toISOString(),
            }
          : null,
        inspectionRule: rule
          ? {
              id: rule.id,
              batchCode: rule.batch_code,
              instruction: rule.instruction,
              requiredPhotoLabel: rule.required_photo_label,
            }
          : null,
        batches,
        canSeal: blockers.length === 0,
        blockers,
      };
    },

    async uploadPhotos(
      auth: AuthContext,
      orderId: string,
      input: { photos: PhotoInput[]; batchCodes: Record<string, string> },
    ) {
      const merchant = merchantId(auth);
      UuidSchema.parse(orderId);
      if (input.photos.length < 1 || input.photos.length > 6)
        throw new AppError('PHOTO_COUNT_INVALID', 'One to six photos are required', 400);
      const [order] = await options.database.db
        .select()
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.merchant_id, merchant)));
      if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order not found', 404);
      if (!['captured', 'packing'].includes(order.status))
        throw new AppError('PACK_STATE_CONFLICT', 'Only captured orders can be packed', 409);
      const items = await options.database.db
        .select({ id: order_items.id })
        .from(order_items)
        .where(eq(order_items.order_id, orderId));
      for (const id of Object.keys(input.batchCodes))
        if (!items.some((item) => item.id === id))
          throw new AppError(
            'BATCH_ITEM_MISMATCH',
            'Batch code references another order item',
            409,
          );
      const stored: Array<{ hash: string; label: string }> = [];
      const database = options.database.db;
      await database.transaction(async (tx) => {
        const blobs = createBlobStore(tx, clock);
        const ledger = createLedger(tx, clock);
        for (const photo of input.photos) {
          if (!PhotoLabels.has(photo.label))
            throw new AppError('PHOTO_LABEL_INVALID', 'Photo label is not supported', 400);
          const inspected = await inspectImage(photo.bytes, photo.mime, clock);
          if (inspected.exifOutsideWindow)
            throw new AppError(
              'PHOTO_EXIF_STALE',
              'Photo EXIF timestamp is outside the freshness window',
              422,
            );
          const hash = await blobs.put(photo.bytes, photo.mime);
          const reused = await blobs.photoUsedByMerchant(hash, merchant);
          if (reused.some((id) => id !== orderId))
            throw new AppError(
              'PHOTO_REUSED',
              'Photo is already attached to another merchant order',
              409,
            );
          await ledger.append(orderId, {
            type: 'photo',
            actor: actor(merchant),
            blob_sha256: hash,
            payload: { label: photo.label },
          });
          stored.push({ hash, label: photo.label });
        }
        await tx.update(orders).set({ status: 'packing' }).where(eq(orders.id, orderId));
        const jobId = await options.jobs.publish(
          'pack.photos_uploaded',
          {
            orderId,
            photoShas: stored.map((photo) => photo.hash),
            labels: stored.map((photo) => photo.label),
            batchCodes: input.batchCodes,
          },
          { db: { executeSql: (query, values) => options.database.pool.query(query, values) } },
        );
        if (!jobId)
          throw new AppError(
            'PACK_JOB_NOT_CREATED',
            'Packing attestation could not be queued',
            503,
          );
      });
      return { photoShas: stored.map((photo) => photo.hash) };
    },

    async override(auth: AuthContext, orderId: string, reason: string) {
      const merchant = merchantId(auth);
      UuidSchema.parse(orderId);
      if (!reason.trim() || reason.length > 2000)
        throw new AppError('OVERRIDE_REASON_INVALID', 'A bounded override reason is required', 400);
      const [order] = await options.database.db
        .select()
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.merchant_id, merchant)));
      if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order not found', 404);
      const [latest] = await options.database.db
        .select()
        .from(attestations)
        .where(eq(attestations.order_id, orderId))
        .orderBy(desc(attestations.created_at))
        .limit(1);
      if (!latest || latest.status === 'match')
        throw new AppError(
          'OVERRIDE_NOT_ALLOWED',
          'Only an attestation mismatch can be overridden',
          409,
        );
      await createLedger(options.database.db, clock).append(orderId, {
        type: 'override',
        actor: actor(merchant),
        payload: { reason: reason.trim(), attestationId: latest.id },
      });
      return { status: 'overridden' as const };
    },

    async seal(
      auth: AuthContext,
      orderId: string,
      input: {
        batchCodes: Record<string, string>;
        carrier: string;
        carrierNameOther?: string;
        trackingNumber: string;
        packer: string;
      },
    ) {
      const merchant = merchantId(auth);
      UuidSchema.parse(orderId);
      if (!CarrierPattern.test(input.carrier))
        throw new AppError('TRACKING_CARRIER_INVALID', 'Tracking carrier is invalid', 400);
      if (input.carrier === 'OTHER' && !input.carrierNameOther?.trim())
        throw new AppError(
          'TRACKING_CARRIER_NAME_REQUIRED',
          'A named carrier is required for OTHER',
          400,
        );
      if (input.carrier !== 'OTHER' && input.carrierNameOther !== undefined)
        throw new AppError(
          'TRACKING_CARRIER_NAME_INVALID',
          'Named carrier is only valid for OTHER',
          400,
        );
      if (!input.trackingNumber.trim() || input.trackingNumber.length > 64)
        throw new AppError('TRACKING_NUMBER_INVALID', 'Tracking number is invalid', 400);
      if (!input.packer.trim() || input.packer.length > 255)
        throw new AppError('PACKER_INVALID', 'Packer is invalid', 400);
      const result = await options.database.db.transaction(async (tx) => {
        const [order] = await tx
          .select()
          .from(orders)
          .where(and(eq(orders.id, orderId), eq(orders.merchant_id, merchant)))
          .for('update');
        if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order not found', 404);
        if (order.status === 'sealed' || order.status === 'shipped' || order.status === 'delivered')
          throw new AppError('ALREADY_SEALED', 'Order has already been sealed', 409);
        if (!['captured', 'packing'].includes(order.status))
          throw new AppError(
            'PACK_STATE_CONFLICT',
            'Order cannot be sealed in its current state',
            409,
          );
        const items = await tx.select().from(order_items).where(eq(order_items.order_id, orderId));
        if (!items.length || items.some((item) => !input.batchCodes[item.id]))
          throw new AppError('BATCH_MISMATCH', 'Every order item must have a batch code', 409);
        const codes = items.map((item) => input.batchCodes[item.id]!);
        const batches = await tx
          .select()
          .from(inventory_batches)
          .where(
            and(
              eq(inventory_batches.merchant_id, merchant),
              inArray(inventory_batches.batch_code, codes),
            ),
          )
          .for('update');
        for (const item of items) {
          const batch = batches.find(
            (candidate) => candidate.batch_code === input.batchCodes[item.id],
          );
          if (!batch || batch.status !== 'active' || batch.qty_remaining < item.quantity)
            throw new AppError('NO_STOCK', 'The selected batch cannot fulfil this order', 409);
        }
        const [latest] = await tx
          .select()
          .from(attestations)
          .where(eq(attestations.order_id, orderId))
          .orderBy(desc(attestations.created_at))
          .limit(1);
        const rules = await tx
          .select()
          .from(inspection_rules)
          .where(
            and(
              eq(inspection_rules.merchant_id, merchant),
              eq(inspection_rules.active, true),
              inArray(inspection_rules.batch_code, codes),
            ),
          );
        const blockers = await this.blockers(order, latest, rules[0], true, tx);
        if (blockers.length)
          throw new AppError('PACK_BLOCKED', 'Order cannot be sealed', 409, { blockers });
        const now = new Date(Math.trunc(clock.now().getTime()));
        for (const item of items) {
          const code = input.batchCodes[item.id]!;
          await tx
            .update(order_items)
            .set({ batch_code: code, packed_by: input.packer.trim(), packed_at: now })
            .where(eq(order_items.id, item.id));
          await tx
            .update(inventory_batches)
            .set({ qty_remaining: sql`${inventory_batches.qty_remaining} - ${item.quantity}` })
            .where(
              eq(inventory_batches.id, batches.find((batch) => batch.batch_code === code)!.id),
            );
        }
        const [shipment] = await tx
          .insert(shipments)
          .values({
            order_id: orderId,
            carrier: input.carrier,
            carrier_name_other: input.carrierNameOther?.trim() ?? null,
            tracking_number: input.trackingNumber.trim(),
            status: 'label_created',
          })
          .returning();
        await tx
          .update(orders)
          .set({ status: 'sealed', sealed_at: now })
          .where(eq(orders.id, orderId));
        await createLedger(tx, clock).append(orderId, {
          type: 'sealed',
          actor: actor(merchant),
          payload: {
            batchCodes: input.batchCodes,
            carrier: input.carrier,
            trackingNumber: input.trackingNumber.trim(),
            shipmentId: shipment!.id,
          },
        });
        return { orderId, shipmentId: shipment!.id };
      });
      const jobId = await options.jobs.publish('tracking.push', { orderId });
      if (!jobId)
        throw new AppError('TRACKING_JOB_NOT_CREATED', 'Tracking could not be queued', 503);
      return { ...result, status: 'sealed' as const };
    },

    async blockers(
      order: typeof orders.$inferSelect,
      latest: typeof attestations.$inferSelect | undefined,
      rule: typeof inspection_rules.$inferSelect | undefined,
      includeAttestation = true,
      executor: Database | Parameters<Parameters<Database['transaction']>[0]>[0] = options.database
        .db,
    ) {
      const blockers: string[] = [];
      if (order.hold_reason) blockers.push('ORDER_HELD');
      if (rule && !hasPassingInspection(latest, rule)) blockers.push('INSPECTION_REQUIRED');
      if (includeAttestation && latest && latest.status !== 'match')
        blockers.push('ATTESTATION_MISMATCH');
      const overrides = await executor
        .select({
          type: ledger_entries.type,
          attestationId: sql<string>`(${ledger_entries.payload}->>'attestationId')`,
        })
        .from(ledger_entries)
        .where(and(eq(ledger_entries.order_id, order.id), eq(ledger_entries.type, 'override')));
      if (
        blockers.includes('ATTESTATION_MISMATCH') &&
        latest &&
        overrides.some((row) => row.attestationId === latest.id)
      )
        blockers.splice(blockers.indexOf('ATTESTATION_MISMATCH'), 1);
      return blockers;
    },
  };
}
