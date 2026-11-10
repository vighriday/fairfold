import { createHash } from 'node:crypto';
import Fastify, {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyServerOptions,
} from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AppError,
  DemoLoginResponseSchema,
  DemoLoginSchema,
  DemoSubjects,
  ErrorEnvelopeSchema,
  systemClock,
  type Clock,
} from '@fairfold/contracts';
import { createAuth } from './auth.js';
import type { Config } from './config.js';
import intelligenceRoutes from './routes/intel/index.js';

export const RedactionPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'password',
  'secret',
  'token',
  '*.password',
  '*.secret',
  '*.token',
];

export async function createApi(options: {
  config: Config;
  checkDatabase: () => Promise<void>;
  clock?: Clock;
  logger?: FastifyServerOptions['logger'];
  routes?: FastifyPluginAsync;
}) {
  const { config } = options;
  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            level: 'info',
            ...(typeof options.logger === 'object' ? options.logger : {}),
            redact: { paths: RedactionPaths, censor: '[REDACTED]' },
            serializers: {
              req: (request) => ({ method: request.method, url: request.url?.split('?')[0] }),
            },
          },
    bodyLimit: 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorateRequest('auth', null);
  const auth = createAuth(config.demoTokenSecret, options.clock ?? systemClock);
  app.addHook('onRequest', async (request) => {
    await auth.authenticate(request);
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError)
      return reply
        .status(error.statusCode)
        .send({ error: { code: error.code, message: error.message, details: error.details } });
    const candidate = error as {
      statusCode?: number;
      validation?: Array<{ instancePath?: string; keyword?: string }>;
      code?: string;
      name?: string;
    };
    if (candidate.validation || candidate.statusCode === 400)
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: {
            fields:
              candidate.validation?.map((issue) => ({
                path: issue.instancePath,
                rule: issue.keyword,
              })) ?? [],
          },
        },
      });
    if (
      candidate.statusCode === 413 ||
      candidate.statusCode === 415 ||
      candidate.statusCode === 429
    )
      return reply.status(candidate.statusCode).send({
        error: {
          code:
            candidate.statusCode === 429
              ? 'RATE_LIMITED'
              : candidate.statusCode === 413
                ? 'FILE_TOO_LARGE'
                : 'UNSUPPORTED_MEDIA_TYPE',
          message:
            candidate.statusCode === 429
              ? 'Request limit exceeded'
              : 'Request content is not accepted',
          details: {},
        },
      });
    request.log.error(
      { errorType: candidate.name ?? 'Error', code: candidate.code ?? 'INTERNAL_ERROR' },
      'Request failed',
    );
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', details: {} },
    });
  });
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Fairfold API',
        description:
          'H1 foundation with the intelligence endpoints. PayPal checkout endpoints are not implemented yet.',
        version: '0.1.0',
      },
      components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs', staticCSP: true });
  const origins = new Set([
    new URL(config.frontendOrigin).origin,
    new URL(config.appBaseUrl).origin,
  ]);
  await app.register(cors, {
    origin: (origin, callback) => callback(null, origin === undefined || origins.has(origin)),
  });
  const rateKey = (request: FastifyRequest) =>
    request.headers.authorization
      ? createHash('sha256').update(request.headers.authorization).digest('hex')
      : request.ip;
  await app.register(rateLimit, {
    max: 60,
    timeWindow: '1 minute',
    keyGenerator: rateKey,
  });
  const checkUploadLimit = app.createRateLimit({
    max: 10,
    keyGenerator: (request) => rateKey(request) + ':uploads',
  });
  app.addHook('onRequest', async (request) => {
    const multipartUpload = request.headers['content-type']
      ?.toLowerCase()
      .startsWith('multipart/form-data');
    if (!multipartUpload && !/\/(photos|inspections)$/.test(request.routeOptions.url ?? '')) return;
    const result = await checkUploadLimit(request);
    if (!result.isAllowed && result.isExceeded)
      throw new AppError('RATE_LIMITED', 'Upload limit exceeded', 429);
  });
  await app.register(multipart, { limits: { fileSize: 12 * 1024 * 1024, files: 6 } });

  app.get(
    '/healthz',
    {
      schema: {
        response: {
          200: z.object({
            status: z.literal('ok'),
            database: z.literal('ready'),
            phase: z.literal('H1'),
            intelligence: z.literal('ready'),
          }),
          503: ErrorEnvelopeSchema,
        },
      },
    },
    async (_request, reply) => {
      try {
        await options.checkDatabase();
      } catch {
        return reply.status(503).send({
          error: {
            code: 'DATABASE_UNAVAILABLE',
            message: 'Database is unavailable',
            details: {},
          },
        });
      }
      return {
        status: 'ok' as const,
        database: 'ready' as const,
        phase: 'H1' as const,
        intelligence: 'ready' as const,
      };
    },
  );
  app.post(
    '/api/auth/demo-login',
    {
      schema: {
        body: DemoLoginSchema,
        response: {
          200: DemoLoginResponseSchema,
          403: ErrorEnvelopeSchema,
          404: ErrorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      if (!config.demoMode) throw new AppError('NOT_FOUND', 'Route not found', 404);
      const { role, subjectId } = request.body;
      if (DemoSubjects[role] !== subjectId)
        throw new AppError('FORBIDDEN', 'Unknown demo identity', 403);
      return { token: await auth.issue({ role, subjectId }), role, subjectId };
    },
  );
  if (options.routes) await app.register(options.routes);
  await app.register(intelligenceRoutes);
  app.setNotFoundHandler((_request, reply) =>
    reply
      .status(404)
      .send({ error: { code: 'NOT_FOUND', message: 'Route not found', details: {} } }),
  );
  return app;
}
