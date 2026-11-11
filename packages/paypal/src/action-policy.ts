import { z } from 'zod';
import { AppError, MoneySchema, UuidSchema } from '@fairfold/contracts';
import { redactDisputeText } from './dispute-policy.js';

const uniqueIds = z
  .array(UuidSchema)
  .max(500)
  .refine((list) => new Set(list).size === list.length);
const ids = uniqueIds.min(1);
const rules = {
  hold_orders: z.object({ orderIds: ids }).strict(),
  release_orders: z
    .object({
      orderIds: uniqueIds.default([]),
      inspectionRuleIds: uniqueIds.optional(),
      reason: z.string().max(2000).optional(),
    })
    .strict()
    .refine((value) => value.orderIds.length + (value.inspectionRuleIds?.length ?? 0) > 0),
  add_inspection_rule: z
    .object({
      batchCode: z.string().trim().min(1).max(255),
      instruction: z.string().min(1).max(2000),
      requiredPhotoLabel: z.string().trim().min(1).max(255),
      productId: UuidSchema.optional(),
    })
    .strict(),
  send_buyer_messages: z
    .object({
      messageIds: ids,
      level: z.enum(['suspected', 'confirmed']).optional(),
      template: z
        .object({
          subject: z.string().max(120),
          body: z.string().max(1200),
          usedTemplate: z.boolean(),
        })
        .strict()
        .optional(),
    })
    .strict(),
  propose_offers: z
    .object({
      disputeIds: z
        .array(z.string().regex(/^[A-Za-z0-9-]{1,255}$/))
        .min(1)
        .max(500)
        .refine((list) => new Set(list).size === list.length),
    })
    .strict(),
  proactive_refund: z
    .object({ orderIds: ids, amounts: z.record(UuidSchema, MoneySchema) })
    .strict(),
} as const;

export function validateActionPayload(type: string, value: unknown): Record<string, unknown> {
  const rule = rules[type as keyof typeof rules];
  if (!rule) throw new AppError('ACTION_INVALID', 'Action type is invalid', 409);
  const parsed = rule.safeParse(value);
  if (!parsed.success)
    throw new AppError('ACTION_PAYLOAD_INVALID', 'Approved action payload is invalid', 409);
  const result = parsed.data;
  if ('instruction' in result) result.instruction = redactDisputeText(result.instruction);
  if ('reason' in result && result.reason !== undefined)
    result.reason = redactDisputeText(result.reason);
  if ('template' in result && result.template) {
    result.template.subject = redactDisputeText(result.template.subject);
    result.template.body = redactDisputeText(result.template.body);
  }
  if (type === 'proactive_refund') {
    const refund = rules.proactive_refund.parse(result);
    if (
      Object.keys(refund.amounts).length !== refund.orderIds.length ||
      refund.orderIds.some((id) => !refund.amounts[id])
    )
      throw new AppError(
        'ACTION_PAYLOAD_INVALID',
        'Each refund requires an explicit approved amount',
        409,
      );
  }
  return result;
}
