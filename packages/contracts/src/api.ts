import { z } from 'zod';
import { BandSchema, MoneySchema, RecommendationSchema, RoleSchema, UuidSchema } from './common.js';
import { BuyerSignalSchema } from './ai.js';
import {
  AffectedOrdersSchema,
  DimensionSchema,
  HypothesisStatsSchema,
  ValueTestSchema,
} from './sharedCause.js';

export const DemoLoginSchema = z.object({ role: RoleSchema, subjectId: UuidSchema }).strict();
export const DemoLoginResponseSchema = DemoLoginSchema.extend({ token: z.string() });
export const ListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().default(50),
  cursor: z.string().optional(),
});
export const OrderSummarySchema = z.object({
  id: UuidSchema,
  merchantId: UuidSchema,
  status: z.string(),
  amount: MoneySchema,
  createdAt: z.iso.datetime(),
  items: z.array(
    z.object({ sku: z.string(), name: z.string(), quantity: z.number().int().positive() }),
  ),
});
export type OrderSummary = z.infer<typeof OrderSummarySchema>;
export const OrderRowSchema = OrderSummarySchema.extend({
  buyerDisplayName: z.string().nullable(),
  buyerSignal: z.object({ band: BandSchema, topReasons: z.array(z.string()) }).nullable(),
  hold: z.object({ reason: z.string(), hypothesisId: UuidSchema }).nullable(),
  alertCount: z.number().int().nonnegative(),
  disputeOpen: z.boolean(),
});
export type OrderRow = z.infer<typeof OrderRowSchema>;
export const OrderDetailSchema = z.object({
  id: UuidSchema,
  paypalOrderId: z.string(),
  paypalCaptureId: z.string().nullable(),
  status: z.string(),
  amount: MoneySchema,
  items: z.array(
    z.object({
      id: UuidSchema,
      sku: z.string(),
      name: z.string(),
      quantity: z.number().int(),
      batchCode: z.string().nullable(),
    }),
  ),
  buyer: z
    .object({
      id: UuidSchema,
      displayName: z.string().nullable(),
      payerAccountStatus: z.string().nullable(),
    })
    .nullable(),
  sellerProtection: z.object({
    status: z.string().nullable(),
    disputeCategories: z.array(z.string()),
  }),
  buyerSignal: BuyerSignalSchema.nullable(),
  shipment: z
    .object({
      carrier: z.string(),
      trackingNumber: z.string(),
      status: z.string(),
      lastScanAt: z.iso.datetime().nullable(),
    })
    .nullable(),
  hold: z.object({ reason: z.string(), hypothesisId: UuidSchema }).nullable(),
  ledger: z.object({ length: z.number().int().nonnegative(), verified: z.boolean() }),
  disputes: z.array(
    z.object({
      id: z.string(),
      reason: z.string(),
      status: z.string(),
      dueAt: z.iso.datetime().nullable(),
    }),
  ),
  sharedCauses: z.array(
    z.object({ hypothesisId: UuidSchema, label: z.string(), status: z.string() }),
  ),
});
export type OrderDetail = z.infer<typeof OrderDetailSchema>;
export const DisputeRowSchema = z.object({
  id: z.string(),
  orderId: UuidSchema.nullable(),
  reason: z.string(),
  status: z.string(),
  lifeCycleStage: z.string().nullable(),
  dueAt: z.iso.datetime().nullable(),
  latestPack: z
    .object({ id: UuidSchema, status: z.string(), recommendation: RecommendationSchema })
    .nullable(),
});
export type DisputeRow = z.infer<typeof DisputeRowSchema>;
export const DisputeMessageSchema = z.object({
  postedBy: z.enum(['BUYER', 'SELLER', 'ARBITER']),
  timePosted: z.iso.datetime(),
  content: z.string(),
});
export const DisputeDetailSchema = DisputeRowSchema.extend({
  amount: MoneySchema.nullable(),
  outcomeCode: z.string().nullable(),
  messages: z.array(DisputeMessageSchema),
  evidences: z.array(
    z.object({
      evidenceType: z.string(),
      source: z.string(),
      date: z.iso.datetime().nullable(),
      itemId: z.string().nullable(),
    }),
  ),
  allowedResponseOptions: z
    .object({
      makeOffer: z.object({ offerTypes: z.array(z.string()) }).optional(),
      acceptClaim: z.object({ acceptClaimTypes: z.array(z.string()) }).optional(),
    })
    .nullable(),
});
export type DisputeDetail = z.infer<typeof DisputeDetailSchema>;
export const AlertSchema = z.object({
  id: UuidSchema,
  type: z.string(),
  orderId: UuidSchema.nullable(),
  refId: z.string().nullable(),
  message: z.string(),
  createdAt: z.iso.datetime(),
  acknowledgedAt: z.iso.datetime().nullable(),
});
export type Alert = z.infer<typeof AlertSchema>;
export const HypothesisSummarySchema = z.object({
  id: UuidSchema,
  headline: z.string(),
  status: z.string(),
  strength: z.enum(['strong', 'possible']),
  dimension: DimensionSchema,
  value: z.string(),
  complaintCount: z.number().int(),
  unshippedCount: z.number().int(),
  safetyFlag: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type HypothesisSummary = z.infer<typeof HypothesisSummarySchema>;
export const HypothesisDetailSchema = z.object({
  id: UuidSchema,
  status: z.enum(['open', 'confirmed', 'dismissed', 'resolved']),
  strength: z.enum(['strong', 'possible']),
  headline: z.string(),
  explanation: z.string(),
  cluster: z.object({
    id: UuidSchema,
    label: z.string(),
    category: z.string(),
    complaints: z.array(
      z.object({
        id: UuidSchema,
        orderId: UuidSchema,
        summary: z.string(),
        createdAt: z.iso.datetime(),
        source: z.string(),
      }),
    ),
  }),
  stats: HypothesisStatsSchema,
  alternatives: z.array(ValueTestSchema),
  affected: AffectedOrdersSchema,
  actions: z.array(
    z.object({ id: UuidSchema, type: z.string(), status: z.string(), payload: z.unknown() }),
  ),
  safetyFlag: z.boolean(),
});
export type HypothesisDetail = z.infer<typeof HypothesisDetailSchema>;
export const HypothesisSchema = z.object({
  id: UuidSchema,
  merchantId: UuidSchema,
  clusterId: UuidSchema,
  dimension: DimensionSchema,
  value: z.string(),
  status: z.enum(['open', 'confirmed', 'dismissed', 'resolved', 'superseded']),
  strength: z.enum(['strong', 'possible']),
  stats: HypothesisStatsSchema,
  affected: AffectedOrdersSchema,
});
export type Hypothesis = z.infer<typeof HypothesisSchema>;
export const MessageSchema = z.object({
  id: UuidSchema,
  orderId: UuidSchema.nullable(),
  buyerId: UuidSchema.nullable(),
  disputeId: z.string().nullable(),
  actionId: UuidSchema.nullable(),
  channel: z.enum(['in_app', 'email_outbox', 'paypal_dispute']),
  subject: z.string().nullable(),
  body: z.string(),
  status: z.string(),
  sentAt: z.iso.datetime().nullable(),
});
export type Message = z.infer<typeof MessageSchema>;
export const ReviewSchema = z.object({
  id: UuidSchema,
  merchantId: UuidSchema,
  orderId: UuidSchema,
  rating: z.number().int().min(1).max(5),
  text: z.string(),
  merchantReply: z.string().nullable(),
  createdAt: z.iso.datetime(),
  weight: z.number(),
});
export type Review = z.infer<typeof ReviewSchema>;
export const SignalContestSchema = z.object({
  id: UuidSchema,
  buyerId: UuidSchema,
  signalId: UuidSchema,
  text: z.string(),
  status: z.enum(['open', 'upheld', 'corrected']),
  merchantNote: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type SignalContest = z.infer<typeof SignalContestSchema>;
export const AttestInputSchema = z.object({
  orderId: UuidSchema.nullable(),
  hypothesisId: UuidSchema.nullable(),
  step: z.enum(['pack', 'inspection', 'buyer_photo']),
  items: z.array(
    z.object({
      orderItemId: UuidSchema,
      name: z.string(),
      sku: z.string(),
      colour: z.string().nullable(),
      size: z.string().nullable(),
      quantity: z.number().int(),
    }),
  ),
  batchCodes: z.record(z.string(), z.string()),
  photos: z.array(
    z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/), label: z.string(), mime: z.string() }),
  ),
  inspectionRule: z
    .object({ instruction: z.string(), requiredPhotoLabel: z.string(), clusterLabel: z.string() })
    .nullable(),
  expectedTrackingNumber: z.string().nullable(),
});
export type AttestInput = z.infer<typeof AttestInputSchema>;
export const CatalogItemSchema = z.object({
  merchantId: UuidSchema,
  sku: z.string(),
  name: z.string(),
  price: MoneySchema,
  storeBand: z.enum(['verified', 'standard', 'caution', 'new']),
});
export type CatalogItem = z.infer<typeof CatalogItemSchema>;

export const CoreRequests = {
  checkoutConfig: z.object({ merchant: z.string().min(1) }),
  createOrder: z
    .object({
      merchantId: UuidSchema,
      items: z
        .array(z.object({ sku: z.string().min(1), quantity: z.number().int().positive() }))
        .min(1),
      shipping: z
        .object({ fullName: z.string(), address: z.record(z.string(), z.string()) })
        .optional(),
    })
    .strict(),
  packPhotos: z.object({
    labels: z.array(z.string()),
    batchCodes: z.record(z.string(), z.string()),
  }),
  packOverride: z.object({ reason: z.string().trim().min(1) }).strict(),
  packSeal: z
    .object({
      batchCodes: z.record(z.string(), z.string()),
      carrier: z.string().min(1),
      carrierNameOther: z.string().optional(),
      trackingNumber: z.string().min(1),
      packer: z.string().min(1),
    })
    .strict(),
  approvePack: z
    .object({
      recommendation: RecommendationSchema.optional(),
      offerType: z.string().optional(),
      acceptClaimType: z.string().optional(),
      amount: MoneySchema.optional(),
      note: z.string().optional(),
    })
    .strict(),
  approveAction: z.object({ edits: z.record(z.string(), z.unknown()).optional() }).strict(),
};
