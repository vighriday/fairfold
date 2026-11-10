import { AppError, decodeEncryptionKey, type Clock, type HandlerMap } from '@fairfold/contracts';
import { createDatabase } from '@fairfold/db';
import { createJobs } from '@fairfold/jobs';
import { handlers as intelligenceHandlers } from '@fairfold/intelligence/handlers';
import {
  createPayPalClientFactory,
  createDisputeSynchronizer,
  databaseCredentials,
  createPayPalEventHandler,
  createDisputesPoller,
  createEvidenceSubmitHandler,
  syncDisputePollSchedules,
  type DisputeSynchronizer,
} from '@fairfold/paypal';

export function readWorkerConfig(environment: NodeJS.ProcessEnv = process.env) {
  try {
    const databaseUrl = environment.DATABASE_URL!;
    if (!['postgres:', 'postgresql:'].includes(new URL(databaseUrl).protocol)) throw new Error();
    const encryptionKey = environment.APP_ENCRYPTION_KEY!;
    decodeEncryptionKey(encryptionKey);
    const paypalApiBase = environment.PAYPAL_API_BASE ?? 'https://api-m.sandbox.paypal.com';
    if (paypalApiBase !== 'https://api-m.sandbox.paypal.com') throw new Error();
    return { databaseUrl, encryptionKey, paypalApiBase };
  } catch {
    throw new AppError(
      'WORKER_CONFIG_INVALID',
      'Worker sandbox/database/key configuration is invalid',
    );
  }
}
type WorkerLog = {
  info(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
};

export function createWorkerRuntime(
  config: ReturnType<typeof readWorkerConfig>,
  options: {
    log: WorkerLog;
    clock?: Clock;
    syncDispute?: DisputeSynchronizer;
    queueSchema?: string;
  },
) {
  const encryptionKey = decodeEncryptionKey(config.encryptionKey);
  const database = createDatabase(config.databaseUrl);
  const jobs = createJobs(config.databaseUrl, {
    schema: options.queueSchema,
    clock: options.clock,
    onError: () => options.log.error({ code: 'QUEUE_ERROR' }, 'Queue error'),
  });
  const forMerchant = createPayPalClientFactory({
    credentials: databaseCredentials(database.db),
    encryptionKey,
    apiBase: config.paypalApiBase,
    clock: options.clock,
    logger: { warn: (fields, message) => options.log.error({ ...fields }, message) },
  });
  const syncDispute =
    options.syncDispute ??
    createDisputeSynchronizer({
      database,
      jobs,
      forMerchant,
      clock: options.clock,
    });
  const event = createPayPalEventHandler({
    database,
    jobs,
    forMerchant,
    clock: options.clock,
    syncDispute,
  });
  const poll = createDisputesPoller({
    forMerchant,
    clock: options.clock,
    syncDispute,
    isRealMerchant: async (id) =>
      !!(await database.db.query.merchants.findFirst({
        columns: { id: true },
        where: (merchant, { and, eq }) =>
          and(eq(merchant.id, id), eq(merchant.is_simulated, false)),
      })),
  });
  let refresh: Promise<{ scheduledMerchants: number }> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let starting: Promise<void> | undefined;
  let closing: Promise<void> | undefined;
  let stopping: Promise<void> | undefined;
  const refreshSchedules = () =>
    (refresh ??= syncDisputePollSchedules({ database: database.db, jobs }).finally(() => {
      refresh = undefined;
    }));
  const stopResources = () =>
    (stopping ??= (async () => {
      if (timer) clearInterval(timer);
      try {
        await refresh;
      } catch {
        /* Failure already has a fixed runtime diagnostic. */
      }
      try {
        await jobs.stop();
      } finally {
        await database.close();
      }
    })());
  const close = () =>
    (closing ??= (async () => {
      await starting?.catch(() => {});
      await stopResources();
    })());
  return {
    jobs,
    refreshSchedules,
    close,
    start() {
      if (closing)
        return Promise.reject(new AppError('WORKER_CLOSED', 'Worker has already closed'));
      return (starting ??= (async () => {
        try {
          if (closing) throw new AppError('WORKER_CLOSED', 'Worker has already closed');
          for (const name of ['paypal.event', 'disputes.poll'] as const)
            if (intelligenceHandlers[name])
              throw new AppError('WORKER_HANDLER_CONFLICT', 'A job handler has conflicting owners');
          const handlers: HandlerMap = {
            ...intelligenceHandlers,
            'paypal.event': event,
            'disputes.poll': poll,
            'evidence.submit': createEvidenceSubmitHandler({
              database,
              jobs,
              forMerchant,
              clock: options.clock,
            }),
          };
          await jobs.start();
          if (closing) throw new AppError('WORKER_CLOSED', 'Worker closed during startup');
          await jobs.register(handlers);
          const schedules = await refreshSchedules();
          timer = setInterval(() => {
            void refreshSchedules().catch(() =>
              options.log.error(
                { code: 'POLL_SCHEDULE_REFRESH_FAILED' },
                'Poll schedules could not refresh',
              ),
            );
          }, 60_000);
          timer.unref();
          options.log.info(
            {
              phase: 'H3',
              handlerCount: Object.keys(handlers).length,
              intelligence: 'stub',
              disputeSync: 'configured',
              ...schedules,
            },
            'Worker ready',
          );
        } catch {
          await stopResources();
          throw new AppError('WORKER_START_FAILED', 'Worker did not start', 503);
        }
      })());
    },
  };
}
