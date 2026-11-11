import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixedClock } from '@fairfold/contracts';
import {
  actions,
  alerts,
  complaint_clusters,
  complaints,
  hypotheses,
  messages,
} from '@fairfold/db';
import { upsertComplaint } from '../../src/complaints/create.js';
import { createHandlers } from '../../src/handlers.js';
import { setIntelRuntime } from '../../src/runtime.js';
import { readComplaintWith, runSharedCauseScanWith } from '../../src/sharedCause/scan.js';
import { readFileSync } from 'node:fs';
import { APICallError } from 'ai';
import { MockEmbeddingModelV4 } from 'ai/test';
import { LOCAL_EMBEDDING_DIM, localEmbedding } from '../../src/sharedCause/reader.js';
import { mockModel } from '../helpers/mockModel.js';
import {
  dbUrl,
  insertBuyer,
  insertDispute,
  insertMerchant,
  insertOrder,
  insertProduct,
  openTestDb,
  resetTables,
  testRuntime,
} from './harness.js';
import { buildWorld, SEAM } from './sharedCauseWorld.js';

const NOW = new Date('2026-11-09T12:00:00.000Z');
const seedFixture = JSON.parse(
  readFileSync(new URL('../../eval/fixtures/complaints.json', import.meta.url), 'utf8'),
) as { seed: Array<{ text: string; extracted: unknown }> };

describe.skipIf(!dbUrl)('shared cause scan against Postgres', () => {
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

  const counts = async (hypothesisId: string) => ({
    actions: (
      await database.db.select().from(actions).where(eq(actions.hypothesis_id, hypothesisId))
    )
      .map((a) => a.type)
      .sort(),
    messages: (await database.db.select().from(messages)).length,
    alerts: (await database.db.select().from(alerts)).map((a) => a.type).sort(),
    hypotheses: (await database.db.select().from(hypotheses)).length,
    clusters: (await database.db.select().from(complaint_clusters)).length,
  });

  it('A1 shape: the seed world gives batch_code = B17 with the 18 unshipped orders, proposals and an alert', async () => {
    const w = await buildWorld(database.db, NOW);
    const { runtime } = testRuntime(database.db, { clock: fixedClock(NOW) });
    const found = await runSharedCauseScanWith(runtime, w.merchant.id);

    expect(found).toHaveLength(1);
    const h = found[0]!;
    expect(h).toMatchObject({ dimension: 'batch_code', value: 'B17', status: 'open' });
    expect(h.stats.primary).toMatchObject({ n: 39, k: 5, kRest: 1, nRest: 200 });
    expect(h.stats.primary.exposureDays).toBe(546);
    expect(h.stats.primary.p).toBeCloseTo(0.0006, 4);
    expect(h.strength).toBe('strong');
    expect(h.affected.unshipped.sort()).toEqual(w.unshipped.sort());
    expect(h.affected.unshipped).toHaveLength(18);
    expect(h.affected.inTransit.sort()).toEqual(w.inTransit.sort());
    expect(h.affected.deliveredNoComplaint).toHaveLength(34);
    expect(h.affected.openDisputes).toEqual([]);

    const [row] = await database.db.select().from(hypotheses).where(eq(hypotheses.id, h.id));
    expect(row!.safety_flag).toBe(false);
    expect(row!.explanation).toContain('4 carriers'); // section 9: courier spread is shown
    expect(row!.explanation).toMatch(
      /^5 of 39 orders with batch B17 had a "sleeve seam: stitching came apart" complaint/,
    );

    const acts = await database.db.select().from(actions).where(eq(actions.hypothesis_id, h.id));
    const byType = Object.fromEntries(acts.map((a) => [a.type, a]));
    expect(Object.keys(byType).sort()).toEqual([
      'add_inspection_rule',
      'hold_orders',
      'send_buyer_messages',
    ]);
    expect(acts.every((a) => a.status === 'proposed')).toBe(true);
    expect((byType.hold_orders!.payload as { orderIds: string[] }).orderIds.sort()).toEqual(
      w.unshipped.sort(),
    );
    expect(byType.add_inspection_rule!.payload).toEqual({
      batchCode: 'B17',
      instruction:
        'Photograph a close-up of the sleeve seam on each unit of batch B17 and check for: stitching came apart.',
      requiredPhotoLabel: 'seam_closeup',
      productId: w.hoodie.id, // Hriday's executor stores it in inspection_rules.product_id
    });
    const send = byType.send_buyer_messages!.payload as { messageIds: string[]; level: string };
    expect(send.level).toBe('suspected');
    expect(send.messageIds).toHaveLength(38); // 4 in transit + 34 delivered without complaint, one per buyer
    const drafts = await database.db.select().from(messages);
    expect(drafts.every((m) => m.status === 'draft' && m.channel === 'in_app')).toBe(true);
    expect(drafts[0]!.body).toContain("we're checking a possible issue");
    expect(new Set(drafts.map((m) => m.buyer_id)).size).toBe(38);

    const raised = await database.db.select().from(alerts);
    expect(raised).toHaveLength(1);
    expect(raised[0]).toMatchObject({ type: 'shared_cause', ref_id: h.id });
    expect(raised[0]!.message).toMatch(/^Possible shared product issue: batch B17/);
  });

  it('seeded complaints with pre-read extractions need no Complaint Reader and one embedding request', async () => {
    const w = await buildWorld(database.db, NOW);
    // scripts/seed.ts (section 19) stores each fixture extraction as read and publishes no complaint.created
    const seed = seedFixture.seed.slice(0, w.complaints.length);
    for (const [i, c] of w.complaints.entries())
      await database.db
        .update(complaints)
        .set({ text: seed[i]!.text, extracted: seed[i]!.extracted, embedding: null })
        .where(eq(complaints.id, c.id));
    const embedding = new MockEmbeddingModelV4({
      provider: 'mock',
      modelId: 'mock-embedding',
      maxEmbeddingsPerCall: 100, // as Gemini's embedding model
      doEmbed: async ({ values }) => ({
        embeddings: values.map((v) => localEmbedding(v)),
        warnings: [],
      }),
    });
    const text = mockModel([{ subject: 'About your {product}', body: 'Order {order}: checking.' }]);
    const { runtime } = testRuntime(database.db, {
      clock: fixedClock(NOW),
      models: { embedding, text: text.model },
    });

    const [h] = await runSharedCauseScanWith(runtime, w.merchant.id);
    expect(h).toMatchObject({ dimension: 'batch_code', value: 'B17', status: 'open' });
    expect(h!.stats.primary).toMatchObject({ n: 39, k: 5, kRest: 1, nRest: 200 });
    expect(embedding.doEmbedCalls).toHaveLength(1);
    expect(embedding.doEmbedCalls[0]!.values).toHaveLength(w.complaints.length);
    const rows = await database.db.select().from(complaints);
    expect(rows.every((r) => r.embedding?.length === LOCAL_EMBEDDING_DIM)).toBe(true);
    // the only text-model call is the one buyer-message template (task I6), none reads a complaint
    expect(text.calls).toHaveLength(1);

    await runSharedCauseScanWith(runtime, w.merchant.id);
    expect(embedding.doEmbedCalls).toHaveLength(1);
  });

  it('re-running the scan is idempotent', async () => {
    const w = await buildWorld(database.db, NOW);
    const { runtime } = testRuntime(database.db, { clock: fixedClock(NOW) });
    const [first] = await runSharedCauseScanWith(runtime, w.merchant.id);
    const before = await counts(first!.id);
    const [second] = await runSharedCauseScanWith(runtime, w.merchant.id);
    expect(second!.id).toBe(first!.id);
    expect(await counts(first!.id)).toEqual(before);
    const clusterIds = async () =>
      (await database.db.select().from(complaints).orderBy(complaints.id)).map((c) => c.cluster_id);
    const clustered = await clusterIds();
    const again = await runSharedCauseScanWith(runtime, w.merchant.id);
    expect(again.map((h) => h.id)).toEqual([first!.id]);
    expect(await clusterIds()).toEqual(clustered);
  });

  it("after Maya's live dispute joins, the same hypothesis has 6 complaints and a rate ratio in 28–34", async () => {
    const w = await buildWorld(database.db, NOW);
    const { runtime, jobs } = testRuntime(database.db, {
      clock: fixedClock(NOW),
      models: { text: mockModel([SEAM]).model },
    });
    const [before] = await runSharedCauseScanWith(runtime, w.merchant.id);

    const maya = await insertBuyer(database.db, { display_name: 'Maya K.' });
    const { order } = await insertOrder(database.db, {
      merchantId: w.merchant.id,
      buyerId: maya.id,
      product: w.hoodie,
      status: 'delivered',
      batchCode: 'B17',
      packer: 'station-1',
      capturedAt: new Date('2026-11-05T09:00:00Z'),
      shippedAt: new Date('2026-11-06T09:00:00Z'),
      deliveredAt: new Date('2026-11-09T09:00:00Z'),
    });
    const dispute = await insertDispute(database.db, {
      merchant_id: w.merchant.id,
      order_id: order.id,
      status: 'WAITING_FOR_SELLER_RESPONSE',
    });
    const { id } = await upsertComplaint(runtime, {
      merchantId: w.merchant.id,
      orderId: order.id,
      buyerId: maya.id,
      source: 'dispute',
      sourceRef: dispute.id,
      text: 'The hoodie arrived with the stitching on the left sleeve seam coming apart.',
    });
    const extraction = await readComplaintWith(runtime, id);
    expect(extraction.category).toBe('product_defect');
    expect(jobs.debounced).toEqual([{ name: 'sharedcause.scan', key: w.merchant.id, seconds: 60 }]);

    const [after] = await runSharedCauseScanWith(runtime, w.merchant.id);
    expect(after!.id).toBe(before!.id);
    expect(after!.stats.primary).toMatchObject({ n: 40, k: 6 });
    expect(after!.stats.primary.rateRatio).toBeGreaterThanOrEqual(28);
    expect(after!.stats.primary.rateRatio).toBeLessThanOrEqual(34);
    expect(after!.affected.openDisputes).toEqual([dispute.id]);
    expect(jobs.published).toContainEqual({
      name: 'evidence.rebuild',
      payload: { disputeIds: [dispute.id] },
    });
  });

  it('a safety complaint flags the hypothesis, raises safety_complaint and produces no drafts', async () => {
    const w = await buildWorld(database.db, NOW, { safety: true });
    const { runtime } = testRuntime(database.db, { clock: fixedClock(NOW) });
    const [h] = await runSharedCauseScanWith(runtime, w.merchant.id);
    const [row] = await database.db.select().from(hypotheses).where(eq(hypotheses.id, h!.id));
    expect(row!.safety_flag).toBe(true);
    expect((await counts(h!.id)).alerts).toEqual(['safety_complaint', 'shared_cause']);
    expect(await database.db.select().from(messages)).toEqual([]);
    expect(
      await database.db
        .select()
        .from(actions)
        .where(and(eq(actions.hypothesis_id, h!.id), eq(actions.type, 'send_buyer_messages'))),
    ).toEqual([]);
  });

  it('the inspection rule asks for a close-up of the faulty part, not always the seam', async () => {
    const w = await buildWorld(database.db, NOW, {
      fault: { component: 'drawstring eyelet', failureMode: 'metal ring fell out' },
    });
    const { runtime } = testRuntime(database.db, { clock: fixedClock(NOW) });
    const [h] = await runSharedCauseScanWith(runtime, w.merchant.id);
    const [rule] = await database.db
      .select()
      .from(actions)
      .where(and(eq(actions.hypothesis_id, h!.id), eq(actions.type, 'add_inspection_rule')));
    expect(rule!.payload).toMatchObject({ batchCode: 'B17', requiredPhotoLabel: 'eyelet_closeup' });
  });

  it('missing embedding configuration leaves a new complaint unembedded', async () => {
    const w = await buildWorld(database.db, NOW);
    const { runtime } = testRuntime(database.db, {
      clock: fixedClock(NOW),
      models: { text: mockModel([SEAM]).model },
    });
    delete runtime.models.embedding;
    const { id } = await upsertComplaint(runtime, {
      merchantId: w.merchant.id,
      orderId: w.world[0]!.id,
      buyerId: null,
      source: 'buyer_report',
      sourceRef: 'no-embedding-config',
      text: 'Sleeve seam opened.',
    });
    await readComplaintWith(runtime, id);
    const [row] = await database.db.select().from(complaints).where(eq(complaints.id, id));
    expect(row!.embedding).toBeNull();
    expect(row!.cluster_id).toBeNull();
  });

  it('an embedding request that fails keeps the extraction; a later scan embeds the complaint', async () => {
    const w = await buildWorld(database.db, NOW);
    const refusing = new MockEmbeddingModelV4({
      provider: 'mock',
      modelId: 'refusing-embedding',
      doEmbed: async () => {
        throw new APICallError({
          message: 'quota exceeded',
          url: 'https://example.invalid/embed',
          requestBodyValues: {},
          statusCode: 429,
          isRetryable: true,
        });
      },
    });
    const { runtime, jobs } = testRuntime(database.db, {
      clock: fixedClock(NOW),
      models: { text: mockModel([SEAM]).model, embedding: refusing },
    });
    const { id } = await upsertComplaint(runtime, {
      merchantId: w.merchant.id,
      orderId: w.world[0]!.id,
      buyerId: null,
      source: 'buyer_report',
      sourceRef: 'report-embed',
      text: 'The sleeve seam came apart.',
    });

    await expect(readComplaintWith(runtime, id)).resolves.toMatchObject({
      category: 'product_defect',
    });
    const [read] = await database.db.select().from(complaints).where(eq(complaints.id, id));
    expect(read!.extracted).toMatchObject({ component: 'sleeve seam' });
    expect(read!.embedding).toBeNull();
    expect(jobs.debounced).toHaveLength(1);
    expect(refusing.doEmbedCalls).toHaveLength(1); // no retry

    // the scan still runs while embeddings are refused; the complaint simply waits ungrouped
    const [h] = await runSharedCauseScanWith(runtime, w.merchant.id);
    expect(h).toMatchObject({ value: 'B17' });
    expect(refusing.doEmbedCalls).toHaveLength(2);

    // once the embedding model answers, the next scan embeds and groups it
    const embedding = new MockEmbeddingModelV4({
      provider: 'mock',
      modelId: 'mock-embedding',
      maxEmbeddingsPerCall: 100,
      doEmbed: async ({ values }) => ({
        embeddings: values.map((v) => localEmbedding(v)),
        warnings: [],
      }),
    });
    const { runtime: later } = testRuntime(database.db, {
      clock: fixedClock(NOW),
      models: { embedding },
    });
    await runSharedCauseScanWith(later, w.merchant.id);
    const [embedded] = await database.db.select().from(complaints).where(eq(complaints.id, id));
    expect(embedded!.embedding).toHaveLength(LOCAL_EMBEDDING_DIM);
    expect(embedded!.cluster_id).not.toBeNull();
  });

  it('a single safety-severity complaint raises safety_complaint as soon as it is read, once (section 12)', async () => {
    const merchant = await insertMerchant(database.db);
    const product = await insertProduct(database.db, merchant.id);
    const buyer = await insertBuyer(database.db);
    const { order } = await insertOrder(database.db, {
      merchantId: merchant.id,
      buyerId: buyer.id,
      product,
      status: 'delivered',
    });
    const { runtime } = testRuntime(database.db, {
      clock: fixedClock(NOW),
      models: { text: mockModel([{ ...SEAM, severity: 'safety' }]).model },
    });
    const { id } = await upsertComplaint(runtime, {
      merchantId: merchant.id,
      orderId: order.id,
      buyerId: buyer.id,
      source: 'buyer_report',
      sourceRef: 'report-1',
      text: 'The zip pull snapped and cut my hand.',
    });

    await readComplaintWith(runtime, id);
    await readComplaintWith(runtime, id); // a redelivered complaint.created job

    const raised = await database.db
      .select()
      .from(alerts)
      .where(eq(alerts.type, 'safety_complaint'));
    expect(raised).toHaveLength(1);
    expect(raised[0]).toMatchObject({
      merchant_id: merchant.id,
      order_id: order.id,
      ref_id: id,
    });
    expect(raised[0]!.message).toMatch(/safety/i);
    expect(await database.db.select().from(hypotheses)).toEqual([]);
  });

  it('complaint.created reads the complaint; sharedcause.scan and sweep run the scan through the handler map', async () => {
    const w = await buildWorld(database.db, NOW);
    const { runtime, jobs } = testRuntime(database.db, {
      clock: fixedClock(NOW),
      models: { text: mockModel([{ ...SEAM, category: 'other' }]).model },
    });
    const handlers = createHandlers(() => runtime);
    const { id } = await upsertComplaint(runtime, {
      merchantId: w.merchant.id,
      orderId: w.world[0]!.id,
      buyerId: null,
      source: 'buyer_report',
      sourceRef: 'report-x',
      text: 'Something else entirely.',
    });
    await handlers['complaint.created']!({ complaintId: id });
    const [read] = await database.db.select().from(complaints).where(eq(complaints.id, id));
    expect(read!.extracted).toMatchObject({ category: 'other' });
    expect(read!.embedding).toHaveLength(256);
    expect(jobs.debounced).toHaveLength(1);

    // the sweep queues the merchant's scan; the scan job runs it
    await handlers['sharedcause.sweep']!({});
    expect(jobs.published).toContainEqual({
      name: 'sharedcause.scan',
      payload: { merchantId: w.merchant.id },
    });
    expect(await database.db.select().from(hypotheses)).toEqual([]);
    await handlers['sharedcause.scan']!({ merchantId: w.merchant.id });
    const [h] = await database.db.select().from(hypotheses);
    expect(h).toMatchObject({ dimension: 'batch_code', value: 'B17' });
    const [still] = await database.db.select().from(complaints).where(eq(complaints.id, id));
    expect(still!.cluster_id).toBeNull(); // category other never groups
    await handlers['sharedcause.scan']!({ merchantId: w.merchant.id });
    expect(await database.db.select().from(hypotheses)).toHaveLength(1);
  });
});
