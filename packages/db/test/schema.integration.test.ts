import { testDatabaseUrl } from './environment.js';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { createDatabase, migrateDatabase, schema } from '../src/index.js';

const integrationUrl = testDatabaseUrl();

describe.skipIf(!integrationUrl)('PostgreSQL migration and Drizzle agreement', () => {
  let database: ReturnType<typeof createDatabase>;
  beforeAll(async () => {
    database = createDatabase(integrationUrl!);
    await migrateDatabase(database.db);
    await migrateDatabase(database.db);
  });
  afterAll(async () => {
    await database?.close();
  });
  it('runs on PostgreSQL 16 with UTC sessions and all 25 source tables', async () => {
    expect((await database.pool.query('show server_version')).rows[0].server_version).toMatch(
      /^16\./,
    );
    expect((await database.pool.query('show timezone')).rows[0].TimeZone).toBe('UTC');
    const tables = await database.pool.query(
      "select tablename from pg_tables where schemaname='public' order by tablename",
    );
    expect(tables.rows.map((row: { tablename: string }) => row.tablename)).toEqual(
      Object.keys(schema).sort(),
    );
    expect(tables.rows).toHaveLength(25);
  });
  it('matches every column type, nullability and default in the authoritative migration', async () => {
    let compared = 0;
    for (const table of Object.values(schema)) {
      const config = getTableConfig(table);
      const result = await database.pool.query<{
        name: string;
        type: string;
        not_null: boolean;
        has_default: boolean;
      }>(
        "select a.attname as name, format_type(a.atttypid,a.atttypmod) as type, a.attnotnull as not_null, a.atthasdef as has_default from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=$1 and a.attnum>0 and not a.attisdropped order by a.attnum",
        [config.name],
      );
      expect(
        result.rows.map((row) => row.name),
        config.name,
      ).toEqual(config.columns.map((column) => column.name));
      for (const column of config.columns) {
        const actual = result.rows.find((row) => row.name === column.name)!;
        const normalize = (type: string) =>
          type
            .replace('bigserial', 'bigint')
            .replace(/\s+\(/g, '(')
            .replace(/,\s*/g, ',')
            .replace(/\s+/g, ' ');
        expect(normalize(actual.type), config.name + '.' + column.name).toBe(
          normalize(column.getSQLType()),
        );
        expect(actual.not_null, config.name + '.' + column.name).toBe(column.notNull);
        expect(actual.has_default, config.name + '.' + column.name).toBe(column.hasDefault);
        compared++;
      }
    }
    expect(compared).toBe(253);
  });
  it('retains the source indexes and enum-like status checks', async () => {
    const indexes = await database.pool.query(
      "select indexname from pg_indexes where schemaname='public'",
    );
    expect(indexes.rows.map((row: { indexname: string }) => row.indexname)).toEqual(
      expect.arrayContaining(['orders_merchant_id_status_idx', 'order_items_batch_code_idx']),
    );
    const merchant = await database.pool.query(
      "insert into merchants(slug,name,domain,country) values(gen_random_uuid()::text,'H1 constraint test','constraint.example','IN') returning id",
    );
    await expect(
      database.pool.query(
        "insert into orders(merchant_id,paypal_order_id,invoice_id,status,amount_value,currency) values($1,gen_random_uuid()::text,gen_random_uuid()::text,'not_a_status',38,'USD')",
        [merchant.rows[0].id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
