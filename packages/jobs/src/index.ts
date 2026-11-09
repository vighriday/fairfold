import { PgBoss, type Db } from 'pg-boss';
import {
  JobNames,
  JobSchemas,
  systemClock,
  type Clock,
  type HandlerMap,
  type JobName,
  type JobPayload,
} from '@fairfold/contracts';

export type PublishOptions = { db?: Db };
export type Jobs = ReturnType<typeof createJobs>;

export function createJobs(
  connectionString: string,
  options: { schema?: string; clock?: Clock; onError?: (error: Error) => void } = {},
) {
  const boss = new PgBoss({
    connectionString,
    schema: options.schema ?? 'pgboss',
    application_name: 'fairfold-worker',
  });
  const clock = options.clock ?? systemClock;
  boss.on('error', (error: Error) => {
    if (options.onError) options.onError(error);
    else console.error(JSON.stringify({ level: 'error', component: 'jobs', code: error.name }));
  });
  return {
    boss,
    async start() {
      await boss.start();
      for (const name of JobNames) {
        await boss.createQueue(name, {
          policy: name === 'sharedcause.scan' ? 'short' : 'standard',
          retryLimit: 3,
          retryDelay: 5,
          retryBackoff: true,
        });
      }
    },
    async stop() {
      await boss.stop({ graceful: true, timeout: 10_000 });
    },
    async publish<N extends JobName>(
      name: N,
      payload: JobPayload<N>,
      publishOptions: PublishOptions = {},
    ) {
      const parsed = JobSchemas[name].parse(payload);
      return boss.send(name, parsed, { ...publishOptions });
    },
    async work<N extends JobName>(name: N, handler: (payload: JobPayload<N>) => Promise<void>) {
      return boss.work<unknown>(name, { batchSize: 1, pollingIntervalSeconds: 1 }, async (jobs) => {
        for (const job of jobs) await handler(JobSchemas[name].parse(job.data) as JobPayload<N>);
      });
    },
    async register(handlers: HandlerMap) {
      for (const name of JobNames) {
        const handler = handlers[name] as
          ((payload: JobPayload<typeof name>) => Promise<void>) | undefined;
        if (handler) await this.work(name, handler);
      }
    },
    async schedule<N extends JobName>(
      name: N,
      cron: string,
      payload: JobPayload<N>,
      timezone = 'UTC',
    ) {
      await boss.schedule(name, cron, JobSchemas[name].parse(payload), { tz: timezone });
    },
    async publishDebounced(name: 'sharedcause.scan', key: string, seconds: number) {
      if (!Number.isFinite(seconds) || seconds <= 0)
        throw new Error('Debounce seconds must be positive');
      const payload = JobSchemas[name].parse({ merchantId: key });
      return boss.upsert(name, payload, {
        singletonKey: key,
        startAfter: new Date(clock.now().getTime() + seconds * 1000),
      });
    },
  };
}
