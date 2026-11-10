import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixedClock } from '@fairfold/contracts';
import {
  attestations,
  complaint_clusters,
  complaints,
  evidence_blobs,
  evidence_packs,
  hypotheses,
} from '@fairfold/db';
import { createBlobStore, createLedger } from '@fairfold/ledger';
import { buildEvidencePackWith } from '../../src/dispute/build.js';
import { createHandlers } from '../../src/handlers.js';
import { setIntelRuntime } from '../../src/runtime.js';
import { buildApi } from '../routes/api.js';
import {
  dbUrl,
  insertBuyer,
  insertDispute,
  insertMerchant,
  insertOrder,
  insertProduct,
  insertShipment,
  openTestDb,
  resetTables,
  testRuntime,
} from './harness.js';

const NOW = new Date('2026-11-11T12:00:00.000Z');
const at = (iso: string) => fixedClock(iso);
const jpeg = (r: number) =>
  sharp({ create: { width: 320, height: 240, channels: 3, background: { r, g: 60, b: 120 } } })
    .jpeg()
    .toBuffer();

describe.skipIf(!dbUrl)('dispute agent against Postgres', () => {
  let database: Awaited<ReturnType<typeof openTestDb>>;
  beforeAll(async () => {
    database = await openTestDb();
  });
  afterAll(async () => {
    setIntelRuntime(null);
    await database?.close();
  });
  beforeEach(async () => {
    await resetTables(database.db);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  /** A sealed, shipped and delivered order with packing photos, a match attestation and a full ledger. */
  async function packedOrder() {
    const merchant = await insertMerchant(database.db, {
      policy_urls: [{ kind: 'returns', url: 'https://neelblockprints.example/returns' }],
    });
    const product = await insertProduct(database.db, merchant.id);
    const buyer = await insertBuyer(database.db);
    const { order, item } = await insertOrder(database.db, {
      merchantId: merchant.id,
      buyerId: buyer.id,
      product,
      status: 'delivered',
      batchCode: 'B17',
      capturedAt: new Date('2026-11-01T10:00:00Z'),
      sealedAt: new Date('2026-11-02T09:00:00Z'),
      shippedAt: new Date('2026-11-02T12:00:00Z'),
      deliveredAt: new Date('2026-11-06T15:00:00Z'),
    });
    const blobs = createBlobStore(database.db);
    const shas = [
      await blobs.put(await jpeg(10), 'image/jpeg'),
      await blobs.put(await jpeg(200), 'image/jpeg'),
    ];
    await createLedger(database.db, at('2026-11-01T10:00:00Z')).append(order.id, {
      type: 'captured',
      payload: { amount: '38.00' },
    });
    await createLedger(database.db, at('2026-11-02T08:50:00Z')).append(order.id, {
      type: 'photo',
      payload: { label: 'item', exifOutsideWindow: true },
      blob_sha256: shas[0],
    });
    await createLedger(database.db, at('2026-11-02T08:51:00Z')).append(order.id, {
      type: 'photo',
      payload: { label: 'sealed_parcel' },
      blob_sha256: shas[1],
    });
    const [att] = await database.db
      .insert(attestations)
      .values({
        order_id: order.id,
        step: 'pack',
        batch_code: 'B17',
        photo_shas: shas,
        photo_labels: ['item', 'sealed_parcel'],
        model: 'grok-vision',
        status: 'match',
        confidence: 0.91,
        result: {
          items: [
            {
              orderItemId: item.id,
              seen: { itemType: 'hoodie', colour: 'navy', sizeLabel: 'M', quantity: 1 },
              matches: true,
              confidence: 0.92,
              notes: '',
            },
          ],
          batchLabelText: 'B17',
          shippingLabel: { visible: true, trackingNumberText: 'DHL123' },
          defects: [],
          inspection: null,
          couldNotVerify: [],
          confidence: 0.91,
        },
      })
      .returning();
    await createLedger(database.db, at('2026-11-02T08:55:00Z')).append(order.id, {
      type: 'attestation',
      payload: { attestationId: att!.id, status: 'match' },
    });
    await createLedger(database.db, at('2026-11-02T09:00:00Z')).append(order.id, {
      type: 'sealed',
      payload: {},
    });
    await createLedger(database.db, at('2026-11-02T12:00:00Z')).append(order.id, {
      type: 'tracking_pushed',
      payload: {},
    });
    await createLedger(database.db, at('2026-11-06T15:00:00Z')).append(order.id, {
      type: 'delivered',
      payload: {},
    });
    await insertShipment(database.db, order.id, {
      carrier: 'DHL',
      tracking_number: 'DHL123',
      status: 'delivered',
    });
    const dispute = await insertDispute(database.db, {
      merchant_id: merchant.id,
      order_id: order.id,
      status: 'WAITING_FOR_SELLER_RESPONSE',
      life_cycle_stage: 'CHARGEBACK',
      amount_value: '38.00',
      currency: 'USD',
      seller_response_due_date: new Date('2026-11-18T12:00:00Z'),
      raw: {
        create_time: '2026-11-10T08:00:00Z',
        messages: [{ posted_by: 'BUYER', content: 'The left sleeve seam opened after one wash.' }],
      },
    });
    return { merchant, product, buyer, order, dispute, shas };
  }

  async function linkHypothesis(
    merchantId: string,
    disputeId: string,
    orderId: string,
    status: 'open' | 'confirmed',
  ) {
    const [cluster] = await database.db
      .insert(complaint_clusters)
      .values({
        merchant_id: merchantId,
        category: 'product_defect',
        label: 'sleeve seam opening',
        centroid: [1, 0],
      })
      .returning();
    await database.db.insert(complaints).values({
      merchant_id: merchantId,
      order_id: orderId,
      source: 'dispute',
      source_ref: disputeId,
      text: 'Seam opened',
      cluster_id: cluster!.id,
    });
    const [h] = await database.db
      .insert(hypotheses)
      .values({
        merchant_id: merchantId,
        cluster_id: cluster!.id,
        dimension: 'batch_code',
        value: 'B17',
        status,
        strength: 'strong',
        stats: {},
        alternatives: [],
        affected: {},
        explanation: 'Seam complaints concentrate in batch B17 (6 of 40 orders).',
      })
      .returning();
    return h!;
  }

  it('clean packing evidence: provide_evidence OTHER with the PDF stored through blobs.put', async () => {
    const { dispute } = await packedOrder();
    const { runtime } = testRuntime(database.db, { clock: fixedClock(NOW) });
    const pack = await buildEvidencePackWith(runtime, dispute.id);
    expect(pack).toMatchObject({
      recommendation: 'provide_evidence',
      sharedContext: null,
      actionParams: null,
    });
    expect(pack.evidences).toEqual([{ evidence_type: 'OTHER', notes: pack.narrative }]);
    expect(pack.narrative).toContain('DHL123');
    expect(pack.narrative).toMatch(/hash chain verifies/);
    expect(pack.files).toEqual([
      {
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        filename: `fairfold-evidence-${dispute.id}.pdf`,
        mime: 'application/pdf',
      },
    ]);
    const [blob] = await database.db
      .select()
      .from(evidence_blobs)
      .where(eq(evidence_blobs.sha256, pack.files[0]!.sha256));
    expect(blob!.mime).toBe('application/pdf');
    expect(blob!.bytes!.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('A9 shape: an open B17 hypothesis gives inspect_first, and shared context never reaches filed evidence', async () => {
    const { merchant, order, dispute } = await packedOrder();
    const h = await linkHypothesis(merchant.id, dispute.id, order.id, 'open');
    const { runtime } = testRuntime(database.db, { clock: fixedClock(NOW) });
    const pack = await buildEvidencePackWith(runtime, dispute.id);
    expect(pack.recommendation).toBe('inspect_first');
    expect(pack.sharedContext).toEqual({
      hypothesisId: h.id,
      status: 'open',
      summary: h.explanation,
    });
    const filed = JSON.stringify(pack.evidences) + pack.narrative;
    expect(filed).not.toContain('B17');
    expect(filed).not.toContain('concentrate');
    expect(pack.files).toEqual([]);
    const [row] = await database.db
      .select()
      .from(evidence_packs)
      .where(eq(evidence_packs.id, pack.packId));
    expect(row).toMatchObject({
      status: 'draft',
      recommendation: 'inspect_first',
      hypothesis_id: h.id,
    });
  });

  it('a confirmed hypothesis outside the inquiry stage becomes accept_claim with a return', async () => {
    const { merchant, order, dispute } = await packedOrder();
    await linkHypothesis(merchant.id, dispute.id, order.id, 'confirmed');
    const { runtime } = testRuntime(database.db, { clock: fixedClock(NOW) });
    const pack = await buildEvidencePackWith(runtime, dispute.id);
    expect(pack).toMatchObject({
      recommendation: 'accept_claim',
      actionParams: {
        acceptClaimType: 'REFUND_WITH_RETURN',
        amount: { currency_code: 'USD', value: '38.00' },
      },
    });
  });

  it('rebuilding supersedes the old draft', async () => {
    const { dispute } = await packedOrder();
    const { runtime } = testRuntime(database.db, { clock: fixedClock(NOW) });
    const first = await buildEvidencePackWith(runtime, dispute.id);
    const second = await buildEvidencePackWith(runtime, dispute.id);
    const rows = await database.db
      .select()
      .from(evidence_packs)
      .where(eq(evidence_packs.dispute_id, dispute.id));
    expect(Object.fromEntries(rows.map((r) => [r.id, r.status]))).toEqual({
      [first.packId]: 'superseded',
      [second.packId]: 'draft',
    });
  });

  describe("the buyer's own photos (I5: shown beside the packing photos for the merchant)", () => {
    /** The buyer reported the problem with one photo, which the Evidence Agent described with `status`. */
    async function buyerReported(status: 'match' | 'mismatch') {
      const packed = await packedOrder();
      const sha = await createBlobStore(database.db).put(await jpeg(120), 'image/jpeg');
      await database.db.insert(complaints).values({
        merchant_id: packed.merchant.id,
        order_id: packed.order.id,
        buyer_id: packed.buyer.id,
        source: 'buyer_report',
        source_ref: 'report-1',
        text: 'The seam came apart.',
        image_shas: [sha],
      });
      await database.db.insert(attestations).values({
        order_id: packed.order.id,
        step: 'buyer_photo',
        photo_shas: [sha],
        photo_labels: ['buyer_photo'],
        model: 'mock-vision',
        status,
        confidence: 0.85,
        result: {
          items: [],
          batchLabelText: null,
          shippingLabel: { visible: false, trackingNumberText: null },
          defects: [],
          inspection: null,
          couldNotVerify: [],
          confidence: 0.85,
        },
      });
      return { ...packed, sha };
    }

    async function imagesIn(pdfSha: string): Promise<number> {
      const blob = await createBlobStore(database.db).get(pdfSha);
      const doc = await PDFDocument.load(blob.bytes!);
      let images = 0;
      for (const [, object] of doc.context.enumerateIndirectObjects())
        if (
          object instanceof PDFRawStream &&
          object.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')
        )
          images += 1;
      return images;
    }

    it("the PDF carries the buyer's report photo beside the two packing photos", async () => {
      const { dispute } = await buyerReported('match');
      const { runtime } = testRuntime(database.db, { clock: fixedClock(NOW) });
      const pack = await buildEvidencePackWith(runtime, dispute.id);
      expect(await imagesIn(pack.files[0]!.sha256)).toBe(3);
    });

    it('a buyer photo that may show a different item is flagged to the merchant, not decided', async () => {
      const { dispute } = await buyerReported('mismatch');
      const { runtime } = testRuntime(database.db, { clock: fixedClock(NOW) });
      const pack = await buildEvidencePackWith(runtime, dispute.id);
      expect(pack.recommendation).toBe('provide_evidence');
      expect(pack.rationale.join(' ')).toMatch(/buyer's photos may show a different item/);
      expect(JSON.stringify(pack.evidences)).not.toMatch(/different item/);
    });
  });

  it('dispute.synced keeps one complaint per dispute, appends new messages and publishes it once', async () => {
    const { dispute } = await packedOrder();
    const { runtime, jobs } = testRuntime(database.db, { clock: fixedClock(NOW) });
    const handlers = createHandlers(() => runtime);
    await handlers['dispute.synced']!({ disputeId: dispute.id, isNew: true, newBuyerMessages: [] });
    await handlers['dispute.synced']!({
      disputeId: dispute.id,
      isNew: false,
      newBuyerMessages: ['Photos attached of the seam.'],
    });
    const rows = await database.db
      .select()
      .from(complaints)
      .where(eq(complaints.source_ref, dispute.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.text).toBe(
      'PayPal dispute reason: MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED.\n\nThe left sleeve seam opened after one wash.\n\nPhotos attached of the seam.',
    );
    expect(jobs.published).toEqual([
      { name: 'complaint.created', payload: { complaintId: rows[0]!.id } },
    ]);
    const packs = await database.db
      .select()
      .from(evidence_packs)
      .where(eq(evidence_packs.dispute_id, dispute.id));
    expect(packs.map((p) => p.status).sort()).toEqual(['draft', 'superseded']);
    await handlers['evidence.rebuild']!({ disputeIds: [dispute.id] });
    expect(
      await database.db
        .select()
        .from(evidence_packs)
        .where(eq(evidence_packs.dispute_id, dispute.id)),
    ).toHaveLength(3);
  });

  it('routes 19 and 20: the owner rebuilds and downloads the PDF; another store cannot', async () => {
    const { merchant, dispute } = await packedOrder();
    const { runtime } = testRuntime(database.db, { clock: fixedClock(NOW) });
    setIntelRuntime(runtime);
    const { app, as } = await buildApi();
    const rebuilt = await app.inject({
      method: 'POST',
      url: `/api/disputes/${dispute.id}/packs`,
      headers: await as('merchant', merchant.id),
    });
    expect(rebuilt.statusCode).toBe(200);
    expect(rebuilt.json()).toMatchObject({
      recommendation: 'provide_evidence',
      packId: expect.any(String),
    });
    const pdf = await app.inject({
      url: `/api/disputes/${dispute.id}/packs/${rebuilt.json().packId}/pdf`,
      headers: await as('merchant', merchant.id),
    });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.rawPayload.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    const other = await insertMerchant(database.db);
    const denied = await app.inject({
      method: 'POST',
      url: `/api/disputes/${dispute.id}/packs`,
      headers: await as('merchant', other.id),
    });
    expect(denied.statusCode).toBe(403);
    const missing = await app.inject({
      url: `/api/disputes/${dispute.id}/packs/00000000-0000-4000-8000-000000000999/pdf`,
      headers: await as('merchant', merchant.id),
    });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });
});
