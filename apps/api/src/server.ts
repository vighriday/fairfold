import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '@fairfold/db';
import { decodeEncryptionKey } from '@fairfold/contracts';
import { computeBuyerSignal } from '@fairfold/intelligence';
import { createJobs } from '@fairfold/jobs';
import { createCheckoutClientFactory, databaseCredentials } from '@fairfold/paypal';
import { createApi } from './app.js';
import { readConfig } from './config.js';
import { createCheckoutService } from './checkout/service.js';
import { createOrderReads } from './orders/read.js';
import { createCoreRoutes } from './routes/core/index.js';

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
const config = readConfig();
const database = createDatabase(config.databaseUrl);
const jobs = createJobs(config.databaseUrl);
const forMerchant = createCheckoutClientFactory({
  credentials: databaseCredentials(database.db),
  encryptionKey: decodeEncryptionKey(config.encryptionKey),
  apiBase: config.paypalApiBase,
  logger: { warn: (fields, message) => app.log.warn(fields, message) },
});
const checkout = createCheckoutService({ database, jobs, forMerchant });
const reads = createOrderReads({ database: database.db, computeBuyerSignal });
const app = await createApi({
  config,
  phase: 'H2',
  routes: createCoreRoutes({ checkout, reads }),
  checkDatabase: async () => {
    await database.pool.query('select 1');
  },
});
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  try {
    await app.close();
  } finally {
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
try {
  await jobs.start();
  await app.listen({ port: config.port, host: process.env.RENDER ? '0.0.0.0' : '127.0.0.1' });
} catch (error) {
  app.log.error({ errorType: error instanceof Error ? error.name : 'Error' }, 'API startup failed');
  await shutdown();
  process.exitCode = 1;
}
