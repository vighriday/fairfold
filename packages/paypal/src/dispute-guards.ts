import { z } from 'zod';
import { AppError } from '@fairfold/contracts';

export type DisputeOperation = 'provide_evidence' | 'make_offer' | 'accept_claim' | 'send_message';
const symbol = z.string().regex(/^[A-Z][A-Z0-9_]{0,127}$/);
const types = z.array(symbol).max(100);
const state = z.object({
  dispute_id: z.string().regex(/^[A-Za-z0-9-]{1,255}$/),
  status: symbol,
  dispute_life_cycle_stage: symbol.optional(),
  allowed_response_options: z
    .object({
      make_offer: z.object({ offer_types: types.optional() }).optional(),
      accept_claim: z.object({ accept_claim_types: types.optional() }).optional(),
    })
    .optional(),
});
const offers = new Set(['REFUND', 'REFUND_WITH_REPLACEMENT', 'REPLACEMENT_WITHOUT_REFUND']);
const claims = new Set(['REFUND', 'PARTIAL_REFUND']);

/** Pure validation only. Caller must supply a fresh merchant-scoped GET immediately before execution. */
export function assertDisputeActionAvailable(
  detail: unknown,
  input: {
    disputeId: string;
    operation: DisputeOperation;
    variant?: string;
  },
): void {
  if (!['provide_evidence', 'make_offer', 'accept_claim', 'send_message'].includes(input.operation))
    throw new AppError('DISPUTE_ACTION_INVALID', 'Dispute action is invalid', 400);
  if (input.variant === 'REFUND_WITH_RETURN')
    throw new AppError(
      'PAYPAL_RETURN_ADDRESS_REVIEW_REQUIRED',
      'Return-based action requires the existing Q2 contract review',
      409,
    );
  const variant = input.variant ?? (input.operation === 'accept_claim' ? 'REFUND' : undefined);
  if (
    (input.operation === 'make_offer' && (!variant || !offers.has(variant))) ||
    (input.operation === 'accept_claim' && (!variant || !claims.has(variant))) ||
    (['provide_evidence', 'send_message'].includes(input.operation) && variant !== undefined)
  )
    throw new AppError('DISPUTE_ACTION_INVALID', 'Dispute action type is invalid', 400);
  const parsed = state.safeParse(detail);
  if (!parsed.success || parsed.data.dispute_id !== input.disputeId)
    throw new AppError(
      'PAYPAL_DISPUTE_DETAIL_INVALID',
      'Authoritative dispute details are invalid',
      502,
    );
  const current = parsed.data;
  // Original section 4's seller-response rule applies to all actions; F4 adds INQUIRY for offers/messages.
  const unavailable =
    current.status !== 'WAITING_FOR_SELLER_RESPONSE' ||
    (['make_offer', 'send_message'].includes(input.operation) &&
      current.dispute_life_cycle_stage !== 'INQUIRY') ||
    (input.operation === 'make_offer' &&
      !current.allowed_response_options?.make_offer?.offer_types?.includes(variant!)) ||
    (input.operation === 'accept_claim' &&
      !current.allowed_response_options?.accept_claim?.accept_claim_types?.includes(variant!));
  if (unavailable)
    throw new AppError(
      'STAGE_CHANGED',
      'Current dispute state/options do not permit the approved action',
      409,
    );
}
