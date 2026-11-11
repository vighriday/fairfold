// The API and the worker pass their own database and job queue into the intelligence package, so its services,
// routes and job handlers open no pool or queue of their own.
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobName } from '@fairfold/contracts';
import { complaints, store_reports } from '@fairfold/db';
import type { PublishOptions as HostPublishOptions } from '@fairfold/jobs';
import { reportProblem } from '../../src/complaints/report.js';
import { handlers } from '../../src/handlers.js';
import { bindIntelRuntime, getIntelRuntime, setIntelRuntime } from '../../src/runtime.js';
import {
  dbUrl,
  insertBuyer,
  insertMerchant,
  insertOrder,
  insertProduct,
  openTestDb,
  resetTables,
} from './harness.js';

/** A host job queue as createJobs returns it, recording what is sent through it. */
function hostJobs() {
  const sent: Array<{ name: JobName; payload: unknown; options: HostPublishOptions }> = [];
  const debounced: Array<{ key: string; seconds: number }> = [];
  return {
    sent,
    debounced,
    async publish(name: JobName, payload: unknown, options: HostPublishOptions = {}) {
      sent.push({ name, payload, options });
      return 'job-id';
    },
    async publishDebounced(_name: 'sharedcause.scan', key: string, seconds: number) {
      debounced.push({ key, seconds });
      return 'job-id';
    },
  };
}

describe.skipIf(!dbUrl)("the host's database and job queue", () => {
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
    setIntelRuntime(null);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  it('bindIntelRuntime makes the services, routes and job handlers use them', async () => {
    const jobs = hostJobs();
    const bound = bindIntelRuntime({ db: database.db, jobs, env: {} });
    expect(getIntelRuntime()).toBe(bound);
    expect(getIntelRuntime().db).toBe(database.db);

    const merchant = await insertMerchant(database.db);
    const product = await insertProduct(database.db, merchant.id);
    const buyer = await insertBuyer(database.db);
    const { order } = await insertOrder(database.db, {
      merchantId: merchant.id,
      buyerId: buyer.id,
      product,
      status: 'delivered',
    });

    // a route's service: the job goes through the host queue, inside the transaction (pg-boss db adapter)
    const { complaintId } = await reportProblem(getIntelRuntime(), buyer.id, order.id, 'Seam.', []);
    expect(jobs.sent).toHaveLength(1);
    expect(jobs.sent[0]).toMatchObject({
      name: 'complaint.created',
      payload: { complaintId },
      options: { db: { executeSql: expect.any(Function) } },
    });
    const [stored] = await database.db
      .select()
      .from(complaints)
      .where(eq(complaints.id, complaintId));
    expect(stored).toBeDefined();

    // the worker's default handler map resolves the same runtime
    await handlers['storereport.refresh']!({ merchantId: merchant.id });
    expect(
      await database.db
        .select()
        .from(store_reports)
        .where(eq(store_reports.merchant_id, merchant.id)),
    ).toHaveLength(1);
    // the sweep re-sends the complaint once it has been unread for over an hour
    await database.db
      .update(complaints)
      .set({ created_at: new Date(Date.now() - 2 * 3_600_000) })
      .where(eq(complaints.id, complaintId));
    await handlers['sharedcause.sweep']!({});
    expect(jobs.sent.map((j) => j.name)).toEqual(['complaint.created', 'complaint.created']);
    expect(jobs.sent[1]!.options).toEqual({}); // not in a transaction
  });

  it('a job published outside a transaction reaches the host queue without a db option', async () => {
    const jobs = hostJobs();
    const rt = bindIntelRuntime({ db: database.db, jobs, env: {} });
    await rt.jobs.publish('storereport.refresh', {
      merchantId: '00000000-0000-4000-8000-000000000001',
    });
    await rt.jobs.publishDebounced('sharedcause.scan', 'm', 60);
    expect(jobs.sent).toEqual([
      {
        name: 'storereport.refresh',
        payload: { merchantId: '00000000-0000-4000-8000-000000000001' },
        options: {},
      },
    ]);
    expect(jobs.debounced).toEqual([{ key: 'm', seconds: 60 }]);
  });
});
