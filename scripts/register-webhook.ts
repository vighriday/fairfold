import { config } from 'dotenv';
import { decodeEncryptionKey } from '../packages/contracts/src/index.js';
import { createDatabase } from '../packages/db/src/index.js';
import {
  createPayPalClientFactory,
  databaseCredentials,
  registerMerchantWebhook,
} from '../packages/paypal/src/index.js';
import { readConfig } from '../apps/api/src/config.js';
import { safeScriptError } from './support/sandbox-environment.js';

config({ path: new URL('../.env', import.meta.url), quiet: true });
try {
  const [merchantSlug, ...extra] = process.argv.slice(2);
  if (!merchantSlug || extra.length) throw new Error('Expected one merchant slug');
  const settings = readConfig(process.env);
  const database = createDatabase(settings.databaseUrl);
  try {
    const forMerchant = createPayPalClientFactory({
      credentials: databaseCredentials(database.db),
      encryptionKey: decodeEncryptionKey(settings.encryptionKey),
      apiBase: settings.paypalApiBase,
      logger: { warn: (fields) => console.error(JSON.stringify(fields)) },
    });
    console.log(
      JSON.stringify(
        await registerMerchantWebhook({
          database,
          forMerchant,
          appBaseUrl: settings.appBaseUrl,
          merchantSlug,
        }),
      ),
    );
  } finally {
    await database.close();
  }
} catch (error) {
  console.error(safeScriptError(error));
  console.error(
    'Registration did not complete. If a vendor request ran, reconcile the app webhook in PayPal Dashboard before retrying.',
  );
  process.exitCode = 1;
}
