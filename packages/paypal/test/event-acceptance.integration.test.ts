import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixedClock } from '@fairfold/contracts';
import {
  createDatabase,
  merchants,
  orders,
  paypal_events,
  ledger_entries,
  migrateDatabase,
} from '@fairfold/db';
import { createLedger } from '@fairfold/ledger';
import { testDatabaseUrl } from '../../db/test/environment.js';
import { inspectCapturedEvent } from '../src/event-acceptance.js';

const url = testDatabaseUrl(),
  clock = fixedClock('2026-11-10T05:06:07.008Z');
describe.skipIf(!url)('H3 read-only acceptance inspection (synthetic rows)', () => {
  let database: ReturnType<typeof createDatabase>;
  beforeAll(async () => {
    database = createDatabase(url!);
    await migrateDatabase(database.db);
  });
  afterAll(async () => {
    await database?.close();
  });
  async function fixture() {
    const merchantId = randomUUID(),
      orderId = randomUUID(),
      slug = 'h3-audit-' + merchantId;
    const order = 'O' + randomUUID().replaceAll('-', '').toUpperCase(),
      capture = 'C' + randomUUID().replaceAll('-', '').toUpperCase();
    await database.db.insert(merchants).values({
      id: merchantId,
      slug,
      name: 'Synthetic acceptance merchant',
      domain: 'synthetic.invalid',
      country: 'US',
      paypal_webhook_id: 'SYNTHETICWEBHOOK',
    });
    await database.db.insert(orders).values({
      id: orderId,
      merchant_id: merchantId,
      paypal_order_id: order,
      paypal_capture_id: capture,
      invoice_id: 'FF-' + orderId,
      amount_value: '38.00',
      currency: 'USD',
      status: 'captured',
      captured_at: clock.now(),
    });
    await createLedger(database.db, clock).append(orderId, {
      type: 'captured',
      actor: 'paypal',
      payload: {
        paypalOrderId: order,
        paypalCaptureId: capture,
        amount: { currency_code: 'USD', value: '38.00' },
      },
    });
    const eventId = 'WH-' + randomUUID();
    await database.db.insert(paypal_events).values({
      id: eventId,
      merchant_id: merchantId,
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      verified: true,
      processed_at: clock.now(),
      payload: {
        id: eventId,
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: { id: capture, supplementary_data: { related_ids: { order_id: order } } },
      },
    });
    return { merchantId, orderId, eventId, slug };
  }
  it('reports matching verified event/order/ledger state without claiming real delivery provenance', async () => {
    const f = await fixture();
    expect(await inspectCapturedEvent(database.db, f.slug, f.eventId)).toMatchObject({
      status: 'LOCAL_EVENT_STATE_READY',
      orderId: f.orderId,
      verified: true,
      captureLedgerEntries: 1,
      ledgerVerified: true,
      realDeliveryAndRedeliveryProof: 'REQUIRES_OPERATOR_OBSERVATION',
    });
  });
  it('rejects pending/unverified or foreign event inspection', async () => {
    const f = await fixture(),
      foreign = await fixture();
    await expect(inspectCapturedEvent(database.db, foreign.slug, f.eventId)).rejects.toThrow();
    await database.db
      .update(paypal_events)
      .set({ processed_at: null })
      .where(eq(paypal_events.id, f.eventId));
    await expect(inspectCapturedEvent(database.db, f.slug, f.eventId)).rejects.toThrow();
    await database.db
      .update(paypal_events)
      .set({ processed_at: clock.now(), verified: false })
      .where(eq(paypal_events.id, f.eventId));
    await expect(inspectCapturedEvent(database.db, f.slug, f.eventId)).rejects.toThrow();
  });
  it('rejects tampered ledger or drifted captured amount', async () => {
    const f = await fixture();
    await database.db.update(orders).set({ amount_value: '39.00' }).where(eq(orders.id, f.orderId));
    await expect(inspectCapturedEvent(database.db, f.slug, f.eventId)).rejects.toThrow();
    await database.db.update(orders).set({ amount_value: '38.00' }).where(eq(orders.id, f.orderId));
    await database.db
      .update(ledger_entries)
      .set({ payload: { tampered: true } })
      .where(eq(ledger_entries.order_id, f.orderId));
    await expect(inspectCapturedEvent(database.db, f.slug, f.eventId)).rejects.toThrow();
  });
});
