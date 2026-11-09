import { testDatabaseUrl } from '../../db/test/environment.js';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { fixedClock } from '@fairfold/contracts';
import { createDatabase, migrateDatabase, merchants, orders } from '@fairfold/db';
import {
  canonicalJson,
  createBlobStore,
  createLedger,
  GenesisHash,
  inspectImage,
  sha256,
} from '../src/index.js';

const integrationUrl = testDatabaseUrl();

describe.skipIf(!integrationUrl)('real evidence storage and ledger transactions', () => {
  let database: ReturnType<typeof createDatabase>;
  const clock = fixedClock('2026-11-09T06:00:00.789Z');
  beforeAll(async () => {
    database = createDatabase(integrationUrl!);
    await migrateDatabase(database.db);
  });
  afterAll(async () => {
    await database?.close();
  });
  async function orderFixture() {
    const [merchant] = await database.db
      .insert(merchants)
      .values({
        slug: 'h1-' + randomUUID(),
        name: 'H1 fictional merchant',
        domain: 'h1.example',
        country: 'IN',
        is_simulated: true,
      })
      .returning();
    const [order] = await database.db
      .insert(orders)
      .values({
        merchant_id: merchant!.id,
        paypal_order_id: 'SEED-H1-' + randomUUID(),
        invoice_id: 'FF-' + randomUUID(),
        status: 'captured',
        amount_value: '38.00',
        currency: 'USD',
      })
      .returning();
    return { merchant: merchant!, order: order! };
  }
  it('hashes and stores exactly the same millisecond timestamp', async () => {
    const { order } = await orderFixture();
    const ledger = createLedger(database.db, clock);
    const first = await ledger.append(order.id, {
      type: 'captured',
      payload: { amount: '38.00', synthetic: true },
    });
    expect(first.seq).toBe(1);
    expect(first.server_time.toISOString()).toBe('2026-11-09T06:00:00.789Z');
    expect(first.prev_hash).toBe(GenesisHash);
    expect(first.entry_hash).toBe(
      sha256(
        GenesisHash +
          canonicalJson({
            order_id: order.id,
            seq: 1,
            type: 'captured',
            payload: { amount: '38.00', synthetic: true },
            blob_sha256: null,
            actor: 'system',
            server_time: first.server_time.toISOString(),
          }),
      ),
    );
    expect((await ledger.verify(order.id)).verified).toBe(true);
  });
  it('serializes concurrent appends on the order row', async () => {
    const { order } = await orderFixture();
    const ledger = createLedger(database.db, clock);
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        ledger.append(order.id, { type: 'photo', payload: { index } }),
      ),
    );
    const verified = await ledger.verify(order.id);
    expect(verified.verified).toBe(true);
    expect(verified.entries.map((entry) => entry.seq)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
  });
  it('detects a directly edited payload at its first broken sequence (A7)', async () => {
    const { order } = await orderFixture();
    const ledger = createLedger(database.db, clock);
    await ledger.append(order.id, { type: 'captured', payload: { synthetic: true } });
    await ledger.append(order.id, { type: 'sealed', payload: { batch: 'B17' } });
    await database.pool.query(
      'update ledger_entries set payload=$1::jsonb where order_id=$2 and seq=1',
      [JSON.stringify({ synthetic: false }), order.id],
    );
    expect(await ledger.verify(order.id)).toMatchObject({ verified: false, brokenAtSeq: 1 });
  });
  it('participates in a parent transaction without committing an orphan ledger entry', async () => {
    const { order } = await orderFixture();
    await expect(
      database.db.transaction(async (tx) => {
        await tx.update(orders).set({ status: 'sealed' }).where(eq(orders.id, order.id));
        await createLedger(tx, clock).append(order.id, {
          type: 'sealed',
          payload: { synthetic: true },
        });
        throw new Error('deliberate rollback');
      }),
    ).rejects.toThrow('deliberate rollback');
    expect(
      (await database.db.select().from(orders).where(eq(orders.id, order.id)))[0]!.status,
    ).toBe('captured');
    expect((await createLedger(database.db, clock).verify(order.id)).entries).toHaveLength(0);
  });
  it('normalizes, resizes and deduplicates images while detecting merchant-local reuse', async () => {
    const { merchant, order } = await orderFixture();
    const other = await orderFixture();
    const image = await sharp({
      create: { width: 3000, height: 1000, channels: 3, background: '#182b49' },
    })
      .png()
      .toBuffer();
    const blobs = createBlobStore(database.db, clock);
    const hash = await blobs.put(image, 'image/png');
    expect(await blobs.put(image, 'image/png')).toBe(hash);
    const blob = await blobs.get(hash);
    expect(blob.mime).toBe('image/jpeg');
    expect(blob.width).toBe(2048);
    expect(sha256(blob.bytes!)).toBe(hash);
    const metadata = await sharp(blob.bytes!).metadata();
    expect(metadata.exif).toBeUndefined();
    const count = await database.pool.query(
      'select count(*)::int as n from evidence_blobs where sha256=$1',
      [hash],
    );
    expect(count.rows[0].n).toBe(1);
    await createLedger(database.db, clock).append(order.id, {
      type: 'photo',
      payload: {},
      blob_sha256: hash,
    });
    expect(await blobs.photoUsedByMerchant(hash, merchant.id)).toEqual([order.id]);
    expect(await blobs.photoUsedByMerchant(hash, other.merchant.id)).toEqual([]);
  });
  it('flags stale EXIF before normalization and rejects masquerading input', async () => {
    const image = await sharp({
      create: { width: 4, height: 4, channels: 3, background: '#fff' },
    })
      .jpeg()
      .withExif({ IFD0: { DateTime: '2026:11:01 00:00:00' } })
      .toBuffer();
    expect((await inspectImage(image, 'image/jpeg', clock)).exifOutsideWindow).toBe(true);
    await expect(inspectImage(image, 'image/png', clock)).rejects.toMatchObject({
      code: 'IMAGE_TYPE_MISMATCH',
    });
    await expect(inspectImage(Buffer.from('bad'), 'image/jpeg', clock)).rejects.toMatchObject({
      code: 'INVALID_IMAGE',
    });
    await expect(
      inspectImage(Buffer.alloc(12 * 1024 * 1024 + 1), 'image/jpeg', clock),
    ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
  });
  it('preserves generated PDF bytes exactly, handles purging and rejects byte tampering', async () => {
    const blobs = createBlobStore(database.db, clock);
    const pdf = Buffer.from('%PDF-1.7\nH1 synthetic byte fixture ' + randomUUID() + '\n%%EOF');
    const hash = await blobs.put(pdf, 'application/pdf');
    expect(hash).toBe(sha256(pdf));
    expect((await blobs.get(hash)).bytes).toEqual(pdf);
    await database.pool.query(
      'update evidence_blobs set bytes=null,purged_at=now() where sha256=$1',
      [hash],
    );
    await expect(blobs.get(hash)).rejects.toMatchObject({ code: 'BLOB_PURGED' });
    await blobs.put(pdf, 'application/pdf');
    expect((await blobs.get(hash)).bytes).toEqual(pdf);
    await database.pool.query('update evidence_blobs set bytes=$1 where sha256=$2', [
      Buffer.from('tampered'),
      hash,
    ]);
    await expect(blobs.get(hash)).rejects.toMatchObject({ code: 'BLOB_INTEGRITY_FAILED' });
  });
});
