import { and, desc, eq } from 'drizzle-orm';
import { AlertSchema, AppError, ListQuerySchema } from '@fairfold/contracts';
import { alerts, type Database } from '@fairfold/db';
import type { AuthContext } from '../auth.js';

function merchant(auth: AuthContext | null) {
  if (!auth) throw new AppError('UNAUTHENTICATED', 'A valid bearer token is required', 401);
  if (auth.role !== 'merchant')
    throw new AppError('FORBIDDEN', 'Only a merchant may read alerts', 403);
  return auth;
}

export function createAlertReads(database: Database) {
  type ListQuery = ReturnType<typeof ListQuerySchema.parse>;
  return {
    async list(authInput: AuthContext | null, query: ListQuery) {
      const auth = merchant(authInput);
      const rows = await database
        .select()
        .from(alerts)
        .where(eq(alerts.merchant_id, auth.subjectId))
        .orderBy(desc(alerts.created_at))
        .limit(query.limit);
      return rows.map((row) =>
        AlertSchema.parse({
          id: row.id,
          type: row.type,
          orderId: row.order_id,
          refId: row.ref_id,
          message: row.message,
          createdAt: row.created_at.toISOString(),
          acknowledgedAt: row.acknowledged_at?.toISOString() ?? null,
        }),
      );
    },
    async acknowledge(authInput: AuthContext | null, alertId: string) {
      const auth = merchant(authInput);
      const updated = await database
        .update(alerts)
        .set({ acknowledged_at: new Date() })
        .where(and(eq(alerts.id, alertId), eq(alerts.merchant_id, auth.subjectId)))
        .returning({ id: alerts.id });
      if (!updated.length) throw new AppError('ALERT_NOT_FOUND', 'Alert was not found', 404);
      return { ok: true as const };
    },
  };
}
