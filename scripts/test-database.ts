import { config } from 'dotenv';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

config({ path: new URL('../.env', import.meta.url), quiet: true });
if (!process.env.TEST_DATABASE_URL)
  throw new Error('TEST_DATABASE_URL must identify an isolated local test database');
const url = new URL(process.env.TEST_DATABASE_URL);
if (
  !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
  !/^\/fairfold_[a-z0-9_]*test$/.test(url.pathname)
) {
  throw new Error('Integration tests require a loopback fairfold_*test database');
}
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)),
    'run',
    'schema.integration.test.ts',
    'storage.integration.test.ts',
    'retention.integration.test.ts',
    'jobs.integration.test.ts',
    'credentials.integration.test.ts',
    'registration.integration.test.ts',
    'dispute-execution.integration.test.ts',
    'webhooks.integration.test.ts',
    'event-handler.integration.test.ts',
    'poll-schedules.integration.test.ts',
    'runtime.integration.test.ts',
    'event-acceptance.integration.test.ts',
    'capture-store.integration.test.ts',
    'create-order.integration.test.ts',
    'order-reads.integration.test.ts',
    'checkout-service.integration.test.ts',
    'core-routes.integration.test.ts',
    'packing.integration.test.ts',
    'sandbox-setup.integration.test.ts',
    'sandbox-verify.integration.test.ts',
  ],
  { stdio: 'inherit', env: { ...process.env, FAIRFOLD_RUN_DB_TESTS: 'true' } },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
