// Buyer Signal service (task I3): compute and store per order, the buyer's own view, and contests.
import { and, desc, eq, sql } from 'drizzle-orm';
import { AppError, type BuyerSignal, type SignalContest } from '@fairfold/contracts';
import type { BuyerSignalView } from '@fairfold/contracts/intel';
import { alerts, buyer_signals, signal_contests } from '@fairfold/db';
import type { DatabaseExecutor } from '@fairfold/ledger';
import { getIntelRuntime, type IntelRuntime } from '../runtime.js';
import { buyerFeatures, loadOrder } from './features.js';
import { scoreBuyer, type BuyerFeatures } from './points.js';
import { explainSignal } from './sentence.js';

type SignalRow = typeof buyer_signals.$inferSelect;
/** buyer_signals has no sentence column, so the stored features carry it (DECISIONS.md I-D6). */
interface StoredFeatures extends BuyerFeatures {
  sentence: string;
}

function toSignal(row: SignalRow): BuyerSignal {
  const features = row.features as StoredFeatures;
  const reasons = row.reasons as BuyerSignal['reasons'];
  return {
    band: row.band as BuyerSignal['band'],
    points: row.points,
    reasons,
    recommendation: row.recommendation,
    sentence: features.sentence,
    simulatedNetworkUsed: reasons.some((r) => r.code === 'NETWORK_DISPUTES_LOST'),
  };
}

/** The order's latest stored signal, if one exists. */
async function storedSignal(db: DatabaseExecutor, orderId: string): Promise<SignalRow | undefined> {
  const [row] = await db
    .select()
    .from(buyer_signals)
    .where(eq(buyer_signals.order_id, orderId))
    .orderBy(desc(buyer_signals.computed_at), desc(buyer_signals.id))
    .limit(1);
  return row;
}

/**
 * The order's Buyer Signal, computed once per order at capture (section 10). The first call scores the order and
 * stores the signal; every later call — a redelivered order.captured job, the merchant's order page — returns that
 * stored signal, so the band cannot drift after capture and the model writes the sentence once. Concurrent first
 * calls are serialised per order by a transaction-scoped advisory lock, so exactly one row is written.
 * An order without a buyer has nothing to store (buyer_signals.buyer_id is required) and is scored on each call.
 */
export async function computeBuyerSignalWith(
  rt: IntelRuntime,
  orderId: string,
): Promise<BuyerSignal> {
  const existing = await storedSignal(rt.db, orderId);
  if (existing) return toSignal(existing);

  const order = await loadOrder(rt, orderId);
  const features = await buyerFeatures(rt, order);
  const scored = scoreBuyer(features);
  const sentence = await explainSignal(scored, rt.models.text);
  const signal: BuyerSignal = { ...scored, sentence };
  const buyerId = order.buyer_id;
  if (!buyerId) return signal;

  return rt.db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`fairfold:buyer_signal:${orderId}`}, 0))`,
    );
    const raced = await storedSignal(tx, orderId);
    if (raced) return toSignal(raced);
    const stored: StoredFeatures = { ...features, sentence };
    await tx.insert(buyer_signals).values({
      merchant_id: order.merchant_id,
      buyer_id: buyerId,
      order_id: order.id,
      band: signal.band,
      points: signal.points,
      reasons: signal.reasons,
      features: stored,
      recommendation: signal.recommendation,
      computed_at: rt.clock.now(),
    });
    return signal;
  });
}

/** Section 15: computeBuyerSignal(orderId) — the order's stored signal, computed on first use. */
export function computeBuyerSignal(orderId: string): Promise<BuyerSignal> {
  return computeBuyerSignalWith(getIntelRuntime(), orderId);
}

/** Endpoint 9: the signal for the merchant's own order. */
export async function orderSignalForMerchant(
  rt: IntelRuntime,
  merchantId: string,
  orderId: string,
): Promise<BuyerSignal> {
  const order = await loadOrder(rt, orderId);
  if (order.merchant_id !== merchantId)
    throw new AppError('FORBIDDEN', 'This order belongs to another store', 403);
  return computeBuyerSignalWith(rt, orderId);
}

/** Endpoint 34: a buyer sees their own latest band and reasons with one store, never the points total. */
export async function buyerOwnSignal(
  rt: IntelRuntime,
  buyerId: string,
  merchantId: string,
): Promise<BuyerSignalView & { signalId: string }> {
  const [row] = await rt.db
    .select()
    .from(buyer_signals)
    .where(and(eq(buyer_signals.buyer_id, buyerId), eq(buyer_signals.merchant_id, merchantId)))
    .orderBy(desc(buyer_signals.computed_at))
    .limit(1);
  if (!row)
    throw new AppError(
      'SIGNAL_NOT_FOUND',
      'No signal has been computed for you at this store',
      404,
    );
  const s = toSignal(row);
  return {
    signalId: row.id,
    band: s.band,
    reasons: s.reasons,
    simulatedNetworkUsed: s.simulatedNetworkUsed,
  };
}

function toContest(row: typeof signal_contests.$inferSelect): SignalContest {
  return {
    id: row.id,
    buyerId: row.buyer_id,
    signalId: row.signal_id,
    text: row.text,
    status: row.status as SignalContest['status'],
    merchantNote: row.merchant_note,
    createdAt: row.created_at.toISOString(),
  };
}

/** Endpoint 35: records the contest and raises a signal_contest alert for the merchant. */
export async function contestSignal(
  rt: IntelRuntime,
  buyerId: string,
  signalId: string,
  text: string,
): Promise<{ contestId: string }> {
  const [signal] = await rt.db.select().from(buyer_signals).where(eq(buyer_signals.id, signalId));
  if (!signal) throw new AppError('SIGNAL_NOT_FOUND', 'Signal not found', 404);
  if (signal.buyer_id !== buyerId)
    throw new AppError('FORBIDDEN', 'This signal belongs to another account', 403);
  return rt.db.transaction(async (tx) => {
    const [contest] = await tx
      .insert(signal_contests)
      .values({ buyer_id: buyerId, signal_id: signalId, text, created_at: rt.clock.now() })
      .returning();
    await tx.insert(alerts).values({
      merchant_id: signal.merchant_id,
      order_id: signal.order_id,
      type: 'signal_contest',
      ref_id: contest!.id,
      message: 'A buyer contested their buyer signal. Review their note and uphold or correct it.',
      created_at: rt.clock.now(),
    });
    return { contestId: contest!.id };
  });
}

/** Endpoint 40: contests on this merchant's signals, newest first. */
export async function listContests(rt: IntelRuntime, merchantId: string): Promise<SignalContest[]> {
  const rows = await rt.db
    .select({ contest: signal_contests })
    .from(signal_contests)
    .innerJoin(buyer_signals, eq(buyer_signals.id, signal_contests.signal_id))
    .where(eq(buyer_signals.merchant_id, merchantId))
    .orderBy(desc(signal_contests.created_at));
  return rows.map((r) => toContest(r.contest));
}

/** Endpoint 41: the merchant upholds or corrects; only an open contest on their own signal. */
export async function resolveContest(
  rt: IntelRuntime,
  merchantId: string,
  contestId: string,
  status: 'upheld' | 'corrected',
  merchantNote: string,
): Promise<SignalContest> {
  const [found] = await rt.db
    .select({ contest: signal_contests, merchantId: buyer_signals.merchant_id })
    .from(signal_contests)
    .innerJoin(buyer_signals, eq(buyer_signals.id, signal_contests.signal_id))
    .where(eq(signal_contests.id, contestId));
  if (!found) throw new AppError('CONTEST_NOT_FOUND', 'Contest not found', 404);
  if (found.merchantId !== merchantId)
    throw new AppError('FORBIDDEN', 'This contest belongs to another store', 403);
  if (found.contest.status !== 'open')
    throw new AppError('CONTEST_RESOLVED', 'This contest is already resolved', 409);
  const [row] = await rt.db
    .update(signal_contests)
    .set({ status, merchant_note: merchantNote })
    .where(eq(signal_contests.id, contestId))
    .returning();
  return toContest(row!);
}
