import { z } from 'zod';

export const UuidSchema = z.uuid();
export const MoneySchema = z.object({
  currency_code: z.string().regex(/^[A-Z]{3}$/),
  value: z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/),
});
export type Money = z.infer<typeof MoneySchema>;
export const BandSchema = z.enum(['green', 'yellow', 'red', 'grey']);
export type Band = z.infer<typeof BandSchema>;
export const RecommendationSchema = z.enum([
  'provide_evidence',
  'make_offer',
  'accept_claim',
  'inspect_first',
  'merchant_decides',
]);
export type Recommendation = z.infer<typeof RecommendationSchema>;
export const RoleSchema = z.enum(['merchant', 'buyer', 'admin', 'agent']);
export type Role = z.infer<typeof RoleSchema>;

export const DemoSubjects = {
  merchant: '00000000-0000-4000-8000-000000000001',
  buyer: '00000000-0000-4000-8000-000000000002',
  admin: '00000000-0000-4000-8000-000000000003',
  agent: '00000000-0000-4000-8000-000000000004',
} as const;

export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()),
  }),
});

export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 400,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const LedgerEntryTypes = [
  'captured',
  'photo',
  'attestation',
  'inspection',
  'override',
  'sealed',
  'tracking_pushed',
  'scan',
  'delivered',
  'gap_alert',
  'held',
  'released',
  'complaint',
  'dispute_opened',
  'evidence_submitted',
  'offer_made',
  'claim_accepted',
  'message_sent',
  'refund',
  'resolved',
] as const;
export const LedgerEntryTypeSchema = z.enum(LedgerEntryTypes);
export type LedgerEntryType = z.infer<typeof LedgerEntryTypeSchema>;
