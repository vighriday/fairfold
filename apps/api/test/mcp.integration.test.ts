import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createDatabase,
  merchants,
  migrateDatabase,
  orders,
  products,
  store_reports,
} from '@fairfold/db';
import { fixedClock } from '@fairfold/contracts';
import { beginShopperRun, createMcpShopperTools } from '@fairfold/shopper';
import { testDatabaseUrl } from '../../../packages/db/test/environment.js';
import { createApi } from '../src/app.js';
import { createAuth } from '../src/auth.js';
import { readConfig } from '../src/config.js';
import { createMcpRoutes } from '../src/mcp/routes.js';
import { createMcpService } from '../src/mcp/service.js';

const databaseUrl = testDatabaseUrl();
const clock = fixedClock('2026-11-10T12:00:00.000Z');
const signingSecret = 'synthetic-mcp-route-test-key-not-a-real-secret';

describe.skipIf(!databaseUrl)('authenticated MCP HTTP contract', () => {
  const database = createDatabase(databaseUrl!);
  const apps: Array<Awaited<ReturnType<typeof createApi>>> = [];
  let merchantId: string;
  let productName: string;
  let orderId: string;
  let merchantToken: string;
  let agentToken: string;

  beforeAll(async () => {
    await migrateDatabase(database.db);
    merchantId = randomUUID();
    productName = 'MCP route navy hoodie ' + merchantId;
    await database.db.insert(merchants).values({
      id: merchantId,
      slug: 'mcp-route-' + merchantId,
      name: 'MCP route merchant',
      domain: 'mcp-route.example.invalid',
      country: 'US',
      is_simulated: true,
    });
    await database.db.insert(products).values({
      merchant_id: merchantId,
      sku: 'MCP-NAVY-HOODIE',
      name: productName,
      description: 'Synthetic MCP route listing',
      unit_value: '40.00',
      currency: 'USD',
      listing_version: 'mcp-test-v1',
    });
    await database.db.insert(store_reports).values({
      merchant_id: merchantId,
      report: {
        merchantId,
        band: 'verified',
        facts: {
          domain: 'mcp-route.example.invalid',
          domainRegisteredAt: null,
          policies: [],
        },
        fulfilment: {
          ordersSealed90d: 2,
          medianHoursCaptureToSeal: 4,
          pctTrackingWithin72h: 1,
          pctWithPackingEvidence: 1,
          disputeRate90d: 0,
          proactiveFixes90d: 1,
          unansweredNotReceived: 0,
        },
        reviews: { count: 0, average: null, themes: [] },
        sources: [],
        computedAt: '2026-11-10T12:00:00.000Z',
      },
    });
    orderId = randomUUID();
    await database.db.insert(orders).values({
      id: orderId,
      merchant_id: merchantId,
      paypal_order_id: 'MCP-ORDER-' + orderId,
      invoice_id: 'MCP-INVOICE-' + orderId,
      status: 'captured',
      amount_value: '40.00',
      currency: 'USD',
    });
    const config = readConfig({
      DATABASE_URL: databaseUrl!,
      APP_BASE_URL: 'http://localhost:3115',
      FRONTEND_ORIGIN: 'http://localhost:3115',
      APP_ENCRYPTION_KEY: Buffer.alloc(32, 6).toString('base64'),
      DEMO_TOKEN_SECRET: signingSecret,
      DEMO_MODE: 'true',
    });
    const app = await createApi({
      config,
      phase: 'H7',
      clock,
      logger: false,
      checkDatabase: async () => {
        await database.pool.query('select 1');
      },
      routes: async (routes) => {
        await routes.register(createMcpRoutes(createMcpService(database)));
      },
    });
    apps.push(app);
    const auth = createAuth(signingSecret, clock);
    merchantToken = await auth.issue({ role: 'merchant', subjectId: merchantId });
    agentToken = await auth.issue({ role: 'agent', subjectId: randomUUID() });
  });

  afterAll(async () => {
    await Promise.all(apps.map((app) => app.close()));
    await database.close();
  });

  function call(method: string, token: string, params?: Record<string, unknown>) {
    return apps[0]!.inject({
      method: 'POST',
      url: '/mcp',
      headers: { authorization: `Bearer ${token}`, accept: 'application/json, text/event-stream' },
      payload: { jsonrpc: '2.0', id: 'mcp-test', method, ...(params ? { params } : {}) },
    });
  }

  it('requires authentication and exposes the MCP tool contract', async () => {
    expect(
      (
        await apps[0]!.inject({
          method: 'POST',
          url: '/mcp',
          payload: { jsonrpc: '2.0', id: 1, method: 'initialize' },
        })
      ).statusCode,
    ).toBe(401);
    const response = await call('tools/list', agentToken);
    expect(response.statusCode).toBe(200);
    expect(response.json().result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'search_catalog',
      'get_store_report',
      'get_order_proof',
    ]);
  });

  it('runs catalog search through the authenticated route without PayPal access', async () => {
    const response = await call('tools/call', agentToken, {
      name: 'search_catalog',
      arguments: { query: productName, maxPrice: '41.00' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().result.content[0].text).toContain(merchantId);
    expect(response.json().result.content[0].text).toContain('MCP-NAVY-HOODIE');
  });

  it('runs the shopper policy through the real MCP route boundary', async () => {
    const tools = createMcpShopperTools({
      endpoint: 'http://mcp.test/mcp',
      bearerToken: agentToken,
      fetchImpl: async (_input, init) => {
        const request = JSON.parse(init?.body ?? '{}') as {
          method: string;
          params: Record<string, unknown>;
        };
        const response = await apps[0]!.inject({
          method: 'POST',
          url: '/mcp',
          headers: {
            authorization: init?.headers?.authorization ?? '',
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
          },
          payload: {
            jsonrpc: '2.0',
            id: 'shopper-http-test',
            method: request.method,
            params: request.params,
          },
        });
        return {
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          json: async () => response.json(),
        };
      },
    });
    const createOrder = vi.fn(async () => ({
      orderId: 'shopper-order-1',
      approvalUrl: 'https://paypal.test/approve',
    }));
    const run = await beginShopperRun(
      tools,
      { createOrder, capture: vi.fn() },
      { query: productName, maxPrice: '41.00' },
    );
    expect(run.status).toBe('awaiting_paypal_approval');
    expect(createOrder).toHaveBeenCalledWith({
      merchantId,
      sku: 'MCP-NAVY-HOODIE',
      quantity: 1,
      context: { sandbox: true },
    });
  });

  it('keeps private proof unavailable to agents at the HTTP boundary', async () => {
    const response = await call('tools/call', agentToken, {
      name: 'get_order_proof',
      arguments: { orderId },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().result.isError).toBe(true);
    expect(JSON.parse(response.json().result.content[0].text).error.code).toBe('FORBIDDEN');
    expect(merchantToken).toContain('.');
  });

  it('rejects unsupported MCP methods and tools explicitly', async () => {
    const method = await call('prompts/get', agentToken);
    expect(method.statusCode).toBe(200);
    expect(method.json().error.code).toBe(-32601);

    const tool = await call('tools/call', agentToken, {
      name: 'delete_everything',
      arguments: {},
    });
    expect(tool.statusCode).toBe(200);
    expect(tool.json().result.isError).toBe(true);
  });
});
