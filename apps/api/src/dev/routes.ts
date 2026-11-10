import { type FastifyPluginAsync } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ErrorEnvelopeSchema } from '@fairfold/contracts';
import { requireAuth } from '../auth.js';
import { DevCheckoutHtml, DevCheckoutScript } from './page.js';

export function createDevRoutes(
  enabled: boolean,
  options: {
    adjudicate?: ReturnType<
      typeof import('../disputes/demo-adjudicate.js').createDemoDisputeAdjudication
    >;
  } = {},
): FastifyPluginAsync {
  return async (app) => {
    if (!enabled) return;
    const typed = app.withTypeProvider<ZodTypeProvider>();
    const headers = {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    };
    typed.get('/dev', async (_request, reply) =>
      reply
        .headers({
          ...headers,
          'content-security-policy': "base-uri 'none'; object-src 'none'; frame-ancestors 'none'",
        })
        .type('text/html; charset=utf-8')
        .send(DevCheckoutHtml),
    );
    typed.get('/dev/checkout.js', async (_request, reply) =>
      reply.headers(headers).type('application/javascript; charset=utf-8').send(DevCheckoutScript),
    );
    if (options.adjudicate) {
      typed.post(
        '/api/dev/disputes/:id/adjudicate',
        {
          preHandler: requireAuth('merchant'),
          schema: {
            tags: ['Demo'],
            security: [{ bearerAuth: [] }],
            params: z.object({ id: z.string().min(1).max(255) }),
            body: z.object({ outcome: z.enum(['BUYER_FAVOR', 'SELLER_FAVOR']) }).strict(),
            response: {
              200: z.object({
                disputeId: z.string(),
                outcome: z.enum(['BUYER_FAVOR', 'SELLER_FAVOR']),
                status: z.string().nullable(),
              }),
              400: ErrorEnvelopeSchema,
              401: ErrorEnvelopeSchema,
              403: ErrorEnvelopeSchema,
              404: ErrorEnvelopeSchema,
              409: ErrorEnvelopeSchema,
              502: ErrorEnvelopeSchema,
            },
          },
        },
        async (request) =>
          options.adjudicate!(request.auth, request.params.id, request.body.outcome),
      );
    }
  };
}
