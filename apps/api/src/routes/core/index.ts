import { z } from 'zod';
import { type FastifyPluginAsync } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  AppError,
  CoreRequests,
  DisputeDetailSchema,
  DisputeRowSchema,
  ErrorEnvelopeSchema,
  ListQuerySchema,
  OrderDetailSchema,
  OrderRowSchema,
  OrderSummarySchema,
  UuidSchema,
} from '@fairfold/contracts';
import { requireAuth } from '../../auth.js';
import { createDevRoutes } from '../../dev/routes.js';
import { type createCheckoutService } from '../../checkout/service.js';
import { OrderListQuerySchema, type createOrderReads } from '../../orders/read.js';
import { type createPackingService } from '../../packing/service.js';

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
  disputeReads?: ReturnType<typeof import('../../disputes/read.js').createDisputeReads>;
  disputeApproval?: ReturnType<typeof import('../../disputes/approve.js').createDisputeApproval>;
  demoAdjudicate?: ReturnType<
    typeof import('../../disputes/demo-adjudicate.js').createDemoDisputeAdjudication
  >;
  packing?: ReturnType<typeof createPackingService>;
  demoMode: boolean;
}): FastifyPluginAsync {
  return async (server) => {
    const app = server.withTypeProvider<ZodTypeProvider>();
    await app.register(createDevRoutes(options.demoMode, { adjudicate: options.demoAdjudicate }));
    if (options.disputeReads) {
      const disputeReads = options.disputeReads;
      app.get(
        '/api/merchant/disputes',
        {
          preHandler: requireAuth('merchant'),
          schema: {
            tags: ['Disputes'],
            security: bearer,
            summary: 'List this merchant’s disputes',
            querystring: ListQuerySchema,
            response: { 200: z.array(DisputeRowSchema), ...errors },
          },
        },
        async (request) => disputeReads.list(request.auth, request.query),
      );
      app.get(
        '/api/merchant/disputes/:id',
        {
          preHandler: requireAuth('merchant'),
          schema: {
            tags: ['Disputes'],
            security: bearer,
            summary: 'Read one merchant-owned dispute',
            params: z.object({ id: z.string().min(1).max(255) }),
            response: { 200: DisputeDetailSchema, ...errors },
          },
        },
        async (request) => disputeReads.detail(request.auth, request.params.id),
      );
    }
    if (options.disputeApproval) {
      const disputeApproval = options.disputeApproval;
      app.post(
        '/api/merchant/disputes/:disputeId/packs/:packId/approve',
        {
          preHandler: requireAuth('merchant'),
          schema: {
            tags: ['Disputes'],
            security: bearer,
            summary: 'Approve one merchant-owned evidence pack',
            params: z.object({ disputeId: z.string().min(1).max(255), packId: UuidSchema }),
            body: CoreRequests.approveAction,
            response: {
              200: z.object({
                packId: UuidSchema,
                disputeId: z.string(),
                status: z.literal('approved'),
                recommendation: z.enum(['provide_evidence', 'make_offer', 'accept_claim']),
              }),
              ...errors,
            },
          },
        },
        async (request) =>
          disputeApproval(
            request.auth,
            request.params.disputeId,
            request.params.packId,
            request.body,
          ),
      );
    }
    if (options.packing) {
      const packing = options.packing;
      app.get(
        '/api/orders/:id/pack',
        {
          preHandler: requireAuth('merchant'),
          schema: {
            tags: ['Pack Station'],
            security: bearer,
            summary: 'Read merchant-owned packing state and blockers',
            params: z.object({ id: UuidSchema }),
            response: {
              200: z.object({
                photos: z.array(
                  z.object({
                    sha256: z.string().regex(/^[a-f0-9]{64}$/),
                    label: z.string(),
                    createdAt: z.iso.datetime(),
                  }),
                ),
                attestation: z
                  .object({
                    id: UuidSchema,
                    status: z.enum(['match', 'mismatch', 'could_not_verify']),
                    confidence: z.number(),
                    result: z.unknown(),
                    createdAt: z.iso.datetime(),
                  })
                  .nullable(),
                inspectionRule: z
                  .object({
                    id: UuidSchema,
                    batchCode: z.string(),
                    instruction: z.string(),
                    requiredPhotoLabel: z.string(),
                  })
                  .nullable(),
                batches: z.array(
                  z.object({
                    id: UuidSchema,
                    batchCode: z.string(),
                    qtyRemaining: z.number().int(),
                    status: z.string(),
                  }),
                ),
                canSeal: z.boolean(),
                blockers: z.array(z.string()),
              }),
              ...errors,
            },
          },
        },
        async (request) => packing.get(request.auth!, request.params.id),
      );
      app.post(
        '/api/orders/:id/pack/photos',
        {
          preHandler: requireAuth('merchant'),
          schema: {
            tags: ['Pack Station'],
            security: bearer,
            summary: 'Upload merchant-owned packing photos',
            params: z.object({ id: UuidSchema }),
            response: {
              202: z.object({ photoShas: z.array(z.string().regex(/^[a-f0-9]{64}$/)) }),
              ...errors,
            },
          },
        },
        async (request, reply) => {
          const files: Array<{ bytes: Buffer; mime: string }> = [];
          const labels: string[] = [];
          let batchCodes: Record<string, string> = {};
          for await (const part of request.parts()) {
            if (part.type === 'file') {
              files.push({ bytes: await part.toBuffer(), mime: part.mimetype });
            } else if (part.fieldname === 'labels') {
              labels.push(String(part.value));
            } else if (part.fieldname === 'batchCodes') {
              try {
                const parsed: unknown = JSON.parse(String(part.value));
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
                  throw new Error();
                batchCodes = Object.fromEntries(
                  Object.entries(parsed).map(([key, value]) => {
                    if (typeof value !== 'string' || !value.trim()) throw new Error();
                    return [key, value.trim()];
                  }),
                );
              } catch {
                throw new AppError('BATCH_CODES_INVALID', 'batchCodes must be a JSON object', 400);
              }
            }
          }
          if (files.length !== labels.length)
            throw new AppError('PHOTO_LABEL_COUNT_MISMATCH', 'Each photo requires one label', 400);
          const photos = files.map((file, index) => ({ ...file, label: labels[index]! }));
          return reply
            .status(202)
            .send(
              await packing.uploadPhotos(request.auth!, request.params.id, { photos, batchCodes }),
            );
        },
      );
      app.post(
        '/api/orders/:id/pack/override',
        {
          preHandler: requireAuth('merchant'),
          schema: {
            tags: ['Pack Station'],
            security: bearer,
            summary: 'Override only an attestation mismatch',
            params: z.object({ id: UuidSchema }),
            body: z.object({ reason: z.string().trim().min(1).max(2000) }).strict(),
            response: { 200: z.object({ status: z.literal('overridden') }), ...errors },
          },
        },
        async (request) => packing.override(request.auth!, request.params.id, request.body.reason),
      );
      app.post(
        '/api/orders/:id/pack/seal',
        {
          preHandler: requireAuth('merchant'),
          schema: {
            tags: ['Pack Station'],
            security: bearer,
            summary: 'Seal an order after all packing blockers pass',
            params: z.object({ id: UuidSchema }),
            body: z
              .object({
                batchCodes: z.record(z.string(), z.string().trim().min(1)),
                carrier: z.string().regex(/^[A-Z0-9_]{1,64}$/),
                carrierNameOther: z.string().trim().min(1).max(64).optional(),
                trackingNumber: z.string().trim().min(1).max(64),
                packer: z.string().trim().min(1).max(255),
              })
              .strict(),
            response: {
              200: z.object({
                orderId: UuidSchema,
                shipmentId: UuidSchema,
                status: z.literal('sealed'),
              }),
              ...errors,
            },
          },
        },
        async (request) => packing.seal(request.auth!, request.params.id, request.body),
      );
    }
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
