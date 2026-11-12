import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { parseRoute } from '../../web/src/router.js';

const dist = new URL('../../web/dist/', import.meta.url);
const assets = new Map([
  ['fonts.css', 'text/css; charset=utf-8'],
  ['threads.js', 'text/javascript; charset=utf-8'],
  ['landing.js', 'text/javascript; charset=utf-8'],
  ['dc-lite.js', 'text/javascript; charset=utf-8'],
  ['site.js', 'text/javascript; charset=utf-8'],
  ['product-hd-ind-01.svg', 'image/svg+xml'],
  ['product-ts-ind-02.svg', 'image/svg+xml'],
  ['illustration-sealed-parcel.svg', 'image/svg+xml'],
]);

/** Explicit public files only. Never expose the repository or use a catch-all SPA rewrite. */
export function websiteRoutes(demoMode: boolean): FastifyPluginAsync {
  return async (app) => {
    const publicPage = { schema: { hide: true }, config: { rateLimit: false as const } };
    const files = new Map<string, { body: Buffer; etag: string }>();
    const load = async (file: string) => {
      let cached = files.get(file);
      if (!cached) {
        cached = { body: await readFile(new URL(file, dist)), etag: '' };
        if (file === 'console.html')
          cached.body = Buffer.from(
            cached.body.toString().replace('data-demo="false"', `data-demo="${demoMode}"`),
          );
        cached.etag = '"' + createHash('sha256').update(cached.body).digest('hex') + '"';
        files.set(file, cached);
      }
      return cached;
    };
    // Fail before listening when the deployment omitted the website build.
    for (const file of [
      'index.html',
      'console.html',
      ...[...assets.keys()].map((a) => 'assets/' + a),
    ])
      await load(file);
    app.addHook('onSend', async (_request, reply) => {
      reply.header('x-content-type-options', 'nosniff');
      reply.header('referrer-policy', 'strict-origin-when-cross-origin');
      reply.header('x-frame-options', 'DENY');
    });
    const serve = (file: string, type: string): void => {
      app.get(file === 'index.html' ? '/' : '/assets/' + file, publicPage, async (req, reply) => {
        const resource = await load(file === 'index.html' ? file : 'assets/' + file);
        reply.type(type).header('cache-control', 'no-cache').header('etag', resource.etag);
        if (req.headers['if-none-match'] === resource.etag) return reply.code(304).send();
        return reply.send(resource.body);
      });
    };
    serve('index.html', 'text/html; charset=utf-8');
    for (const [name, type] of assets) serve(name, type);
    app.get('/console', publicPage, (_req, reply) => reply.redirect('/console/orders'));
    app.get('/console/', publicPage, (_req, reply) => reply.redirect('/console/orders'));
    for (const path of ['/console/:view', '/console/:view/:id'])
      app.get(path, publicPage, async (req, reply) => {
        if (!parseRoute(req.url.split('?')[0]!)) return reply.callNotFound();
        const resource = await load('console.html');
        return reply
          .type('text/html; charset=utf-8')
          .header('cache-control', 'no-store')
          .send(resource.body);
      });
    app.get('/Fairfold.html', publicPage, (_req, reply) => reply.redirect('/', 301));
    app.get('/Fairfold Console.html', publicPage, (_req, reply) =>
      reply.redirect('/console/orders', 301),
    );
  };
}
