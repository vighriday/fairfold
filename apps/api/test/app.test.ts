import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { DemoSubjects, fixedClock } from '@fairfold/contracts';
import { createApi } from '../src/app.js';
import { createAuth, requireAuth, requireSubject } from '../src/auth.js';
import { readConfig } from '../src/config.js';

const env = {
  DATABASE_URL: 'postgres://fairfold:fairfold@127.0.0.1:55432/fairfold_h1_test',
  APP_BASE_URL: 'http://localhost:3000',
  FRONTEND_ORIGIN: 'http://localhost:5173',
  APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  DEMO_TOKEN_SECRET: 'unit-test-signing-key-that-is-not-a-real-secret',
  DEMO_MODE: 'true',
};
const clock = fixedClock('2026-11-09T06:00:00.000Z');
const apps: Array<Awaited<ReturnType<typeof createApi>>> = [];
async function appFixture(overrides: Partial<Parameters<typeof createApi>[0]> = {}) {
  const app = await createApi({
    config: readConfig(env),
    checkDatabase: async () => {},
    clock,
    logger: false,
    ...overrides,
  });
  apps.push(app);
  return app;
}
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('H1 API foundation', () => {
  it('serves OpenAPI and distinguishes database readiness from process availability', async () => {
    const app = await appFixture();
    expect((await app.inject('/healthz')).json()).toMatchObject({
      status: 'ok',
      database: 'ready',
      intelligence: 'stub',
    });
    expect((await app.inject('/docs/json')).json().paths).toHaveProperty('/api/auth/demo-login');
    expect((await app.inject('/docs/')).statusCode).toBe(200);
    const unavailable = await appFixture({
      checkDatabase: async () => {
        throw new Error('private connection information');
      },
    });
    const response = await unavailable.inject('/healthz');
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('private connection');
  });
  it('allows only the seeded role/subject pairs and validates login bodies', async () => {
    const app = await appFixture();
    const valid = await app.inject({
      method: 'POST',
      url: '/api/auth/demo-login',
      payload: { role: 'merchant', subjectId: DemoSubjects.merchant },
    });
    expect(valid.statusCode).toBe(200);
    expect(valid.json().token.split('.')).toHaveLength(3);
    const wrong = await app.inject({
      method: 'POST',
      url: '/api/auth/demo-login',
      payload: { role: 'merchant', subjectId: DemoSubjects.buyer },
    });
    expect(wrong.statusCode).toBe(403);
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/auth/demo-login',
      payload: { role: 'owner', subjectId: 'not-a-uuid' },
    });
    expect(invalid.statusCode).toBe(400);
    const production = await appFixture({ config: readConfig({ ...env, DEMO_MODE: 'false' }) });
    expect(
      (
        await production.inject({
          method: 'POST',
          url: '/api/auth/demo-login',
          payload: { role: 'merchant', subjectId: DemoSubjects.merchant },
        })
      ).statusCode,
    ).toBe(404);
  });
  it('enforces role, subject ownership, signature and expiry', async () => {
    let now = new Date('2026-11-09T06:00:00.000Z');
    const mutableClock = { now: () => new Date(now) };
    const app = await appFixture({
      clock: mutableClock,
      routes: async (server) => {
        server.get('/private', { preHandler: requireAuth('merchant') }, async (request) => {
          requireSubject(request, DemoSubjects.merchant);
          return { ok: true };
        });
      },
    });
    const auth = createAuth(env.DEMO_TOKEN_SECRET, mutableClock);
    const token = await auth.issue({ role: 'merchant', subjectId: DemoSubjects.merchant });
    expect((await app.inject('/private')).statusCode).toBe(401);
    expect(
      (await app.inject({ url: '/private', headers: { authorization: 'Bearer ' + token } }))
        .statusCode,
    ).toBe(200);
    const buyer = await auth.issue({ role: 'buyer', subjectId: DemoSubjects.buyer });
    expect(
      (await app.inject({ url: '/private', headers: { authorization: 'Bearer ' + buyer } }))
        .statusCode,
    ).toBe(403);
    const differentMerchant = await auth.issue({ role: 'merchant', subjectId: DemoSubjects.buyer });
    expect(
      (
        await app.inject({
          url: '/private',
          headers: { authorization: 'Bearer ' + differentMerchant },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: '/private',
          headers: { authorization: 'Bearer ' + token + 'tamper' },
        })
      ).statusCode,
    ).toBe(401);
    now = new Date('2026-11-09T07:00:01.000Z');
    expect(
      (await app.inject({ url: '/private', headers: { authorization: 'Bearer ' + token } }))
        .statusCode,
    ).toBe(401);
  });
  it('limits ordinary requests and uploads separately per token', async () => {
    const app = await appFixture({
      routes: async (server) => {
        server.post('/test/photos', { preHandler: requireAuth('merchant') }, async () => ({
          ok: true,
        }));
      },
    });
    const token = await createAuth(env.DEMO_TOKEN_SECRET, clock).issue({
      role: 'merchant',
      subjectId: DemoSubjects.merchant,
    });
    const headers = { authorization: 'Bearer ' + token };
    for (let index = 0; index < 10; index++)
      expect((await app.inject({ method: 'POST', url: '/test/photos', headers })).statusCode).toBe(
        200,
      );
    expect((await app.inject({ method: 'POST', url: '/test/photos', headers })).statusCode).toBe(
      429,
    );
    const ordinary = await appFixture();
    for (let index = 0; index < 60; index++)
      expect((await ordinary.inject({ url: '/healthz', headers })).statusCode).toBe(200);
    expect((await ordinary.inject({ url: '/healthz', headers })).statusCode).toBe(429);
    const mixed = await appFixture({
      routes: async (server) => {
        server.post('/test/photos', async () => ({ ok: true }));
      },
    });
    for (let index = 0; index < 50; index++)
      expect((await mixed.inject({ url: '/healthz', headers })).statusCode).toBe(200);
    for (let index = 0; index < 10; index++)
      expect(
        (await mixed.inject({ method: 'POST', url: '/test/photos', headers })).statusCode,
      ).toBe(200);
    expect((await mixed.inject({ url: '/healthz', headers })).statusCode).toBe(429);
  });
  it('restricts CORS and does not leak bodies, query secrets or exception messages in logs', async () => {
    let logs = '';
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        logs += String(chunk);
        callback();
      },
    });
    const app = await appFixture({
      logger: { level: 'info', stream },
      routes: async (server) => {
        server.post('/explode', async () => {
          throw new Error('private-email@example.invalid');
        });
      },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/explode?token=private-query-value',
      payload: { password: 'private-body-value' },
    });
    expect(response.statusCode).toBe(500);
    const allowed = await app.inject({ url: '/healthz', headers: { origin: env.FRONTEND_ORIGIN } });
    expect(allowed.headers['access-control-allow-origin']).toBe(env.FRONTEND_ORIGIN);
    const denied = await app.inject({
      url: '/healthz',
      headers: { origin: 'https://untrusted.example' },
    });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.body + logs).not.toContain('private-email');
    expect(logs).not.toContain('private-body-value');
    expect(logs).not.toContain('private-query-value');
  });
  it('enforces the multipart file count and per-file size limits', async () => {
    const app = await appFixture({
      routes: async (server) => {
        server.post('/multipart-test', async (request) => {
          let count = 0;
          for await (const file of request.files()) {
            await file.toBuffer();
            count++;
          }
          return { count };
        });
      },
    });
    function multipart(files: Buffer[]) {
      const boundary = 'fairfold-test-boundary';
      const body = Buffer.concat(
        files
          .flatMap((bytes, index) => [
            Buffer.from(
              '--' +
                boundary +
                '\r\nContent-Disposition: form-data; name="photos"; filename="' +
                index +
                '.jpg"\r\nContent-Type: image/jpeg\r\n\r\n',
            ),
            bytes,
            Buffer.from('\r\n'),
          ])
          .concat(Buffer.from('--' + boundary + '--\r\n')),
      );
      return {
        method: 'POST' as const,
        url: '/multipart-test',
        headers: { 'content-type': 'multipart/form-data; boundary=' + boundary },
        payload: body,
      };
    }
    expect((await app.inject(multipart([Buffer.from('synthetic')]))).json()).toEqual({ count: 1 });
    expect(
      (await app.inject(multipart(Array.from({ length: 7 }, () => Buffer.from('synthetic')))))
        .statusCode,
    ).toBe(413);
    expect((await app.inject(multipart([Buffer.alloc(12 * 1024 * 1024 + 1)]))).statusCode).toBe(
      413,
    );
  });
  it('uses the assigned Render URL for initial hosted API and frontend configuration', () => {
    const { APP_BASE_URL: _base, FRONTEND_ORIGIN: _frontend, ...hosted } = env;
    expect(
      readConfig({
        ...hosted,
        RENDER: 'true',
        RENDER_EXTERNAL_URL: 'https://assigned-fairfold.example',
        PORT: '10000',
      }),
    ).toMatchObject({
      appBaseUrl: 'https://assigned-fairfold.example',
      frontendOrigin: 'https://assigned-fairfold.example',
      port: 10000,
    });
  });
  it('keeps explicit deployment URLs ahead of Render metadata', () => {
    expect(
      readConfig({ ...env, RENDER: 'true', RENDER_EXTERNAL_URL: 'https://assigned.example' }),
    ).toMatchObject({ appBaseUrl: env.APP_BASE_URL, frontendOrigin: env.FRONTEND_ORIGIN });
  });
  it('requires explicit URL configuration outside Render', () => {
    const { APP_BASE_URL: _base, FRONTEND_ORIGIN: _frontend, ...local } = env;
    for (const render of [undefined, 'false']) {
      expect(() =>
        readConfig({
          ...local,
          RENDER: render,
          RENDER_EXTERNAL_URL: 'https://ignored.example',
        }),
      ).toThrow('APP_BASE_URL');
    }
  });
  it('rejects missing or malformed assigned URLs without exposing configuration values', () => {
    const { APP_BASE_URL: _base, FRONTEND_ORIGIN: _frontend, ...hosted } = env;
    for (const url of [undefined, '', 'invalid-private-value']) {
      expect(() => readConfig({ ...hosted, RENDER: 'true', RENDER_EXTERNAL_URL: url })).toThrow(
        'Invalid configuration: APP_BASE_URL, FRONTEND_ORIGIN',
      );
    }
    expect(() =>
      readConfig({
        ...env,
        APP_BASE_URL: '',
        RENDER: 'true',
        RENDER_EXTERNAL_URL: 'https://assigned.example',
      }),
    ).toThrow('APP_BASE_URL');
  });
  it('refuses live PayPal configuration before boot', () => {
    expect(() => readConfig({ ...env, PAYPAL_API_BASE: 'https://api-m.paypal.com' })).toThrow(
      'PAYPAL_API_BASE',
    );
  });
});
