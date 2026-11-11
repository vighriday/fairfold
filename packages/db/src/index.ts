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

/** Database writes and pg-boss publication must use this same checked-out connection. */
export async function withTransaction<T>(
  database: Pick<ReturnType<typeof createDatabase>, 'pool'>,
  work: (
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    queueDb: { executeSql: (query: string, values?: unknown[]) => Promise<pg.QueryResult> },
  ) => Promise<T>,
): Promise<T> {
  const client = await database.pool.connect();
  try {
    return await drizzle(client, { schema }).transaction((tx) =>
      work(tx, { executeSql: (query, values) => client.query(query, values) }),
    );
  } finally {
    client.release();
  }
}

export async function migrateDatabase(database: Database): Promise<void> {
  await migrate(database, {
    migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
  });
}
