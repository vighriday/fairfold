// Store Report, catalogue and review endpoints 5, 6, 29, 33, 42 (section 11).
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CatalogItemSchema, ReviewSchema, StoreReportSchema } from '@fairfold/contracts';
import {
  CatalogQuerySchema,
  IdParamsSchema,
  MerchantParamsSchema,
  ReviewBodySchema,
  ReviewReplyBodySchema,
} from '@fairfold/contracts/intel';
import {
  createReview,
  listReviews,
  replyToReview,
  searchCatalogWith,
  storeReportFor,
} from '@fairfold/intelligence';
import { requireAuth } from '../../auth.js';
import { bearer, runtime, subjectOf } from './common.js';

const storeReportRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/api/stores/:merchantId/report',
    { schema: { params: MerchantParamsSchema, response: { 200: StoreReportSchema } } },
    async (request) => storeReportFor(runtime(), request.params.merchantId),
  );

  app.get(
    '/api/catalog',
    { schema: { querystring: CatalogQuerySchema, response: { 200: z.array(CatalogItemSchema) } } },
    async (request) =>
      searchCatalogWith(runtime(), { query: request.query.q, maxPrice: request.query.maxPrice }),
  );

  app.get(
    '/api/stores/:merchantId/reviews',
    { schema: { params: MerchantParamsSchema, response: { 200: z.array(ReviewSchema) } } },
    async (request) => listReviews(runtime(), request.params.merchantId),
  );

  app.post(
    '/api/reviews/:id/reply',
    {
      preHandler: requireAuth('merchant'),
      schema: {
        security: bearer,
        params: IdParamsSchema,
        body: ReviewReplyBodySchema,
        response: { 200: ReviewSchema },
      },
    },
    async (request) =>
      replyToReview(runtime(), subjectOf(request), request.params.id, request.body.text),
  );

  app.post(
    '/api/buyer/orders/:id/review',
    {
      preHandler: requireAuth('buyer'),
      schema: {
        security: bearer,
        params: IdParamsSchema,
        body: ReviewBodySchema,
        response: { 200: ReviewSchema },
      },
    },
    async (request) =>
      createReview(
        runtime(),
        subjectOf(request),
        request.params.id,
        request.body.rating,
        request.body.text,
      ),
  );
};

export default storeReportRoutes;
