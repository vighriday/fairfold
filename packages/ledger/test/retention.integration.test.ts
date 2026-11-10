import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixedClock } from '@fairfold/contracts';
import { createDatabase, evidence_blobs, merchants, migrateDatabase, orders } from '@fairfold/db';
import { testDatabaseUrl } from '../../db/test/environment.js';
import { createLedger, createRetentionHandler, sha256 } from '../src/index.js';

const integrationUrl = testDatabaseUrl();

describe.skipIf(!integrationUrl)('evidence retention', () => {
  let database: ReturnType<typeof createDatabase>;
  const clock = fixedClock('2026-11-10T00:00:00.000Z');

  beforeAll(async () => {
    database = createDatabase(integrationUrl!);
    await migrateDatabase(database.db);
  });

  afterAll(async () => {
    await database?.close();
  });

  async function order(deliveredAt: string | null) {
    const [merchant] = await database.db
      .insert(merchants)
      .values({
        slug: 'retention-' + randomUUID(),
        name: 'Retention merchant',
        domain: 'retention.example',
        country: 'IN',
        is_simulated: true,
      })
      .returning();
    const [created] = await database.db
      .insert(orders)
      .values({
        merchant_id: merchant!.id,
        paypal_order_id: 'RETENTION-' + randomUUID(),
        invoice_id: 'FF-RETENTION-' + randomUUID(),
        status: deliveredAt ? 'delivered' : 'captured',
        amount_value: '10.00',
        currency: 'USD',
        delivered_at: deliveredAt ? new Date(deliveredAt) : null,
      })
      .returning();
    return created!;
  }

  it('purges expired bytes but preserves the row and hash', async () => {
    const created = await order('2026-01-01T00:00:00.000Z');
    const bytes = Buffer.from('expired-retention-fixture-' + randomUUID());
    const hash = sha256(bytes);
    await database.db.insert(evidence_blobs).values({
      sha256: hash,
      mime: 'image/jpeg',
      bytes,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
    });
    await createLedger(database.db, clock).append(created.id, {
      type: 'photo',
      payload: { synthetic: true },
      blob_sha256: hash,
    });

    await createRetentionHandler({ database: database.db, clock })();

    const [blob] = await database.db
      .select()
      .from(evidence_blobs)
      .where(eq(evidence_blobs.sha256, hash));
    expect(blob?.bytes).toBeNull();
    expect(blob?.purged_at?.toISOString()).toBe(clock.now().toISOString());
  });

  it('keeps a shared blob while another order is still retained', async () => {
    const oldOrder = await order('2026-01-01T00:00:00.000Z');
    const retainedOrder = await order('2026-10-01T00:00:00.000Z');
    const bytes = Buffer.from('shared-retention-fixture-' + randomUUID());
    const hash = sha256(bytes);
    await database.db.insert(evidence_blobs).values({
      sha256: hash,
      mime: 'image/jpeg',
      bytes,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
    });
    const ledger = createLedger(database.db, clock);
    await ledger.append(oldOrder.id, {
      type: 'photo',
      payload: { synthetic: true },
      blob_sha256: hash,
    });
    await ledger.append(retainedOrder.id, {
      type: 'photo',
      payload: { synthetic: true },
      blob_sha256: hash,
    });

    await createRetentionHandler({ database: database.db, clock })();

    const [blob] = await database.db
      .select()
      .from(evidence_blobs)
      .where(eq(evidence_blobs.sha256, hash));
    expect(blob?.bytes).toEqual(bytes);
    expect(blob?.purged_at).toBeNull();
  });
});
