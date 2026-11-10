import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decryptSecret } from '@fairfold/contracts';
import { createDatabase, merchants, products, migrateDatabase } from '@fairfold/db';
import { testDatabaseUrl } from '../../../packages/db/test/environment.js';
import { provisionSandboxCheckout, SandboxHoodie } from '../src/checkout/setup-sandbox.js';
import { inspectSandboxCheckout } from '../src/checkout/verify-sandbox.js';

const integrationUrl = testDatabaseUrl();
describe.skipIf(!integrationUrl)('minimal H2 sandbox catalogue setup', () => {
  let database: ReturnType<typeof createDatabase>;
  const key = randomBytes(32);
  const credentials = {
    clientId: 'synthetic-setup-client',
    clientSecret: 'synthetic-setup-secret',
    encryptionKey: key,
  };
  const source = SandboxHoodie;
  beforeAll(async () => {
    database = createDatabase(integrationUrl!);
    await migrateDatabase(database.db);
    // This fixed demo subject belongs only to this fixture in the isolated test database.
    await database.db.delete(products).where(eq(products.merchant_id, source.merchantId));
    await database.db.delete(merchants).where(eq(merchants.id, source.merchantId));
  });
  afterAll(async () => {
    if (database) {
      await database.db.delete(products).where(eq(products.merchant_id, source.merchantId));
      await database.db.delete(merchants).where(eq(merchants.id, source.merchantId));
      await database.close();
    }
  });
  async function setup() {
    return provisionSandboxCheckout({ database: database.db, ...credentials });
  }
  async function rows() {
    const [merchant] = await database.db
      .select()
      .from(merchants)
      .where(eq(merchants.id, source.merchantId));
    const catalogue = await database.db
      .select()
      .from(products)
      .where(eq(products.merchant_id, source.merchantId));
    return { merchant: merchant!, catalogue };
  }
  it('creates only source Neel and the USD38 hoodie with an encrypted secret', async () => {
    expect(await setup()).toMatchObject({ merchantCreated: true, productCreated: true });
    const result = await rows();
    expect(result.merchant).toMatchObject({
      slug: source.slug,
      is_simulated: false,
      paypal_client_id: credentials.clientId,
    });
    expect(decryptSecret(result.merchant.paypal_client_secret_enc!, key)).toBe(
      credentials.clientSecret,
    );
    expect(JSON.stringify(result)).not.toContain(credentials.clientSecret);
    expect(result.catalogue).toHaveLength(1);
    expect(result.catalogue[0]).toMatchObject({
      sku: source.sku,
      unit_value: '38.00',
      currency: 'USD',
      listing_version: 'v1',
    });
  });
  it('repeats and runs concurrent setup without replacing the listing, secret or product ID', async () => {
    await database.db
      .update(products)
      .set({ description: 'Existing listing', listing_version: 'v2' })
      .where(eq(products.merchant_id, source.merchantId));
    const before = await rows();
    const results = await Promise.all(Array.from({ length: 4 }, setup));
    expect(results.every((result) => !result.merchantCreated && !result.productCreated)).toBe(true);
    expect(await rows()).toEqual(before);
  });
  it('preflights stored credentials and catalogue without exposing secret values', async () => {
    expect((await inspectSandboxCheckout({ database: database.db, ...credentials })).status).toBe(
      'LOCAL_SETUP_READY',
    );
    const wrongKey = await inspectSandboxCheckout({
      database: database.db,
      ...credentials,
      encryptionKey: randomBytes(32),
    });
    expect(wrongKey.status).toBe('BLOCKED');
    expect(wrongKey.checks.credentialsMatch).toBe(false);
    expect(JSON.stringify(wrongKey)).not.toContain(credentials.clientSecret);
    const [other] = await database.db
      .insert(products)
      .values({
        merchant_id: source.merchantId,
        sku: 'SYNTHETIC-EUR-PREFLIGHT',
        name: 'Synthetic EUR item',
        description: 'Synthetic test only',
        unit_value: '1.00',
        currency: 'EUR',
      })
      .returning();
    try {
      expect(
        (await inspectSandboxCheckout({ database: database.db, ...credentials })).checks
          .oneCurrency,
      ).toBe(false);
    } finally {
      await database.db.delete(products).where(eq(products.id, other!.id));
    }
  });
  it.each(['client', 'secret', 'key', 'simulated', 'price', 'currency', 'slug'])(
    'rejects a conflicting %s without changing the existing setup',
    async (field) => {
      const override = { ...credentials };
      if (field === 'client') override.clientId = 'different-client';
      if (field === 'secret') override.clientSecret = 'different-secret';
      if (field === 'key') override.encryptionKey = randomBytes(32);
      if (field === 'simulated')
        await database.db
          .update(merchants)
          .set({ is_simulated: true })
          .where(eq(merchants.id, source.merchantId));
      if (field === 'slug')
        await database.db
          .update(merchants)
          .set({ slug: 'synthetic-conflict' })
          .where(eq(merchants.id, source.merchantId));
      if (field === 'price')
        await database.db
          .update(products)
          .set({ unit_value: '39.00' })
          .where(eq(products.merchant_id, source.merchantId));
      if (field === 'currency')
        await database.db
          .update(products)
          .set({ currency: 'EUR' })
          .where(eq(products.merchant_id, source.merchantId));
      const before = await rows();
      try {
        await expect(
          provisionSandboxCheckout({ database: database.db, ...override }),
        ).rejects.toMatchObject({ code: 'SANDBOX_SETUP_CONFLICT' });
        expect(await rows()).toEqual(before);
      } finally {
        await database.db
          .update(merchants)
          .set({ slug: source.slug, is_simulated: false })
          .where(eq(merchants.id, source.merchantId));
        await database.db
          .update(products)
          .set({ unit_value: '38.00', currency: 'USD' })
          .where(and(eq(products.merchant_id, source.merchantId), eq(products.sku, source.sku)));
      }
    },
  );
});
