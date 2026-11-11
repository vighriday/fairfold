import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { attestations, inspection_rules, complaint_clusters, hypotheses } from '@fairfold/db';
import { createBlobStore, createLedger } from '@fairfold/ledger';
import { upsertComplaint } from '../../src/complaints/create.js';
import { createHandlers } from '../../src/handlers.js';
import { readComplaintWith } from '../../src/sharedCause/scan.js';
import { mockModel } from '../helpers/mockModel.js';
import {
  dbUrl,
  insertMerchant,
  insertOrder,
  insertProduct,
  openTestDb,
  resetTables,
  testRuntime,
} from './harness.js';

const jpeg = (r: number) =>
  sharp({ create: { width: 64, height: 48, channels: 3, background: { r, g: 40, b: 90 } } })
    .jpeg()
    .toBuffer();

describe.skipIf(!dbUrl)('evidence agent against Postgres', () => {
  let database: Awaited<ReturnType<typeof openTestDb>>;
  beforeAll(async () => {
    database = await openTestDb();
  });
  afterAll(async () => {
    await database?.close();
  });
  beforeEach(async () => {
    await resetTables(database.db);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  async function packedOrder() {
    const merchant = await insertMerchant(database.db);
    const product = await insertProduct(database.db, merchant.id);
    const { order, item } = await insertOrder(database.db, {
      merchantId: merchant.id,
      product,
      batchCode: 'B17',
    });
    const { runtime } = testRuntime(database.db);
    const blobs = createBlobStore(database.db, runtime.clock);
    const shas = [
      await blobs.put(await jpeg(10), 'image/jpeg'),
      await blobs.put(await jpeg(20), 'image/jpeg'),
    ];
    return { merchant, product, order, item, runtime, shas };
  }

  it('pack.photos_uploaded stores the attestation and chains one verified ledger entry', async () => {
    const { order, item, runtime, shas } = await packedOrder();
    const { model, calls } = mockModel([
      {
        items: [
          {
            orderItemId: item.id,
            seen: { itemType: 'hoodie', colour: 'navy', sizeLabel: 'M', quantity: 1 },
            matches: true,
            confidence: 0.93,
            notes: '',
          },
        ],
        batchLabelText: 'B17',
        shippingLabel: { visible: true, trackingNumberText: 'FF100000001' },
        defects: [],
        inspection: null,
        couldNotVerify: [],
        confidence: 0.9,
      },
    ]);
    runtime.models.vision = model;
    await createHandlers(() => runtime)['pack.photos_uploaded']!({
      orderId: order.id,
      photoShas: shas,
      labels: ['item', 'size_label'],
      batchCodes: { [item.id]: 'B17' },
    });
    expect(calls).toHaveLength(1);
    const rows = await database.db
      .select()
      .from(attestations)
      .where(eq(attestations.order_id, order.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      step: 'pack',
      status: 'match',
      batch_code: 'B17',
      model: 'mock-vision',
      photo_shas: shas,
    });
    const chain = await createLedger(database.db).verify(order.id);
    expect(chain.verified).toBe(true);
    expect(chain.entries.map((e) => e.type)).toEqual(['attestation']);
    expect(chain.entries[0]!.payload).toMatchObject({
      attestationId: rows[0]!.id,
      status: 'match',
    });
  });

  it("a buyer's report photos are described as a buyer_photo attestation when the complaint is read, once", async () => {
    const { merchant, order, item, runtime, shas } = await packedOrder();
    const extraction = {
      category: 'product_defect',
      component: 'left sleeve seam',
      failureMode: 'stitching came apart',
      locationOnItem: 'left sleeve',
      severity: 'functional',
      summary: 'The left sleeve seam came apart.',
      language: 'en',
    };
    const described = {
      items: [
        {
          orderItemId: item.id,
          seen: { itemType: 'hoodie', colour: 'navy', sizeLabel: null, quantity: 1 },
          matches: true,
          confidence: 0.88,
          notes: '',
        },
      ],
      batchLabelText: null,
      shippingLabel: { visible: false, trackingNumberText: null },
      defects: [
        { component: 'left sleeve seam', description: 'seam open', severity: 'functional' },
      ],
      inspection: null,
      couldNotVerify: ['shipping label'],
      confidence: 0.85,
    };
    const first = mockModel([extraction, described]);
    runtime.models.vision = first.model;
    const { id } = await upsertComplaint(runtime, {
      merchantId: merchant.id,
      orderId: order.id,
      buyerId: null,
      source: 'buyer_report',
      sourceRef: 'report-1',
      text: 'The left sleeve seam came apart after one wear.',
      imageShas: shas,
    });

    await readComplaintWith(runtime, id);
    const again = mockModel([extraction]);
    runtime.models.vision = again.model;
    await readComplaintWith(runtime, id); // a redelivered complaint.created job

    const rows = await database.db
      .select()
      .from(attestations)
      .where(eq(attestations.order_id, order.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      step: 'buyer_photo',
      status: 'match',
      hypothesis_id: null,
      batch_code: null,
      model: 'mock-vision',
      photo_shas: shas,
      photo_labels: ['buyer_photo', 'buyer_photo'],
    });
    expect(first.calls).toHaveLength(2);
    expect(again.calls).toHaveLength(1);
    expect((await createLedger(database.db).verify(order.id)).entries).toEqual([]);
  });

  it('photos uploaded one at a time are attested together, and both attestations are chained', async () => {
    const { order, item, runtime, shas } = await packedOrder();
    const { model, calls } = mockModel([
      {
        items: [
          {
            orderItemId: item.id,
            seen: { itemType: 'hoodie', colour: 'navy', sizeLabel: 'M', quantity: 1 },
            matches: true,
            confidence: 0.93,
            notes: '',
          },
        ],
        batchLabelText: 'B17',
        shippingLabel: { visible: true, trackingNumberText: 'FF100000001' },
        defects: [],
        inspection: null,
        couldNotVerify: [],
        confidence: 0.9,
      },
    ]);
    runtime.models.vision = model;
    const pack = createHandlers(() => runtime)['pack.photos_uploaded']!;
    await pack({
      orderId: order.id,
      photoShas: [shas[0]!],
      labels: ['item'],
      batchCodes: { [item.id]: 'B17' },
    });
    await pack({
      orderId: order.id,
      photoShas: [shas[1]!],
      labels: ['sealed_parcel'],
      batchCodes: { [item.id]: 'B17' },
    });
    const rows = await database.db
      .select()
      .from(attestations)
      .where(eq(attestations.order_id, order.id))
      .orderBy(attestations.created_at);
    expect(rows.map((r) => r.photo_shas)).toEqual([[shas[0]], [shas[0], shas[1]]]);
    expect(rows[1]!.photo_labels).toEqual(['item', 'sealed_parcel']);
    expect(calls).toHaveLength(2);
    const chain = await createLedger(database.db).verify(order.id);
    expect(chain.verified).toBe(true);
    expect(chain.entries.map((e) => e.type)).toEqual(['attestation', 'attestation']);
  });

  it('an active inspection rule on the batch reaches the prompt with its cluster label', async () => {
    const { merchant, order, item, runtime, shas } = await packedOrder();
    const [cluster] = await database.db
      .insert(complaint_clusters)
      .values({
        merchant_id: merchant.id,
        category: 'product_defect',
        label: 'sleeve seam opening',
        centroid: [1, 0],
      })
      .returning();
    const [hyp] = await database.db
      .insert(hypotheses)
      .values({
        merchant_id: merchant.id,
        cluster_id: cluster!.id,
        dimension: 'batch_code',
        value: 'B17',
        strength: 'strong',
        stats: {},
        alternatives: [],
        affected: {},
        explanation: 'x',
      })
      .returning();
    await database.db.insert(inspection_rules).values({
      merchant_id: merchant.id,
      batch_code: 'B17',
      instruction: 'Photograph the left sleeve seam close up.',
      required_photo_label: 'seam_closeup',
      created_by_hypothesis_id: hyp!.id,
    });
    const { model, calls } = mockModel([
      {
        items: [],
        batchLabelText: null,
        shippingLabel: { visible: false, trackingNumberText: null },
        defects: [],
        inspection: null,
        couldNotVerify: [],
        confidence: 0.5,
      },
    ]);
    runtime.models.vision = model;
    await createHandlers(() => runtime)['pack.photos_uploaded']!({
      orderId: order.id,
      photoShas: shas,
      labels: ['item', 'seam_closeup'],
      batchCodes: { [item.id]: 'B17' },
    });
    expect(JSON.stringify(calls[0]!.prompt)).toContain('sleeve seam opening');
    const [row] = await database.db
      .select()
      .from(attestations)
      .where(eq(attestations.order_id, order.id));
    expect(row!.status).toBe('could_not_verify');
  });
});
