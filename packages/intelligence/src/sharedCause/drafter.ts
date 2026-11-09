// Message Drafter (section 10): drafts one buyer's message from their own order and the approved hypothesis
// wording. Code picks the buyers and the level; nothing is sent without merchant approval (Hriday sends).
import { z } from 'zod';
import { generateStructured, type LanguageModel } from '@fairfold/ai';

export type MessageLevel = 'suspected' | 'confirmed';
export interface DraftOrder {
  orderRef: string;
  productName: string;
}
export interface Draft {
  subject: string;
  body: string;
  usedTemplate: boolean;
}

const DraftSchema = z.object({
  subject: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(1200),
});

export function templateMessage(order: DraftOrder, wording: string, level: MessageLevel): Draft {
  if (level === 'suspected')
    return {
      subject: `About your recent ${order.productName} order`,
      body:
        `Hi, we're checking a possible issue with some recent ${order.productName} orders (${wording}). ` +
        `If you notice a problem with yours (order ${order.orderRef}), reply to this message and we'll put it right. ` +
        'Otherwise there is nothing you need to do.',
      usedTemplate: true,
    };
  return {
    subject: `A fix for your ${order.productName}`,
    body:
      `Hi, we found ${wording}, and your order ${order.orderRef} may be affected. We're sorry. ` +
      'Reply to this message and we will replace or refund it, whichever you prefer.',
    usedTemplate: true,
  };
}

const SYSTEM = [
  'You draft a short, warm message from a small online store to ONE customer about a possible product issue.',
  'suspected level: the store is checking a possible issue and asks the customer to reply if they notice it; do not',
  'admit a fault. confirmed level: the store found the fault, apologises and offers a replacement or refund.',
  "Mention only this customer's own order. Never mention other customers. No promises beyond the wording given.",
].join(' ');

export async function draftMessage(
  order: DraftOrder,
  hypothesisWording: string,
  level: MessageLevel,
  guard: { otherBuyerNames: string[] },
  model?: LanguageModel,
): Promise<Draft> {
  const template = templateMessage(order, hypothesisWording, level);
  const out = await generateStructured({
    schema: DraftSchema,
    system: SYSTEM,
    user: [
      `Level: ${level}`,
      `Customer's order: ${order.orderRef} (${order.productName})`,
      `Approved wording of the issue: ${hypothesisWording}`,
    ].join('\n'),
    kind: 'text',
    component: 'message_drafter',
    fallback: () => ({ subject: template.subject, body: template.body }),
    model,
  });
  if (out.usedFallback) return template;
  const text = `${out.value.subject}\n${out.value.body}`.toLowerCase();
  const leaks = guard.otherBuyerNames
    .map((n) => n.trim().toLowerCase())
    .filter((n) => n.length >= 2)
    .some((n) => text.includes(n) || text.includes(n.split(/\s+/)[0]!));
  if (leaks) return template;
  return { subject: out.value.subject, body: out.value.body, usedTemplate: false };
}
