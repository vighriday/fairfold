// Helpers shared by the intelligence routes (section 11 endpoints owned by Ishaan).
import type { FastifyRequest } from 'fastify';
import { AppError } from '@fairfold/contracts';
import { getIntelRuntime } from '@fairfold/intelligence';

/** The runtime is resolved per request, so registering the routes never opens a database connection. */
export const runtime = () => getIntelRuntime();

/** The authenticated subject id; preHandler requireAuth has already checked the role. */
export function subjectOf(request: FastifyRequest): string {
  if (!request.auth) throw new AppError('UNAUTHENTICATED', 'A valid bearer token is required', 401);
  return request.auth.subjectId;
}

export const bearer = [{ bearerAuth: [] }];
