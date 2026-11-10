import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';

export * from './schema.js';
export { schema };
export type Database = ReturnType<typeof createDatabase>['db'];
export type DatabaseConnection = pg.PoolClient;

export function createDatabase(connectionString: string) {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5_000,
    options: '-c timezone=UTC',
  });
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}

export async function migrateDatabase(database: Database): Promise<void> {
  await migrate(database, {
    migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
  });
}
