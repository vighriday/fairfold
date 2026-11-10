import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createDatabase,
  merchants,
  migrateDatabase,
  orders,
  order_items,
  products,
  paypal_events,
  ledger_entries,
  buyers,
} from '@fairfold/db';
import { fixedClock, type ForMerchant, type PayPalClient } from '@fairfold/contracts';
import { createJobs } from '@fairfold/jobs';
import { createLedger } from '@fairfold/ledger';
import { testDatabaseUrl } from '../../db/test/environment.js';
import { createPayPalEventHandler } from '../src/event-handler.js';

const url = testDatabaseUrl(),
  clock = fixedClock('2026-11-10T02:03:04.005Z');
describe.skipIf(!url)('H3 transactional reconciliation (synthetic authoritative GET)', () => {
  let database: ReturnType<typeof createDatabase>, jobs: ReturnType<typeof createJobs>;
  beforeAll(async () => {
    database = createDatabase(url!);
    await migrateDatabase(database.db);
    jobs = createJobs(url!, { schema: 'h3_handler_' + randomUUID().replaceAll('-', '') });
    await jobs.start();
  });
  afterAll(async () => {
    await jobs?.stop();
    await database?.close();
  });
  async function fixture() {
    const merchantId = randomUUID(),
      slug = 'h3-handler-' + merchantId;
    await database.db.insert(merchants).values({
      id: merchantId,
      slug,
      name: 'Synthetic handler merchant',
      domain: 'synthetic.invalid',
      country: 'US',
    });
    const [product] = await database.db
      .insert(products)
      .values({
        merchant_id: merchantId,
        sku: 'SYNTHETIC-HOODIE',
        name: 'Synthetic hoodie',
        description: 'Synthetic listing',
        currency: 'USD',
        unit_value: '38.00',
        listing_version: 'v-synthetic',
      })
      .returning();
    const paypalOrderId = 'O' + randomUUID().replaceAll('-', '').toUpperCase();
    const captureId = 'C' + randomUUID().replaceAll('-', '').toUpperCase();
    const payerId = 'P' + randomUUID().replaceAll('-', '').toUpperCase();
    const item: {
      sku?: string;
      name: string;
      quantity: string;
      unit_amount: { currency_code: string; value: string };
    } = {
      sku: product!.sku,
      name: product!.name,
      quantity: '1',
      unit_amount: { currency_code: 'USD', value: '38.00' },
    };
    const unit: {
      reference_id?: string;
      custom_id?: string;
      invoice_id?: string;
      amount: { currency_code: string; value: string };
      items: (typeof item)[];
      shipping: {
        address: {
          address_line_1: string;
          address_line_2: string;
          country_code: string;
          postal_code: string;
        };
      };
      payments: {
        captures: Array<{
          id: string;
          status: string;
          amount: { currency_code: string; value: string };
          seller_protection: { status: string; dispute_categories: string[] };
        }>;
      };
    } = {
      reference_id: 'default',
      amount: { currency_code: 'USD', value: '38.00' },
      items: [item],
      shipping: {
        address: {
          address_line_1: 'Excluded synthetic street',
          address_line_2: 'Unit 2',
          country_code: 'US',
          postal_code: '12345',
        },
      },
      payments: {
        captures: [
          {
            id: captureId,
            status: 'COMPLETED',
            amount: { currency_code: 'USD', value: '38.00' },
            seller_protection: { status: 'ELIGIBLE', dispute_categories: ['ITEM_NOT_RECEIVED'] },
          },
        ],
      },
    };
    const raw = {
      id: paypalOrderId,
      status: 'COMPLETED',
      purchase_units: [unit],
      payment_source: {
        paypal: {
          account_id: payerId,
          account_status: 'VERIFIED',
          email_address: 'excluded@example.invalid',
          name: { given_name: 'Synthetic', surname: 'Buyer' },
        },
      },
    };
    const get = vi.fn<PayPalClient['orders']['get']>(async () => structuredClone(raw));
    const forMerchant = vi.fn(async (id: string) => {
      expect(id).toBe(merchantId);
      return { orders: { get } };
    }) as unknown as ForMerchant;
    const makeHandler = (
      syncDispute?: Parameters<typeof createPayPalEventHandler>[0]['syncDispute'],
    ) => createPayPalEventHandler({ database, jobs, forMerchant, clock, syncDispute });
    async function event(
      type = 'PAYMENT.CAPTURE.COMPLETED',
      resource: Record<string, unknown> = {
        id: captureId,
        supplementary_data: { related_ids: { order_id: paypalOrderId } },
      },
    ) {
      const id = 'WH-' + randomUUID();
      await database.db.insert(paypal_events).values({
        id,
        event_type: type,
        merchant_id: merchantId,
        verified: true,
        payload: { id, event_type: type, resource },
        received_at: clock.now(),
      });
      return id;
    }
    const readOrder = async () =>
      (await database.db.select().from(orders).where(eq(orders.paypal_order_id, paypalOrderId)))[0];
    const readEvent = async (id: string) =>
      (await database.db.select().from(paypal_events).where(eq(paypal_events.id, id)))[0]!;
    return {
      merchantId,
      slug,
      product: product!,
      paypalOrderId,
      captureId,
      payerId,
      unit,
      raw,
      get,
      forMerchant,
      makeHandler,
      event,
      readOrder,
      readEvent,
    };
  }
  it('imports by SKU, stores approved capture fields and atomically marks processing', async () => {
    const f = await fixture(),
      id = await f.event();
    await f.makeHandler()({ eventId: id });
    const order = (await f.readOrder())!;
    expect(order).toMatchObject({
      merchant_id: f.merchantId,
      status: 'captured',
      paypal_capture_id: f.captureId,
      amount_value: '38.00',
      payer_account_status: 'VERIFIED',
      seller_protection_status: 'ELIGIBLE',
      ship_to_country: 'US',
    });
    expect(order.ship_to_hash).toMatch(/^[a-f0-9]{64}$/);
    const items = await database.db
      .select()
      .from(order_items)
      .where(eq(order_items.order_id, order.id));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ product_id: f.product.id, listing_version: 'v-synthetic' });
    const [buyer] = await database.db.select().from(buyers).where(eq(buyers.id, order.buyer_id!));
    expect(buyer!.email_hash).toMatch(/^[a-f0-9]{64}$/);
    expect((await f.readEvent(id)).processed_at).toEqual(clock.now());
    expect(await createLedger(database.db, clock).verify(order.id)).toMatchObject({
      verified: true,
      entries: [{ type: 'captured', seq: 1 }],
    });
  });
  it('falls back to a unique exact name only when SKU is absent', async () => {
    const f = await fixture();
    delete f.unit.items[0]!.sku;
    const id = await f.event();
    await f.makeHandler()({ eventId: id });
    expect(await f.readOrder()).toBeDefined();
  });
  it('preserves source metadata for a create-before-local-write orphan', async () => {
    const f = await fixture(),
      sourceId = randomUUID();
    f.unit.reference_id = sourceId;
    f.unit.custom_id = f.slug;
    f.unit.invoice_id = 'FF-' + sourceId;
    await f.makeHandler()({ eventId: await f.event() });
    expect(await f.readOrder()).toMatchObject({ id: sourceId, invoice_id: 'FF-' + sourceId });
  });
  it.each([
    'unknown-sku',
    'ambiguous-name',
    'price',
    'total',
    'quantity',
    'custom-merchant',
    'capture-id',
  ])('rejects %s without a partial import', async (reason) => {
    const f = await fixture();
    if (reason === 'unknown-sku') f.unit.items[0]!.sku = 'UNMATCHED';
    if (reason === 'ambiguous-name') {
      delete f.unit.items[0]!.sku;
      await database.db.insert(products).values({
        merchant_id: f.merchantId,
        sku: 'SECOND',
        name: f.product.name,
        description: 'Synthetic ambiguous listing',
        unit_value: '38.00',
        currency: 'USD',
      });
    }
    if (reason === 'price') f.unit.items[0]!.unit_amount.value = '37.00';
    if (reason === 'total') f.unit.amount.value = '39.00';
    if (reason === 'quantity') f.unit.items[0]!.quantity = '2';
    if (reason === 'custom-merchant') f.unit.custom_id = 'another-merchant';
    if (reason === 'capture-id') f.unit.payments.captures[0]!.id = 'DIFFERENTCAPTURE';
    const id = await f.event();
    await expect(f.makeHandler()({ eventId: id })).rejects.toThrow();
    expect(await f.readOrder()).toBeUndefined();
    expect((await f.readEvent(id)).processed_at).toBeNull();
    expect((await f.readEvent(id)).error).toMatch(/^[A-Z_]+$/);
  });
  it('does not match a product belonging only to another merchant', async () => {
    const f = await fixture(),
      other = await fixture();
    await database.db.delete(products).where(eq(products.id, f.product.id));
    await expect(f.makeHandler()({ eventId: await f.event() })).rejects.toThrow();
    expect(await f.readOrder()).toBeUndefined();
    expect(other.product.sku).toBe(f.product.sku);
  });
  it('runs concurrent duplicate jobs once and separate capture events with one logical effect', async () => {
    const f = await fixture(),
      id = await f.event(),
      handle = f.makeHandler();
    await Promise.all(Array.from({ length: 12 }, () => handle({ eventId: id })));
    expect(f.get).toHaveBeenCalledTimes(1);
    await Promise.all([handle({ eventId: await f.event() }), handle({ eventId: await f.event() })]);
    const order = (await f.readOrder())!;
    expect(
      await database.db
        .select()
        .from(ledger_entries)
        .where(and(eq(ledger_entries.order_id, order.id), eq(ledger_entries.type, 'captured'))),
    ).toHaveLength(1);
    expect(
      (await jobs.boss.findJobs<{ orderId: string }>('order.captured')).filter(
        (j) => j.data.orderId === order.id,
      ),
    ).toHaveLength(1);
  });
  it('rolls back imported items/buyer/capture/marker on downstream queue failure and recovers after restart', async () => {
    const f = await fixture(),
      id = await f.event();
    vi.spyOn(jobs, 'publish').mockResolvedValueOnce(null);
    await expect(f.makeHandler()({ eventId: id })).rejects.toMatchObject({
      code: 'CAPTURE_JOB_NOT_CREATED',
    });
    expect(await f.readOrder()).toBeUndefined();
    expect(
      await database.db.select().from(buyers).where(eq(buyers.paypal_payer_id, f.payerId)),
    ).toHaveLength(0);
    expect((await f.readEvent(id)).processed_at).toBeNull();
    await f.makeHandler()({ eventId: id });
    expect((await f.readEvent(id)).error).toBeNull();
    expect((await f.readOrder())!.status).toBe('captured');
  });
  it.each(['sealed', 'shipped', 'delivered', 'refunded'])(
    'does not regress a later %s state on capture redelivery',
    async (status) => {
      const f = await fixture();
      await f.makeHandler()({ eventId: await f.event() });
      const order = (await f.readOrder())!;
      await database.db.update(orders).set({ status }).where(eq(orders.id, order.id));
      await f.makeHandler()({ eventId: await f.event() });
      expect((await f.readOrder())!.status).toBe(status);
    },
  );
  it.each(['PARTIALLY_REFUNDED', 'REFUNDED'])(
    'uses authoritative %s state for refund events',
    async (status) => {
      const f = await fixture();
      await f.makeHandler()({ eventId: await f.event() });
      f.unit.payments.captures[0]!.status = status;
      const resource = {
        id: 'REFUND001',
        supplementary_data: { related_ids: { capture_id: f.captureId } },
      };
      await f.makeHandler()({ eventId: await f.event('PAYMENT.CAPTURE.REFUNDED', resource) });
      expect((await f.readOrder())!.status).toBe(status === 'REFUNDED' ? 'refunded' : 'captured');
      await f.makeHandler()({ eventId: await f.event('PAYMENT.CAPTURE.REFUNDED', resource) });
      const order = (await f.readOrder())!;
      expect(
        (await jobs.boss.findJobs<{ merchantId: string }>('storereport.refresh')).filter(
          (j) => j.data.merchantId === f.merchantId,
        ),
      ).toHaveLength(status === 'REFUNDED' ? 1 : 0);
      expect(await createLedger(database.db, clock).verify(order.id)).toMatchObject({
        entries: [{ type: 'captured', seq: 1 }],
        verified: true,
      });
    },
  );
  it('imports an already-refunded capture without inventing a completed response', async () => {
    const f = await fixture();
    f.unit.payments.captures[0]!.status = 'REFUNDED';
    await f.makeHandler()({ eventId: await f.event() });
    expect((await f.readOrder())!.status).toBe('refunded');
  });
  it('retries a stale authoritative refund state and missing reference without inventing a link', async () => {
    const f = await fixture();
    await expect(
      f.makeHandler()({
        eventId: await f.event('PAYMENT.CAPTURE.REFUNDED', {
          id: 'REFUND001',
          supplementary_data: {
            related_ids: { order_id: f.paypalOrderId, capture_id: f.captureId },
          },
        }),
      }),
    ).rejects.toMatchObject({ code: 'PAYPAL_REFUND_NOT_RECONCILED' });
    await expect(
      f.makeHandler()({ eventId: await f.event('PAYMENT.CAPTURE.REFUNDED', { id: 'REFUND001' }) }),
    ).rejects.toMatchObject({ code: 'PAYPAL_EVENT_REFERENCE_MISSING' });
    expect(await f.readOrder()).toBeUndefined();
  });
  it('ignores unverified rows, and pending H4 synchronization never becomes processed', async () => {
    const f = await fixture(),
      unverified = await f.event();
    await database.db
      .update(paypal_events)
      .set({ verified: false })
      .where(eq(paypal_events.id, unverified));
    await f.makeHandler()({ eventId: unverified });
    expect(f.get).not.toHaveBeenCalled();
    const dispute = await f.event('CUSTOMER.DISPUTE.UPDATED', {
      dispute_id: 'PP-D-SYNTHETIC',
      id: 'FALLBACK',
    });
    await expect(f.makeHandler()({ eventId: dispute })).rejects.toMatchObject({
      code: 'H4_DISPUTE_SYNC_PENDING',
    });
    expect((await f.readEvent(dispute)).processed_at).toBeNull();
    const sync = vi.fn(async () => {});
    await f.makeHandler(sync)({ eventId: dispute });
    expect(sync).toHaveBeenCalledWith({ merchantId: f.merchantId, disputeId: 'PP-D-SYNTHETIC' });
    await f.makeHandler(sync)({
      eventId: await f.event('CUSTOMER.DISPUTE.CREATED', { id: 'PP-D-FALLBACK' }),
    });
    expect(sync).toHaveBeenLastCalledWith({ merchantId: f.merchantId, disputeId: 'PP-D-FALLBACK' });
  });
  it('acknowledges approvals without capturing and flags reversals without guessing a financial transition', async () => {
    const f = await fixture(),
      reversed = await f.event('PAYMENT.CAPTURE.REVERSED');
    await f.makeHandler()({ eventId: reversed });
    expect((await f.readEvent(reversed)).error).toBe('REVERSAL_REQUIRES_REVIEW');
    await f.makeHandler()({ eventId: await f.event('CHECKOUT.ORDER.APPROVED') });
    expect(f.get).not.toHaveBeenCalled();
    expect(await f.readOrder()).toBeUndefined();
  });
  it('delivers an event through a real pg-boss worker', async () => {
    const f = await fixture(),
      id = await f.event();
    await jobs.work('paypal.event', f.makeHandler());
    await jobs.publish('paypal.event', { eventId: id });
    await expect
      .poll(async () => (await f.readEvent(id)).processed_at, { timeout: 8000 })
      .not.toBeNull();
    expect(await f.readOrder()).toBeDefined();
  });
});
