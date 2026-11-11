// Section 15: the functions Ishaan provides, exactly as Hriday's packages call them. The assignment below is a
// compile-time check (pnpm typecheck) that every export keeps its documented signature — the guarantee the H1
// stubs gave before they were retired — and the tests run the four runtime-bound ones against Postgres.
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fixedClock,
  type AttestationResult,
  type AttestInput,
  type BuyerSignal,
  type CatalogItem,
  type EvidencePackDraft,
  type Hypothesis,
  type Message,
  type StoreReport,
} from '@fairfold/contracts';
import { complaints } from '@fairfold/db';
import { createBlobStore } from '@fairfold/ledger';
import * as intelligence from '../../src/index.js';
import { upsertComplaint } from '../../src/complaints/create.js';
import { setIntelRuntime } from '../../src/runtime.js';
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
import { buildWorld, SEAM } from './sharedCauseWorld.js';

interface Section15 {
  attestPackingPhotos(input: AttestInput): Promise<AttestationResult>;
  computeBuyerSignal(orderId: string): Promise<BuyerSignal>;
  buildStoreReport(merchantId: string): Promise<StoreReport>;
  readComplaint(complaintId: string): Promise<void>;
  runSharedCauseScan(merchantId: string): Promise<Hypothesis[]>;
  buildEvidencePack(disputeId: string): Promise<EvidencePackDraft>;
  draftBuyerMessages(hypothesisId: string, level?: 'suspected' | 'confirmed'): Promise<Message[]>;
  searchCatalog(input: { query: string; maxPrice?: number }): Promise<CatalogItem[]>;
}
const section15: Section15 = intelligence;

const NOW = new Date('2026-11-09T12:00:00.000Z');

describe.skipIf(!dbUrl)('section 15 functions run on the process runtime', () => {
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

  it('readComplaint(complaintId) extracts and embeds the complaint', async () => {
    const merchant = await insertMerchant(database.db);
    const product = await insertProduct(database.db, merchant.id);
    const { order } = await insertOrder(database.db, { merchantId: merchant.id, product });
    const { runtime } = testRuntime(database.db, {
      clock: fixedClock(NOW),
      models: { text: mockModel([SEAM]).model },
    });
    setIntelRuntime(runtime);
    const { id } = await upsertComplaint(runtime, {
      merchantId: merchant.id,
      orderId: order.id,
      buyerId: null,
      source: 'buyer_report',
      sourceRef: 'report-1',
      text: 'The sleeve seam came apart.',
    });
    await expect(section15.readComplaint(id)).resolves.toBeUndefined();
    const [row] = await database.db.select().from(complaints).where(eq(complaints.id, id));
    expect(row!.extracted).toMatchObject({ category: 'product_defect' });
    expect(row!.embedding?.length).toBeGreaterThan(0);
  });

  it('runSharedCauseScan(merchantId) and draftBuyerMessages(hypothesisId) work on the seed-shaped world', async () => {
    const w = await buildWorld(database.db, NOW);
    const { runtime } = testRuntime(database.db, { clock: fixedClock(NOW) });
    setIntelRuntime(runtime);
    const [h] = await section15.runSharedCauseScan(w.merchant.id);
    expect(h).toMatchObject({ dimension: 'batch_code', value: 'B17', status: 'open' });
    // the scan already drafted the suspected level for every affected buyer, so nobody is drafted twice
    await expect(section15.draftBuyerMessages(h!.id)).resolves.toEqual([]);
  });

  it('attestPackingPhotos(input) reads stored photos and the vision model from the runtime', async () => {
    const merchant = await insertMerchant(database.db);
    const product = await insertProduct(database.db, merchant.id);
    const { order, item } = await insertOrder(database.db, { merchantId: merchant.id, product });
    const photo = await sharp({
      create: { width: 64, height: 48, channels: 3, background: { r: 20, g: 40, b: 90 } },
    })
      .jpeg()
      .toBuffer();
    const sha256 = await createBlobStore(database.db).put(photo, 'image/jpeg');
    const { model, calls } = mockModel([
      {
        items: [
          {
            orderItemId: item.id,
            seen: { itemType: 'hoodie', colour: 'navy', sizeLabel: 'M', quantity: 1 },
            matches: true,
            confidence: 0.9,
            notes: '',
          },
        ],
        batchLabelText: 'B17',
        shippingLabel: { visible: false, trackingNumberText: null },
        defects: [],
        inspection: null,
        couldNotVerify: [],
        confidence: 0.9,
      },
    ]);
    const { runtime } = testRuntime(database.db, { models: { vision: model } });
    setIntelRuntime(runtime);
    const result = await section15.attestPackingPhotos({
      orderId: order.id,
      hypothesisId: null,
      step: 'pack',
      items: [
        {
          orderItemId: item.id,
          name: item.name,
          sku: item.sku,
          colour: 'navy',
          size: 'M',
          quantity: 1,
        },
      ],
      batchCodes: { [item.id]: 'B17' },
      photos: [{ sha256, label: 'item', mime: 'image/jpeg' }],
      inspectionRule: null,
      expectedTrackingNumber: null,
    });
    expect(result.batchLabelText).toBe('B17');
    expect(calls).toHaveLength(1);
  });
});
