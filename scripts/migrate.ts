import { config } from 'dotenv';
import { createDatabase, migrateDatabase } from '../packages/db/src/index.js';

config({ path: new URL('../.env', import.meta.url), quiet: true });
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const database = createDatabase(process.env.DATABASE_URL);
try {
  await migrateDatabase(database.db);
  console.log('Fairfold database migrations applied.');
} finally {
  await database.close();
}
