import { decodeEncryptionKey } from '../packages/contracts/src/index.js';
import { createDatabase } from '../packages/db/src/index.js';
import { provisionSandboxCheckout } from '../apps/api/src/checkout/setup-sandbox.js';
import { inspectSandboxCheckout } from '../apps/api/src/checkout/verify-sandbox.js';
import { renderSandboxEnvironment } from './support/render-sandbox-environment.js';
import { safeScriptError } from './support/sandbox-environment.js';

// Deliberately no dotenv import: only the reviewed Render process supplies credentials.
try {
  const environment = renderSandboxEnvironment(process.env, process.argv.slice(2));
  const database = createDatabase(environment.databaseUrl);
  try {
    const options = {
      database: database.db,
      clientId: environment.clientId,
      clientSecret: environment.clientSecret,
      encryptionKey: decodeEncryptionKey(environment.encryptionKey),
    };
    const result = environment.mode === 'apply' ? await provisionSandboxCheckout(options) : null;
    const readiness = await inspectSandboxCheckout(options);
    const ready = Object.values(readiness.checks).every(Boolean);
    console.log(
      JSON.stringify({
        status: ready ? 'RENDER_SETUP_READY' : 'RENDER_SETUP_PENDING',
        mode: environment.mode,
        ...(result ?? {}),
        checks: readiness.checks,
        paypalRequests: 0,
        buyerIdentityMapped: false,
      }),
    );
    if (!ready) process.exitCode = 2;
  } finally {
    await database.close();
  }
} catch (error) {
  console.error(safeScriptError(error));
  process.exitCode = 1;
}
