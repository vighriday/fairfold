// Endpoint 32 (section 11): the buyer's report-problem upload, multipart with `text` and up to 4 `photos`.
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { AppError } from '@fairfold/contracts';
import {
  ComplaintIdResponseSchema,
  IdParamsSchema,
  ReportProblemFieldsSchema,
} from '@fairfold/contracts/intel';
import { reportProblem } from '@fairfold/intelligence';
import { requireAuth } from '../../auth.js';
import { bearer, runtime, subjectOf } from './common.js';

const MAX_PHOTOS = 4;
const PHOTO_FIELDS = new Set(['photos', 'photos[]']);

const complaintRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    '/api/buyer/orders/:id/report-problem',
    {
      preHandler: requireAuth('buyer'),
      schema: {
        security: bearer,
        consumes: ['multipart/form-data'],
        params: IdParamsSchema,
        response: { 200: ComplaintIdResponseSchema },
      },
    },
    async (request) => {
      if (!request.isMultipart())
        throw new AppError('MULTIPART_REQUIRED', 'Send multipart/form-data', 415);
      let text: unknown;
      const photos: Array<{ bytes: Buffer; mime: string }> = [];
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          if (!PHOTO_FIELDS.has(part.fieldname))
            throw new AppError('UNEXPECTED_FILE', `Unexpected file field ${part.fieldname}`, 400);
          if (photos.length >= MAX_PHOTOS)
            throw new AppError('TOO_MANY_PHOTOS', `At most ${MAX_PHOTOS} photos`, 400, {
              max: MAX_PHOTOS,
            });
          photos.push({ bytes: await part.toBuffer(), mime: part.mimetype });
        } else if (part.fieldname === 'text') {
          text = part.value;
        }
      }
      const fields = ReportProblemFieldsSchema.safeParse({ text });
      if (!fields.success)
        throw new AppError('VALIDATION_ERROR', 'A problem description is required', 400, {
          fields: [{ path: '/text', rule: 'required' }],
        });
      return reportProblem(
        runtime(),
        subjectOf(request),
        request.params.id,
        fields.data.text,
        photos,
      );
    },
  );
};

export default complaintRoutes;
