import { config } from 'dotenv';
import { createDatabase, migrateDatabase } from '../packages/db/src/index.js';

config({ path: new URL('../.env', import.meta.url), quiet: true });
const url = new URL(process.env.DATABASE_URL ?? '');
if (
  !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
  !/^\/fairfold(?:_[a-z0-9_]+)?$/.test(url.pathname) ||
  !process.argv.includes('--confirm')
) {
  throw new Error('Reset is restricted to a local fairfold database and requires --confirm');
}
const database = createDatabase(url.toString());
try {
  await database.pool.query(
    'drop schema if exists pgboss cascade; drop schema if exists drizzle cascade; drop schema public cascade; create schema public;',
  );
  await migrateDatabase(database.db);
  console.log('Local Fairfold database reset and migrated.');
} finally {
  await database.close();
}
