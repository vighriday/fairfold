import { and, eq, or, sql } from 'drizzle-orm';
import { AppError, DemoSubjects, decryptSecret, encryptSecret } from '@fairfold/contracts';
import { merchants, products, type Database } from '@fairfold/db';

export const SandboxHoodie = {
  merchantId: DemoSubjects.merchant,
  slug: 'neel-block-prints',
  name: 'Neel Block Prints',
  domain: 'neelblockprints.example',
  country: 'IN',
  sku: 'HD-IND-01',
  productName: 'Block-print cotton hoodie',
  value: '38.00',
  currency: 'USD',
} as const;

function conflict(): never {
  throw new AppError(
    'SANDBOX_SETUP_CONFLICT',
    'Existing sandbox setup requires explicit review',
    409,
  );
}

/** Minimal H2 catalogue only. Never seeds B17, buyers, history or fictional payments. */
export async function provisionSandboxCheckout(options: {
  database: Database;
  clientId: string;
  clientSecret: string;
  encryptionKey: Buffer;
}) {
  if (
    !options.clientId.trim() ||
    !options.clientSecret.trim() ||
    options.encryptionKey.length !== 32
  )
    throw new AppError(
      'SANDBOX_SETUP_INVALID',
      'Sandbox credentials and encryption key are required',
    );
  const source = SandboxHoodie;
  return options.database.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(186447901, 2)`);
    const existing = await tx
      .select()
      .from(merchants)
      .where(or(eq(merchants.id, source.merchantId), eq(merchants.slug, source.slug)));
    const merchant = existing[0];
    if (
      existing.length > 1 ||
      (merchant &&
        (merchant.id !== source.merchantId ||
          merchant.slug !== source.slug ||
          merchant.is_simulated ||
          merchant.name !== source.name ||
          merchant.domain !== source.domain ||
          merchant.country !== source.country ||
          (merchant.paypal_client_id !== null && merchant.paypal_client_id !== options.clientId)))
    )
      return conflict();
    if (merchant?.paypal_client_secret_enc) {
      try {
        if (
          decryptSecret(merchant.paypal_client_secret_enc, options.encryptionKey) !==
          options.clientSecret
        )
          return conflict();
      } catch {
        return conflict();
      }
    }
    const [product] = await tx
      .select()
      .from(products)
      .where(and(eq(products.merchant_id, source.merchantId), eq(products.sku, source.sku)));
    if (
      product &&
      (product.unit_value !== source.value ||
        product.currency !== source.currency ||
        product.name !== source.productName)
    )
      return conflict();
    const credentials = {
      paypal_client_id: options.clientId,
      paypal_client_secret_enc:
        merchant?.paypal_client_secret_enc ??
        encryptSecret(options.clientSecret, options.encryptionKey),
    };
    if (merchant) {
      await tx.update(merchants).set(credentials).where(eq(merchants.id, source.merchantId));
    } else {
      await tx.insert(merchants).values({
        id: source.merchantId,
        slug: source.slug,
        name: source.name,
        domain: source.domain,
        country: source.country,
        is_simulated: false,
        ...credentials,
      });
    }
    if (!product) {
      await tx.insert(products).values({
        merchant_id: source.merchantId,
        sku: source.sku,
        name: source.productName,
        description: 'Block-print cotton hoodie.',
        listing_version: 'v1',
        unit_value: source.value,
        currency: source.currency,
      });
    }
    return {
      merchantId: source.merchantId,
      sku: source.sku,
      merchantCreated: !merchant,
      productCreated: !product,
    };
  });
}
