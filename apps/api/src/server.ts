import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '@fairfold/db';
import { createApi } from './app.js';
import { readConfig } from './config.js';

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
const config = readConfig();
const database = createDatabase(config.databaseUrl);
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
  await app.close();
  await database.close();
}
process.once('SIGINT', () => {
  void shutdown();
});
process.once('SIGTERM', () => {
  void shutdown();
});
await app.listen({ port: config.port, host: process.env.RENDER ? '0.0.0.0' : '127.0.0.1' });
