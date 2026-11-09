import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fixedClock, type PayPalClient } from '@fairfold/contracts';
import {
  createDatabase,
  merchants,
  migrateDatabase,
  order_items,
  orders,
  products,
} from '@fairfold/db';
import { testDatabaseUrl } from '../../../packages/db/test/environment.js';
import { createCheckoutOrders } from '../src/checkout/create-order.js';

const integrationUrl = testDatabaseUrl();
const clock = fixedClock('2026-11-09T14:20:00.456Z');
type Create = PayPalClient['orders']['create'];

describe.skipIf(!integrationUrl)('database-priced checkout creation', () => {
  let database: ReturnType<typeof createDatabase>;
  beforeAll(async () => {
    database = createDatabase(integrationUrl!);
    await migrateDatabase(database.db);
  });
  afterAll(async () => {
    await database?.close();
  });
  async function fixture() {
    const orderId = randomUUID();
    const [merchant] = await database.db
      .insert(merchants)
      .values({
        slug: 'checkout-test-' + orderId,
        name: 'Synthetic checkout merchant',
        domain: 'checkout.example.invalid',
        country: 'US',
      })
      .returning();
    const [product] = await database.db
      .insert(products)
      .values({
        merchant_id: merchant!.id,
        sku: 'SYNTHETIC-HOODIE',
        name: 'Synthetic hoodie',
        description: 'Synthetic fixture product',
        unit_value: '38.00',
        currency: 'USD',
        listing_version: 'v-original',
      })
      .returning();
    const create = vi.fn<Create>(async () => ({
      id: 'O' + orderId.replaceAll('-', '').toUpperCase(),
      status: 'CREATED',
      approveUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=SYNTHETIC',
    }));
    const forMerchant = vi.fn(async () => ({ orders: { create } }));
    const service = createCheckoutOrders({
      database: database.db,
      forMerchant,
      clock,
      createId: () => orderId,
    });
    const input = { merchantId: merchant!.id, items: [{ sku: product!.sku, quantity: 1 }] };
    return { orderId, merchant: merchant!, product: product!, create, forMerchant, service, input };
  }
  async function noOrder(orderId: string) {
    expect(await database.db.select().from(orders).where(eq(orders.id, orderId))).toHaveLength(0);
    expect(
      await database.db.select().from(order_items).where(eq(order_items.order_id, orderId)),
    ).toHaveLength(0);
  }
  it('uses stored prices/listing, source reference/custom/invoice/request IDs and the exact public result', async () => {
    const f = await fixture();
    const result = await f.service.create({
      ...f.input,
      items: [
        {
          ...f.input.items[0],
          unitAmount: { currency_code: 'USD', value: '0.01' },
          name: 'Forged name',
          listingVersion: 'forged',
        },
      ],
      shipping: {
        fullName: 'Transient Recipient',
        address: { address_line_1: 'Transient Street', country_code: 'US' },
      },
    });
    expect(result).toEqual({
      orderId: f.orderId,
      paypalOrderId: f.create.mock.results[0] && (await f.create.mock.results[0].value).id,
    });
    expect(f.forMerchant).toHaveBeenCalledWith(f.merchant.id);
    expect(f.create).toHaveBeenCalledExactlyOnceWith(
      {
        referenceId: f.orderId,
        customId: f.merchant.slug,
        invoiceId: 'FF-' + f.orderId,
        items: [
          {
            name: f.product.name,
            sku: f.product.sku,
            quantity: 1,
            unitAmount: { currency_code: 'USD', value: '38.00' },
          },
        ],
        shipping: {
          fullName: 'Transient Recipient',
          address: { address_line_1: 'Transient Street', country_code: 'US' },
        },
      },
      { requestId: 'ff-create-' + f.orderId },
    );
    const [order] = await database.db.select().from(orders).where(eq(orders.id, f.orderId));
    const items = await database.db
      .select()
      .from(order_items)
      .where(eq(order_items.order_id, f.orderId));
    expect(order).toMatchObject({
      merchant_id: f.merchant.id,
      invoice_id: 'FF-' + f.orderId,
      status: 'created',
      amount_value: '38.00',
      currency: 'USD',
      created_at: clock.now(),
      buyer_id: null,
      paypal_capture_id: null,
      captured_at: null,
      ship_to_country: null,
      ship_to_hash: null,
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      product_id: f.product.id,
      sku: f.product.sku,
      name: f.product.name,
      quantity: 1,
      unit_value: '38.00',
      listing_version: 'v-original',
    });
    expect(JSON.stringify({ order, items })).not.toContain('Transient');
  });
  it('combines duplicate SKUs and calculates decimal totals without floating point', async () => {
    const f = await fixture();
    await database.db
      .update(products)
      .set({ unit_value: '0.10' })
      .where(eq(products.id, f.product.id));
    const [second] = await database.db
      .insert(products)
      .values({
        merchant_id: f.merchant.id,
        sku: 'SYNTHETIC-SECOND',
        name: 'Synthetic second item',
        description: 'Test',
        unit_value: '0.20',
        currency: 'USD',
      })
      .returning();
    await f.service.create({
      ...f.input,
      items: [
        { sku: f.product.sku, quantity: 1 },
        { sku: second!.sku, quantity: 1 },
        { sku: f.product.sku, quantity: 2 },
      ],
    });
    const [order] = await database.db.select().from(orders).where(eq(orders.id, f.orderId));
    expect(order!.amount_value).toBe('0.50');
    const items = await database.db
      .select()
      .from(order_items)
      .where(eq(order_items.order_id, f.orderId));
    expect(items).toHaveLength(2);
    expect(items.find((item) => item.sku === f.product.sku)!.quantity).toBe(3);
    expect(
      f.create.mock.calls[0]![0].items.find((item) => item.sku === f.product.sku)!.quantity,
    ).toBe(3);
  });
  it('retains the exact database-priced snapshot sent to PayPal if a listing changes during the call', async () => {
    const f = await fixture();
    f.create.mockImplementationOnce(async () => {
      await database.db
        .update(products)
        .set({ unit_value: '99.99', name: 'Updated name', listing_version: 'v-new' })
        .where(eq(products.id, f.product.id));
      return {
        id: 'UPDATEDLISTINGORDER',
        status: 'APPROVED',
        approveUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=SYNTHETIC',
      };
    });
    await f.service.create(f.input);
    const [order] = await database.db.select().from(orders).where(eq(orders.id, f.orderId));
    const [item] = await database.db
      .select()
      .from(order_items)
      .where(eq(order_items.order_id, f.orderId));
    expect(order).toMatchObject({ status: 'created', amount_value: '38.00', captured_at: null });
    expect(item).toMatchObject({
      unit_value: '38.00',
      name: f.product.name,
      listing_version: 'v-original',
    });
  });
  it.each(['unknown merchant', 'simulated merchant', 'unknown SKU', 'foreign SKU'])(
    'rejects %s before obtaining a PayPal client',
    async (reason) => {
      const f = await fixture();
      if (reason === 'unknown merchant') f.input.merchantId = randomUUID();
      if (reason === 'simulated merchant')
        await database.db
          .update(merchants)
          .set({ is_simulated: true })
          .where(eq(merchants.id, f.merchant.id));
      if (reason === 'unknown SKU') f.input.items[0]!.sku = 'UNAVAILABLE';
      if (reason === 'foreign SKU') {
        const other = await fixture();
        await database.db
          .update(products)
          .set({ sku: 'FOREIGN-ONLY' })
          .where(eq(products.id, other.product.id));
        f.input.items[0]!.sku = 'FOREIGN-ONLY';
      }
      await expect(f.service.create(f.input)).rejects.toMatchObject({
        code:
          reason === 'unknown merchant'
            ? 'MERCHANT_NOT_FOUND'
            : reason === 'simulated merchant'
              ? 'MERCHANT_NOT_PAYABLE'
              : 'PRODUCT_NOT_FOUND',
      });
      expect(f.forMerchant).not.toHaveBeenCalled();
      expect(f.create).not.toHaveBeenCalled();
      await noOrder(f.orderId);
    },
  );
  it.each(['zero', 'overflow', 'mixed currencies'])(
    'rejects %s totals before invoking PayPal',
    async (reason) => {
      const f = await fixture();
      if (reason === 'zero')
        await database.db
          .update(products)
          .set({ unit_value: '0.00' })
          .where(eq(products.id, f.product.id));
      if (reason === 'overflow') {
        await database.db
          .update(products)
          .set({ unit_value: '9999999999.99' })
          .where(eq(products.id, f.product.id));
        f.input.items[0]!.quantity = 2;
      }
      if (reason === 'mixed currencies') {
        await database.db.insert(products).values({
          merchant_id: f.merchant.id,
          sku: 'EUR-ITEM',
          name: 'Synthetic EUR',
          description: 'Test',
          unit_value: '1.00',
          currency: 'EUR',
        });
        f.input.items.push({ sku: 'EUR-ITEM', quantity: 1 });
      }
      await expect(f.service.create(f.input)).rejects.toMatchObject({ code: 'INVALID_CART' });
      expect(f.forMerchant).not.toHaveBeenCalled();
      await noOrder(f.orderId);
    },
  );
  it.each([0, -1, 1.5, 2_147_483_648, Number.MAX_SAFE_INTEGER])(
    'rejects invalid quantity %s before invoking PayPal',
    async (quantity) => {
      const f = await fixture();
      f.input.items[0]!.quantity = quantity;
      await expect(f.service.create(f.input)).rejects.toMatchObject({ code: 'INVALID_CART' });
      expect(f.forMerchant).not.toHaveBeenCalled();
      await noOrder(f.orderId);
    },
  );
  it('guards aggregate duplicate quantities against SQL integer overflow', async () => {
    const f = await fixture();
    f.input.items[0]!.quantity = 2_147_483_647;
    f.input.items.push({ sku: f.product.sku, quantity: 1 });
    await expect(f.service.create(f.input)).rejects.toMatchObject({ code: 'INVALID_CART' });
    expect(f.forMerchant).not.toHaveBeenCalled();
    await noOrder(f.orderId);
  });
  it('stores no local order when credential resolution or the vendor create operation fails', async () => {
    const first = await fixture();
    first.forMerchant.mockRejectedValueOnce(new Error('Synthetic unavailable credentials'));
    await expect(first.service.create(first.input)).rejects.toThrow(
      'Synthetic unavailable credentials',
    );
    expect(first.create).not.toHaveBeenCalled();
    await noOrder(first.orderId);
    const second = await fixture();
    second.create.mockRejectedValueOnce(new Error('Synthetic vendor failure'));
    await expect(second.service.create(second.input)).rejects.toThrow('Synthetic vendor failure');
    expect(second.create).toHaveBeenCalledTimes(1);
    await noOrder(second.orderId);
  });
  it('rolls back the order if item persistence fails after vendor creation and reports only recovery identifiers', async () => {
    const f = await fixture();
    f.create.mockImplementationOnce(async () => {
      await database.db.delete(products).where(eq(products.id, f.product.id));
      return {
        id: 'SYNTHETICORPHANORDER',
        status: 'CREATED',
        approveUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=SYNTHETIC',
      };
    });
    await expect(f.service.create(f.input)).rejects.toMatchObject({
      code: 'CHECKOUT_PERSISTENCE_FAILED',
      statusCode: 503,
      details: { orderId: f.orderId, paypalOrderId: 'SYNTHETICORPHANORDER' },
    });
    expect(f.create).toHaveBeenCalledTimes(1);
    await noOrder(f.orderId);
  });
  it('rejects unexpected top-level input and an invalid clock without external effects', async () => {
    const f = await fixture();
    await expect(f.service.create({ ...f.input, amount: '0.01' })).rejects.toMatchObject({
      code: 'INVALID_CART',
    });
    const invalid = createCheckoutOrders({
      database: database.db,
      forMerchant: f.forMerchant,
      clock: { now: () => new Date('invalid') },
    });
    await expect(invalid.create(f.input)).rejects.toThrow('Invalid checkout clock');
    expect(f.forMerchant).not.toHaveBeenCalled();
    await noOrder(f.orderId);
  });
});
