import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabase, merchants, migrateDatabase } from '@fairfold/db';
import { decryptSecret, encryptSecret } from '@fairfold/contracts';
import { testDatabaseUrl } from '../../db/test/environment.js';
import { databaseCredentials } from '../src/index.js';

const integrationUrl = testDatabaseUrl();
describe.skipIf(!integrationUrl)('H2 merchant credential lookup', () => {
  let database: ReturnType<typeof createDatabase>;
  const merchantId = randomUUID();
  beforeAll(async () => {
    database = createDatabase(integrationUrl!);
    await migrateDatabase(database.db);
  });
  afterAll(async () => {
    if (database) {
      try {
        await database.db.delete(merchants).where(eq(merchants.id, merchantId));
      } finally {
        await database.close();
      }
    }
  });
  it('returns no credentials for an absent merchant', async () => {
    expect(await databaseCredentials(database.db).lookup(merchantId)).toBeNull();
  });
  it('reads only merchant-scoped encrypted credentials and observes updates', async () => {
    const key = randomBytes(32);
    const secret = 'synthetic-lookup-secret';
    const secretEncrypted = encryptSecret(secret, key);
    await database.db.insert(merchants).values({
      id: merchantId,
      slug: 'h2-test-' + merchantId,
      name: 'Synthetic test merchant',
      domain: 'synthetic.example',
      country: 'IN',
      paypal_client_id: 'synthetic-client',
      paypal_client_secret_enc: secretEncrypted,
      is_simulated: false,
    });
    const provider = databaseCredentials(database.db);
    const record = await provider.lookup(merchantId);
    expect(record).toEqual({ clientId: 'synthetic-client', secretEncrypted, simulated: false });
    expect(decryptSecret(record!.secretEncrypted!, key)).toBe(secret);
    expect(await provider.lookup(randomUUID())).toBeNull();
    await database.db
      .update(merchants)
      .set({ paypal_client_secret_enc: null, is_simulated: true })
      .where(eq(merchants.id, merchantId));
    expect(await provider.lookup(merchantId)).toEqual({
      clientId: 'synthetic-client',
      secretEncrypted: null,
      simulated: true,
    });
  });
});
