import { z } from 'zod';
import { MoneySchema, type Money } from './common.js';

export type { Money } from './common.js';
export const PostOptsSchema = z.object({ requestId: z.string().min(1).max(108) });
export type PostOpts = z.infer<typeof PostOptsSchema>;

export const CaptureResultSchema = z.object({
  orderId: z.string().min(1),
  captureId: z.string().min(1),
  status: z.string().min(1),
  sellerProtection: z.object({
    status: z.string().nullable(),
    disputeCategories: z.array(z.string()),
  }),
  payerAccountStatus: z.string().nullable(),
  payerId: z.string().nullable(),
  payerEmail: z.string().nullable(),
  payerName: z.string().nullable(),
  shipping: z
    .object({
      fullName: z.string().nullable(),
      address: z.object({
        address_line_1: z.string().optional(),
        admin_area_2: z.string().optional(),
        admin_area_1: z.string().optional(),
        postal_code: z.string().optional(),
        country_code: z.string().optional(),
      }),
    })
    .nullable(),
  raw: z.unknown(),
});

export const PayPalOrderInputSchema = z.object({
  referenceId: z.string().min(1),
  customId: z.string().min(1),
  invoiceId: z.string().min(1),
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        sku: z.string().min(1),
        quantity: z.number().int().positive(),
        unitAmount: MoneySchema,
      }),
    )
    .min(1),
  shipping: z
    .object({ fullName: z.string(), address: z.record(z.string(), z.string()) })
    .optional(),
});
export const PayPalTrackingInputSchema = z.object({
  captureId: z.string().min(1),
  trackingNumber: z.string().min(1),
  carrier: z.string().min(1),
  carrierNameOther: z.string().optional(),
  notifyPayer: z.boolean(),
});

export interface CaptureResult {
  orderId: string;
  captureId: string;
  status: string;
  sellerProtection: { status: string | null; disputeCategories: string[] };
  payerAccountStatus: string | null;
  payerId: string | null;
  payerEmail: string | null;
  payerName: string | null;
  shipping: {
    fullName: string | null;
    address: {
      address_line_1?: string;
      admin_area_2?: string;
      admin_area_1?: string;
      postal_code?: string;
      country_code?: string;
    };
  } | null;
  raw: unknown;
}

export interface PayPalClient {
  orders: {
    create(
      input: {
        referenceId: string;
        customId: string;
        invoiceId: string;
        items: Array<{ name: string; sku: string; quantity: number; unitAmount: Money }>;
        shipping?: { fullName: string; address: Record<string, string> };
      },
      opts: PostOpts,
    ): Promise<{ id: string; status: string; approveUrl: string }>;
    capture(paypalOrderId: string, opts: PostOpts): Promise<CaptureResult>;
    get(paypalOrderId: string): Promise<unknown>;
    addTracking(
      paypalOrderId: string,
      input: {
        captureId: string;
        trackingNumber: string;
        carrier: string;
        carrierNameOther?: string;
        notifyPayer: boolean;
      },
      opts: PostOpts,
    ): Promise<{ trackerId: string }>;
  };
  payments: {
    refund(
      captureId: string,
      input: { amount?: Money; noteToPayer?: string; invoiceId?: string },
      opts: PostOpts,
    ): Promise<{ refundId: string; status: string }>;
  };
  disputes: {
    list(input: {
      startTime?: string;
      updateTimeAfter?: string;
      disputeState?: string;
      pageSize?: number;
      nextPageToken?: string;
    }): Promise<{ items: unknown[]; nextPageToken: string | null }>;
    get(disputeId: string): Promise<unknown>;
    provideEvidence(
      disputeId: string,
      evidences: unknown[],
      files: Array<{ filename: string; mime: string; bytes: Buffer }>,
      opts: PostOpts,
    ): Promise<unknown>;
    makeOffer(
      disputeId: string,
      input: {
        note: string;
        offerType:
          | 'REFUND'
          | 'REFUND_WITH_RETURN'
          | 'REFUND_WITH_REPLACEMENT'
          | 'REPLACEMENT_WITHOUT_REFUND';
        offerAmount?: Money;
        invoiceId?: string;
      },
      opts: PostOpts,
    ): Promise<unknown>;
    acceptClaim(
      disputeId: string,
      input: {
        note: string;
        acceptClaimType?: 'REFUND' | 'REFUND_WITH_RETURN' | 'PARTIAL_REFUND';
        refundAmount?: Money;
      },
      opts: PostOpts,
    ): Promise<unknown>;
    sendMessage(disputeId: string, message: string, opts: PostOpts): Promise<unknown>;
    sandboxAdjudicate(
      disputeId: string,
      outcome: 'BUYER_FAVOR' | 'SELLER_FAVOR',
      opts: PostOpts,
    ): Promise<unknown>;
    sandboxRequireEvidence(
      disputeId: string,
      action: 'BUYER_EVIDENCE' | 'SELLER_EVIDENCE',
      opts: PostOpts,
    ): Promise<unknown>;
  };
  webhooks: {
    verify(headers: Record<string, string>, rawBody: string, webhookId: string): Promise<boolean>;
    register(url: string, eventTypes: string[]): Promise<{ id: string }>;
  };
  reporting: {
    searchTransactions(input: {
      startDate: string;
      endDate: string;
      transactionId?: string;
    }): Promise<unknown[]>;
  };
  carriers: {
    toDisputeCarrier(trackingCarrier: string): {
      carrier_name: string;
      carrier_name_other?: string;
    };
  };
}
export type ForMerchant = (merchantId: string) => Promise<PayPalClient>;
