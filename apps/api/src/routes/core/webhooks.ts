import { type FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '@fairfold/contracts';
import { type createEventIngress } from '@fairfold/paypal';

const signatureHeaders = new Set([
  'paypal-auth-algo',
  'paypal-cert-url',
  'paypal-transmission-id',
  'paypal-transmission-sig',
  'paypal-transmission-time',
]);

export function createWebhookRoutes(
  ingest: ReturnType<typeof createEventIngress>,
): FastifyPluginAsync {
  return async (app) => {
    // Encapsulation keeps normal checkout/auth JSON parsing unchanged.
    app.removeContentTypeParser('application/json');
    app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, bytes, done) =>
      done(null, bytes),
    );
    app.post<{ Params: { merchantSlug: string }; Body: Buffer }>(
      '/webhooks/paypal/:merchantSlug',
      {
        schema: {
          description:
            'PayPal signature-authenticated event ingress; original bytes are verified before processing.',
          params: z.object({
            merchantSlug: z
              .string()
              .max(100)
              .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
          }),
        },
      },
      async (request, reply) => {
        const headers: Record<string, string> = {};
        const rawHeaders = request.raw.rawHeaders;
        for (let i = 0; i < rawHeaders.length; i += 2) {
          const key = rawHeaders[i]!.toLowerCase();
          if (!signatureHeaders.has(key)) continue;
          if (Object.hasOwn(headers, key))
            throw new AppError('WEBHOOK_HEADERS_INVALID', 'Duplicate signature header', 400);
          headers[key] = rawHeaders[i + 1]!;
        }
        if (!Buffer.isBuffer(request.body))
          throw new AppError('WEBHOOK_EVENT_INVALID', 'JSON bytes required', 400);
        await ingest(request.params.merchantSlug, headers, request.body);
        return reply.code(200).send();
      },
    );
  };
}
