// Buyer Signal endpoints 9, 34, 35, 40, 41 (section 11).
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BuyerSignalSchema, SignalContestSchema } from '@fairfold/contracts';
import {
  BuyerSignalQuerySchema,
  BuyerSignalViewSchema,
  ContestBodySchema,
  ContestIdResponseSchema,
  IdParamsSchema,
  IntelListQuerySchema,
  ResolveContestBodySchema,
} from '@fairfold/contracts/intel';
import {
  buyerOwnSignal,
  contestSignal,
  listContests,
  orderSignalForMerchant,
  resolveContest,
} from '@fairfold/intelligence';
import { z } from 'zod';
import { requireAuth } from '../../auth.js';
import { bearer, runtime, subjectOf } from './common.js';

const buyerSignalRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/api/orders/:id/buyer-signal',
    {
      preHandler: requireAuth('merchant'),
      schema: { security: bearer, params: IdParamsSchema, response: { 200: BuyerSignalSchema } },
    },
    async (request) => orderSignalForMerchant(runtime(), subjectOf(request), request.params.id),
  );

  app.get(
    '/api/buyer/signal',
    {
      preHandler: requireAuth('buyer'),
      schema: {
        security: bearer,
        querystring: BuyerSignalQuerySchema,
        response: { 200: BuyerSignalViewSchema.extend({ signalId: z.uuid() }) },
      },
    },
    async (request) => buyerOwnSignal(runtime(), subjectOf(request), request.query.merchantId),
  );

  app.post(
    '/api/buyer/signal/contest',
    {
      preHandler: requireAuth('buyer'),
      schema: {
        security: bearer,
        body: ContestBodySchema,
        response: { 200: ContestIdResponseSchema },
      },
    },
    async (request) =>
      contestSignal(runtime(), subjectOf(request), request.body.signalId, request.body.text),
  );

  app.get(
    '/api/merchant/signal-contests',
    {
      preHandler: requireAuth('merchant'),
      schema: {
        security: bearer,
        querystring: IntelListQuerySchema,
        response: { 200: z.array(SignalContestSchema) },
      },
    },
    async (request) => listContests(runtime(), subjectOf(request), request.query),
  );

  app.post(
    '/api/merchant/signal-contests/:id/resolve',
    {
      preHandler: requireAuth('merchant'),
      schema: {
        security: bearer,
        params: IdParamsSchema,
        body: ResolveContestBodySchema,
        response: { 200: SignalContestSchema },
      },
    },
    async (request) =>
      resolveContest(
        runtime(),
        subjectOf(request),
        request.params.id,
        request.body.status,
        request.body.merchantNote,
      ),
  );
};

export default buyerSignalRoutes;
