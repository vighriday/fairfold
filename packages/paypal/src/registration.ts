import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { AppError, type ForMerchant } from '@fairfold/contracts';
import { merchants, schema, type createDatabase } from '@fairfold/db';

export const PayPalEventTypes = [
  'CHECKOUT.ORDER.APPROVED',
  'PAYMENT.CAPTURE.COMPLETED',
  'PAYMENT.CAPTURE.REFUNDED',
  'PAYMENT.CAPTURE.REVERSED',
  'CUSTOMER.DISPUTE.CREATED',
  'CUSTOMER.DISPUTE.UPDATED',
  'CUSTOMER.DISPUTE.RESOLVED',
] as const;

/** Registration is explicit; an ambiguous outcome requires Dashboard reconciliation. */
export async function registerMerchantWebhook(options: {
  database: Pick<ReturnType<typeof createDatabase>, 'pool'>;
  forMerchant: ForMerchant;
  appBaseUrl: string;
  merchantSlug: string;
}) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(options.merchantSlug))
    throw new AppError('INVALID_MERCHANT_SLUG', 'Merchant slug is invalid', 400);
  let base: URL;
  try {
    base = new URL(options.appBaseUrl);
  } catch {
    throw new AppError('PUBLIC_HTTPS_REQUIRED', 'A public HTTPS API origin is required', 400);
  }
  if (
    base.protocol !== 'https:' ||
    base.username ||
    base.password ||
    base.port ||
    base.pathname !== '/' ||
    base.search ||
    base.hash ||
    !base.hostname.includes('.') ||
    /(^|\.)(localhost|local|invalid)$/.test(base.hostname) ||
    /^(\d+\.){3}\d+$/.test(base.hostname)
  )
    throw new AppError('PUBLIC_HTTPS_REQUIRED', 'A public HTTPS API origin is required', 400);
  const url = new URL('/webhooks/paypal/' + options.merchantSlug, base).href;
  const client = await options.database.pool.connect();
  try {
    return await drizzle(client, { schema }).transaction(async (tx) => {
      const [merchant] = await tx
        .select()
        .from(merchants)
        .where(eq(merchants.slug, options.merchantSlug))
        .for('update');
      if (!merchant || merchant.is_simulated)
        throw new AppError('MERCHANT_NOT_AVAILABLE', 'A real sandbox merchant is required', 404);
      if (!merchant.paypal_client_id || !merchant.paypal_client_secret_enc)
        throw new AppError(
          'PAYPAL_CREDENTIALS_REQUIRED',
          'Merchant sandbox credentials are required',
          409,
        );
      if (merchant.paypal_webhook_id)
        return {
          merchantId: merchant.id,
          webhookId: merchant.paypal_webhook_id,
          url,
          alreadyRegistered: true,
        };
      const paypal = await options.forMerchant(merchant.id);
      const result = await paypal.webhooks.register(url, [...PayPalEventTypes]);
      if (!/^[A-Za-z0-9]{1,50}$/.test(result.id))
        throw new AppError(
          'WEBHOOK_REGISTRATION_UNCERTAIN',
          'Reconcile the app webhook in PayPal Dashboard before retrying',
          502,
        );
      await tx
        .update(merchants)
        .set({ paypal_webhook_id: result.id })
        .where(eq(merchants.id, merchant.id));
      return { merchantId: merchant.id, webhookId: result.id, url, alreadyRegistered: false };
    });
  } finally {
    client.release();
  }
}
