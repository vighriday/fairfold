import { and, eq, isNotNull, sql } from 'drizzle-orm';
import {
  AppError,
  UuidSchema,
  systemClock,
  type Clock,
  type ForMerchant,
} from '@fairfold/contracts';
import { merchants, type Database } from '@fairfold/db';
import { type Jobs } from '@fairfold/jobs';
import { pendingDisputeSync, type DisputeSynchronizer } from './event-handler.js';

const historyMs = 180 * 24 * 60 * 60 * 1000;
const overlapMs = 2 * 60 * 1000;

/** Watermarks are volatile: restart replays the full supported history instead of skipping data. */
export function createDisputesPoller(options: {
  forMerchant: ForMerchant;
  isRealMerchant: (merchantId: string) => Promise<boolean>;
  syncDispute?: DisputeSynchronizer;
  clock?: Clock;
}) {
  const clock = options.clock ?? systemClock;
  const watermarks = new Map<string, number>();
  const running = new Map<string, Promise<void>>();
  async function run(merchantId: string) {
    if (!UuidSchema.safeParse(merchantId).success || !(await options.isRealMerchant(merchantId)))
      throw new AppError('MERCHANT_NOT_AVAILABLE', 'Poll merchant is unavailable', 409);
    const startedAt = clock.now().getTime();
    if (!Number.isFinite(startedAt)) throw new Error('Invalid poll clock');
    const floor = startedAt - historyMs + 1000;
    const since = Math.min(startedAt, Math.max(floor, watermarks.get(merchantId) ?? floor));
    const paypal = await options.forMerchant(merchantId);
    const seen = new Set<string>();
    let nextPageToken: string | undefined;
    for (let page = 0; page < 100; page++) {
      const result = await paypal.disputes.list({
        updateTimeAfter: new Date(since).toISOString(),
        pageSize: 50,
        ...(nextPageToken ? { nextPageToken } : {}),
      });
      if (result.items.length > 50)
        throw new AppError(
          'DISPUTES_POLL_PAGE_INVALID',
          'Dispute page exceeds its requested size',
          502,
        );
      for (const item of result.items) {
        const source = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        const disputeId = source.dispute_id ?? source.id;
        if (typeof disputeId !== 'string' || !/^[A-Za-z0-9_-]{1,255}$/.test(disputeId))
          throw new AppError(
            'DISPUTES_POLL_ITEM_INVALID',
            'Dispute list item has no usable ID',
            502,
          );
        await (options.syncDispute ?? pendingDisputeSync)({ merchantId, disputeId });
      }
      if (result.nextPageToken === null) {
        watermarks.set(merchantId, Math.max(floor, startedAt - overlapMs));
        return;
      }
      if (!result.nextPageToken || seen.has(result.nextPageToken))
        throw new AppError('DISPUTES_POLL_CURSOR_LOOP', 'Dispute pagination did not progress', 502);
      seen.add(result.nextPageToken);
      nextPageToken = result.nextPageToken;
    }
    throw new AppError(
      'DISPUTES_POLL_PAGE_LIMIT',
      'Dispute reconciliation exceeded its local page budget',
      503,
    );
  }
  return ({ merchantId }: { merchantId: string }) => {
    const active = running.get(merchantId);
    if (active) return active;
    const pending = run(merchantId).finally(() => {
      running.delete(merchantId);
    });
    running.set(merchantId, pending);
    return pending;
  };
}

export async function syncDisputePollSchedules(options: {
  database: Database;
  jobs: Pick<Jobs, 'boss'>;
}) {
  const real = await options.database
    .select({ id: merchants.id })
    .from(merchants)
    .where(
      and(
        eq(merchants.is_simulated, false),
        isNotNull(merchants.paypal_client_id),
        isNotNull(merchants.paypal_client_secret_enc),
        sql`length(trim(${merchants.paypal_client_id})) > 0`,
        sql`length(trim(${merchants.paypal_client_secret_enc})) > 0`,
      ),
    );
  const ids = new Set(real.map((merchant) => merchant.id));
  for (const schedule of await options.jobs.boss.getSchedules('disputes.poll')) {
    if (!ids.has(schedule.key)) await options.jobs.boss.unschedule('disputes.poll', schedule.key);
  }
  for (const merchantId of ids)
    await options.jobs.boss.schedule(
      'disputes.poll',
      '* * * * *',
      { merchantId },
      {
        tz: 'UTC',
        key: merchantId,
        singletonKey: merchantId,
        singletonSeconds: 60,
      },
    );
  return { scheduledMerchants: ids.size };
}
