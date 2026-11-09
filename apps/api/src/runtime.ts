import { createDatabase } from '@fairfold/db';
import { decodeEncryptionKey } from '@fairfold/contracts';
import { computeBuyerSignal } from '@fairfold/intelligence';
import { createJobs } from '@fairfold/jobs';
import {
  createCheckoutClientFactory,
  databaseCredentials,
  type OrderRecording,
} from '@fairfold/paypal';
import { createApi } from './app.js';
import { type Config } from './config.js';
import { createCheckoutService } from './checkout/service.js';
import { createOrderReads } from './orders/read.js';
import { createCoreRoutes } from './routes/core/index.js';

/** The normal server and local recorded rehearsal use the same application composition. */
export async function createRuntime(config: Config, options: { recording?: OrderRecording } = {}) {
  const database = createDatabase(config.databaseUrl);
  const jobs = createJobs(config.databaseUrl);
  try {
    const forMerchant = createCheckoutClientFactory({
      credentials: databaseCredentials(database.db),
      encryptionKey: decodeEncryptionKey(config.encryptionKey),
      apiBase: config.paypalApiBase,
      recording: options.recording,
      logger: { warn: (fields, message) => app.log.warn(fields, message) },
    });
    const checkout = createCheckoutService({ database, jobs, forMerchant });
    const reads = createOrderReads({ database: database.db, computeBuyerSignal });
    const app = await createApi({
      config,
      phase: 'H2',
      routes: createCoreRoutes({ checkout, reads, demoMode: config.demoMode }),
      checkDatabase: async () => {
        await database.pool.query('select 1');
      },
    });
    let closing: Promise<void> | undefined;
    return {
      app,
      async start(host: '127.0.0.1' | '0.0.0.0') {
        await jobs.start();
        return app.listen({ port: config.port, host });
      },
      close() {
        closing ??= (async () => {
          try {
            await app.close();
          } finally {
            try {
              await jobs.stop();
            } finally {
              await database.close();
            }
          }
        })();
        return closing;
      },
    };
  } catch (error) {
    try {
      await jobs.stop();
    } finally {
      await database.close();
    }
    throw error;
  }
}
