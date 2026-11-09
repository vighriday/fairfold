// Runs the intelligence integration tests against the isolated local test database named in the root .env.
import { config } from 'dotenv';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

config({ path: new URL('../../../.env', import.meta.url), quiet: true });
if (!process.env.TEST_DATABASE_URL)
  throw new Error('TEST_DATABASE_URL must identify an isolated local test database');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL('../../../node_modules/vitest/vitest.mjs', import.meta.url)),
    'run',
    'packages/intelligence',
  ],
  { stdio: 'inherit', cwd: root, env: { ...process.env, FAIRFOLD_RUN_DB_TESTS: 'true' } },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
