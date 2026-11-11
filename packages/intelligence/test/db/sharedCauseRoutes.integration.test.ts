import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixedClock } from '@fairfold/contracts';
import { complaints } from '@fairfold/db';
import { setIntelRuntime } from '../../src/runtime.js';
import { runSharedCauseScanWith } from '../../src/sharedCause/scan.js';
import { buildApi } from '../routes/api.js';
import {
  dbUrl,
  insertBuyer,
  insertMerchant,
  openTestDb,
  resetTables,
  testRuntime,
} from './harness.js';
import { buildWorld } from './sharedCauseWorld.js';

const NOW = new Date('2026-11-09T12:00:00.000Z');

type Part =
  { name: string; value: string } | { name: string; filename: string; type: string; data: Buffer };

function multipart(parts: Part[]) {
  const boundary = `----fairfold${randomUUID()}`;
  const chunks: Buffer[] = [];
  for (const p of parts) {
    const file = 'filename' in p;
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"` +
          (file ? `; filename="${p.filename}"\r\nContent-Type: ${p.type}` : '') +
          '\r\n\r\n',
      ),
      file ? p.data : Buffer.from(p.value),
      Buffer.from('\r\n'),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

const jpeg = () =>
  sharp({ create: { width: 320, height: 240, channels: 3, background: { r: 30, g: 60, b: 120 } } })
    .jpeg()
    .toBuffer();

describe.skipIf(!dbUrl)('shared cause and report-problem routes against Postgres', () => {
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

  it('A1 over HTTP: GET /api/shared-causes?merchantId=<neel> lists batch_code = B17 with 18 unshipped orders', async () => {
    const w = await buildWorld(database.db, NOW);
    const { runtime } = testRuntime(database.db, { clock: fixedClock(NOW) });
    await runSharedCauseScanWith(runtime, w.merchant.id);
    setIntelRuntime(runtime);
    const { app, as } = await buildApi();
    const merchant = await as('merchant', w.merchant.id);

    const list = await app.inject({
      url: `/api/shared-causes?merchantId=${w.merchant.id}`,
      headers: merchant,
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(1);
    expect(list.json()[0]).toMatchObject({
      dimension: 'batch_code',
      value: 'B17',
      unshippedCount: 18,
    });
    const id = list.json()[0].id as string;

    const detail = await app.inject({ url: `/api/shared-causes/${id}`, headers: merchant });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().affected.unshipped).toHaveLength(18);
    const trend = await app.inject({ url: `/api/shared-causes/${id}/trend`, headers: merchant });
    expect(trend.statusCode).toBe(200);
    expect(trend.json().weeks.length).toBeGreaterThan(0);

    const confirm = await app.inject({
      method: 'POST',
      url: `/api/shared-causes/${id}/confirm`,
      headers: merchant,
    });
    expect(confirm.statusCode).toBe(409);
    expect(confirm.json().error.code).toBe('NO_DEFECTIVE_UNIT');
    const badDismiss = await app.inject({
      method: 'POST',
      url: `/api/shared-causes/${id}/dismiss`,
      headers: merchant,
      payload: {},
    });
    expect(badDismiss.statusCode).toBe(400);
    const dismiss = await app.inject({
      method: 'POST',
      url: `/api/shared-causes/${id}/dismiss`,
      headers: merchant,
      payload: { reason: 'Inspected stock, seams fine' },
    });
    expect(dismiss.statusCode).toBe(200);
    expect(dismiss.json().status).toBe('dismissed');

    const other = await insertMerchant(database.db);
    expect(
      (
        await app.inject({
          url: `/api/shared-causes?merchantId=${w.merchant.id}`,
          headers: await as('merchant', other.id),
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: `/api/shared-causes/${id}`,
          headers: await as('merchant', other.id),
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ url: '/api/shared-causes', headers: await as('buyer', randomUUID()) }))
        .statusCode,
    ).toBe(403);
    await app.close();
  });

  it('endpoint 32: a buyer reports a problem on their own order with photos; limits and ownership hold', async () => {
    const w = await buildWorld(database.db, NOW);
    const { runtime, jobs } = testRuntime(database.db, { clock: fixedClock(NOW) });
    setIntelRuntime(runtime);
    const { app, as } = await buildApi();
    const order = w.world.find((o) => o.status === 'delivered' && o.buyerId)!;
    const buyer = await as('buyer', order.buyerId!);
    const url = `/api/buyer/orders/${order.id}/report-problem`;
    const photo = await jpeg();

    const ok = multipart([
      { name: 'text', value: 'The sleeve seam opened after one wash.' },
      { name: 'photos', filename: 'seam.jpg', type: 'image/jpeg', data: photo },
    ]);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { ...buyer, ...ok.headers },
      payload: ok.payload,
    });
    expect(res.statusCode).toBe(200);
    const { complaintId } = res.json() as { complaintId: string };
    const [row] = await database.db.select().from(complaints).where(eq(complaints.id, complaintId));
    expect(row).toMatchObject({
      source: 'buyer_report',
      order_id: order.id,
      order_item_id: order.itemId,
      buyer_id: order.buyerId,
      text: 'The sleeve seam opened after one wash.',
    });
    expect(row!.image_shas).toHaveLength(1);
    expect(jobs.published).toEqual([{ name: 'complaint.created', payload: { complaintId } }]);
    const reports = async () =>
      (await database.db.select().from(complaints).where(eq(complaints.source, 'buyer_report')))
        .length;
    const afterFirst = await reports();

    const five = multipart([
      { name: 'text', value: 'Too many photos' },
      ...Array.from({ length: 5 }, (_, i) => ({
        name: 'photos',
        filename: `p${i}.jpg`,
        type: 'image/jpeg',
        data: photo,
      })),
    ]);
    const tooMany = await app.inject({
      method: 'POST',
      url,
      headers: { ...buyer, ...five.headers },
      payload: five.payload,
    });
    expect(tooMany.statusCode).toBe(400);
    expect(tooMany.json().error.code).toBe('TOO_MANY_PHOTOS');

    const noText = multipart([
      { name: 'photos', filename: 'a.jpg', type: 'image/jpeg', data: photo },
    ]);
    expect(
      (
        await app.inject({
          method: 'POST',
          url,
          headers: { ...buyer, ...noText.headers },
          payload: noText.payload,
        })
      ).statusCode,
    ).toBe(400);

    const json = await app.inject({ method: 'POST', url, headers: buyer, payload: { text: 'hi' } });
    expect(json.statusCode).toBe(415);

    const stranger = await insertBuyer(database.db, { display_name: 'Someone else' });
    const strangerRes = await app.inject({
      method: 'POST',
      url,
      headers: { ...(await as('buyer', stranger.id)), ...ok.headers },
      payload: ok.payload,
    });
    expect(strangerRes.statusCode).toBe(403);
    expect(await reports()).toBe(afterFirst); // refused requests store nothing
    await app.close();
  });
});
