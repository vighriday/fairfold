import { type FastifyPluginAsync } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError, ErrorEnvelopeSchema, systemClock, type Clock } from '@fairfold/contracts';
import { and, eq } from 'drizzle-orm';
import { orders, shipments, type Database } from '@fairfold/db';
import { createLedger } from '@fairfold/ledger';
import { requireAuth, type AuthContext } from '../auth.js';
import { DevCheckoutHtml, DevCheckoutScript } from './page.js';

const demoErrors = {
  401: ErrorEnvelopeSchema,
  403: ErrorEnvelopeSchema,
  404: ErrorEnvelopeSchema,
  409: ErrorEnvelopeSchema,
};

export function createDevRoutes(
  enabled: boolean,
  options: {
    database?: Database;
    clock?: Clock;
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
    if (options.database) {
      const database = options.database;
      async function updateShipment(
        auth: AuthContext | null,
        shipmentId: string,
        delivered: boolean,
      ) {
        if (!auth || auth.role !== 'merchant')
          throw new AppError('FORBIDDEN', 'Only a merchant may update demo shipments', 403);
        const now = (options.clock ?? systemClock).now();
        return database.transaction(async (tx) => {
          const [row] = await tx
            .select({ shipment: shipments, order: orders })
            .from(shipments)
            .innerJoin(orders, eq(orders.id, shipments.order_id))
            .where(and(eq(shipments.id, shipmentId), eq(orders.merchant_id, auth.subjectId)))
            .for('update');
          if (!row) throw new AppError('SHIPMENT_NOT_FOUND', 'Shipment was not found', 404);
          if (row.shipment.status === 'delivered' && delivered)
            return { shipmentId, status: 'delivered', synthetic: true as const };
          if (row.shipment.status === 'delivered' || !['shipped', 'sealed'].includes(row.order.status))
            throw new AppError('SHIPMENT_STATE_CONFLICT', 'Demo shipment cannot advance from this state', 409);
          const status = delivered ? 'delivered' : 'in_transit';
          await tx
            .update(shipments)
            .set({
              status,
              last_scan_at: now,
              events: [
                ...(row.shipment.events as unknown[]),
                { status, at: now.toISOString(), synthetic: true },
              ],
            })
            .where(eq(shipments.id, shipmentId));
          await tx
            .update(orders)
            .set(delivered ? { status: 'delivered', delivered_at: now } : { status: 'shipped' })
            .where(eq(orders.id, row.order.id));
          await createLedger(tx, options.clock ?? systemClock).append(row.order.id, {
            type: delivered ? 'delivered' : 'scan',
            actor: `merchant:${auth.subjectId}`,
            payload: { shipmentId, status, synthetic: true },
          });
          return { shipmentId, status, synthetic: true as const };
        });
      }
      typed.post(
        '/api/dev/shipments/:id/scan',
        {
          preHandler: requireAuth('merchant'),
          schema: {
            tags: ['Demo'],
            security: [{ bearerAuth: [] }],
            params: z.object({ id: z.string().uuid() }),
            response: {
              200: z.object({
                shipmentId: z.string().uuid(),
                status: z.string(),
                synthetic: z.literal(true),
              }),
              ...demoErrors,
            },
          },
        },
        async (request) => updateShipment(request.auth, request.params.id, false),
      );
      typed.post(
        '/api/dev/shipments/:id/deliver',
        {
          preHandler: requireAuth('merchant'),
          schema: {
            tags: ['Demo'],
            security: [{ bearerAuth: [] }],
            params: z.object({ id: z.string().uuid() }),
            response: {
              200: z.object({
                shipmentId: z.string().uuid(),
                status: z.string(),
                synthetic: z.literal(true),
              }),
              ...demoErrors,
            },
          },
        },
        async (request) => updateShipment(request.auth, request.params.id, true),
      );
    }
  };
}
