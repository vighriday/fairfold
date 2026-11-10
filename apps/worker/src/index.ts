import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import { createDatabase } from '@fairfold/db';
import { createJobs } from '@fairfold/jobs';
import { bindIntelRuntime } from '@fairfold/intelligence';
import { handlers } from '@fairfold/intelligence/handlers';

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
if (
  process.env.PAYPAL_API_BASE &&
  process.env.PAYPAL_API_BASE !== 'https://api-m.sandbox.paypal.com'
)
  throw new Error('Only PayPal sandbox is permitted');
const log = pino({ redact: ['token', 'secret', 'password'] });
const database = createDatabase(process.env.DATABASE_URL);
const jobs = createJobs(process.env.DATABASE_URL, {
  onError: (error) => log.error({ code: error.name }, 'Queue error'),
});
// The intelligence handlers use this worker's database and queue instead of opening their own.
bindIntelRuntime({ db: database.db, jobs });
await jobs.start();
await jobs.register(handlers);
log.info(
  { phase: 'H1', handlerCount: Object.keys(handlers).length, intelligence: 'ready' },
  'Worker ready',
);
let stopping = false;
async function shutdown() {
  if (!stopping) {
    stopping = true;
    try {
      await jobs.stop();
    } finally {
      await database.close();
    }
  }
}
process.once('SIGINT', () => {
  void shutdown();
});
process.once('SIGTERM', () => {
  void shutdown();
});
