import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fixedClock } from '@fairfold/contracts';
import {
  attestations,
  complaint_clusters,
  createDatabase,
  hypotheses,
  inventory_batches,
  inspection_rules,
  merchants,
  migrateDatabase,
  order_items,
  orders,
  products,
  shipments,
  ledger_entries,
} from '@fairfold/db';
import { createJobs, type Jobs } from '@fairfold/jobs';
import { testDatabaseUrl } from '../../../packages/db/test/environment.js';
import { createPackingService } from '../src/packing/service.js';
import { createInspectionService } from '../src/packing/inspection.js';

const integrationUrl = testDatabaseUrl();
const clock = fixedClock('2026-11-10T12:00:00.000Z');

describe.skipIf(!integrationUrl)('H5 Pack Station persistence', () => {
  let database: ReturnType<typeof createDatabase>;
  let jobs: Jobs;
  beforeAll(async () => {
    database = createDatabase(integrationUrl!);
    await migrateDatabase(database.db);
    jobs = createJobs(integrationUrl!, {
      schema: 'h5_pack_' + randomUUID().replaceAll('-', ''),
      clock,
    });
    await jobs.start();
  });
  afterAll(async () => {
    await jobs?.stop();
    await database?.close();
  });

  async function fixture() {
    const id = randomUUID();
    const [merchant] = await database.db
      .insert(merchants)
      .values({
        slug: 'h5-' + id,
        name: 'H5 merchant',
        domain: 'h5.example.invalid',
        country: 'US',
      })
      .returning();
    const [product] = await database.db
      .insert(products)
      .values({
        merchant_id: merchant!.id,
        sku: 'H5-HOODIE',
        name: 'H5 hoodie',
        description: 'H5 fixture',
        unit_value: '38.00',
        currency: 'USD',
        listing_version: 'v1',
      })
      .returning();
    const [order] = await database.db
      .insert(orders)
      .values({
        id,
        merchant_id: merchant!.id,
        paypal_order_id: 'O' + id.replaceAll('-', '').toUpperCase(),
        paypal_capture_id: 'C' + id.replaceAll('-', '').toUpperCase(),
        invoice_id: 'FF-' + id,
        status: 'captured',
        amount_value: '38.00',
        currency: 'USD',
        captured_at: clock.now(),
      })
      .returning();
    const [item] = await database.db
      .insert(order_items)
      .values({
        order_id: order!.id,
        product_id: product!.id,
        sku: product!.sku,
        name: product!.name,
        quantity: 1,
        unit_value: product!.unit_value,
        listing_version: product!.listing_version,
      })
      .returning();
    const [batch] = await database.db
      .insert(inventory_batches)
      .values({
        merchant_id: merchant!.id,
        product_id: product!.id,
        batch_code: 'BATCH-' + id.slice(0, 8),
        received_at: clock.now(),
        qty_received: 2,
        qty_remaining: 2,
      })
      .returning();
    const [cluster] = await database.db
      .insert(complaint_clusters)
      .values({
        merchant_id: merchant!.id,
        product_id: product!.id,
        category: 'product_defect',
        label: 'seam',
        centroid: [1],
      })
      .returning();
    const [hypothesis] = await database.db
      .insert(hypotheses)
      .values({
        merchant_id: merchant!.id,
        cluster_id: cluster!.id,
        dimension: 'batch_code',
        value: batch!.batch_code,
        strength: 'strong',
        stats: {},
        alternatives: [],
        affected: {},
        explanation: 'Synthetic H5 hypothesis',
      })
      .returning();
    await database.db.insert(inspection_rules).values({
      merchant_id: merchant!.id,
      product_id: product!.id,
      batch_code: batch!.batch_code,
      instruction: 'Inspect the seam',
      required_photo_label: 'seam_closeup',
      created_by_hypothesis_id: hypothesis!.id,
    });
    return {
      merchant: merchant!,
      order: order!,
      item: item!,
      batch: batch!,
      hypothesis: hypothesis!,
    };
  }

  async function photo() {
    return Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
  }

  async function attest(
    f: Awaited<ReturnType<typeof fixture>>,
    service: ReturnType<typeof createPackingService>,
    result: Record<string, unknown> = {},
  ) {
    const uploaded = await service.uploadPhotos(
      { role: 'merchant', subjectId: f.merchant.id },
      f.order.id,
      {
        photos: [{ bytes: await photo(), mime: 'image/png', label: 'seam_closeup' }],
        batchCodes: { [f.item.id]: f.batch.batch_code },
      },
    );
    const [row] = await database.db
      .insert(attestations)
      .values({
        order_id: f.order.id,
        step: 'pack',
        photo_shas: uploaded.photoShas,
        photo_labels: ['seam_closeup'],
        model: 'synthetic-audit',
        result,
        status: 'match',
        confidence: 1,
        created_at: clock.now(),
      })
      .returning();
    return row!;
  }

  it('stores normalized photos, publishes one attestation job, and reports exact pack state', async () => {
    const f = await fixture();
    await database.db
      .delete(inspection_rules)
      .where(eq(inspection_rules.batch_code, f.batch.batch_code));
    const service = createPackingService({ database, jobs, clock });
    const result = await service.uploadPhotos(
      { role: 'merchant', subjectId: f.merchant.id },
      f.order.id,
      {
        photos: [{ bytes: await photo(), mime: 'image/png', label: 'sealed_parcel' }],
        batchCodes: { [f.item.id]: f.batch.batch_code },
      },
    );
    expect(result.photoShas).toHaveLength(1);
    expect(
      (await jobs.boss.findJobs('pack.photos_uploaded')).filter(
        (job) => (job.data as { orderId: string }).orderId === f.order.id,
      ),
    ).toHaveLength(1);
    await database.db.insert(attestations).values({
      order_id: f.order.id,
      step: 'pack',
      photo_shas: result.photoShas,
      photo_labels: ['sealed_parcel'],
      model: 'synthetic-h5',
      result: { inspection: null },
      status: 'match',
      confidence: 1,
      created_at: clock.now(),
    });
    const state = await service.get({ role: 'merchant', subjectId: f.merchant.id }, f.order.id);
    expect(state.canSeal).toBe(true);
    expect(state.photos[0]?.sha256).toBe(result.photoShas[0]);
    expect(state.batches[0]?.qtyRemaining).toBe(2);
  });

  it('seals once under concurrent attempts and never decrements stock twice', async () => {
    const f = await fixture();
    await database.db
      .delete(inspection_rules)
      .where(eq(inspection_rules.batch_code, f.batch.batch_code));
    const service = createPackingService({ database, jobs, clock });
    const input = {
      batchCodes: { [f.item.id]: f.batch.batch_code },
      carrier: 'UPS',
      trackingNumber: '1Z-H5-' + f.order.id.slice(0, 8),
      packer: 'station-1',
    };
    await attest(f, service);
    const results = await Promise.allSettled([
      service.seal({ role: 'merchant', subjectId: f.merchant.id }, f.order.id, input),
      service.seal({ role: 'merchant', subjectId: f.merchant.id }, f.order.id, input),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const [batch] = await database.db
      .select()
      .from(inventory_batches)
      .where(eq(inventory_batches.id, f.batch.id));
    expect(batch?.qty_remaining).toBe(1);
    expect(
      await database.db.select().from(shipments).where(eq(shipments.order_id, f.order.id)),
    ).toHaveLength(1);
    expect(
      await database.db
        .select()
        .from(orders)
        .where(and(eq(orders.id, f.order.id), eq(orders.status, 'sealed'))),
    ).toHaveLength(1);
  });

  it('stores shared-cause inspection photos and queues Ishaan attestation', async () => {
    const f = await fixture();
    const service = createInspectionService({ database, jobs });
    const result = await service.upload(
      { role: 'merchant', subjectId: f.merchant.id },
      f.hypothesis.id,
      f.batch.batch_code,
      [{ bytes: await photo(), mime: 'image/png', label: 'seam_closeup' }],
      ['seam_closeup'],
    );
    expect(result.requiredPhotoLabel).toBe('seam_closeup');
    expect(result.photoShas).toHaveLength(1);
    expect(
      (await jobs.boss.findJobs('inspection.uploaded')).some((job) => {
        const data = job.data as { hypothesisId: string; batchCode: string };
        return data.hypothesisId === f.hypothesis.id && data.batchCode === f.batch.batch_code;
      }),
    ).toBe(true);
  });

  it('enforces missing attestation, batch/tracking labels and a passing held-order inspection', async () => {
    const f = await fixture();
    const service = createPackingService({ database, jobs, clock });
    const auth = { role: 'merchant' as const, subjectId: f.merchant.id };
    const input = {
      batchCodes: { [f.item.id]: f.batch.batch_code },
      carrier: 'UPS',
      trackingNumber: 'AUDIT-TRACK',
      packer: 'station-1',
    };
    await expect(service.seal(auth, f.order.id, input)).rejects.toMatchObject({
      details: {
        blockers: expect.arrayContaining(['INSPECTION_REQUIRED', 'ATTESTATION_MISMATCH']),
      },
    });
    const row = await attest(f, service, {
      batchLabelText: 'OTHER-BATCH',
      shippingLabel: { trackingNumberText: 'OTHER-TRACK' },
      inspection: { defectVisible: false },
    });
    await expect(service.seal(auth, f.order.id, input)).rejects.toMatchObject({
      details: { blockers: expect.arrayContaining(['BATCH_MISMATCH', 'TRACKING_LABEL_MISMATCH']) },
    });
    await database.db
      .update(attestations)
      .set({
        result: {
          batchLabelText: f.batch.batch_code,
          shippingLabel: { trackingNumberText: input.trackingNumber },
          inspection: { defectVisible: false },
        },
      })
      .where(eq(attestations.id, row.id));
    await database.db
      .update(orders)
      .set({ hold_reason: 'Synthetic hold', held_by_hypothesis_id: f.hypothesis.id })
      .where(eq(orders.id, f.order.id));
    await database.db
      .update(inventory_batches)
      .set({ status: 'on_hold' })
      .where(eq(inventory_batches.id, f.batch.id));
    expect(await service.seal(auth, f.order.id, input)).toMatchObject({ status: 'sealed' });
  });

  it('rolls back photo writes and sealing when their queue insert fails', async () => {
    const f = await fixture();
    await database.db
      .delete(inspection_rules)
      .where(eq(inspection_rules.batch_code, f.batch.batch_code));
    const publish = vi.fn<Jobs['publish']>(async () => null);
    const failing = createPackingService({ database, jobs: { publish }, clock });
    const auth = { role: 'merchant' as const, subjectId: f.merchant.id };
    await expect(
      failing.uploadPhotos(auth, f.order.id, {
        photos: [{ bytes: await photo(), mime: 'image/png', label: 'item' }],
        batchCodes: { [f.item.id]: f.batch.batch_code },
      }),
    ).rejects.toMatchObject({ code: 'PACK_JOB_NOT_CREATED' });
    expect(
      await database.db
        .select()
        .from(ledger_entries)
        .where(eq(ledger_entries.order_id, f.order.id)),
    ).toHaveLength(0);
    const service = createPackingService({ database, jobs, clock });
    await attest(f, service);
    await expect(
      failing.seal(auth, f.order.id, {
        batchCodes: { [f.item.id]: f.batch.batch_code },
        carrier: 'UPS',
        trackingNumber: 'AUDIT-ROLLBACK',
        packer: 'station-1',
      }),
    ).rejects.toMatchObject({ code: 'TRACKING_JOB_NOT_CREATED' });
    expect(
      await database.db.select().from(shipments).where(eq(shipments.order_id, f.order.id)),
    ).toHaveLength(0);
    expect(
      (
        await database.db
          .select()
          .from(inventory_batches)
          .where(eq(inventory_batches.id, f.batch.id))
      )[0]?.qty_remaining,
    ).toBe(2);
    expect(
      (await database.db.select().from(orders).where(eq(orders.id, f.order.id)))[0]?.status,
    ).toBe('packing');
  });

  it('rejects stock shared across duplicate items and batches from another product', async () => {
    const f = await fixture();
    await database.db
      .delete(inspection_rules)
      .where(eq(inspection_rules.batch_code, f.batch.batch_code));
    const service = createPackingService({ database, jobs, clock });
    const auth = { role: 'merchant' as const, subjectId: f.merchant.id };
    const [extra] = await database.db
      .insert(order_items)
      .values({
        order_id: f.order.id,
        product_id: f.item.product_id,
        sku: f.item.sku,
        name: f.item.name,
        quantity: 2,
        unit_value: '38.00',
        listing_version: 'v1',
      })
      .returning();
    const input = {
      batchCodes: { [f.item.id]: f.batch.batch_code, [extra!.id]: f.batch.batch_code },
      carrier: 'UPS',
      trackingNumber: 'STOCK',
      packer: 'station-1',
    };
    await expect(service.seal(auth, f.order.id, input)).rejects.toMatchObject({ code: 'NO_STOCK' });
    await database.db.delete(order_items).where(eq(order_items.id, extra!.id));
    const [other] = await database.db
      .insert(products)
      .values({
        merchant_id: f.merchant.id,
        sku: 'OTHER',
        name: 'Other',
        description: 'Synthetic',
        unit_value: '1.00',
      })
      .returning();
    await database.db
      .update(inventory_batches)
      .set({ product_id: other!.id })
      .where(eq(inventory_batches.id, f.batch.id));
    delete input.batchCodes[extra!.id];
    await expect(service.seal(auth, f.order.id, input)).rejects.toMatchObject({ code: 'NO_STOCK' });
  });
});
