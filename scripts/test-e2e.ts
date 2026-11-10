import { config as loadEnv } from 'dotenv';
import { createDatabase, migrateDatabase } from '@fairfold/db';
import { createRuntime } from '../apps/api/src/runtime.js';
import { readConfig } from '../apps/api/src/config.js';

loadEnv({ path: new URL('../.env', import.meta.url), quiet: true });

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  console.log(
    'SKIPPED: TEST_DATABASE_URL is absent. Local runtime smoke requires an isolated loopback PostgreSQL database; A1-A14 remain NOT RUN.',
  );
  process.exitCode = 2;
} else {
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
    const mcpHeaders = {
      authorization: `Bearer ${loginBody.token}`,
      'content-type': 'application/json',
    };
    const initialize = await fetch(`${configuration.appBaseUrl}/mcp`, {
      method: 'POST',
      headers: mcpHeaders,
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'initialize' }),
    });
    if (!initialize.ok)
      throw new Error(`authenticated MCP initialize returned ${initialize.status}`);
    const initializeBody = (await initialize.json()) as {
      result?: { protocolVersion?: string; capabilities?: unknown };
    };
    if (initializeBody.result?.protocolVersion !== '2025-03-26')
      throw new Error('MCP initialize returned an unexpected protocol version');

    const toolsList = await fetch(`${configuration.appBaseUrl}/mcp`, {
      method: 'POST',
      headers: mcpHeaders,
      body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list' }),
    });
    if (!toolsList.ok) throw new Error(`authenticated MCP tools/list returned ${toolsList.status}`);
    const toolsBody = (await toolsList.json()) as {
      result?: { tools?: Array<{ name?: string }> };
    };
    const toolNames = new Set(toolsBody.result?.tools?.map((tool) => tool.name));
    for (const name of [
      'search_catalog',
      'get_store_report',
      'get_order_proof',
      'provide_dispute_evidence',
    ])
      if (!toolNames.has(name)) throw new Error(`MCP tools/list is missing ${name}`);

    console.log(
      JSON.stringify({
        status: 'LOCAL_RUNTIME_SMOKE_PASS',
        health: 'PASS',
        openapi: 'PASS',
        unauthenticatedMcp: 'PASS',
        demoLogin: 'PASS',
        authenticatedMcpInitialize: 'PASS',
        authenticatedMcpToolsList: 'PASS',
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
