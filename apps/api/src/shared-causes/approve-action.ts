import { and, eq } from 'drizzle-orm';
import { AppError, UuidSchema, systemClock, type Clock } from '@fairfold/contracts';
import { actions, hypotheses, schema, type createDatabase } from '@fairfold/db';
import { type Jobs } from '@fairfold/jobs';
import type { AuthContext } from '../auth.js';

function merchant(auth: AuthContext | null): AuthContext & { role: 'merchant' } {
  if (!auth) throw new AppError('UNAUTHENTICATED', 'A valid bearer token is required', 401);
  if (auth.role !== 'merchant')
    throw new AppError('FORBIDDEN', 'Only a merchant may approve actions', 403);
  return { ...auth, role: 'merchant' };
}

export function createSharedCauseActionApproval(options: {
  database: Pick<ReturnType<typeof createDatabase>, 'pool'>;
  jobs: Pick<Jobs, 'publish'>;
  clock?: Clock;
}) {
  const clock = options.clock ?? systemClock;
  return async (
    authInput: AuthContext | null,
    hypothesisId: string,
    actionId: string,
    edits?: unknown,
  ) => {
    const auth = merchant(authInput);
    if (!UuidSchema.safeParse(hypothesisId).success || !UuidSchema.safeParse(actionId).success)
      throw new AppError('ACTION_NOT_FOUND', 'Action was not found', 404);
    const client = await options.database.pool.connect();
    try {
      return await (
        await import('drizzle-orm/node-postgres')
      )
        .drizzle(client, { schema })
        .transaction(async (tx) => {
          const [row] = await tx
            .select({ action: actions, hypothesis: hypotheses })
            .from(actions)
            .innerJoin(hypotheses, eq(hypotheses.id, actions.hypothesis_id))
            .where(
              and(
                eq(actions.id, actionId),
                eq(actions.hypothesis_id, hypothesisId),
                eq(hypotheses.merchant_id, auth.subjectId),
              ),
            )
            .for('update');
          if (!row) throw new AppError('ACTION_NOT_FOUND', 'Action was not found', 404);
          if (row.action.status !== 'proposed')
            throw new AppError(
              'ACTION_NOT_ACTIONABLE',
              'Only proposed actions may be approved',
              409,
            );
          const payload =
            edits && typeof edits === 'object' && !Array.isArray(edits)
              ? {
                  ...(row.action.payload as Record<string, unknown>),
                  ...(edits as Record<string, unknown>),
                }
              : row.action.payload;
          const approvedAt = clock.now();
          await tx
            .update(actions)
            .set({ payload, status: 'approved', approved_by: `merchant:${auth.subjectId}` })
            .where(eq(actions.id, actionId));
          const jobId = await options.jobs.publish(
            'action.approved',
            { actionId },
            { db: { executeSql: (query, values) => client.query(query, values) } },
          );
          if (!jobId)
            throw new AppError(
              'ACTION_JOB_NOT_CREATED',
              'Approved action could not be queued',
              503,
            );
          return { status: 'approved' as const, actionId, approvedAt: approvedAt.toISOString() };
        });
    } finally {
      client.release();
    }
  };
}
