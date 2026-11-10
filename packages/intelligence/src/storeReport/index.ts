// Store Report (task I4): metrics, band, verified-payment reviews with themes, domain facts and sources.
import { and, countDistinct, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  AppError,
  StoreReportSchema,
  UuidSchema,
  type Review,
  type StoreReport,
} from '@fairfold/contracts';
import {
  actions,
  complaints,
  disputes,
  hypotheses,
  merchants,
  orders,
  reviews,
  store_reports,
} from '@fairfold/db';
import { upsertComplaint } from '../complaints/create.js';
import { DEFAULT_PAGE, invalidCursor, pageAfter, type Page } from '../paging.js';
import { getIntelRuntime, type IntelRuntime } from '../runtime.js';
import { storeBand } from './bands.js';
import { computeFulfilment, WINDOW_DAYS, type FulfilmentInput } from './metrics.js';
import { isRealDomain, rdapRegisteredAt, rdapUrl } from './rdap.js';
import { reviewAverage, weightReviews } from './reviews.js';
import { themesReusing, type ThemesResult } from './themer.js';

const DAY_MS = 24 * 3600_000;

/**
 * The stored report also carries `themesInputHash`, the hash of the reviews its themes were made from. It is not
 * part of StoreReport: StoreReportSchema strips it, so endpoint 5 and the MCP tool never return it.
 */
const StoredThemesSchema = z.object({
  themesInputHash: z.string(),
  reviews: StoreReportSchema.shape.reviews.pick({ themes: true }),
});

async function storedThemes(rt: IntelRuntime, merchantId: string): Promise<ThemesResult | null> {
  const [row] = await rt.db
    .select({ report: store_reports.report })
    .from(store_reports)
    .where(eq(store_reports.merchant_id, merchantId));
  const parsed = StoredThemesSchema.safeParse(row?.report);
  return parsed.success
    ? { themes: parsed.data.reviews.themes, inputHash: parsed.data.themesInputHash }
    : null;
}
const PolicySchema = z.object({ kind: z.enum(['returns', 'shipping', 'contact']), url: z.url() });
const POLICY_LABEL = {
  returns: 'Returns policy',
  shipping: 'Shipping policy',
  contact: 'Contact page',
};

async function loadMerchant(rt: IntelRuntime, merchantId: string) {
  const [m] = await rt.db.select().from(merchants).where(eq(merchants.id, merchantId));
  if (!m) throw new AppError('MERCHANT_NOT_FOUND', 'Store not found', 404);
  return m;
}

async function fulfilmentInput(
  rt: IntelRuntime,
  merchantId: string,
  since: Date,
): Promise<FulfilmentInput> {
  const sealed = await rt.db
    .select({
      capturedAt: orders.captured_at,
      sealedAt: orders.sealed_at,
      trackingPushedAt: sql<Date | null>`(select min(l.server_time) from ledger_entries l where l.order_id = "orders"."id" and l.type = 'tracking_pushed')`,
      packAttestationStatus: sql<
        string | null
      >`(select a.status from attestations a where a.order_id = "orders"."id" and a.step = 'pack' order by a.created_at desc limit 1)`,
    })
    .from(orders)
    .where(and(eq(orders.merchant_id, merchantId), gte(orders.sealed_at, since)));

  const disputeRows = await rt.db
    .select({
      reason: disputes.reason,
      openedAt: sql<Date>`coalesce((${disputes.raw}->>'create_time')::timestamptz, ${disputes.updated_at})`,
    })
    .from(disputes)
    .where(eq(disputes.merchant_id, merchantId));

  const [captured] = await rt.db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(eq(orders.merchant_id, merchantId), gte(orders.captured_at, since)));

  const [refunds] = await rt.db
    .select({ n: sql<number>`count(*)::int` })
    .from(actions)
    .innerJoin(hypotheses, eq(hypotheses.id, actions.hypothesis_id))
    .where(
      and(
        eq(hypotheses.merchant_id, merchantId),
        eq(actions.type, 'proactive_refund'),
        eq(actions.status, 'done'),
        gte(actions.created_at, since),
      ),
    );
  const [messaged] = await rt.db
    .select({ n: countDistinct(hypotheses.id) })
    .from(hypotheses)
    .innerJoin(actions, eq(actions.hypothesis_id, hypotheses.id))
    .where(
      and(
        eq(hypotheses.merchant_id, merchantId),
        eq(hypotheses.status, 'confirmed'),
        gte(hypotheses.confirmed_at, since),
        eq(actions.type, 'send_buyer_messages'),
        eq(actions.status, 'done'),
      ),
    );

  const notReceived = await rt.db
    .select({
      createdAt: complaints.created_at,
      answered: sql<boolean>`exists (select 1 from messages m where m.order_id = "complaints"."order_id" and m.status = 'sent' and m.created_at >= "complaints"."created_at")
        or exists (select 1 from evidence_packs p where "complaints"."source" = 'dispute' and p.dispute_id = "complaints"."source_ref" and p.status = 'submitted')`,
    })
    .from(complaints)
    .where(
      and(
        eq(complaints.merchant_id, merchantId),
        sql`${complaints.extracted}->>'category' = 'not_received'`,
        gte(complaints.created_at, since),
      ),
    );

  return {
    orders: sealed.map((o) => ({
      ...o,
      trackingPushedAt: o.trackingPushedAt ? new Date(o.trackingPushedAt) : null,
    })),
    disputes: disputeRows.map((d) => ({ reason: d.reason, openedAt: new Date(d.openedAt) })),
    capturedInWindow: captured?.n ?? 0,
    proactiveFixes: (refunds?.n ?? 0) + Number(messaged?.n ?? 0),
    notReceivedComplaints: notReceived,
  };
}

/** Every review for the store with its weight (section 10 review rules), newest first. */
export async function listReviews(rt: IntelRuntime, merchantId: string): Promise<Review[]> {
  const rows = await rt.db
    .select()
    .from(reviews)
    .where(eq(reviews.merchant_id, merchantId))
    .orderBy(desc(reviews.created_at), desc(reviews.id));
  const buyerIds = [...new Set(rows.map((r) => r.buyer_id))];
  const stores = buyerIds.length
    ? await rt.db
        .select({ buyerId: orders.buyer_id, n: countDistinct(orders.merchant_id) })
        .from(orders)
        .where(and(inArray(orders.buyer_id, buyerIds), isNotNull(orders.captured_at)))
        .groupBy(orders.buyer_id)
    : [];
  const storesByBuyer = new Map(stores.map((s) => [s.buyerId!, Number(s.n)]));
  return weightReviews(
    rows.map((r) => ({ ...r, buyerId: r.buyer_id, createdAt: r.created_at })),
    storesByBuyer,
  ).map((r) => ({
    id: r.id,
    merchantId: r.merchant_id,
    orderId: r.order_id,
    rating: r.rating,
    text: r.text,
    merchantReply: r.merchant_reply,
    createdAt: r.created_at.toISOString(),
    weight: r.weight,
  }));
}

/**
 * Endpoint 42: one page of the store's reviews, newest first. Weights need every review (at most three per buyer
 * count, earliest first), so the whole list is weighted before the page is cut.
 */
export async function reviewPage(
  rt: IntelRuntime,
  merchantId: string,
  page: Page = DEFAULT_PAGE,
): Promise<Review[]> {
  if (page.cursor !== undefined && !UuidSchema.safeParse(page.cursor).success)
    throw invalidCursor();
  return pageAfter(await listReviews(rt, merchantId), (r) => r.id, page);
}

export async function buildStoreReportWith(
  rt: IntelRuntime,
  merchantId: string,
): Promise<StoreReport> {
  const merchant = await loadMerchant(rt, merchantId);
  const now = rt.clock.now();
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);

  let registeredAt = merchant.domain_registered_at;
  const realDomain = isRealDomain(merchant.domain, merchant.is_simulated);
  if (realDomain) {
    const found = await rdapRegisteredAt(merchant.domain, rt.fetch);
    if (found) {
      registeredAt = found;
      await rt.db
        .update(merchants)
        .set({ domain_registered_at: found })
        .where(eq(merchants.id, merchantId));
    }
  }

  const fulfilment = computeFulfilment(await fulfilmentInput(rt, merchantId, since), now);
  const allReviews = await listReviews(rt, merchantId);
  const counted = allReviews.filter((r) => r.weight > 0);
  const { themes, inputHash } = await themesReusing(
    counted,
    await storedThemes(rt, merchantId),
    rt.models.text,
  );

  const policies = z
    .array(z.unknown())
    .parse(merchant.policy_urls ?? [])
    .flatMap((p) => {
      const parsed = PolicySchema.safeParse(p);
      return parsed.success ? [parsed.data] : [];
    });
  const sources = policies.map((p) => ({ label: POLICY_LABEL[p.kind], url: p.url }));
  if (realDomain)
    sources.push({ label: 'Domain registration (RDAP)', url: rdapUrl(merchant.domain) });
  const base = rt.env.APP_BASE_URL;
  if (base && counted.length)
    sources.push({
      label: 'Verified-payment reviews',
      url: new URL(`/api/stores/${merchantId}/reviews`, base).toString(),
    });

  const report = StoreReportSchema.parse({
    merchantId,
    band: storeBand(fulfilment),
    facts: {
      domain: merchant.domain,
      domainRegisteredAt: registeredAt ? registeredAt.toISOString() : null,
      policies,
    },
    fulfilment,
    reviews: { count: counted.length, average: reviewAverage(counted), themes },
    sources,
    computedAt: now.toISOString(),
  });
  const stored = inputHash ? { ...report, themesInputHash: inputHash } : report;
  await rt.db
    .insert(store_reports)
    .values({ merchant_id: merchantId, report: stored, computed_at: now })
    .onConflictDoUpdate({
      target: store_reports.merchant_id,
      set: { report: stored, computed_at: now },
    });
  return report;
}

/** Section 15: buildStoreReport(merchantId). */
export function buildStoreReport(merchantId: string): Promise<StoreReport> {
  return buildStoreReportWith(getIntelRuntime(), merchantId);
}

/** Endpoint 5: the stored report, built now if the store has none yet. */
export async function storeReportFor(rt: IntelRuntime, merchantId: string): Promise<StoreReport> {
  const [row] = await rt.db
    .select({ report: store_reports.report })
    .from(store_reports)
    .where(eq(store_reports.merchant_id, merchantId));
  return row ? StoreReportSchema.parse(row.report) : buildStoreReportWith(rt, merchantId);
}

/** Endpoint 29: the merchant replies to a review of their own store. */
export async function replyToReview(
  rt: IntelRuntime,
  merchantId: string,
  reviewId: string,
  text: string,
): Promise<Review> {
  const [review] = await rt.db.select().from(reviews).where(eq(reviews.id, reviewId));
  if (!review) throw new AppError('REVIEW_NOT_FOUND', 'Review not found', 404);
  if (review.merchant_id !== merchantId)
    throw new AppError('FORBIDDEN', 'This review belongs to another store', 403);
  await rt.db.update(reviews).set({ merchant_reply: text }).where(eq(reviews.id, reviewId));
  return (await listReviews(rt, merchantId)).find((r) => r.id === reviewId)!;
}

const REVIEWABLE = new Set(['captured', 'packing', 'sealed', 'shipped', 'delivered', 'refunded']);

/**
 * Endpoint 33: one review per captured order, by its buyer. A 1–2 star review also becomes a complaint
 * (source 'review') for shared-cause detection; the store report is refreshed.
 */
export async function createReview(
  rt: IntelRuntime,
  buyerId: string,
  orderId: string,
  rating: number,
  text: string,
): Promise<Review> {
  const [order] = await rt.db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order not found', 404);
  if (order.buyer_id !== buyerId)
    throw new AppError('FORBIDDEN', 'This order belongs to another account', 403);
  if (!order.captured_at || !REVIEWABLE.has(order.status))
    throw new AppError('ORDER_NOT_CAPTURED', 'Only a paid order can be reviewed', 409);
  const [existing] = await rt.db
    .select({ id: reviews.id })
    .from(reviews)
    .where(eq(reviews.order_id, orderId));
  if (existing) throw new AppError('REVIEW_EXISTS', 'This order already has a review', 409);

  // The review, its complaint and their jobs commit together.
  await rt.db.transaction(async (tx) => {
    const [review] = await tx
      .insert(reviews)
      .values({
        merchant_id: order.merchant_id,
        order_id: orderId,
        buyer_id: buyerId,
        rating,
        text,
        created_at: rt.clock.now(),
      })
      .returning({ id: reviews.id });
    if (rating <= 2) {
      const complaint = await upsertComplaint(
        rt,
        {
          merchantId: order.merchant_id,
          orderId,
          buyerId,
          source: 'review',
          sourceRef: review!.id,
          text,
        },
        tx,
      );
      await rt.jobs.publish('complaint.created', { complaintId: complaint.id }, { tx });
    }
    await rt.jobs.publish('storereport.refresh', { merchantId: order.merchant_id }, { tx });
  });
  return (await listReviews(rt, order.merchant_id)).find((r) => r.orderId === orderId)!;
}
