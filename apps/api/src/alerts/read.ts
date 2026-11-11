import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import {
  AlertSchema,
  AppError,
  ListQuerySchema,
  UuidSchema,
  systemClock,
  type Clock,
} from '@fairfold/contracts';
import { alerts, type Database } from '@fairfold/db';
import type { AuthContext } from '../auth.js';

function merchant(auth: AuthContext | null) {
  if (!auth) throw new AppError('UNAUTHENTICATED', 'A valid bearer token is required', 401);
  if (auth.role !== 'merchant')
    throw new AppError('FORBIDDEN', 'Only a merchant may read alerts', 403);
  return auth;
}

export function createAlertReads(database: Database, clock: Clock = systemClock) {
  type ListQuery = ReturnType<typeof ListQuerySchema.parse>;
  return {
    async list(authInput: AuthContext | null, query: ListQuery) {
      const auth = merchant(authInput);
      const parsed = ListQuerySchema.safeParse(query);
      if (!parsed.success || parsed.data.limit > 100)
        throw new AppError('INVALID_ALERT_QUERY', 'Alert query is invalid', 400);
      let after: SQL | undefined;
      if (parsed.data.cursor) {
        if (!UuidSchema.safeParse(parsed.data.cursor).success)
          throw new AppError('INVALID_CURSOR', 'Alert cursor is invalid', 400);
        const [anchor] = await database
          .select({ id: alerts.id })
          .from(alerts)
          .where(and(eq(alerts.id, parsed.data.cursor), eq(alerts.merchant_id, auth.subjectId)));
        if (!anchor) throw new AppError('INVALID_CURSOR', 'Alert cursor is invalid', 400);
        after = sql`(${alerts.created_at}, ${alerts.id}) < (select created_at, id from alerts where id = ${anchor.id})`;
      }
      const rows = await database
        .select()
        .from(alerts)
        .where(and(eq(alerts.merchant_id, auth.subjectId), after))
        .orderBy(desc(alerts.created_at), desc(alerts.id))
        .limit(parsed.data.limit);
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
        .set({ acknowledged_at: sql`coalesce(${alerts.acknowledged_at}, ${clock.now()})` })
        .where(and(eq(alerts.id, alertId), eq(alerts.merchant_id, auth.subjectId)))
        .returning({ id: alerts.id });
      if (!updated.length) throw new AppError('ALERT_NOT_FOUND', 'Alert was not found', 404);
      return { ok: true as const };
    },
  };
}
