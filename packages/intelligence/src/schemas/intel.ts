// Zod schemas for Ishaan's routes (section 11) and for model outputs (section 10).
// Destined for packages/contracts/src/intel.ts by pull request to Hriday (DECISIONS.md I-D4).
import { z } from 'zod';

const uuid = z.string().min(1);
const isoTime = z.string().min(1);
const unit = z.number().min(0).max(1);

export const MoneySchema = z.object({
  currency_code: z.string().length(3),
  value: z.string().regex(/^\d+(\.\d{1,2})?$/, 'decimal string such as "38.00"'),
});

export const BandSchema = z.enum(['green', 'yellow', 'red', 'grey']);
export const StoreBandSchema = z.enum(['verified', 'standard', 'caution', 'new']);
export const DimensionSchema = z.enum(['batch_code', 'carrier', 'listing_version', 'packer', 'ship_week', 'ship_to_country']);
export const RecommendationSchema = z.enum(['provide_evidence', 'make_offer', 'accept_claim', 'inspect_first', 'merchant_decides']);
export const ComplaintCategorySchema = z.enum([
  'product_defect', 'wrong_item', 'size_fit', 'not_as_pictured', 'damaged_in_transit', 'not_received', 'late', 'other',
]);
export const SeveritySchema = z.enum(['cosmetic', 'functional', 'safety']);

// ---------- section 10: model outputs ----------
export const AttestationResultSchema = z.object({
  items: z.array(z.object({
    orderItemId: z.string(),
    seen: z.object({ itemType: z.string(), colour: z.string(), sizeLabel: z.string().nullable(), quantity: z.number().int().min(0) }),
    matches: z.boolean(),
    confidence: unit,
    notes: z.string(),
  })),
  batchLabelText: z.string().nullable(),
  shippingLabel: z.object({ visible: z.boolean(), trackingNumberText: z.string().nullable() }),
  defects: z.array(z.object({ component: z.string(), description: z.string(), severity: SeveritySchema })),
  inspection: z.object({ instruction: z.string(), defectVisible: z.boolean(), matchesCluster: z.boolean() }).nullable(),
  couldNotVerify: z.array(z.string()),
  confidence: unit,
});

export const ComplaintExtractionSchema = z.object({
  category: ComplaintCategorySchema,
  component: z.string().nullable(),
  failureMode: z.string().nullable(),
  locationOnItem: z.string().nullable(),
  severity: SeveritySchema,
  summary: z.string().max(140),
  language: z.string().min(2),
});

// ---------- section 10: computed outputs ----------
export const BuyerSignalSchema = z.object({
  band: BandSchema,
  points: z.number().int(),
  reasons: z.array(z.object({ code: z.string(), label: z.string(), points: z.number().int() })),
  recommendation: z.string(),
  sentence: z.string(),
  simulatedNetworkUsed: z.boolean(),
});

export const StoreReportSchema = z.object({
  merchantId: uuid,
  band: StoreBandSchema,
  facts: z.object({
    domain: z.string(),
    domainRegisteredAt: isoTime.nullable(),
    policies: z.array(z.object({ kind: z.enum(['returns', 'shipping', 'contact']), url: z.string().url() })),
  }),
  fulfilment: z.object({
    ordersSealed90d: z.number().int().min(0),
    medianHoursCaptureToSeal: z.number().min(0).nullable(),
    pctTrackingWithin72h: unit,
    pctWithPackingEvidence: unit,
    disputeRate90d: z.number().min(0),
    proactiveFixes90d: z.number().int().min(0),
    unansweredNotReceived: z.number().int().min(0),
  }),
  reviews: z.object({
    count: z.number().int().min(0),
    average: z.number().min(1).max(5).nullable(),
    themes: z.array(z.object({ label: z.string(), count: z.number().int().min(0), tone: z.enum(['positive', 'negative']), reviewIds: z.array(z.string()) })),
  }),
  sources: z.array(z.object({ label: z.string(), url: z.string().url() })),
  computedAt: isoTime,
});

export const EvidencePackDraftSchema = z.object({
  recommendation: RecommendationSchema,
  rationale: z.array(z.string()),
  evidences: z.array(z.unknown()),
  files: z.array(z.object({ sha256: z.string(), filename: z.string(), mime: z.enum(['application/pdf', 'image/jpeg', 'image/png']) })),
  actionParams: z.object({
    offerType: z.string().optional(),
    acceptClaimType: z.string().optional(),
    amount: z.object({ currency_code: z.string(), value: z.string() }).optional(),
    note: z.string(),
  }).nullable(),
  narrative: z.string().max(2000),
  sharedContext: z.object({ hypothesisId: z.string(), status: z.enum(['open', 'confirmed']), summary: z.string() }).nullable(),
  confidence: unit,
});

// ---------- section 9: shared cause ----------
export const ValueTestSchema = z.object({
  dimension: DimensionSchema,
  value: z.string(),
  n: z.number().int(), k: z.number().int(), exposureDays: z.number(),
  nRest: z.number().int(), kRest: z.number().int(), exposureDaysRest: z.number(),
  rateRatio: z.number(), p: z.number(), q: z.number(),
  wilson95: z.tuple([z.number(), z.number()]),
  wilson95Rest: z.tuple([z.number(), z.number()]),
});

export const HypothesisStatsSchema = z.object({
  horizonDays: z.number().int(),
  testsRun: z.number().int(),
  primary: ValueTestSchema,
  confounders: z.object({
    medianDaysSinceDelivery: z.object({ value: z.number(), rest: z.number() }),
    spread: z.array(z.object({ dimension: DimensionSchema, distinctValues: z.number().int(), topShare: z.number() })),
    coincidesWithListingChange: z.boolean(),
  }),
});

export const AffectedOrdersSchema = z.object({
  unshipped: z.array(z.string()), inTransit: z.array(z.string()),
  deliveredNoComplaint: z.array(z.string()), openDisputes: z.array(z.string()),
});

export const HypothesisSummarySchema = z.object({
  id: uuid, headline: z.string(), status: z.string(), strength: z.enum(['strong', 'possible']),
  dimension: DimensionSchema, value: z.string(), complaintCount: z.number().int(), unshippedCount: z.number().int(),
  safetyFlag: z.boolean(), createdAt: isoTime,
});

export const HypothesisDetailSchema = z.object({
  id: uuid,
  status: z.enum(['open', 'confirmed', 'dismissed', 'resolved']),
  strength: z.enum(['strong', 'possible']),
  headline: z.string(),
  explanation: z.string(),
  cluster: z.object({
    id: uuid, label: z.string(), category: z.string(),
    complaints: z.array(z.object({ id: uuid, orderId: z.string(), summary: z.string(), createdAt: isoTime, source: z.string() })),
  }),
  stats: HypothesisStatsSchema,
  alternatives: z.array(ValueTestSchema),
  affected: AffectedOrdersSchema,
  actions: z.array(z.object({ id: uuid, type: z.string(), status: z.string(), payload: z.unknown() })),
  safetyFlag: z.boolean(),
});

export const TrendSchema = z.object({
  weeks: z.array(z.object({ weekStart: z.string(), value: z.string(), rate: z.number(), n: z.number().int(), k: z.number().int() })),
});

// ---------- section 11: other responses ----------
export const ReviewSchema = z.object({
  id: uuid, merchantId: uuid, orderId: uuid, rating: z.number().int().min(1).max(5), text: z.string(),
  merchantReply: z.string().nullable(), createdAt: isoTime, weight: z.number().min(0).max(1),
});

export const SignalContestSchema = z.object({
  id: uuid, buyerId: uuid, signalId: uuid, text: z.string(), status: z.enum(['open', 'upheld', 'corrected']),
  merchantNote: z.string().nullable(), createdAt: isoTime,
});

export const CatalogItemSchema = z.object({
  merchantId: uuid, sku: z.string(), name: z.string(), price: MoneySchema, storeBand: StoreBandSchema,
});

export const BuyerSignalViewSchema = z.object({
  band: BandSchema,
  reasons: z.array(z.object({ code: z.string(), label: z.string(), points: z.number().int() })),
  simulatedNetworkUsed: z.boolean(),
});

// ---------- section 11: requests ----------
export const IdParamsSchema = z.object({ id: uuid });
export const PackParamsSchema = z.object({ id: z.string().min(1), packId: uuid });
export const MerchantParamsSchema = z.object({ merchantId: uuid });
export const CatalogQuerySchema = z.object({ q: z.string().optional(), maxPrice: z.coerce.number().positive().optional() });
export const BuyerSignalQuerySchema = z.object({ merchantId: uuid });
export const DismissBodySchema = z.object({ reason: z.string().min(1).max(1000) });
export const ReviewReplyBodySchema = z.object({ text: z.string().min(1).max(2000) });
export const ReportProblemFieldsSchema = z.object({ text: z.string().min(1).max(4000) });
export const ReviewBodySchema = z.object({ rating: z.number().int().min(1).max(5), text: z.string().min(1).max(4000) });
export const ContestBodySchema = z.object({ signalId: uuid, text: z.string().min(1).max(2000) });
export const ResolveContestBodySchema = z.object({ status: z.enum(['upheld', 'corrected']), merchantNote: z.string().min(1).max(2000) });

// ---------- the 18 Ishaan endpoints of section 11 ----------
export type Auth = 'none' | 'merchant' | 'buyer';
export interface RouteSpec { method: 'GET' | 'POST'; path: string; auth: Auth; body?: z.ZodType; query?: z.ZodType; response?: z.ZodType }

export const INTEL_ROUTES: Record<number, RouteSpec> = {
  5: { method: 'GET', path: '/api/stores/:merchantId/report', auth: 'none', response: StoreReportSchema },
  6: { method: 'GET', path: '/api/catalog', auth: 'none', query: CatalogQuerySchema, response: z.array(CatalogItemSchema) },
  9: { method: 'GET', path: '/api/orders/:id/buyer-signal', auth: 'merchant', response: BuyerSignalSchema },
  19: { method: 'POST', path: '/api/disputes/:id/packs', auth: 'merchant', response: EvidencePackDraftSchema },
  20: { method: 'GET', path: '/api/disputes/:id/packs/:packId/pdf', auth: 'merchant' },
  22: { method: 'GET', path: '/api/shared-causes', auth: 'merchant', response: z.array(HypothesisSummarySchema) },
  23: { method: 'GET', path: '/api/shared-causes/:id', auth: 'merchant', response: HypothesisDetailSchema },
  24: { method: 'GET', path: '/api/shared-causes/:id/trend', auth: 'merchant', response: TrendSchema },
  26: { method: 'POST', path: '/api/shared-causes/:id/confirm', auth: 'merchant', response: HypothesisDetailSchema },
  27: { method: 'POST', path: '/api/shared-causes/:id/dismiss', auth: 'merchant', body: DismissBodySchema, response: HypothesisDetailSchema },
  29: { method: 'POST', path: '/api/reviews/:id/reply', auth: 'merchant', body: ReviewReplyBodySchema, response: ReviewSchema },
  32: { method: 'POST', path: '/api/buyer/orders/:id/report-problem', auth: 'buyer', response: z.object({ complaintId: uuid }) },
  33: { method: 'POST', path: '/api/buyer/orders/:id/review', auth: 'buyer', body: ReviewBodySchema, response: ReviewSchema },
  34: { method: 'GET', path: '/api/buyer/signal', auth: 'buyer', query: BuyerSignalQuerySchema, response: BuyerSignalViewSchema },
  35: { method: 'POST', path: '/api/buyer/signal/contest', auth: 'buyer', body: ContestBodySchema, response: z.object({ contestId: uuid }) },
  40: { method: 'GET', path: '/api/merchant/signal-contests', auth: 'merchant', response: z.array(SignalContestSchema) },
  41: { method: 'POST', path: '/api/merchant/signal-contests/:id/resolve', auth: 'merchant', body: ResolveContestBodySchema, response: SignalContestSchema },
  42: { method: 'GET', path: '/api/stores/:merchantId/reviews', auth: 'none', response: z.array(ReviewSchema) },
};
