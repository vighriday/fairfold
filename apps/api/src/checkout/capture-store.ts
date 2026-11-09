import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import {
  AppError,
  MoneySchema,
  UuidSchema,
  systemClock,
  type CaptureResult,
  type Clock,
} from '@fairfold/contracts';
import { buyers, orders, schema, type createDatabase } from '@fairfold/db';
import { createLedger } from '@fairfold/ledger';
import { type Jobs } from '@fairfold/jobs';
import { minimizeCapture } from './capture-policy.js';

function minor(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
}

function uniqueViolation(error: unknown): boolean {
  let candidate = error;
  for (let depth = 0; depth < 4 && candidate instanceof Error; depth++) {
    if ('code' in candidate && candidate.code === '23505') return true;
    candidate = candidate.cause;
  }
  return false;
}

/** Persists a trusted merchant-scoped PayPal result, never invokes vendor HTTP. */
export function createCaptureStore(options: {
  database: Pick<ReturnType<typeof createDatabase>, 'pool'>;
  jobs: Pick<Jobs, 'publish'>;
  clock?: Clock;
}) {
  const clock = options.clock ?? systemClock;
  return {
    async persist(input: { merchantId: string; orderId: string; capture: CaptureResult }) {
      if (
        !UuidSchema.safeParse(input.merchantId).success ||
        !UuidSchema.safeParse(input.orderId).success
      )
        throw new AppError('INVALID_ORDER_CONTEXT', 'Order context is invalid', 400);
      const capture = minimizeCapture(input.capture);
      const client = await options.database.pool.connect();
      try {
        // Drizzle, the ledger savepoint and pg-boss use this one checked-out connection.
        return await drizzle(client, { schema }).transaction(async (tx) => {
          const [order] = await tx
            .select()
            .from(orders)
            .where(and(eq(orders.id, input.orderId), eq(orders.merchant_id, input.merchantId)))
            .for('update');
          if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order not found', 404);
          const [merchant] = await tx
            .select({ slug: schema.merchants.slug })
            .from(schema.merchants)
            .where(eq(schema.merchants.id, order.merchant_id));
          const amount = MoneySchema.safeParse({
            currency_code: order.currency,
            value: order.amount_value,
          });
          if (
            !merchant ||
            !amount.success ||
            capture.orderId !== order.paypal_order_id ||
            capture.amount.currency_code !== order.currency ||
            minor(capture.amount.value) !== minor(order.amount_value) ||
            (capture.referenceId !== null && capture.referenceId !== order.id) ||
            (capture.customId !== null && capture.customId !== merchant.slug) ||
            (capture.invoiceId !== null && capture.invoiceId !== order.invoice_id)
          )
            throw new AppError(
              'CAPTURE_ORDER_MISMATCH',
              'Capture does not match the stored order',
              409,
            );
          if (capture.status !== 'COMPLETED')
            throw new AppError('CAPTURE_NOT_COMPLETED', 'Payment capture is not completed', 409);
          if (order.paypal_capture_id !== null || order.captured_at !== null) {
            if (order.paypal_capture_id === capture.captureId && order.captured_at !== null)
              return { orderId: order.id, duplicate: true };
            throw new AppError('CAPTURE_CONFLICT', 'Order has a conflicting capture state', 409);
          }
          if (!['created', 'approved'].includes(order.status))
            throw new AppError(
              'CAPTURE_STATE_CONFLICT',
              'Order cannot transition to captured',
              409,
            );
          const now = new Date(Math.trunc(clock.now().getTime()));
          if (!Number.isFinite(now.getTime())) throw new Error('Invalid capture clock');
          let buyerId: string | null = null;
          if (capture.payerId) {
            const [buyer] = await tx
              .insert(buyers)
              .values({
                paypal_payer_id: capture.payerId,
                email_hash: capture.emailHash,
                display_name: capture.displayName,
                country: capture.shipToCountry,
                created_at: now,
              })
              .onConflictDoUpdate({
                target: buyers.paypal_payer_id,
                set: {
                  email_hash: sql`coalesce(excluded.email_hash, ${buyers.email_hash})`,
                  display_name: sql`coalesce(excluded.display_name, ${buyers.display_name})`,
                  country: sql`coalesce(excluded.country, ${buyers.country})`,
                },
              })
              .returning({ id: buyers.id });
            if (!buyer) throw new Error('Buyer upsert returned no identity');
            buyerId = buyer.id;
          }
          await tx
            .update(orders)
            .set({
              buyer_id: buyerId,
              paypal_capture_id: capture.captureId,
              status: 'captured',
              ship_to_country: capture.shipToCountry,
              ship_to_postal: capture.shipToPostal,
              ship_to_hash: capture.shipToHash,
              payer_account_status: capture.payerAccountStatus,
              seller_protection_status: capture.sellerProtection.status,
              seller_protection_categories: capture.sellerProtection.disputeCategories,
              captured_at: now,
            })
            .where(eq(orders.id, order.id));
          await createLedger(tx, { now: () => now }).append(order.id, {
            type: 'captured',
            actor: 'paypal',
            payload: {
              paypalOrderId: order.paypal_order_id,
              paypalCaptureId: capture.captureId,
              amount: { currency_code: order.currency, value: order.amount_value },
              sellerProtection: capture.sellerProtection,
              payerAccountStatus: capture.payerAccountStatus,
            },
          });
          const jobId = await options.jobs.publish(
            'order.captured',
            { orderId: order.id },
            {
              db: { executeSql: (query, values) => client.query(query, values) },
            },
          );
          if (!jobId)
            throw new AppError(
              'CAPTURE_JOB_NOT_CREATED',
              'Capture notification could not be queued',
              503,
            );
          return { orderId: order.id, duplicate: false };
        });
      } catch (error) {
        if (uniqueViolation(error))
          throw new AppError('CAPTURE_CONFLICT', 'Capture conflicts with an existing order', 409);
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
