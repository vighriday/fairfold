import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabase, merchants, migrateDatabase } from '@fairfold/db';
import { type ForMerchant } from '@fairfold/contracts';
import { testDatabaseUrl } from '../../db/test/environment.js';
import { registerMerchantWebhook, PayPalEventTypes } from '../src/registration.js';

const url = testDatabaseUrl();
describe.skipIf(!url)('H3 explicit merchant webhook registration (synthetic vendor)', () => {
  let database: ReturnType<typeof createDatabase>;
  const ids: string[] = [];
  beforeAll(async () => {
    database = createDatabase(url!);
    await migrateDatabase(database.db);
  });
  afterAll(async () => {
    for (const id of ids) await database.db.delete(merchants).where(eq(merchants.id, id));
    await database.close();
  });
  async function fixture(extra: Partial<typeof merchants.$inferInsert> = {}) {
    const id = randomUUID();
    ids.push(id);
    const slug = 'h3-registration-' + id;
    await database.db.insert(merchants).values({
      id,
      slug,
      name: 'Synthetic registration',
      domain: 'synthetic.invalid',
      country: 'US',
      paypal_client_id: 'synthetic-client',
      paypal_client_secret_enc: 'synthetic-encrypted-value-never-decrypted',
      ...extra,
    });
    const register = vi.fn(async () => ({ id: 'SYNTHETICWEBHOOK123' }));
    // Only the registration seam is exercised; no client HTTP is substituted silently.
    const forMerchant = vi.fn(async () => ({ webhooks: { register } })) as unknown as ForMerchant;
    return {
      id,
      slug,
      register,
      options: {
        database,
        forMerchant,
        appBaseUrl: 'https://fairfold.example.com',
        merchantSlug: slug,
      },
    };
  }
  it('registers exactly seven source events at endpoint 37 and stores the returned ID', async () => {
    const f = await fixture();
    expect(await registerMerchantWebhook(f.options)).toMatchObject({
      merchantId: f.id,
      alreadyRegistered: false,
    });
    expect(f.register).toHaveBeenCalledWith(
      'https://fairfold.example.com/webhooks/paypal/' + f.slug,
      [...PayPalEventTypes],
    );
    const [row] = await database.db.select().from(merchants).where(eq(merchants.id, f.id));
    expect(row!.paypal_webhook_id).toBe('SYNTHETICWEBHOOK123');
  });
  it('coalesces concurrent registration under the merchant row lock', async () => {
    const f = await fixture();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => registerMerchantWebhook(f.options)),
    );
    expect(results.filter((r) => !r.alreadyRegistered)).toHaveLength(1);
    expect(f.register).toHaveBeenCalledTimes(1);
  });
  it('does not overwrite an existing registration or call the vendor', async () => {
    const f = await fixture({ paypal_webhook_id: 'EXISTING123' });
    expect(await registerMerchantWebhook(f.options)).toMatchObject({
      webhookId: 'EXISTING123',
      alreadyRegistered: true,
    });
    expect(f.register).not.toHaveBeenCalled();
  });
  it.each([{ is_simulated: true }, { paypal_client_id: null }, { paypal_client_secret_enc: null }])(
    'rejects an unavailable merchant before vendor HTTP: %j',
    async (extra) => {
      const f = await fixture(extra);
      await expect(registerMerchantWebhook(f.options)).rejects.toThrow();
      expect(f.register).not.toHaveBeenCalled();
    },
  );
  it.each([
    'http://localhost:3110',
    'https://127.0.0.1',
    'https://api.example.com/path',
    'https://user:pass@api.example.com',
    'https://api.example.com/?token=hidden',
  ])('rejects an unsuitable public origin: %s', async (appBaseUrl) => {
    const f = await fixture();
    await expect(registerMerchantWebhook({ ...f.options, appBaseUrl })).rejects.toMatchObject({
      code: 'PUBLIC_HTTPS_REQUIRED',
    });
    expect(f.register).not.toHaveBeenCalled();
  });
  it('does not retry a failed registration or save an unobserved ID', async () => {
    const f = await fixture();
    f.register.mockRejectedValueOnce(new Error('Synthetic timeout'));
    await expect(registerMerchantWebhook(f.options)).rejects.toThrow('Synthetic timeout');
    expect(f.register).toHaveBeenCalledTimes(1);
    const [row] = await database.db.select().from(merchants).where(eq(merchants.id, f.id));
    expect(row!.paypal_webhook_id).toBeNull();
  });
});
