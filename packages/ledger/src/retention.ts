import { sql } from 'drizzle-orm';
import { systemClock, type Clock } from '@fairfold/contracts';
import type { Database } from '@fairfold/db';

const retentionMs = 180 * 24 * 60 * 60 * 1000;

export function createRetentionHandler(options: { database: Database; clock?: Clock }) {
  const clock = options.clock ?? systemClock;
  return async () => {
    const now = clock.now();
    const cutoff = new Date(now.getTime() - retentionMs);
    await options.database.transaction(async (tx) => {
      // Every known reference must be past its delivery window; unknown/unlinked ownership is retained.
      await tx.execute(sql`
      with refs as (
        select blob_sha256 as sha256, order_id from ledger_entries where blob_sha256 is not null
        union select unnest(photo_shas), order_id from attestations
        union select file->>'sha256', dispute.order_id from evidence_packs pack
          inner join disputes dispute on dispute.id = pack.dispute_id
          cross join lateral jsonb_array_elements(pack.files) file
      )
      update evidence_blobs as blob
      set bytes = null, purged_at = ${now}
      where blob.bytes is not null
        and blob.created_at < ${cutoff}
        and exists (select 1 from refs where refs.sha256 = blob.sha256)
        and not exists (
          select 1
          from refs
          left join orders as reference_order on reference_order.id = refs.order_id
          where refs.sha256 = blob.sha256
            and (
              reference_order.delivered_at is null
              or reference_order.delivered_at >= ${cutoff}
            )
        )
    `);
    });
  };
}
