import { z } from 'zod';
import { BandSchema, MoneySchema, RecommendationSchema, UuidSchema } from './common.js';

const Confidence = z.number().min(0).max(1);
export const AttestationResultSchema = z.object({
  items: z.array(
    z.object({
      orderItemId: UuidSchema,
      seen: z.object({
        itemType: z.string(),
        colour: z.string(),
        sizeLabel: z.string().nullable(),
        quantity: z.number().int().nonnegative(),
      }),
      matches: z.boolean(),
      confidence: Confidence,
      notes: z.string(),
    }),
  ),
  batchLabelText: z.string().nullable(),
  shippingLabel: z.object({ visible: z.boolean(), trackingNumberText: z.string().nullable() }),
  defects: z.array(
    z.object({
      component: z.string(),
      description: z.string(),
      severity: z.enum(['cosmetic', 'functional', 'safety']),
    }),
  ),
  inspection: z
    .object({ instruction: z.string(), defectVisible: z.boolean(), matchesCluster: z.boolean() })
    .nullable(),
  couldNotVerify: z.array(z.string()),
  confidence: Confidence,
});
export type AttestationResult = z.infer<typeof AttestationResultSchema>;
export const ComplaintCategorySchema = z.enum([
  'product_defect',
  'wrong_item',
  'size_fit',
  'not_as_pictured',
  'damaged_in_transit',
  'not_received',
  'late',
  'other',
]);
export type ComplaintCategory = z.infer<typeof ComplaintCategorySchema>;
export const ComplaintExtractionSchema = z.object({
  category: ComplaintCategorySchema,
  component: z.string().nullable(),
  failureMode: z.string().nullable(),
  locationOnItem: z.string().nullable(),
  severity: z.enum(['cosmetic', 'functional', 'safety']),
  summary: z.string().max(140),
  language: z.string().min(2),
});
export type ComplaintExtraction = z.infer<typeof ComplaintExtractionSchema>;
export const EvidencePackDraftSchema = z.object({
  recommendation: RecommendationSchema,
  rationale: z.array(z.string()),
  evidences: z.array(z.unknown()),
  files: z.array(
    z.object({
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      filename: z.string(),
      mime: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
    }),
  ),
  actionParams: z
    .object({
      offerType: z.string().optional(),
      acceptClaimType: z.string().optional(),
      amount: MoneySchema.optional(),
      note: z.string(),
    })
    .nullable(),
  narrative: z.string().max(2000),
  sharedContext: z
    .object({
      hypothesisId: UuidSchema,
      status: z.enum(['open', 'confirmed']),
      summary: z.string(),
    })
    .nullable(),
  confidence: Confidence,
});
export type EvidencePackDraft = z.infer<typeof EvidencePackDraftSchema>;
export const BuyerSignalSchema = z.object({
  band: BandSchema,
  points: z.number().int(),
  reasons: z.array(z.object({ code: z.string(), label: z.string(), points: z.number().int() })),
  recommendation: z.string(),
  sentence: z.string(),
  simulatedNetworkUsed: z.boolean(),
});
export type BuyerSignal = z.infer<typeof BuyerSignalSchema>;
export const StoreReportSchema = z.object({
  merchantId: UuidSchema,
  band: z.enum(['verified', 'standard', 'caution', 'new']),
  facts: z.object({
    domain: z.string(),
    domainRegisteredAt: z.string().nullable(),
    policies: z.array(z.object({ kind: z.enum(['returns', 'shipping', 'contact']), url: z.url() })),
  }),
  fulfilment: z.object({
    ordersSealed90d: z.number().int().nonnegative(),
    medianHoursCaptureToSeal: z.number().nullable(),
    pctTrackingWithin72h: z.number(),
    pctWithPackingEvidence: z.number(),
    disputeRate90d: z.number(),
    proactiveFixes90d: z.number().int().nonnegative(),
    unansweredNotReceived: z.number().int().nonnegative(),
  }),
  reviews: z.object({
    count: z.number().int().nonnegative(),
    average: z.number().nullable(),
    themes: z.array(
      z.object({
        label: z.string(),
        count: z.number().int(),
        tone: z.enum(['positive', 'negative']),
        reviewIds: z.array(UuidSchema),
      }),
    ),
  }),
  sources: z.array(z.object({ label: z.string(), url: z.url() })),
  computedAt: z.iso.datetime(),
});
export type StoreReport = z.infer<typeof StoreReportSchema>;
