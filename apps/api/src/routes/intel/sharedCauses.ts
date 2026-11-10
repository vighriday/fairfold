// Shared Cause endpoints 22, 23, 24, 26 and 27 (section 11). Approving an action (25) and inspection uploads (39)
// are Hriday's; this plugin only reads hypotheses and records the merchant's confirm or dismiss.
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AppError,
  HypothesisDetailSchema,
  HypothesisSummarySchema,
  UuidSchema,
} from '@fairfold/contracts';
import { DismissBodySchema, IdParamsSchema, TrendSchema } from '@fairfold/contracts/intel';
import {
  confirmHypothesis,
  dismissHypothesis,
  hypothesisDetail,
  hypothesisTrend,
  listHypotheses,
} from '@fairfold/intelligence';
import { requireAuth } from '../../auth.js';
import { bearer, runtime, subjectOf } from './common.js';

const sharedCauseRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const merchant = { preHandler: requireAuth('merchant') };

  app.get(
    '/api/shared-causes',
    {
      ...merchant,
      schema: {
        security: bearer,
        // A1 passes ?merchantId=; the token's merchant decides, and a different id is refused.
        querystring: z.object({ merchantId: UuidSchema.optional() }),
        response: { 200: z.array(HypothesisSummarySchema) },
      },
    },
    async (request) => {
      const merchantId = subjectOf(request);
      if (request.query.merchantId && request.query.merchantId !== merchantId)
        throw new AppError('FORBIDDEN', 'You can only list your own store', 403);
      return listHypotheses(runtime(), merchantId);
    },
  );

  app.get(
    '/api/shared-causes/:id',
    {
      ...merchant,
      schema: {
        security: bearer,
        params: IdParamsSchema,
        response: { 200: HypothesisDetailSchema },
      },
    },
    async (request) => hypothesisDetail(runtime(), subjectOf(request), request.params.id),
  );

  app.get(
    '/api/shared-causes/:id/trend',
    {
      ...merchant,
      schema: { security: bearer, params: IdParamsSchema, response: { 200: TrendSchema } },
    },
    async (request) => hypothesisTrend(runtime(), subjectOf(request), request.params.id),
  );

  app.post(
    '/api/shared-causes/:id/confirm',
    {
      ...merchant,
      schema: {
        security: bearer,
        params: IdParamsSchema,
        response: { 200: HypothesisDetailSchema },
      },
    },
    async (request) => confirmHypothesis(runtime(), subjectOf(request), request.params.id),
  );

  app.post(
    '/api/shared-causes/:id/dismiss',
    {
      ...merchant,
      schema: {
        security: bearer,
        params: IdParamsSchema,
        body: DismissBodySchema,
        response: { 200: HypothesisDetailSchema },
      },
    },
    async (request) =>
      dismissHypothesis(runtime(), subjectOf(request), request.params.id, request.body.reason),
  );
};

export default sharedCauseRoutes;
