import type { FastifyRequest, preHandlerHookHandler } from 'fastify';
import { SignJWT, jwtVerify } from 'jose';
import { AppError, RoleSchema, UuidSchema, type Clock, type Role } from '@fairfold/contracts';

export interface AuthContext {
  role: Role;
  subjectId: string;
}
declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

export function createAuth(secret: string, clock: Clock) {
  const key = new TextEncoder().encode(secret);
  return {
    async issue(context: AuthContext) {
      const seconds = Math.floor(clock.now().getTime() / 1000);
      return new SignJWT({ role: context.role })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(context.subjectId)
        .setIssuer('fairfold-demo')
        .setAudience('fairfold-api')
        .setIssuedAt(seconds)
        .setExpirationTime(seconds + 3600)
        .sign(key);
    },
    async authenticate(request: FastifyRequest) {
      const authorization = request.headers.authorization;
      if (!authorization) return;
      if (!authorization.startsWith('Bearer '))
        throw new AppError('UNAUTHENTICATED', 'A valid bearer token is required', 401);
      try {
        const { payload } = await jwtVerify(authorization.slice(7), key, {
          algorithms: ['HS256'],
          issuer: 'fairfold-demo',
          audience: 'fairfold-api',
          currentDate: clock.now(),
          requiredClaims: ['sub', 'role', 'exp'],
        });
        request.auth = {
          role: RoleSchema.parse(payload.role),
          subjectId: UuidSchema.parse(payload.sub),
        };
      } catch {
        throw new AppError('UNAUTHENTICATED', 'A valid bearer token is required', 401);
      }
    },
  };
}

export function requireAuth(role: Role | readonly Role[]): preHandlerHookHandler {
  const allowed = typeof role === 'string' ? [role] : role;
  return async (request) => {
    if (!request.auth)
      throw new AppError('UNAUTHENTICATED', 'A valid bearer token is required', 401);
    if (!allowed.includes(request.auth.role))
      throw new AppError('FORBIDDEN', 'This role cannot access the resource', 403);
  };
}

export function requireSubject(request: FastifyRequest, subjectId: string): void {
  if (!request.auth || request.auth.subjectId !== subjectId)
    throw new AppError('FORBIDDEN', 'This resource belongs to another account', 403);
}
