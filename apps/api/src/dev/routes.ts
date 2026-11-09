import { type FastifyPluginAsync } from 'fastify';
import { DevCheckoutHtml, DevCheckoutScript } from './page.js';

export function createDevRoutes(enabled: boolean): FastifyPluginAsync {
  return async (app) => {
    if (!enabled) return;
    const headers = {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    };
    app.get('/dev', async (_request, reply) =>
      reply
        .headers({
          ...headers,
          'content-security-policy': "base-uri 'none'; object-src 'none'; frame-ancestors 'none'",
        })
        .type('text/html; charset=utf-8')
        .send(DevCheckoutHtml),
    );
    app.get('/dev/checkout.js', async (_request, reply) =>
      reply.headers(headers).type('application/javascript; charset=utf-8').send(DevCheckoutScript),
    );
  };
}
