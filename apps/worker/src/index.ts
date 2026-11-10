import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import { createJobs } from '@fairfold/jobs';
import { handlers } from '@fairfold/intelligence/handlers';

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
if (
  process.env.PAYPAL_API_BASE &&
  process.env.PAYPAL_API_BASE !== 'https://api-m.sandbox.paypal.com'
)
  throw new Error('Only PayPal sandbox is permitted');
const log = pino({ redact: ['token', 'secret', 'password'] });
const jobs = createJobs(process.env.DATABASE_URL, {
  onError: (error) => log.error({ code: error.name }, 'Queue error'),
});
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
    await jobs.stop();
  }
}
process.once('SIGINT', () => {
  void shutdown();
});
process.once('SIGTERM', () => {
  void shutdown();
});
