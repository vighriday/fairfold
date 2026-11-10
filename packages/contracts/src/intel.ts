// Ishaan's route schemas (architecture section 11). Owned by Ishaan; reviewed by Hriday by pull request.
// Shared response shapes live in ai.ts, api.ts and sharedCause.ts; this file adds only what the
// intelligence endpoints need on top of them, plus the table of the 18 intelligence endpoints.
import { z } from 'zod';
import { BuyerSignalSchema, EvidencePackDraftSchema, StoreReportSchema } from './ai.js';
import {
  CatalogItemSchema,
  HypothesisDetailSchema,
  HypothesisSummarySchema,
  ReviewSchema,
  SignalContestSchema,
} from './api.js';
import { BandSchema, UuidSchema } from './common.js';

export const TrendSchema = z.object({
  weeks: z.array(
    z.object({
      weekStart: z.string(),
      value: z.string(),
      rate: z.number(),
      n: z.number().int(),
      k: z.number().int(),
    }),
  ),
});
export type Trend = z.infer<typeof TrendSchema>;

/** Endpoint 34: what a buyer may see of their own signal (no points total, no recommendation). */
export const BuyerSignalViewSchema = z.object({
  band: BandSchema,
  reasons: z.array(z.object({ code: z.string(), label: z.string(), points: z.number().int() })),
  simulatedNetworkUsed: z.boolean(),
});
export type BuyerSignalView = z.infer<typeof BuyerSignalViewSchema>;

export const IdParamsSchema = z.object({ id: UuidSchema });
export const DisputeParamsSchema = z.object({ id: z.string().min(1) });
export const PackParamsSchema = z.object({ id: z.string().min(1), packId: UuidSchema });
export const MerchantParamsSchema = z.object({ merchantId: UuidSchema });

/** Most items one page of an intelligence list returns; the catalogue and reviews are public endpoints. */
export const MAX_LIST_LIMIT = 100;
/**
 * Section 11: "list endpoints accept ?limit= (default 50) and ?cursor=". As in the order lists, the cursor is the id
 * of the last item already received (the catalogue's items have no id, so its cursor is `merchantId:sku`); an
 * unknown cursor is answered with 400 INVALID_CURSOR.
 */
export const IntelListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(MAX_LIST_LIMIT).default(50),
  cursor: z.string().min(1).max(300).optional(),
});
export type IntelListQuery = z.infer<typeof IntelListQuerySchema>;
export const CatalogQuerySchema = IntelListQuerySchema.extend({
  q: z.string().optional(),
  maxPrice: z.coerce.number().positive().optional(),
});
export const BuyerSignalQuerySchema = z.object({ merchantId: UuidSchema });
export const DismissBodySchema = z.object({ reason: z.string().trim().min(1).max(1000) }).strict();
export const ReviewReplyBodySchema = z
  .object({ text: z.string().trim().min(1).max(2000) })
  .strict();
export const ReportProblemFieldsSchema = z.object({ text: z.string().trim().min(1).max(4000) });
export const ReviewBodySchema = z
  .object({ rating: z.number().int().min(1).max(5), text: z.string().trim().min(1).max(4000) })
  .strict();
export const ContestBodySchema = z
  .object({ signalId: UuidSchema, text: z.string().trim().min(1).max(2000) })
  .strict();
export const ResolveContestBodySchema = z
  .object({
    status: z.enum(['upheld', 'corrected']),
    merchantNote: z.string().trim().min(1).max(2000),
  })
  .strict();
export const ComplaintIdResponseSchema = z.object({ complaintId: UuidSchema });
export const ContestIdResponseSchema = z.object({ contestId: UuidSchema });

export type IntelAuth = 'none' | 'merchant' | 'buyer';
export interface IntelRouteSpec {
  method: 'GET' | 'POST';
  path: string;
  auth: IntelAuth;
  response: z.ZodType | 'application/pdf';
}

/** The 18 endpoints of section 11 that Ishaan implements. */
export const INTEL_ROUTES = {
  5: {
    method: 'GET',
    path: '/api/stores/:merchantId/report',
    auth: 'none',
    response: StoreReportSchema,
  },
  6: { method: 'GET', path: '/api/catalog', auth: 'none', response: z.array(CatalogItemSchema) },
  9: {
    method: 'GET',
    path: '/api/orders/:id/buyer-signal',
    auth: 'merchant',
    response: BuyerSignalSchema,
  },
  19: {
    method: 'POST',
    path: '/api/disputes/:id/packs',
    auth: 'merchant',
    response: EvidencePackDraftSchema,
  },
  20: {
    method: 'GET',
    path: '/api/disputes/:id/packs/:packId/pdf',
    auth: 'merchant',
    response: 'application/pdf',
  },
  22: {
    method: 'GET',
    path: '/api/shared-causes',
    auth: 'merchant',
    response: z.array(HypothesisSummarySchema),
  },
  23: {
    method: 'GET',
    path: '/api/shared-causes/:id',
    auth: 'merchant',
    response: HypothesisDetailSchema,
  },
  24: {
    method: 'GET',
    path: '/api/shared-causes/:id/trend',
    auth: 'merchant',
    response: TrendSchema,
  },
  26: {
    method: 'POST',
    path: '/api/shared-causes/:id/confirm',
    auth: 'merchant',
    response: HypothesisDetailSchema,
  },
  27: {
    method: 'POST',
    path: '/api/shared-causes/:id/dismiss',
    auth: 'merchant',
    response: HypothesisDetailSchema,
  },
  29: { method: 'POST', path: '/api/reviews/:id/reply', auth: 'merchant', response: ReviewSchema },
  32: {
    method: 'POST',
    path: '/api/buyer/orders/:id/report-problem',
    auth: 'buyer',
    response: ComplaintIdResponseSchema,
  },
  33: {
    method: 'POST',
    path: '/api/buyer/orders/:id/review',
    auth: 'buyer',
    response: ReviewSchema,
  },
  34: { method: 'GET', path: '/api/buyer/signal', auth: 'buyer', response: BuyerSignalViewSchema },
  35: {
    method: 'POST',
    path: '/api/buyer/signal/contest',
    auth: 'buyer',
    response: ContestIdResponseSchema,
  },
  40: {
    method: 'GET',
    path: '/api/merchant/signal-contests',
    auth: 'merchant',
    response: z.array(SignalContestSchema),
  },
  41: {
    method: 'POST',
    path: '/api/merchant/signal-contests/:id/resolve',
    auth: 'merchant',
    response: SignalContestSchema,
  },
  42: {
    method: 'GET',
    path: '/api/stores/:merchantId/reviews',
    auth: 'none',
    response: z.array(ReviewSchema),
  },
} as const satisfies Record<number, IntelRouteSpec>;
