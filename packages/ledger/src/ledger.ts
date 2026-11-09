import { asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  AppError,
  LedgerEntryTypeSchema,
  systemClock,
  UuidSchema,
  type Clock,
} from '@fairfold/contracts';
import { ledger_entries, orders, type Database } from '@fairfold/db';
import { canonicalJson, sha256 } from './canonical.js';

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type DatabaseExecutor = Database | Transaction;
export const GenesisHash = '0'.repeat(64);
const AppendSchema = z
  .object({
    type: LedgerEntryTypeSchema,
    payload: z.json(),
    blob_sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable()
      .optional(),
    actor: z
      .string()
      .regex(/^(system|paypal|merchant:[a-f0-9-]{36}|buyer:[a-f0-9-]{36})$/)
      .default('system'),
  })
  .strict();
export type AppendEntry = z.input<typeof AppendSchema>;
type Entry = typeof ledger_entries.$inferSelect;

function hashContent(
  entry: Pick<
    Entry,
    'order_id' | 'seq' | 'type' | 'payload' | 'blob_sha256' | 'actor' | 'server_time'
  >,
) {
  return canonicalJson({
    order_id: entry.order_id,
    seq: entry.seq,
    type: entry.type,
    payload: entry.payload,
    blob_sha256: entry.blob_sha256,
    actor: entry.actor,
    server_time: entry.server_time.toISOString(),
  });
}

export function createLedger(database: DatabaseExecutor, clock: Clock = systemClock) {
  return {
    async append(orderId: string, input: AppendEntry): Promise<Entry> {
      UuidSchema.parse(orderId);
      const entry = AppendSchema.parse(input);
      canonicalJson(entry.payload);
      return database.transaction(async (tx) => {
        const locked = await tx.execute(
          sql`select id from orders where id = ${orderId} for update`,
        );
        if (locked.rows.length === 0) throw new AppError('ORDER_NOT_FOUND', 'Order not found', 404);
        const [last] = await tx
          .select()
          .from(ledger_entries)
          .where(eq(ledger_entries.order_id, orderId))
          .orderBy(desc(ledger_entries.seq))
          .limit(1);
        const serverTime = new Date(Math.trunc(clock.now().getTime()));
        if (!Number.isFinite(serverTime.getTime())) throw new Error('Invalid ledger clock');
        const content = {
          order_id: orderId,
          seq: (last?.seq ?? 0) + 1,
          type: entry.type,
          payload: entry.payload,
          blob_sha256: entry.blob_sha256 ?? null,
          actor: entry.actor,
          server_time: serverTime,
        };
        const prevHash = last?.entry_hash ?? GenesisHash;
        const [stored] = await tx
          .insert(ledger_entries)
          .values({
            ...content,
            prev_hash: prevHash,
            entry_hash: sha256(prevHash + hashContent(content)),
          })
          .returning();
        if (!stored) throw new Error('Ledger insert did not return a row');
        return stored;
      });
    },
    async verify(orderId: string) {
      UuidSchema.parse(orderId);
      const [order] = await database
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.id, orderId));
      if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order not found', 404);
      const entries = await database
        .select()
        .from(ledger_entries)
        .where(eq(ledger_entries.order_id, orderId))
        .orderBy(asc(ledger_entries.seq));
      let previous = GenesisHash;
      let expected = 1;
      for (const entry of entries) {
        if (
          entry.seq !== expected ||
          entry.prev_hash !== previous ||
          sha256(previous + hashContent(entry)) !== entry.entry_hash
        ) {
          return { entries, verified: false, brokenAtSeq: expected };
        }
        previous = entry.entry_hash;
        expected++;
      }
      return { entries, verified: true, brokenAtSeq: null };
    },
  };
}
