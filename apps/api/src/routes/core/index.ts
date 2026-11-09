import { z } from 'zod';
import { type FastifyPluginAsync } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  AppError,
  CoreRequests,
  ErrorEnvelopeSchema,
  ListQuerySchema,
  OrderDetailSchema,
  OrderRowSchema,
  OrderSummarySchema,
  UuidSchema,
} from '@fairfold/contracts';
import { requireAuth } from '../../auth.js';
import { type createCheckoutService } from '../../checkout/service.js';
import { OrderListQuerySchema, type createOrderReads } from '../../orders/read.js';

const PayPalOrderIdSchema = z.string().regex(/^[A-Z0-9]{1,36}$/);
const errors = {
  400: ErrorEnvelopeSchema,
  401: ErrorEnvelopeSchema,
  403: ErrorEnvelopeSchema,
  404: ErrorEnvelopeSchema,
  409: ErrorEnvelopeSchema,
  429: ErrorEnvelopeSchema,
  500: ErrorEnvelopeSchema,
  502: ErrorEnvelopeSchema,
  503: ErrorEnvelopeSchema,
};
const bearer = [{ bearerAuth: [] }];

export function createCoreRoutes(options: {
  checkout: ReturnType<typeof createCheckoutService>;
  reads: ReturnType<typeof createOrderReads>;
}): FastifyPluginAsync {
  return async (server) => {
    const app = server.withTypeProvider<ZodTypeProvider>();
    app.get(
      '/api/checkout/config',
      {
        schema: {
          tags: ['Checkout'],
          summary: 'Public sandbox checkout configuration',
          querystring: CoreRequests.checkoutConfig,
          response: {
            200: z.object({
              clientId: z.string(),
              merchantId: UuidSchema,
              currency: z.string().regex(/^[A-Z]{3}$/),
            }),
            ...errors,
          },
        },
      },
      async (request) => options.checkout.config(request.query),
    );
    app.post(
      '/api/checkout/orders',
      {
        schema: {
          tags: ['Checkout'],
          summary: 'Create a database-priced sandbox order',
          body: CoreRequests.createOrder,
          response: {
            201: z.object({ orderId: UuidSchema, paypalOrderId: PayPalOrderIdSchema }),
            ...errors,
          },
        },
      },
      async (request, reply) =>
        reply.status(201).send(await options.checkout.create(request.auth, request.body)),
    );
    app.post(
      '/api/checkout/orders/:paypalOrderId/capture',
      {
        preValidation: async (request) => {
          if (!z.object({}).strict().optional().safeParse(request.body).success)
            throw new AppError('VALIDATION_ERROR', 'Capture request body must be empty', 400);
        },
        schema: {
          tags: ['Checkout'],
          summary: 'Capture or recover an approved sandbox order',
          params: z.object({ paypalOrderId: PayPalOrderIdSchema }),
          response: { 200: OrderSummarySchema, ...errors },
        },
      },
      async (request) => options.checkout.capture(request.auth, request.params.paypalOrderId),
    );
    app.get(
      '/api/merchant/orders',
      {
        preHandler: requireAuth('merchant'),
        schema: {
          tags: ['Orders'],
          security: bearer,
          summary: 'List this merchant’s orders',
          querystring: OrderListQuerySchema,
          response: { 200: z.array(OrderRowSchema), ...errors },
        },
      },
      async (request) => options.reads.listMerchant(request.auth, request.query),
    );
    app.get(
      '/api/orders/:id',
      {
        preHandler: requireAuth(['merchant', 'buyer']),
        schema: {
          tags: ['Orders'],
          security: bearer,
          summary: 'Read an owned order with the role’s projection',
          params: z.object({ id: UuidSchema }),
          response: { 200: OrderDetailSchema, ...errors },
        },
      },
      async (request) => options.reads.detail(request.auth, request.params.id),
    );
    app.get(
      '/api/buyer/orders',
      {
        preHandler: requireAuth('buyer'),
        schema: {
          tags: ['Orders'],
          security: bearer,
          summary: 'List this buyer’s own orders',
          querystring: ListQuerySchema,
          response: { 200: z.array(OrderSummarySchema), ...errors },
        },
      },
      async (request) => options.reads.listBuyer(request.auth, request.query),
    );
    app.get(
      '/api/buyer/orders/:id',
      {
        preHandler: requireAuth('buyer'),
        schema: {
          tags: ['Orders'],
          security: bearer,
          summary: 'Read this buyer’s own order without merchant investigations',
          params: z.object({ id: UuidSchema }),
          response: { 200: OrderDetailSchema, ...errors },
        },
      },
      async (request) => options.reads.detail(request.auth, request.params.id),
    );
  };
}
