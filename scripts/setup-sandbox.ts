import { config } from 'dotenv';
import { decodeEncryptionKey } from '../packages/contracts/src/index.js';
import { createDatabase } from '../packages/db/src/index.js';
import { provisionSandboxCheckout } from '../apps/api/src/checkout/setup-sandbox.js';
import { sandboxEnvironment, safeScriptError } from './support/sandbox-environment.js';

config({ path: new URL('../.env', import.meta.url), quiet: true });
try {
  const environment = sandboxEnvironment(process.env);
  if (!environment) {
    console.log(
      'SKIPPED: sandbox app credentials are absent; no database or PayPal operation ran.',
    );
  } else {
    const database = createDatabase(environment.databaseUrl);
    try {
      const result = await provisionSandboxCheckout({
        database: database.db,
        clientId: environment.clientId,
        clientSecret: environment.clientSecret,
        encryptionKey: decodeEncryptionKey(environment.encryptionKey),
      });
      console.log(JSON.stringify({ status: 'LOCAL_SETUP_READY', ...result }));
      console.log('No PayPal request, buyer mapping, B17 seed or acceptance check ran.');
    } finally {
      await database.close();
    }
  }
} catch (error) {
  console.error(safeScriptError(error));
  process.exitCode = 1;
}
