import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import {
  AppError,
  CoreRequests,
  MoneySchema,
  UuidSchema,
  systemClock,
  type Clock,
  type PayPalClient,
} from '@fairfold/contracts';
import { merchants, orders, order_items, products, type Database } from '@fairfold/db';

export type CheckoutOrderClient = { orders: Pick<PayPalClient['orders'], 'create'> };

function invalidCart(): never {
  throw new AppError('INVALID_CART', 'Cart cannot be priced', 400);
}

export function createCheckoutOrders(options: {
  database: Database;
  forMerchant: (merchantId: string) => Promise<CheckoutOrderClient>;
  clock?: Clock;
  createId?: () => string;
}) {
  const clock = options.clock ?? systemClock;
  return {
    async create(input: unknown) {
      const parsed = CoreRequests.createOrder.safeParse(input);
      if (!parsed.success) return invalidCart();
      const cart = parsed.data;
      const quantities = new Map<string, number>();
      if (cart.items.length > 32767) return invalidCart();
      for (const item of cart.items) {
        const quantity = (quantities.get(item.sku) ?? 0) + item.quantity;
        if (!Number.isSafeInteger(quantity) || quantity > 2_147_483_647) return invalidCart();
        quantities.set(item.sku, quantity);
      }
      const [merchant] = await options.database
        .select({ id: merchants.id, slug: merchants.slug, simulated: merchants.is_simulated })
        .from(merchants)
        .where(eq(merchants.id, cart.merchantId));
      if (!merchant) throw new AppError('MERCHANT_NOT_FOUND', 'Merchant not found', 404);
      if (merchant.simulated)
        throw new AppError('MERCHANT_NOT_PAYABLE', 'Merchant cannot accept sandbox checkout', 409);
      const rows = await options.database
        .select({
          id: products.id,
          sku: products.sku,
          name: products.name,
          unitValue: products.unit_value,
          currency: products.currency,
          listingVersion: products.listing_version,
        })
        .from(products)
        .where(
          and(eq(products.merchant_id, merchant.id), inArray(products.sku, [...quantities.keys()])),
        );
      if (rows.length !== quantities.size)
        throw new AppError('PRODUCT_NOT_FOUND', 'A cart product is unavailable', 404);
      const currency = rows[0]!.currency;
      let total = 0n;
      const items = rows
        .sort((a, b) => (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0))
        .map((product) => {
          const price = MoneySchema.safeParse({
            currency_code: product.currency,
            value: product.unitValue,
          });
          if (!price.success || product.currency !== currency) return invalidCart();
          const [whole, fraction = ''] = product.unitValue.split('.');
          total +=
            (BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'))) *
            BigInt(quantities.get(product.sku)!);
          return { ...product, quantity: quantities.get(product.sku)! };
        });
      if (total <= 0n || total > 999_999_999_999n) return invalidCart();
      const orderId = (options.createId ?? randomUUID)();
      if (!UuidSchema.safeParse(orderId).success) throw new Error('Invalid generated order ID');
      const createdAt = new Date(Math.trunc(clock.now().getTime()));
      if (!Number.isFinite(createdAt.getTime())) throw new Error('Invalid checkout clock');
      const client = await options.forMerchant(merchant.id);
      const created = await client.orders.create(
        {
          referenceId: orderId,
          customId: merchant.slug,
          invoiceId: 'FF-' + orderId,
          items: items.map((item) => ({
            sku: item.sku,
            name: item.name,
            quantity: item.quantity,
            unitAmount: { currency_code: item.currency, value: item.unitValue },
          })),
          ...(cart.shipping ? { shipping: cart.shipping } : {}),
        },
        { requestId: 'ff-create-' + orderId },
      );
      // No local write until the validated vendor operation returns. Never replay it here.
      try {
        await options.database.transaction(async (tx) => {
          await tx.insert(orders).values({
            id: orderId,
            merchant_id: merchant.id,
            paypal_order_id: created.id,
            invoice_id: 'FF-' + orderId,
            status: 'created',
            amount_value: `${total / 100n}.${(total % 100n).toString().padStart(2, '0')}`,
            currency,
            created_at: createdAt,
          });
          await tx.insert(order_items).values(
            items.map((item) => ({
              order_id: orderId,
              product_id: item.id,
              sku: item.sku,
              name: item.name,
              quantity: item.quantity,
              unit_value: item.unitValue,
              listing_version: item.listingVersion,
            })),
          );
        });
      } catch {
        throw new AppError(
          'CHECKOUT_PERSISTENCE_FAILED',
          'Created PayPal order could not be stored locally',
          503,
          { orderId, paypalOrderId: created.id },
        );
      }
      return { orderId, paypalOrderId: created.id };
    },
  };
}
