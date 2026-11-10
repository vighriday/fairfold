import { createDatabase } from '@fairfold/db';
import { decodeEncryptionKey } from '@fairfold/contracts';
import { computeBuyerSignal } from '@fairfold/intelligence';
import { createJobs } from '@fairfold/jobs';
import {
  createPayPalClientFactory,
  createEventIngress,
  databaseCredentials,
  type OrderRecording,
} from '@fairfold/paypal';
import { createApi } from './app.js';
import { type Config } from './config.js';
import { createCheckoutService } from './checkout/service.js';
import { createOrderReads } from './orders/read.js';
import { createDisputeReads } from './disputes/read.js';
import { createDisputeApproval } from './disputes/approve.js';
import { createDemoDisputeAdjudication } from './disputes/demo-adjudicate.js';
import { createPackingService } from './packing/service.js';
import { createInspectionService } from './packing/inspection.js';
import { createSharedCauseActionApproval } from './shared-causes/approve-action.js';
import { createAlertReads } from './alerts/read.js';
import { createCoreRoutes } from './routes/core/index.js';
import { createWebhookRoutes } from './routes/core/webhooks.js';
import { createMcpService } from './mcp/service.js';
import { createMcpRoutes } from './mcp/routes.js';

/** The normal server and local recorded rehearsal use the same application composition. */
export async function createRuntime(config: Config, options: { recording?: OrderRecording } = {}) {
  const database = createDatabase(config.databaseUrl);
  const jobs = createJobs(config.databaseUrl);
  try {
    const forMerchant = createPayPalClientFactory({
      credentials: databaseCredentials(database.db),
      encryptionKey: decodeEncryptionKey(config.encryptionKey),
      apiBase: config.paypalApiBase,
      recording: options.recording,
      logger: { warn: (fields, message) => app.log.warn(fields, message) },
    });
    const checkout = createCheckoutService({ database, jobs, forMerchant });
    const reads = createOrderReads({ database: database.db, computeBuyerSignal });
    const disputeReads = createDisputeReads(database.db);
    const disputeApproval = createDisputeApproval({ database, jobs });
    const demoAdjudicate = createDemoDisputeAdjudication({ database: database.db, forMerchant });
    const packing = createPackingService({ database, jobs });
    const inspection = createInspectionService({ database, jobs });
    const actionApproval = createSharedCauseActionApproval({ database, jobs });
    const alertReads = createAlertReads(database.db);
    const mcpService = createMcpService(database);
    const app = await createApi({
      config,
      phase: 'H5',
      routes: async (routes) => {
        await routes.register(
          createCoreRoutes({
            checkout,
            reads,
            disputeReads,
            disputeApproval,
            demoAdjudicate,
            packing,
            inspection,
            actionApproval,
            alertReads,
            database: database.db,
            demoMode: config.demoMode,
          }),
        );
        await routes.register(
          createWebhookRoutes(createEventIngress({ database, jobs, forMerchant })),
        );
        await routes.register(createMcpRoutes(mcpService));
      },
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
