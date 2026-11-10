import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { AppError, systemClock, type Clock, type ForMerchant } from '@fairfold/contracts';
import { merchants, paypal_events, schema, type createDatabase } from '@fairfold/db';
import { type Jobs } from '@fairfold/jobs';
import { minimizeEvent, type VerifiedEvent } from './event-policy.js';

export function createEventIngress(options: {
  database: Pick<ReturnType<typeof createDatabase>, 'db' | 'pool'>;
  jobs: Pick<Jobs, 'publish'>;
  forMerchant: ForMerchant;
  clock?: Clock;
}) {
  const clock = options.clock ?? systemClock;
  return async (slug: string, headers: Record<string, string>, bytes: Buffer) => {
    const [merchant] = await options.database.db
      .select()
      .from(merchants)
      .where(and(eq(merchants.slug, slug), eq(merchants.is_simulated, false)));
    if (!merchant) throw new AppError('MERCHANT_NOT_FOUND', 'Merchant not found', 404);
    if (!merchant.paypal_webhook_id)
      throw new AppError('WEBHOOK_NOT_CONFIGURED', 'Merchant webhook is not configured', 409);
    const raw = bytes.toString('utf8');
    if (!Buffer.from(raw, 'utf8').equals(bytes))
      throw new AppError('WEBHOOK_EVENT_INVALID', 'Event must be valid UTF-8', 400);
    const paypal = await options.forMerchant(merchant.id);
    let verified: boolean;
    try {
      verified = await paypal.webhooks.verify(headers, raw, merchant.paypal_webhook_id);
    } catch {
      throw new AppError(
        'WEBHOOK_VERIFICATION_UNAVAILABLE',
        'Signature verification is unavailable',
        503,
      );
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new AppError('WEBHOOK_EVENT_INVALID', 'Event JSON is invalid', 400);
    }
    const payload = minimizeEvent(body, verified);
    const trusted = verified ? (payload as VerifiedEvent) : undefined;
    const now = new Date(clock.now());
    if (!Number.isFinite(now.getTime())) throw new Error('Invalid webhook clock');
    const client = await options.database.pool.connect();
    try {
      await drizzle(client, { schema }).transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${payload.id}, 0))`);
        const [existing] = await tx
          .select()
          .from(paypal_events)
          .where(eq(paypal_events.id, payload.id))
          .for('update');
        if (existing?.verified) {
          if (verified && existing.merchant_id !== merchant.id)
            throw new AppError(
              'WEBHOOK_MERCHANT_CONFLICT',
              'Event belongs to another merchant',
              409,
            );
          return;
        }
        const values = {
          id: payload.id,
          event_type: payload.event_type,
          resource_type: trusted?.resource_type ?? null,
          resource_id: trusted?.resource.dispute_id ?? trusted?.resource.id ?? null,
          merchant_id: merchant.id,
          payload,
          verified,
          received_at: now,
          processed_at: null,
          error: verified ? null : 'WEBHOOK_SIGNATURE_INVALID',
        };
        if (existing && verified)
          await tx.update(paypal_events).set(values).where(eq(paypal_events.id, payload.id));
        else await tx.insert(paypal_events).values(values).onConflictDoNothing();
        if (verified) {
          const job = await options.jobs.publish(
            'paypal.event',
            { eventId: payload.id },
            { db: { executeSql: (query, values) => client.query(query, values) } },
          );
          if (!job)
            throw new AppError('WEBHOOK_QUEUE_UNAVAILABLE', 'Event could not be queued', 503);
        }
      });
    } finally {
      client.release();
    }
    if (!verified)
      throw new AppError('WEBHOOK_SIGNATURE_INVALID', 'Signature verification failed', 400);
  };
}
