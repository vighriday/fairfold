import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { computeBuyerSignal } from '@fairfold/contracts/stubs';
import { buyers, createDatabase, merchants, migrateDatabase } from '@fairfold/db';
import { createJobs, type Jobs } from '@fairfold/jobs';
import { testDatabaseUrl } from '../../../packages/db/test/environment.js';
import { createApi } from '../src/app.js';
import { createAuth } from '../src/auth.js';
import { readConfig } from '../src/config.js';
import { createOrderReads } from '../src/orders/read.js';
import { createCoreRoutes } from '../src/routes/core/index.js';
import { checkoutFixture, checkoutClock } from './checkout-fixture.js';

const integrationUrl = testDatabaseUrl();
const signingSecret = 'synthetic-core-route-test-key-not-a-real-secret';
describe.skipIf(!integrationUrl)('H2 HTTP contracts with real database/client/queue', () => {
  let database: ReturnType<typeof createDatabase>;
  let jobs: Jobs;
  const apps: Array<Awaited<ReturnType<typeof createApi>>> = [];
  beforeAll(async () => {
    database = createDatabase(integrationUrl!);
    await migrateDatabase(database.db);
    jobs = createJobs(integrationUrl!, { schema: 'h2_routes_' + randomUUID().replaceAll('-', '') });
    await jobs.start();
  });
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });
  afterAll(async () => {
    await jobs?.stop();
    await database?.close();
  });
  async function fixture() {
    const f = await checkoutFixture(database, jobs);
    const buyerId = randomUUID();
    await database.db
      .insert(buyers)
      .values({ id: buyerId, paypal_payer_id: f.payerId, display_name: 'Synthetic route buyer' });
    const config = readConfig({
      DATABASE_URL: integrationUrl!,
      APP_BASE_URL: 'http://localhost:3112',
      FRONTEND_ORIGIN: 'http://localhost:3112',
      APP_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString('base64'),
      DEMO_TOKEN_SECRET: signingSecret,
      DEMO_MODE: 'true',
    });
    const app = await createApi({
      config,
      phase: 'H2',
      checkDatabase: async () => {
        await database.pool.query('select 1');
      },
      clock: checkoutClock,
      logger: false,
      routes: createCoreRoutes({
        checkout: f.service,
        reads: createOrderReads({ database: database.db, computeBuyerSignal }),
      }),
    });
    apps.push(app);
    const auth = createAuth(signingSecret, checkoutClock);
    async function headers(
      role: 'merchant' | 'buyer' | 'admin' | 'agent',
      subjectId = role === 'merchant' ? f.merchant.id : buyerId,
    ) {
      return { authorization: 'Bearer ' + (await auth.issue({ role, subjectId })) };
    }
    async function create() {
      const response = await app.inject({
        method: 'POST',
        url: '/api/checkout/orders',
        payload: f.input,
      });
      expect(response.statusCode).toBe(201);
      return response.json() as { orderId: string; paypalOrderId: string };
    }
    return { ...f, app, buyerId, headers, create };
  }
  it('documents all seven source routes with role security and the H2/stub readiness state', async () => {
    const f = await fixture();
    const spec = (await f.app.inject('/docs/json')).json();
    for (const path of [
      '/api/checkout/config',
      '/api/checkout/orders',
      '/api/checkout/orders/{paypalOrderId}/capture',
      '/api/merchant/orders',
      '/api/orders/{id}',
      '/api/buyer/orders',
      '/api/buyer/orders/{id}',
    ])
      expect(spec.paths).toHaveProperty(path);
    expect(spec.paths['/api/merchant/orders'].get.security).toEqual([{ bearerAuth: [] }]);
    expect(spec.paths['/api/checkout/config'].get.security ?? []).toEqual([]);
    expect((await f.app.inject('/docs/')).statusCode).toBe(200);
    expect((await f.app.inject('/healthz')).json()).toEqual({
      status: 'ok',
      database: 'ready',
      phase: 'H2',
      intelligence: 'stub',
    });
  });
  it('serves public client-ID configuration and creates/captures from the unchanged bodies without bearer auth', async () => {
    const f = await fixture();
    const config = await f.app.inject(
      '/api/checkout/config?merchant=' + encodeURIComponent(f.merchant.slug),
    );
    expect(config.statusCode).toBe(200);
    expect(config.json()).toEqual({
      clientId: 'synthetic-flow-client',
      merchantId: f.merchant.id,
      currency: 'USD',
    });
    const created = await f.create();
    const capture = await f.app.inject({
      method: 'POST',
      url: '/api/checkout/orders/' + created.paypalOrderId + '/capture',
    });
    expect(capture.statusCode).toBe(200);
    expect(capture.json()).toMatchObject({
      id: created.orderId,
      merchantId: f.merchant.id,
      status: 'captured',
      amount: { currency_code: 'USD', value: '38.00' },
    });
    expect(Object.keys(capture.json()).sort()).toEqual(
      ['id', 'merchantId', 'status', 'amount', 'createdAt', 'items'].sort(),
    );
    for (const excluded of [
      'payerId',
      'sellerProtection',
      'raw',
      'paypalCaptureId',
      'secret',
      'token',
      '@example.invalid',
      'Synthetic Street',
    ])
      expect(capture.body).not.toContain(excluded);
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/checkout/orders/' + created.paypalOrderId + '/capture',
          payload: {},
        })
      ).statusCode,
    ).toBe(200);
    expect(f.calls.filter((row) => row.path.endsWith('/capture'))).toHaveLength(1);
  });
  it('accepts buyer checkout and makes the captured order visible only under its actual matched identity', async () => {
    const f = await fixture();
    const buyerHeaders = await f.headers('buyer');
    const created = await f.app.inject({
      method: 'POST',
      url: '/api/checkout/orders',
      headers: buyerHeaders,
      payload: f.input,
    });
    expect(created.statusCode).toBe(201);
    const ids = created.json();
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/checkout/orders/' + ids.paypalOrderId + '/capture',
          headers: buyerHeaders,
        })
      ).statusCode,
    ).toBe(200);
    const list = await f.app.inject({ url: '/api/buyer/orders', headers: buyerHeaders });
    expect(list.statusCode).toBe(200);
    expect(list.json().map((row: { id: string }) => row.id)).toEqual([ids.orderId]);
    for (const url of ['/api/orders/', '/api/buyer/orders/']) {
      const detail = await f.app.inject({ url: url + ids.orderId, headers: buyerHeaders });
      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({
        buyerSignal: null,
        hold: null,
        sharedCauses: [],
        buyer: { id: f.buyerId, payerAccountStatus: null },
      });
    }
  });
  it('enforces merchant ownership on both list and detail even when an alternate merchant is supplied in query', async () => {
    const own = await fixture();
    const foreign = await fixture();
    const a = await own.create();
    const b = await foreign.create();
    const headers = await own.headers('merchant');
    const list = await own.app.inject({
      url: '/api/merchant/orders?merchantId=' + foreign.merchant.id,
      headers,
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().map((row: { id: string }) => row.id)).toEqual([a.orderId]);
    const detail = await own.app.inject({ url: '/api/orders/' + a.orderId, headers });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().buyerSignal.reasons[0].code).toBe('INTELLIGENCE_STUB');
    const hidden = await own.app.inject({ url: '/api/orders/' + b.orderId, headers });
    const missing = await own.app.inject({ url: '/api/orders/' + randomUUID(), headers });
    expect(hidden.statusCode).toBe(404);
    expect(hidden.body).toBe(missing.body);
  });
  it('protects private routes from anonymous, wrong-role, foreign-buyer and tampered tokens', async () => {
    const f = await fixture();
    const created = await f.create();
    await f.service.capture(null, created.paypalOrderId);
    for (const url of [
      '/api/merchant/orders',
      '/api/orders/' + created.orderId,
      '/api/buyer/orders',
      '/api/buyer/orders/' + created.orderId,
    ])
      expect((await f.app.inject(url)).statusCode).toBe(401);
    const wrongBuyer = await f.headers('buyer', randomUUID());
    for (const prefix of ['/api/orders/', '/api/buyer/orders/'])
      expect(
        (await f.app.inject({ url: prefix + created.orderId, headers: wrongBuyer })).statusCode,
      ).toBe(404);
    expect(
      (await f.app.inject({ url: '/api/merchant/orders', headers: await f.headers('buyer') }))
        .statusCode,
    ).toBe(403);
    for (const role of ['admin', 'agent'] as const)
      expect(
        (
          await f.app.inject({
            url: '/api/orders/' + created.orderId,
            headers: await f.headers(role),
          })
        ).statusCode,
      ).toBe(403);
    const valid = await f.headers('buyer');
    expect(
      (
        await f.app.inject({
          url: '/api/buyer/orders',
          headers: { authorization: valid.authorization + 'tampered' },
        })
      ).statusCode,
    ).toBe(401);
  });
  it('validates create/capture/config/query boundaries without invoking PayPal on invalid input', async () => {
    const f = await fixture();
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/checkout/orders',
          payload: { ...f.input, amount: '0.01' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/checkout/orders',
          payload: { ...f.input, items: [{ sku: f.product.sku, quantity: 0 }] },
        })
      ).statusCode,
    ).toBe(400);
    expect((await f.app.inject('/api/checkout/config')).statusCode).toBe(400);
    expect(
      (
        await f.app.inject({
          url: '/api/merchant/orders?status=unknown',
          headers: await f.headers('merchant'),
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await f.app.inject({ url: '/api/buyer/orders?limit=0', headers: await f.headers('buyer') }))
        .statusCode,
    ).toBe(400);
    expect(
      (await f.app.inject({ method: 'POST', url: '/api/checkout/orders/SEED-ORDER/capture' }))
        .statusCode,
    ).toBe(400);
    expect(f.forMerchant).not.toHaveBeenCalled();
    const created = await f.create();
    const calls = f.calls.length;
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/checkout/orders/' + created.paypalOrderId + '/capture',
          payload: { merchantId: randomUUID() },
        })
      ).statusCode,
    ).toBe(400);
    expect(f.calls).toHaveLength(calls);
  });
  it('rejects merchant/admin/agent checkout roles and returns safe errors for missing configuration/vendor decline', async () => {
    const f = await fixture();
    for (const role of ['merchant', 'admin', 'agent'] as const) {
      const response = await f.app.inject({
        method: 'POST',
        url: '/api/checkout/orders',
        headers: await f.headers(role),
        payload: f.input,
      });
      expect(response.statusCode).toBe(403);
    }
    expect(f.forMerchant).not.toHaveBeenCalled();
    const created = await f.create();
    f.state.postFailure = 'declined';
    const decline = await f.app.inject({
      method: 'POST',
      url: '/api/checkout/orders/' + created.paypalOrderId + '/capture',
    });
    expect(decline.statusCode).toBe(502);
    expect(decline.json()).toMatchObject({
      error: {
        code: 'PAYPAL_HTTP_ERROR',
        details: { outcomeUnknown: false, issues: ['INSTRUMENT_DECLINED'] },
      },
    });
    expect(decline.body).not.toContain('@example.invalid');
    expect(decline.body).not.toContain('description');
    await database.db
      .update(merchants)
      .set({ paypal_client_id: null })
      .where(eq(merchants.id, f.merchant.id));
    const config = await f.app.inject('/api/checkout/config?merchant=' + f.merchant.slug);
    expect(config.statusCode).toBe(503);
    expect(config.json().error.code).toBe('PAYPAL_CREDENTIALS_MISSING');
  });
  it('supports source pagination through HTTP and rejects a foreign cursor without leaking its order', async () => {
    const f = await fixture();
    const first = await f.create();
    await f.create();
    const headers = await f.headers('merchant');
    const page = await f.app.inject({ url: '/api/merchant/orders?limit=1', headers });
    expect(page.statusCode).toBe(200);
    expect(page.json()).toHaveLength(1);
    const next = await f.app.inject({
      url: '/api/merchant/orders?limit=1&cursor=' + page.json()[0].id,
      headers,
    });
    expect(next.statusCode).toBe(200);
    expect(next.json()).toHaveLength(1);
    expect(next.json()[0].id).not.toBe(page.json()[0].id);
    const foreign = await fixture();
    const hidden = await foreign.create();
    const invalid = await f.app.inject({
      url: '/api/merchant/orders?cursor=' + hidden.orderId,
      headers,
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe('INVALID_CURSOR');
    expect(invalid.body).not.toContain(hidden.orderId);
    expect(new Set([page.json()[0].id, next.json()[0].id])).toContain(first.orderId);
  });
});
