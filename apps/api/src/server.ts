import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '@fairfold/db';
import { bindIntelRuntime } from '@fairfold/intelligence';
import { createJobs } from '@fairfold/jobs';
import { createApi } from './app.js';
import { readConfig } from './config.js';

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
const config = readConfig();
const database = createDatabase(config.databaseUrl);
const jobs = createJobs(config.databaseUrl);
await jobs.start();
// The intelligence routes use this server's database and queue instead of opening their own.
bindIntelRuntime({ db: database.db, jobs });
const app = await createApi({
  config,
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
await app.listen({ port: config.port, host: process.env.RENDER ? '0.0.0.0' : '127.0.0.1' });
