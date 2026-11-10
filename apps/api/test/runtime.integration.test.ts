// The API's own runtime binds the intelligence package to the API's database and job queue (DECISIONS.md I-D37), so
// the intelligence routes open no second pool or queue.
import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { getIntelRuntime, setIntelRuntime } from '@fairfold/intelligence';
import { testDatabaseUrl } from '../../../packages/db/test/environment.js';
import { readConfig } from '../src/config.js';
import { createRuntime } from '../src/runtime.js';

const url = testDatabaseUrl();

describe.skipIf(!url)('API runtime composition', () => {
  const saved = process.env.DATABASE_URL;
  afterEach(() => {
    setIntelRuntime(null);
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
  });

  it("binds the intelligence runtime to the API's database instead of building one from the environment", async () => {
    // An unbound intelligence runtime is built from DATABASE_URL; without it, only a bound one resolves.
    delete process.env.DATABASE_URL;
    const runtime = await createRuntime(
      readConfig({
        DATABASE_URL: url!,
        APP_BASE_URL: 'http://localhost:3000',
        FRONTEND_ORIGIN: 'http://localhost:5173',
        APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
        DEMO_TOKEN_SECRET: 'unit-test-signing-key-that-is-not-a-real-secret',
      }),
    );
    try {
      const intel = getIntelRuntime();
      const [row] = (await intel.db.execute(sql`select 1 as one`)).rows;
      expect(row).toEqual({ one: 1 });
    } finally {
      await runtime.close();
    }
  });
});
