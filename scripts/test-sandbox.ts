import { config } from 'dotenv';
import { decodeEncryptionKey } from '../packages/contracts/src/index.js';
import { createDatabase } from '../packages/db/src/index.js';
import { readConfig } from '../apps/api/src/config.js';
import { createRuntime } from '../apps/api/src/runtime.js';
import {
  inspectSandboxCheckout,
  verifySandboxCapture,
} from '../apps/api/src/checkout/verify-sandbox.js';
import { sandboxEnvironment, safeScriptError } from './support/sandbox-environment.js';
import { createFileRecording, readSandboxRecords } from './support/sandbox-recordings.js';

config({ path: new URL('../.env', import.meta.url), quiet: true });
try {
  const [command = 'check', orderId, ...extra] = process.argv
    .slice(2)
    .filter((argument) => argument !== '--');
  if (
    !['check', 'serve', 'verify'].includes(command) ||
    extra.length ||
    (command === 'verify' ? !orderId : !!orderId)
  )
    throw new Error('Invalid command');
  const environment = sandboxEnvironment(process.env);
  if (!environment) {
    console.log(
      'SKIPPED: PayPal sandbox credentials are absent. No PayPal acceptance check has passed.',
    );
    if (command !== 'check') process.exitCode = 2;
  } else {
    const database = createDatabase(environment.databaseUrl);
    let ready = false;
    try {
      if (command === 'verify') {
        const result = await verifySandboxCapture({
          database: database.db,
          orderId: orderId!,
          records: readSandboxRecords(),
        });
        console.log(JSON.stringify(result, null, 2));
        console.log(
          'Run pnpm exec vitest run recorded-sandbox.test.ts. Maya/SDK observation is a separate human evidence step.',
        );
        if (result.a4Database !== 'PASS' || result.recordedCreateAndCapture !== 'PASS')
          process.exitCode = 1;
      } else {
        const result = await inspectSandboxCheckout({
          database: database.db,
          ...environment,
          encryptionKey: decodeEncryptionKey(environment.encryptionKey),
        });
        console.log(JSON.stringify(result, null, 2));
        ready = result.status === 'LOCAL_SETUP_READY';
        if (!ready) process.exitCode = 1;
      }
    } finally {
      await database.close();
    }
    if (command === 'check')
      console.log('A4 NOT RUN by this read-only preflight. Next: pnpm test:sandbox serve.');
    if (command === 'serve' && ready) {
      const port = process.env.PORT ?? '3000';
      const origin = `http://localhost:${port}`;
      const configuration = readConfig({
        ...process.env,
        APP_BASE_URL: origin,
        FRONTEND_ORIGIN: origin,
      });
      const runtime = await createRuntime(configuration, { recording: createFileRecording() });
      process.once('SIGINT', () => {
        void runtime.close();
      });
      process.once('SIGTERM', () => {
        void runtime.close();
      });
      try {
        await runtime.start('127.0.0.1');
        console.log(`REHEARSAL_READY: ${origin}/dev`);
        console.log(
          'Approve one hoodie only in Maya’s PayPal sandbox window. No payment runs automatically. Sanitized recordings stay in ignored .work/h2-sandbox.',
        );
      } catch (error) {
        await runtime.close();
        throw error;
      }
    }
  }
} catch (error) {
  console.error(safeScriptError(error));
  console.error('See docs/hriday/sandbox-rehearsal.md for setup, commands and recovery.');
  process.exitCode = 1;
}
