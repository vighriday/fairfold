import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixedClock } from '@fairfold/contracts';
import {
  attestations,
  createDatabase,
  inventory_batches,
  merchants,
  migrateDatabase,
  order_items,
  orders,
  products,
  shipments,
} from '@fairfold/db';
import { createJobs, type Jobs } from '@fairfold/jobs';
import { testDatabaseUrl } from '../../../packages/db/test/environment.js';
import { createPackingService } from '../src/packing/service.js';

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
    return { merchant: merchant!, order: order!, item: item!, batch: batch! };
  }

  async function photo() {
    return Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
  }

  it('stores normalized photos, publishes one attestation job, and reports exact pack state', async () => {
    const f = await fixture();
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
    const service = createPackingService({ database, jobs, clock });
    const input = {
      batchCodes: { [f.item.id]: f.batch.batch_code },
      carrier: 'UPS',
      trackingNumber: '1Z-H5-' + f.order.id.slice(0, 8),
      packer: 'station-1',
    };
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
});
