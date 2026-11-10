import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import { createWorkerRuntime, readWorkerConfig } from './runtime.js';

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
const log = pino({ redact: ['token', 'secret', 'password'] });
try {
  const runtime = createWorkerRuntime(readWorkerConfig(), { log });
  const shutdown = () => {
    void runtime.close().catch(() => {
      log.error({ code: 'WORKER_CLOSE_FAILED' }, 'Worker shutdown failed');
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  await runtime.start();
} catch {
  log.error({ code: 'WORKER_START_FAILED' }, 'Worker did not start');
  process.exitCode = 1;
}
