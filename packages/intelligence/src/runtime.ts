// The platform pieces every intelligence service uses: Hriday's database, job queue and clock, plus
// optional model overrides. The worker and the API import ready-made handlers and routes, so the
// default runtime is built lazily from the environment on first use (after dotenv has loaded).
import type { EmbeddingModel, LanguageModel } from '@fairfold/ai';
import { systemClock, type Clock, type JobName, type JobPayload } from '@fairfold/contracts';
import { createDatabase, type Database } from '@fairfold/db';
import { createJobs } from '@fairfold/jobs';

export type Env = Record<string, string | undefined>;

export interface Publisher {
  publish<N extends JobName>(name: N, payload: JobPayload<N>): Promise<unknown>;
  publishDebounced(name: 'sharedcause.scan', key: string, seconds: number): Promise<unknown>;
}

export interface IntelRuntime {
  db: Database;
  clock: Clock;
  jobs: Publisher;
  env: Env;
  /** Injected in tests and evals; when absent, packages/ai builds models from the environment. */
  models: { vision?: LanguageModel; text?: LanguageModel; embedding?: EmbeddingModel };
  fetch: typeof fetch;
}

export function createIntelRuntime(parts: {
  db: Database;
  jobs: Publisher;
  clock?: Clock;
  env?: Env;
  models?: IntelRuntime['models'];
  fetch?: typeof fetch;
}): IntelRuntime {
  return {
    db: parts.db,
    jobs: parts.jobs,
    clock: parts.clock ?? systemClock,
    env: parts.env ?? process.env,
    models: parts.models ?? {},
    fetch: parts.fetch ?? globalThis.fetch,
  };
}

/** A publisher that starts pg-boss on the first publish, so importing intelligence never opens a queue. */
export function lazyPublisher(connectionString: string): Publisher {
  let started: Promise<ReturnType<typeof createJobs>> | null = null;
  const jobs = () => {
    started ??= (async () => {
      const j = createJobs(connectionString);
      await j.start();
      return j;
    })();
    return started;
  };
  return {
    async publish(name, payload) {
      return (await jobs()).publish(name, payload);
    },
    async publishDebounced(name, key, seconds) {
      return (await jobs()).publishDebounced(name, key, seconds);
    },
  };
}

let active: IntelRuntime | null = null;

/** Replace the process-wide runtime (tests and evals). Pass null to fall back to the environment. */
export function setIntelRuntime(runtime: IntelRuntime | null): void {
  active = runtime;
}

export function getIntelRuntime(): IntelRuntime {
  if (active) return active;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required for the intelligence services');
  active = createIntelRuntime({ db: createDatabase(url).db, jobs: lazyPublisher(url) });
  return active;
}
