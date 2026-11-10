import { sql } from 'drizzle-orm';
import { systemClock, type Clock } from '@fairfold/contracts';
import type { Database } from '@fairfold/db';

const retentionMs = 180 * 24 * 60 * 60 * 1000;

export function createRetentionHandler(options: { database: Database; clock?: Clock }) {
  const clock = options.clock ?? systemClock;
  return async () => {
    const now = clock.now();
    const cutoff = new Date(now.getTime() - retentionMs);
    await options.database.execute(sql`
      update evidence_blobs as blob
      set bytes = null, purged_at = ${now}
      where blob.bytes is not null
        and blob.created_at < ${cutoff}
        and not exists (
          select 1
          from ledger_entries as entry
          inner join orders as reference_order on reference_order.id = entry.order_id
          where entry.blob_sha256 = blob.sha256
            and (
              reference_order.delivered_at is null
              or reference_order.delivered_at >= ${cutoff}
            )
        )
    `);
  };
}
