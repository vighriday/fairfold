import { config as loadEnv } from 'dotenv';
import { createDatabase, migrateDatabase } from '@fairfold/db';
import { createRuntime } from '../apps/api/src/runtime.js';
import { readConfig } from '../apps/api/src/config.js';
import { connectMcpShopperTools } from '../packages/shopper/src/index.js';

loadEnv({ path: new URL('../.env', import.meta.url), quiet: true });

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  console.log(
    'SKIPPED: TEST_DATABASE_URL is absent. Local runtime smoke requires an isolated loopback PostgreSQL database; A1-A14 remain NOT RUN.',
  );
  process.exitCode = 2;
} else {
  const parsedDatabaseUrl = new URL(databaseUrl);
  if (
    !['127.0.0.1', 'localhost', '[::1]'].includes(parsedDatabaseUrl.hostname) ||
    !/^\/fairfold_[a-z0-9_]*test$/.test(parsedDatabaseUrl.pathname)
  ) {
    throw new Error(
      'TEST_DATABASE_URL must identify a loopback PostgreSQL database named fairfold_*test',
    );
  }
  const port = Number(process.env.E2E_PORT ?? 3116);
  const database = createDatabase(databaseUrl);
  const configuration = readConfig({
    ...process.env,
    DATABASE_URL: databaseUrl,
    APP_BASE_URL: `http://127.0.0.1:${port}`,
    FRONTEND_ORIGIN: `http://127.0.0.1:${port}`,
    APP_ENCRYPTION_KEY: process.env.APP_ENCRYPTION_KEY ?? Buffer.alloc(32, 8).toString('base64'),
    DEMO_TOKEN_SECRET:
      process.env.DEMO_TOKEN_SECRET ?? 'local-e2e-signing-secret-not-for-production',
    DEMO_MODE: 'true',
    PORT: String(port),
  });
  const runtime = await createRuntime(configuration);
  try {
    await migrateDatabase(database.db);
    await runtime.start('127.0.0.1');
    const health = await fetch(`${configuration.appBaseUrl}/healthz`);
    if (!health.ok) throw new Error(`healthz returned ${health.status}`);
    const healthBody = (await health.json()) as Record<string, unknown>;
    if (healthBody.status !== 'ok' || healthBody.database !== 'ready')
      throw new Error('healthz did not report ready API/database state');

    const docs = await fetch(`${configuration.appBaseUrl}/docs/json`);
    if (!docs.ok) throw new Error(`docs/json returned ${docs.status}`);
    const docsBody = (await docs.json()) as { paths?: Record<string, unknown> };
    for (const path of ['/healthz', '/mcp', '/api/auth/demo-login'])
      if (!docsBody.paths || !(path in docsBody.paths))
        throw new Error(`OpenAPI is missing ${path}`);

    const unauthenticatedMcp = await fetch(`${configuration.appBaseUrl}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
    });
    if (unauthenticatedMcp.status !== 401)
      throw new Error(`unauthenticated MCP returned ${unauthenticatedMcp.status}`);

    const login = await fetch(`${configuration.appBaseUrl}/api/auth/demo-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        role: 'agent',
        subjectId: '00000000-0000-4000-8000-000000000004',
      }),
    });
    if (!login.ok) throw new Error(`demo login returned ${login.status}`);
    const loginBody = (await login.json()) as { token?: string };
    if (!loginBody.token) throw new Error('demo login did not return a token');
    const mcp = await connectMcpShopperTools(configuration.appBaseUrl + '/mcp', loginBody.token);
    try {
      const list = await mcp.client.listTools();
      const names = list.tools.map((tool) => tool.name);
      for (const name of ['search_catalog', 'get_store_report', 'get_order_proof'])
        if (!names.includes(name)) throw new Error('MCP required tool is missing');
      if (names.includes('provide_dispute_evidence'))
        throw new Error('Merchant evidence tool was exposed to an agent');
      const search = await mcp.tools('search_catalog', { query: 'navy hoodie', maxPrice: '45.00' });
      if (!Array.isArray(search)) throw new Error('MCP search result is not an array');
    } finally {
      await mcp.close();
    }

    console.log(
      JSON.stringify({
        status: 'LOCAL_RUNTIME_SMOKE_PASS',
        health: 'PASS',
        openapi: 'PASS',
        unauthenticatedMcp: 'PASS',
        demoLogin: 'PASS',
        authenticatedMcpInitialize: 'PASS',
        authenticatedMcpToolsList: 'PASS',
        authenticatedMcpToolsCall: 'PASS',
        paypalRequests: 0,
        acceptance: 'A1-A14 NOT RUN',
      }),
    );
  } catch (error) {
    console.error(error instanceof Error ? `LOCAL_RUNTIME_SMOKE_FAIL: ${error.message}` : error);
    process.exitCode = 1;
  } finally {
    await runtime.close();
    await database.close();
  }
}
