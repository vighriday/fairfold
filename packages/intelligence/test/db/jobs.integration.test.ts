// Reliable job publishing: a job is sent inside the database transaction that writes the rows it refers to, so it is
// queued exactly when those rows commit; the nightly sweep re-reads complaints whose complaint.created never ran.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixedClock } from '@fairfold/contracts';
import { attestations, complaints } from '@fairfold/db';
import { createJobs, type Jobs } from '@fairfold/jobs';
import { upsertComplaint } from '../../src/complaints/create.js';
import { reportProblem } from '../../src/complaints/report.js';
import { syncDispute } from '../../src/dispute/handlers.js';
import { jobsPublisher, setIntelRuntime } from '../../src/runtime.js';
import { confirmHypothesis } from '../../src/sharedCause/confirm.js';
import {
  readComplaintWith,
  runSharedCauseScanWith,
  sweepSharedCauses,
} from '../../src/sharedCause/scan.js';
import { createReview } from '../../src/storeReport/index.js';
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
const HOUR = 3_600_000;

describe.skipIf(!dbUrl)('reliable job publishing against Postgres', () => {
  let database: Awaited<ReturnType<typeof openTestDb>>;
  let boss: Jobs;
  beforeAll(async () => {
    database = await openTestDb();
    boss = createJobs(dbUrl!, { schema: 'fairfold_intel_jobs_test' });
    await boss.start();
  });
  afterAll(async () => {
    setIntelRuntime(null);
    await boss?.stop();
    await database?.close();
  });
  beforeEach(async () => {
    await resetTables(database.db);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  it('a job sent with the transaction is queued only if the transaction commits', async () => {
    const publisher = jobsPublisher(boss);
    const kept = randomUUID();
    const dropped = randomUUID();
    let keptId: unknown;
    let droppedId: unknown;
    await database.db.transaction(async (tx) => {
      keptId = await publisher.publish('storereport.refresh', { merchantId: kept }, { tx });
    });
    await database.db
      .transaction(async (tx) => {
        droppedId = await publisher.publish('storereport.refresh', { merchantId: dropped }, { tx });
        throw new Error('roll back');
      })
      .catch(() => undefined);
    expect(typeof keptId).toBe('string');
    expect(typeof droppedId).toBe('string');
    expect(await boss.boss.getJobById('storereport.refresh', keptId as string)).toMatchObject({
      data: { merchantId: kept },
    });
    expect(await boss.boss.getJobById('storereport.refresh', droppedId as string)).toBeNull();
  });

  it('report-problem, a low review and a new dispute send complaint.created in the transaction that stores the complaint', async () => {
    const merchant = await insertMerchant(database.db);
    const product = await insertProduct(database.db, merchant.id);
    const buyer = await insertBuyer(database.db);
    const order = async () =>
      (
        await insertOrder(database.db, {
          merchantId: merchant.id,
          buyerId: buyer.id,
          product,
          status: 'delivered',
        })
      ).order;
    const [reported, reviewed, disputed] = [await order(), await order(), await order()];
    const { runtime, jobs } = testRuntime(database.db, { clock: fixedClock(NOW) });

    const { complaintId } = await reportProblem(runtime, buyer.id, reported.id, 'Seam split.', []);
    const review = await createReview(runtime, buyer.id, reviewed.id, 1, 'Seam split.');
    const dispute = await insertDispute(database.db, {
      merchant_id: merchant.id,
      order_id: disputed.id,
      raw: { messages: [{ posted_by: 'BUYER', content: 'The seam split.' }] },
    });
    await syncDispute(runtime, { disputeId: dispute.id, isNew: true, newBuyerMessages: [] });

    const ids = async (source: string, ref?: string) =>
      (await database.db.select().from(complaints))
        .filter((c) => c.source === source && (ref === undefined || c.source_ref === ref))
        .map((c) => c.id);
    const [reviewComplaint] = await ids('review', review.id);
    const [disputeComplaint] = await ids('dispute', dispute.id);
    expect(jobs.inTransaction).toEqual([
      { name: 'complaint.created', payload: { complaintId } },
      { name: 'complaint.created', payload: { complaintId: reviewComplaint } },
      { name: 'storereport.refresh', payload: { merchantId: merchant.id } },
      { name: 'complaint.created', payload: { complaintId: disputeComplaint } },
    ]);
    expect(jobs.published).toEqual(jobs.inTransaction);
  });

  it('the scan and Confirm send evidence.rebuild in the transaction that changes the hypothesis', async () => {
    const w = await buildWorld(database.db, NOW);
    const { runtime, jobs } = testRuntime(database.db, {
      clock: fixedClock(NOW),
      models: { text: mockModel([SEAM]).model },
    });
    const [h] = await runSharedCauseScanWith(runtime, w.merchant.id);
    // a live dispute joins the open hypothesis: the scan rebuilds its pack
    const { order } = await insertOrder(database.db, {
      merchantId: w.merchant.id,
      product: w.hoodie,
      status: 'delivered',
      batchCode: 'B17',
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
      buyerId: null,
      source: 'dispute',
      sourceRef: dispute.id,
      text: 'The left sleeve seam is coming apart.',
    });
    await readComplaintWith(runtime, id);
    await runSharedCauseScanWith(runtime, w.merchant.id);
    expect(jobs.inTransaction).toContainEqual({
      name: 'evidence.rebuild',
      payload: { disputeIds: [dispute.id] },
    });

    jobs.inTransaction.length = 0;
    await database.db.insert(attestations).values({
      order_id: null,
      hypothesis_id: h!.id,
      batch_code: 'B17',
      step: 'inspection',
      photo_shas: ['a'.repeat(64)],
      photo_labels: ['seam_closeup'],
      model: 'mock-vision',
      status: 'match',
      confidence: 0.9,
      result: {
        items: [],
        batchLabelText: 'B17',
        shippingLabel: { visible: false, trackingNumberText: null },
        defects: [{ component: 'sleeve seam', description: 'open stitch', severity: 'functional' }],
        inspection: {
          instruction: 'Photograph the seam',
          defectVisible: true,
          matchesCluster: true,
        },
        couldNotVerify: [],
        confidence: 0.9,
      },
    });
    await confirmHypothesis(runtime, w.merchant.id, h!.id);
    expect(jobs.inTransaction).toEqual([
      { name: 'evidence.rebuild', payload: { disputeIds: [dispute.id] } },
    ]);
  });

  it('the nightly sweep re-reads complaints that were never read, after an hour of grace', async () => {
    const w = await buildWorld(database.db, NOW);
    const { runtime, jobs } = testRuntime(database.db, { clock: fixedClock(NOW) });
    const unread = async (ref: string, hoursAgo: number) =>
      (
        await database.db
          .insert(complaints)
          .values({
            merchant_id: w.merchant.id,
            order_id: w.world[0]!.id,
            source: 'buyer_report',
            source_ref: ref,
            text: 'The seam split.',
            created_at: new Date(NOW.getTime() - hoursAgo * HOUR),
          })
          .returning()
      )[0]!;
    const lost = await unread('lost', 30);
    await unread('in-flight', 0.25); // its complaint.created job may still be queued

    await sweepSharedCauses(runtime);
    expect(jobs.published.filter((j) => j.name === 'complaint.created')).toEqual([
      { name: 'complaint.created', payload: { complaintId: lost.id } },
    ]);
  });
});
