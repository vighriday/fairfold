import { and, eq } from 'drizzle-orm';
import {
  AppError,
  CoreRequests,
  MoneySchema,
  OrderSummarySchema,
  UuidSchema,
  type Clock,
} from '@fairfold/contracts';
import { merchants, orders, order_items, products, type createDatabase } from '@fairfold/db';
import { type Jobs } from '@fairfold/jobs';
import { PayPalError, type CheckoutClient } from '@fairfold/paypal';
import { type AuthContext } from '../auth.js';
import { createCheckoutOrders } from './create-order.js';
import { createCaptureStore } from './capture-store.js';

function checkoutRole(auth: AuthContext | null) {
  if (auth && auth.role !== 'buyer')
    throw new AppError('FORBIDDEN', 'This role cannot use buyer checkout', 403);
  if (auth && !UuidSchema.safeParse(auth.subjectId).success)
    throw new AppError('UNAUTHENTICATED', 'A valid bearer token is required', 401);
}

export function createCheckoutService(options: {
  database: ReturnType<typeof createDatabase>;
  jobs: Pick<Jobs, 'publish'>;
  forMerchant: (merchantId: string) => Promise<CheckoutClient>;
  clock?: Clock;
}) {
  const creator = createCheckoutOrders({
    database: options.database.db,
    forMerchant: options.forMerchant,
    clock: options.clock,
  });
  const captures = createCaptureStore(options);
  const pending = new Map<string, Promise<ReturnType<typeof OrderSummarySchema.parse>>>();
  async function summary(id: string, merchantId: string) {
    return options.database.db.transaction(
      async (tx) => {
        const [order] = await tx
          .select()
          .from(orders)
          .where(and(eq(orders.id, id), eq(orders.merchant_id, merchantId)));
        if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order not found', 404);
        const items = await tx
          .select({ sku: order_items.sku, name: order_items.name, quantity: order_items.quantity })
          .from(order_items)
          .where(eq(order_items.order_id, id))
          .orderBy(order_items.sku, order_items.id);
        return OrderSummarySchema.parse({
          id: order.id,
          merchantId: order.merchant_id,
          status: order.status,
          amount: { currency_code: order.currency, value: order.amount_value },
          createdAt: order.created_at.toISOString(),
          items,
        });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  async function execute(order: typeof orders.$inferSelect) {
    if (order.paypal_capture_id || order.captured_at) {
      if (!order.paypal_capture_id || !order.captured_at)
        throw new AppError('CAPTURE_CONFLICT', 'Order has a conflicting capture state', 409);
      return summary(order.id, order.merchant_id);
    }
    if (!['created', 'approved'].includes(order.status))
      throw new AppError('CAPTURE_STATE_CONFLICT', 'Order cannot transition to captured', 409);
    const client = await options.forMerchant(order.merchant_id);
    let result = await client.readCapture(order.paypal_order_id);
    if (!result) {
      try {
        result = await client.orders.capture(order.paypal_order_id, {
          requestId: 'ff-capture-' + order.id,
        });
      } catch (error) {
        if (
          !(error instanceof PayPalError) ||
          (!error.outcomeUnknown && !error.issues.includes('ORDER_ALREADY_CAPTURED'))
        )
          throw error;
        // Re-fetch after an ambiguous POST or another instance's successful capture; never issue a second POST here.
        result = await client.readCapture(order.paypal_order_id);
        if (!result) throw error;
      }
    }
    await captures.persist({ merchantId: order.merchant_id, orderId: order.id, capture: result });
    return summary(order.id, order.merchant_id);
  }
  return {
    async config(query: unknown) {
      const parsed = CoreRequests.checkoutConfig.safeParse(query);
      if (!parsed.success)
        throw new AppError('INVALID_CHECKOUT_QUERY', 'Checkout query is invalid', 400);
      const [merchant] = await options.database.db
        .select({
          id: merchants.id,
          clientId: merchants.paypal_client_id,
          simulated: merchants.is_simulated,
        })
        .from(merchants)
        .where(eq(merchants.slug, parsed.data.merchant));
      if (!merchant) throw new AppError('MERCHANT_NOT_FOUND', 'Merchant not found', 404);
      if (merchant.simulated)
        throw new AppError('MERCHANT_NOT_PAYABLE', 'Merchant cannot accept sandbox checkout', 409);
      if (!merchant.clientId?.trim())
        throw new AppError(
          'PAYPAL_CREDENTIALS_MISSING',
          'Sandbox merchant setup is incomplete',
          503,
        );
      const currencies = await options.database.db
        .selectDistinct({ currency: products.currency })
        .from(products)
        .where(eq(products.merchant_id, merchant.id));
      if (
        currencies.length !== 1 ||
        !MoneySchema.shape.currency_code.safeParse(currencies[0]?.currency).success
      )
        throw new AppError(
          'CHECKOUT_CURRENCY_UNAVAILABLE',
          'Merchant checkout currency is unavailable',
          409,
        );
      return {
        clientId: merchant.clientId,
        merchantId: merchant.id,
        currency: currencies[0]!.currency,
      };
    },
    create(auth: AuthContext | null, input: unknown) {
      checkoutRole(auth);
      return creator.create(input);
    },
    async capture(auth: AuthContext | null, paypalOrderId: string) {
      checkoutRole(auth);
      if (!/^[A-Z0-9]{1,36}$/.test(paypalOrderId))
        throw new AppError('INVALID_PAYPAL_ORDER_ID', 'PayPal order ID is invalid', 400);
      const [order] = await options.database.db
        .select()
        .from(orders)
        .where(eq(orders.paypal_order_id, paypalOrderId));
      if (!order || (auth && order.buyer_id && order.buyer_id !== auth.subjectId))
        throw new AppError('ORDER_NOT_FOUND', 'Order not found', 404);
      const existing = pending.get(order.id);
      if (existing) return existing;
      const work = execute(order);
      pending.set(order.id, work);
      try {
        return await work;
      } finally {
        if (pending.get(order.id) === work) pending.delete(order.id);
      }
    },
  };
}
