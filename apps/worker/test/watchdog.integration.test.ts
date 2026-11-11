import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixedClock } from '@fairfold/contracts';
import {
  alerts,
  createDatabase,
  disputes,
  merchants,
  migrateDatabase,
  orders,
  shipments,
} from '@fairfold/db';
import { createLedger } from '@fairfold/ledger';
import { testDatabaseUrl } from '../../../packages/db/test/environment.js';
import { createWatchdogHandler } from '../src/watchdog.js';

const integrationUrl = testDatabaseUrl();

describe.skipIf(!integrationUrl)('watchdog sweep', () => {
  let database: ReturnType<typeof createDatabase>;
  const clock = fixedClock('2026-11-10T00:00:00.000Z');

  beforeAll(async () => {
    database = createDatabase(integrationUrl!);
    await migrateDatabase(database.db);
  });

  afterAll(async () => {
    await database?.close();
  });

  async function merchant() {
    const [row] = await database.db
      .insert(merchants)
      .values({
        slug: 'watchdog-' + randomUUID(),
        name: 'Watchdog merchant',
        domain: 'watchdog.example',
        country: 'IN',
        is_simulated: true,
      })
      .returning();
    return row!;
  }

  it('creates one alert per gap and appends one ledger entry across repeated sweeps', async () => {
    const owner = await merchant();
    const [order] = await database.db
      .insert(orders)
      .values({
        merchant_id: owner.id,
        paypal_order_id: 'WATCH-' + randomUUID(),
        invoice_id: 'FF-WATCH-' + randomUUID(),
        status: 'shipped',
        amount_value: '20.00',
        currency: 'USD',
        captured_at: new Date('2026-11-01T00:00:00.000Z'),
        shipped_at: new Date('2026-11-01T00:00:00.000Z'),
      })
      .returning();
    await database.db.insert(shipments).values({
      order_id: order!.id,
      carrier: 'OTHER',
      carrier_name_other: 'Synthetic carrier',
      tracking_number: 'SYNTHETIC-1',
      last_scan_at: new Date('2026-11-06T00:00:00.000Z'),
      events: [],
    });

    const sweep = createWatchdogHandler({ database: database.db, clock });
    await sweep();
    await sweep();

    const rows = await database.db
      .select()
      .from(alerts)
      .where(and(eq(alerts.order_id, order!.id), eq(alerts.type, 'tracking_gap')));
    expect(rows).toHaveLength(1);
    expect((await createLedger(database.db, clock).verify(order!.id)).entries).toHaveLength(1);
  });

  it('creates seal-overdue and dispute-due alerts without sending messages', async () => {
    const owner = await merchant();
    const [order] = await database.db
      .insert(orders)
      .values({
        merchant_id: owner.id,
        paypal_order_id: 'WATCH-' + randomUUID(),
        invoice_id: 'FF-WATCH-' + randomUUID(),
        status: 'captured',
        amount_value: '20.00',
        currency: 'USD',
        captured_at: new Date('2026-11-01T00:00:00.000Z'),
      })
      .returning();
    await database.db.insert(disputes).values({
      id: 'WATCH-DISPUTE-' + randomUUID(),
      merchant_id: owner.id,
      order_id: order!.id,
      reason: 'ITEM_NOT_RECEIVED',
      status: 'WAITING_FOR_SELLER_RESPONSE',
      seller_response_due_date: new Date('2026-11-11T00:00:00.000Z'),
      raw: { synthetic: true },
      updated_at: clock.now(),
    });

    await createWatchdogHandler({ database: database.db, clock })();
    const rows = await database.db
      .select({ type: alerts.type })
      .from(alerts)
      .where(eq(alerts.order_id, order!.id));
    expect(rows.map((row) => row.type).sort()).toEqual(['dispute_due_soon', 'seal_overdue']);
  });

  it('uses shipment age for no-scan orders and deduplicates concurrent unlinked dispute alerts', async () => {
    const owner = await merchant();
    const [order] = await database.db.insert(orders).values({
      merchant_id: owner.id, paypal_order_id: 'WATCH-' + randomUUID(),
      invoice_id: 'FF-WATCH-' + randomUUID(), status: 'shipped', amount_value: '20.00',
      currency: 'USD', shipped_at: clock.now(),
    }).returning();
    await database.db.insert(shipments).values({ order_id: order!.id,
      carrier: 'OTHER', carrier_name_other: 'Synthetic carrier', tracking_number: randomUUID(), events: [] });
    const disputeId = 'WATCH-' + randomUUID();
    await database.db.insert(disputes).values({ id: disputeId, merchant_id: owner.id,
      reason: 'ITEM_NOT_RECEIVED', status: 'WAITING_FOR_BUYER_RESPONSE',
      seller_response_due_date: clock.now(), raw: { synthetic: true }, updated_at: clock.now() });
    const sweep = createWatchdogHandler({ database: database.db, clock });
    await Promise.all([sweep(), sweep()]);
    const rows = await database.db.select().from(alerts).where(eq(alerts.merchant_id, owner.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'dispute_due_soon', order_id: null, ref_id: disputeId });
  });
});
