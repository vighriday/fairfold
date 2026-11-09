import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixedClock } from '@fairfold/contracts';
import {
  buyers,
  createDatabase,
  ledger_entries,
  merchants,
  migrateDatabase,
  order_items,
  orders,
  products,
} from '@fairfold/db';
import { createJobs, type Jobs } from '@fairfold/jobs';
import { createLedger } from '@fairfold/ledger';
import { testDatabaseUrl } from '../../../packages/db/test/environment.js';
import { createCaptureStore } from '../src/checkout/capture-store.js';
import { minimizeCapture } from '../src/checkout/capture-policy.js';
import { captureFixture, rawUnit } from './capture-fixture.js';

const integrationUrl = testDatabaseUrl();
const clock = fixedClock('2026-11-09T14:00:00.123Z');

describe.skipIf(!integrationUrl)('atomic capture persistence on real PostgreSQL', () => {
  let database: ReturnType<typeof createDatabase>;
  let jobs: Jobs;
  let store: ReturnType<typeof createCaptureStore>;
  beforeAll(async () => {
    database = createDatabase(integrationUrl!);
    await migrateDatabase(database.db);
    jobs = createJobs(integrationUrl!, {
      schema: 'h2_capture_' + randomUUID().replaceAll('-', ''),
      clock,
    });
    await jobs.start();
    store = createCaptureStore({ database, jobs, clock });
  });
  afterAll(async () => {
    await jobs?.stop();
    await database?.close();
  });
  async function fixture() {
    const id = randomUUID();
    const [merchant] = await database.db
      .insert(merchants)
      .values({
        slug: 'capture-test-' + id,
        name: 'Synthetic capture merchant',
        domain: 'capture.example.invalid',
        country: 'US',
      })
      .returning();
    const [product] = await database.db
      .insert(products)
      .values({
        merchant_id: merchant!.id,
        sku: 'SYNTHETIC-HOODIE',
        name: 'Synthetic hoodie',
        description: 'Synthetic test product',
        unit_value: '38.00',
        currency: 'USD',
        listing_version: 'v-test',
      })
      .returning();
    const [order] = await database.db
      .insert(orders)
      .values({
        id,
        merchant_id: merchant!.id,
        paypal_order_id: 'O' + id.replaceAll('-', '').toUpperCase(),
        invoice_id: 'FF-' + id,
        status: 'created',
        amount_value: '38.00',
        currency: 'USD',
      })
      .returning();
    const [item] = await database.db
      .insert(order_items)
      .values({
        order_id: id,
        product_id: product!.id,
        sku: product!.sku,
        name: product!.name,
        quantity: 1,
        unit_value: product!.unit_value,
        listing_version: product!.listing_version,
      })
      .returning();
    const capture = captureFixture();
    capture.orderId = order!.paypal_order_id;
    capture.captureId = 'C' + randomUUID().replaceAll('-', '').toUpperCase();
    capture.payerId = 'P' + randomUUID().replaceAll('-', '').toUpperCase();
    (capture.raw as { id: string }).id = capture.orderId;
    const unit = rawUnit(capture);
    unit.reference_id = id;
    unit.custom_id = merchant!.slug;
    unit.invoice_id = order!.invoice_id;
    const payment = (
      unit.payments as {
        captures: Array<{
          id: string;
          status: string;
          amount: { value: string; currency_code: string };
        }>;
      }
    ).captures[0]!;
    payment.id = capture.captureId;
    const input = { merchantId: merchant!.id, orderId: id, capture };
    return { input, order: order!, item: item!, merchant: merchant!, payment, unit };
  }
  async function snapshot(orderId: string) {
    const [order] = await database.db.select().from(orders).where(eq(orders.id, orderId));
    const entries = await database.db
      .select()
      .from(ledger_entries)
      .where(eq(ledger_entries.order_id, orderId));
    const queued = (await jobs.boss.findJobs<{ orderId: string }>('order.captured')).filter(
      (job) => job.data.orderId === orderId,
    );
    return { order: order!, entries, queued };
  }
  async function unchanged(input: Awaited<ReturnType<typeof fixture>>['input']) {
    const state = await snapshot(input.orderId);
    expect(state.order).toMatchObject({
      status: 'created',
      buyer_id: null,
      paypal_capture_id: null,
      captured_at: null,
    });
    expect(state.entries).toHaveLength(0);
    expect(state.queued).toHaveLength(0);
    if (input.capture.payerId)
      expect(
        await database.db
          .select()
          .from(buyers)
          .where(eq(buyers.paypal_payer_id, input.capture.payerId)),
      ).toHaveLength(0);
  }
  it('atomically stores only approved fields, unchanged prices/items, one verified ledger and one minimal job', async () => {
    const { input, item } = await fixture();
    expect(await store.persist(input)).toEqual({ orderId: input.orderId, duplicate: false });
    const state = await snapshot(input.orderId);
    const [buyer] = await database.db
      .select()
      .from(buyers)
      .where(eq(buyers.id, state.order.buyer_id!));
    const retained = minimizeCapture(input.capture);
    expect(buyer).toMatchObject({
      paypal_payer_id: input.capture.payerId,
      email_hash: retained.emailHash,
      display_name: 'Synthetic Buyer',
      country: 'US',
      created_at: clock.now(),
    });
    expect(state.order).toMatchObject({
      status: 'captured',
      amount_value: '38.00',
      currency: 'USD',
      paypal_capture_id: input.capture.captureId,
      captured_at: clock.now(),
      ship_to_hash: retained.shipToHash,
      ship_to_country: 'US',
      ship_to_postal: 'Ab 12',
      payer_account_status: 'VERIFIED',
      seller_protection_status: 'ELIGIBLE',
      seller_protection_categories: ['ITEM_NOT_RECEIVED'],
    });
    expect(
      await database.db.select().from(order_items).where(eq(order_items.order_id, input.orderId)),
    ).toEqual([item]);
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]).toMatchObject({
      type: 'captured',
      actor: 'paypal',
      server_time: clock.now(),
      payload: {
        paypalOrderId: input.capture.orderId,
        paypalCaptureId: input.capture.captureId,
        amount: { currency_code: 'USD', value: '38.00' },
        sellerProtection: input.capture.sellerProtection,
        payerAccountStatus: 'VERIFIED',
      },
    });
    expect((await createLedger(database.db, clock).verify(input.orderId)).verified).toBe(true);
    expect(state.queued).toHaveLength(1);
    expect(state.queued[0]!.data).toEqual({ orderId: input.orderId });
    const serialized = JSON.stringify({ ...state, buyer });
    for (const value of [
      '@example.invalid',
      'Road',
      'Suite',
      'Excluded Recipient',
      'excluded-',
      'purchase_units',
    ])
      expect(serialized).not.toContain(value);
    expect(JSON.stringify(state.entries)).not.toContain('Synthetic Buyer');
  });
  it('serializes eight concurrent callbacks and later duplicates to one logical capture', async () => {
    const { input } = await fixture();
    const results = await Promise.all(Array.from({ length: 8 }, () => store.persist(input)));
    expect(results.filter((result) => !result.duplicate)).toHaveLength(1);
    expect((await store.persist(input)).duplicate).toBe(true);
    const state = await snapshot(input.orderId);
    expect(state.entries).toHaveLength(1);
    expect(state.queued).toHaveLength(1);
    expect(
      await database.db
        .select()
        .from(buyers)
        .where(eq(buyers.paypal_payer_id, input.capture.payerId!)),
    ).toHaveLength(1);
  });
  it.each(['packing', 'sealed', 'shipped', 'delivered', 'refunded'])(
    'does not rewind %s on replay',
    async (status) => {
      const { input } = await fixture();
      await store.persist(input);
      await database.db.update(orders).set({ status }).where(eq(orders.id, input.orderId));
      expect((await store.persist(input)).duplicate).toBe(true);
      const state = await snapshot(input.orderId);
      expect(state.order.status).toBe(status);
      expect(state.entries).toHaveLength(1);
      expect(state.queued).toHaveLength(1);
    },
  );
  it('upserts one payer for concurrent distinct orders and does not erase known fields with absent data', async () => {
    const first = await fixture();
    const second = await fixture();
    second.input.capture.payerId = first.input.capture.payerId;
    await Promise.all([store.persist(first.input), store.persist(second.input)]);
    const prior = await snapshot(first.input.orderId);
    expect((await snapshot(second.input.orderId)).order.buyer_id).toBe(prior.order.buyer_id);
    const [before] = await database.db
      .select()
      .from(buyers)
      .where(eq(buyers.id, prior.order.buyer_id!));
    const third = await fixture();
    third.input.capture.payerId = first.input.capture.payerId;
    third.input.capture.payerEmail =
      third.input.capture.payerName =
      third.input.capture.payerAccountStatus =
        null;
    third.input.capture.sellerProtection = { status: null, disputeCategories: [] };
    delete third.unit.shipping;
    await store.persist(third.input);
    const [after] = await database.db
      .select()
      .from(buyers)
      .where(eq(buyers.id, prior.order.buyer_id!));
    expect(after).toEqual(before);
    expect((await snapshot(third.input.orderId)).order).toMatchObject({
      payer_account_status: null,
      seller_protection_status: null,
      ship_to_hash: null,
    });
  });
  it('leaves buyer unknown when payer ID is missing instead of merging by email', async () => {
    const { input } = await fixture();
    input.capture.payerId = null;
    await store.persist(input);
    expect((await snapshot(input.orderId)).order.buyer_id).toBeNull();
  });
  it.each(['PENDING', 'DECLINED', 'FAILED'])(
    'does not persist a %s payment as captured',
    async (status) => {
      const { input, payment } = await fixture();
      input.capture.status = payment.status = status;
      await expect(store.persist(input)).rejects.toMatchObject({ code: 'CAPTURE_NOT_COMPLETED' });
      await unchanged(input);
    },
  );
  it.each(['amount', 'currency', 'order', 'reference', 'merchant', 'invoice'])(
    'rejects a mismatched %s without writes',
    async (field) => {
      const { input, payment, unit } = await fixture();
      if (field === 'amount') payment.amount.value = '37.99';
      if (field === 'currency') payment.amount.currency_code = 'EUR';
      if (field === 'order') {
        input.capture.orderId = 'DIFFERENT';
        (input.capture.raw as { id: string }).id = 'DIFFERENT';
      }
      if (field === 'reference') unit.reference_id = randomUUID();
      if (field === 'merchant') unit.custom_id = 'different-store';
      if (field === 'invoice') unit.invoice_id = 'FF-different';
      await expect(store.persist(input)).rejects.toMatchObject({ code: 'CAPTURE_ORDER_MISMATCH' });
      await unchanged(input);
    },
  );
  it('accepts decimal-equivalent captured money and an approved stored order', async () => {
    const { input, payment } = await fixture();
    payment.amount.value = '38';
    await database.db
      .update(orders)
      .set({ status: 'approved' })
      .where(eq(orders.id, input.orderId));
    expect((await store.persist(input)).duplicate).toBe(false);
    expect((await snapshot(input.orderId)).order.amount_value).toBe('38.00');
  });
  it('rejects a foreign merchant and missing order without disclosing or mutating its state', async () => {
    const { input } = await fixture();
    await expect(store.persist({ ...input, merchantId: randomUUID() })).rejects.toMatchObject({
      code: 'ORDER_NOT_FOUND',
      statusCode: 404,
    });
    await expect(store.persist({ ...input, orderId: randomUUID() })).rejects.toMatchObject({
      code: 'ORDER_NOT_FOUND',
      statusCode: 404,
    });
    await unchanged(input);
  });
  it('rejects a cancelled order and conflicting capture before new side effects', async () => {
    const first = await fixture();
    await database.db
      .update(orders)
      .set({ status: 'cancelled' })
      .where(eq(orders.id, first.input.orderId));
    await expect(store.persist(first.input)).rejects.toMatchObject({
      code: 'CAPTURE_STATE_CONFLICT',
    });
    const second = await fixture();
    await store.persist(second.input);
    second.input.capture.captureId = second.payment.id = 'DIFFERENTCAPTURE';
    await expect(store.persist(second.input)).rejects.toMatchObject({ code: 'CAPTURE_CONFLICT' });
    const state = await snapshot(second.input.orderId);
    expect(state.entries).toHaveLength(1);
    expect(state.queued).toHaveLength(1);
  });
  it('rolls back buyer, order, ledger and an actual pg-boss insert if queuing subsequently fails', async () => {
    const { input } = await fixture();
    const failingJobs: Pick<Jobs, 'publish'> = {
      async publish(name, payload, publishOptions) {
        await jobs.publish(name, payload, publishOptions);
        throw new Error('Synthetic failure after actual queue insert');
      },
    };
    const failing = createCaptureStore({ database, jobs: failingJobs, clock });
    await expect(failing.persist(input)).rejects.toThrow(
      'Synthetic failure after actual queue insert',
    );
    await unchanged(input);
    expect((await store.persist(input)).duplicate).toBe(false);
    expect((await snapshot(input.orderId)).queued).toHaveLength(1);
  });
  it('rolls back the complete transaction if the publisher does not return a job ID', async () => {
    const { input } = await fixture();
    const failingJobs: Pick<Jobs, 'publish'> = {
      async publish() {
        return null;
      },
    };
    await expect(
      createCaptureStore({ database, jobs: failingJobs, clock }).persist(input),
    ).rejects.toMatchObject({ code: 'CAPTURE_JOB_NOT_CREATED' });
    await unchanged(input);
  });
  it('prevents the same capture ID belonging to two distinct orders, rolling back the second buyer', async () => {
    const first = await fixture();
    await store.persist(first.input);
    const second = await fixture();
    second.input.capture.captureId = second.payment.id = first.input.capture.captureId;
    await expect(store.persist(second.input)).rejects.toMatchObject({ code: 'CAPTURE_CONFLICT' });
    await unchanged(second.input);
    expect(
      await database.db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.paypal_capture_id, first.input.capture.captureId),
            eq(orders.id, first.input.orderId),
          ),
        ),
    ).toHaveLength(1);
  });
  it('rejects an invalid injected clock before writing capture data', async () => {
    const { input } = await fixture();
    const invalid = createCaptureStore({
      database,
      jobs,
      clock: { now: () => new Date('invalid') },
    });
    await expect(invalid.persist(input)).rejects.toThrow('Invalid capture clock');
    await unchanged(input);
  });
});
