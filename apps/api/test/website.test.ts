import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApi } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { websiteRoutes } from '../src/website.js';
import { buildWebsite } from '../../web/src/build.js';

const apps: Awaited<ReturnType<typeof createApi>>[] = [];
beforeAll(() => buildWebsite());
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
async function fixture(demoMode = true) {
  const config = readConfig({
    DATABASE_URL: 'postgres://synthetic:synthetic@127.0.0.1:5432/fairfold_unit_test',
    APP_BASE_URL: 'http://localhost:3000',
    FRONTEND_ORIGIN: 'http://localhost:3000',
    APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    DEMO_TOKEN_SECRET: 'unit-test-signing-key-that-is-not-a-real-secret',
    DEMO_MODE: String(demoMode),
  });
  const app = await createApi({
    config,
    logger: false,
    checkDatabase: async () => {},
    routes: websiteRoutes(config.demoMode),
  });
  apps.push(app);
  return app;
}
describe('same-origin website deployment', () => {
  it('keeps public asset reloads outside the API budget while preserving API throttling', async () => {
    const app = await fixture();
    for (let i = 0; i < 65; i++) expect((await app.inject('/assets/site.js')).statusCode).toBe(200);
    for (let i = 0; i < 60; i++) expect((await app.inject('/healthz')).statusCode).toBe(200);
    expect((await app.inject('/healthz')).statusCode).toBe(429);
  });
  it('serves every deep link independently of client navigation', async () => {
    const app = await fixture();
    const landing = await app.inject('/');
    expect(landing.statusCode).toBe(200);
    expect(landing.body).toContain('/console/orders');
    for (const path of [
      '/console/orders',
      '/console/pack/00000000-0000-4000-8000-000000000001',
      '/console/disputes/SEED-PP-D-1',
      '/console/shared-causes',
      '/console/store-report',
    ]) {
      const result = await app.inject(path);
      expect(result.statusCode, path).toBe(200);
      expect(result.headers['content-type']).toContain('text/html');
      expect(result.body).toContain('data-demo="true"');
      expect(result.headers['cache-control']).toBe('no-store');
    }
  });
  it('serves the fictional product illustrations and binds them to listings', async () => {
    const app = await fixture();
    for (const image of [
      'product-hd-ind-01.svg',
      'product-ts-ind-02.svg',
      'illustration-sealed-parcel.svg',
    ]) {
      const result = await app.inject('/assets/' + image);
      expect(result.statusCode, image).toBe(200);
      expect(result.headers['content-type']).toBe('image/svg+xml');
      expect(result.body).toContain('Illustration of');
    }
    expect((await app.inject('/')).body).toContain('url(/assets/product-hd-ind-01.svg)');
    const consoleHtml = (await app.inject('/console/orders')).body;
    expect(consoleHtml).toContain('{{ r.thumb }}');
    expect(consoleHtml).toContain('{{ p.thumb }}');
  });
  it('never rewrites API errors or exposes repository files', async () => {
    const app = await fixture();
    for (const path of [
      '/api/missing',
      '/console/missing',
      '/console/store-report/secret',
      '/assets/console.js',
      '/assets/../../.env',
      '/docs/internal/source.docx',
      '/.git/config',
      '/standalone/assets/console.js',
    ]) {
      const result = await app.inject(path);
      expect(result.statusCode, path).toBe(404);
      expect(result.json().error.code).toBe('NOT_FOUND');
    }
    expect((await app.inject('/docs/json')).json().paths).not.toHaveProperty('/console/{view}');
  });
  it('revalidates public assets, handles HEAD and gates demo configuration', async () => {
    const app = await fixture(false);
    const script = await app.inject('/assets/site.js');
    expect(script.statusCode).toBe(200);
    expect(script.headers['x-content-type-options']).toBe('nosniff');
    expect(
      (
        await app.inject({
          url: '/assets/site.js',
          headers: { 'if-none-match': script.headers.etag! },
        })
      ).statusCode,
    ).toBe(304);
    expect((await app.inject({ url: '/', method: 'HEAD' })).body).toBe('');
    expect((await app.inject('/console/orders')).body).toContain('data-demo="false"');
    expect((await app.inject('/console')).headers.location).toBe('/console/orders');
    expect((await app.inject('/Fairfold.html')).headers.location).toBe('/');
    expect((await app.inject('/Fairfold%20Console.html')).headers.location).toBe('/console/orders');
  });
});
