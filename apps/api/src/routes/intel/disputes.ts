// Dispute Agent endpoints 19 and 20 (section 11).
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { EvidencePackDraftSchema } from '@fairfold/contracts';
import { DisputeParamsSchema, PackParamsSchema } from '@fairfold/contracts/intel';
import { packPdfForMerchant, rebuildPackForMerchant } from '@fairfold/intelligence';
import { requireAuth } from '../../auth.js';
import { bearer, runtime, subjectOf } from './common.js';

const disputeRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    '/api/disputes/:id/packs',
    {
      preHandler: requireAuth('merchant'),
      schema: {
        security: bearer,
        params: DisputeParamsSchema,
        response: { 200: EvidencePackDraftSchema.extend({ packId: z.uuid() }) },
      },
    },
    async (request) => rebuildPackForMerchant(runtime(), subjectOf(request), request.params.id),
  );

  app.get(
    '/api/disputes/:id/packs/:packId/pdf',
    { preHandler: requireAuth('merchant'), schema: { security: bearer, params: PackParamsSchema } },
    async (request, reply) => {
      const { filename, bytes } = await packPdfForMerchant(
        runtime(),
        subjectOf(request),
        request.params.id,
        request.params.packId,
      );
      return reply
        .type('application/pdf')
        .header(
          'content-disposition',
          `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"`,
        )
        .send(bytes);
    },
  );
};

export default disputeRoutes;
