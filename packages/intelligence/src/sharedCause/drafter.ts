// Message Drafter (section 10): drafts the buyer message for an approved hypothesis wording. Code picks the buyers
// and the level; nothing is sent without merchant approval (Hriday sends). Template-first: the model writes at most
// one template per hypothesis and level, with {order} and {product} placeholders, and code fills in each buyer's
// own order. The model never sees a buyer, an order reference or another buyer's name, so a free-tier quota is
// spent once per hypothesis and level instead of once per buyer.
import { z } from 'zod';
import { generateStructured, type LanguageModel } from '@fairfold/ai';

export type MessageLevel = 'suspected' | 'confirmed';
export interface DraftOrder {
  orderRef: string;
  productName: string;
}
/** A message with {order} and {product} placeholders; `usedTemplate` is true for the fixed template. */
export interface MessageTemplate {
  subject: string;
  body: string;
  usedTemplate: boolean;
}
export interface Draft {
  subject: string;
  body: string;
  usedTemplate: boolean;
}

export const SUBJECT_MAX = 120;
export const BODY_MAX = 1200;
/** Room kept for each placeholder when checking a template against the limits. */
const PLACEHOLDER_ROOM = 80;
const PLACEHOLDERS = ['{order}', '{product}'] as const;

/** The model's answer; length and placeholders are checked by code, so a long answer costs no retry. */
const DraftSchema = z.object({
  subject: z.string().trim().min(1),
  body: z.string().trim().min(1),
});

export function fixedTemplate(wording: string, level: MessageLevel): MessageTemplate {
  if (level === 'suspected')
    return {
      subject: 'About your recent {product} order',
      body:
        `Hi, we're checking a possible issue with some recent {product} orders (${wording}). ` +
        `If you notice a problem with yours (order {order}), reply to this message and we'll put it right. ` +
        'Otherwise there is nothing you need to do.',
      usedTemplate: true,
    };
  return {
    subject: 'A fix for your {product}',
    body:
      `Hi, we found ${wording}, and your order {order} may be affected. We're sorry. ` +
      'Reply to this message and we will replace or refund it, whichever you prefer.',
    usedTemplate: true,
  };
}

/** One buyer's message: the template with their own order reference and product name. */
export function fillTemplate(
  t: MessageTemplate,
  order: DraftOrder,
): { subject: string; body: string } {
  const fill = (s: string) =>
    s.replaceAll('{order}', order.orderRef).replaceAll('{product}', order.productName);
  return { subject: fill(t.subject), body: fill(t.body) };
}

export function templateMessage(order: DraftOrder, wording: string, level: MessageLevel): Draft {
  return { ...fillTemplate(fixedTemplate(wording, level), order), usedTemplate: true };
}

const SYSTEM = [
  'You draft a short, warm message template from a small online store to a customer about a possible product issue.',
  'suspected level: the store is checking a possible issue and asks the customer to reply if they notice it; do not',
  'admit a fault. confirmed level: the store found the fault, apologises and offers a replacement or refund.',
  "The same template goes to each affected customer separately. Write {order} where the customer's own order",
  'reference goes (required, in the body) and {product} where the product name goes; use no other braces.',
  'Never mention other customers or any name. No promises beyond the wording given.',
].join(' ');

/** Length with each placeholder counted at PLACEHOLDER_ROOM characters. */
function filledLength(s: string): number {
  return PLACEHOLDERS.reduce(
    (n, p) => n + (s.split(p).length - 1) * (PLACEHOLDER_ROOM - p.length),
    s.length,
  );
}

function usable(t: { subject: string; body: string }, buyerNames: string[]): boolean {
  if (!t.body.includes('{order}')) return false;
  const text = `${t.subject}\n${t.body}`;
  if (/[{}]/.test(PLACEHOLDERS.reduce((s, p) => s.replaceAll(p, ''), text))) return false;
  if (filledLength(t.subject) > SUBJECT_MAX || filledLength(t.body) > BODY_MAX) return false;
  const lower = text.toLowerCase();
  const leaks = buyerNames
    .map((n) => n.trim().toLowerCase())
    .filter((n) => n.length >= 2)
    .some((n) => lower.includes(n) || lower.includes(n.split(/\s+/)[0]!));
  return !leaks;
}

/**
 * One model call for a hypothesis and level. The draft is used only when its body has {order}, it has no other
 * placeholder, it fits the message limits and it names none of `buyerNames`; otherwise the fixed template is used.
 */
export async function draftTemplate(
  hypothesisWording: string,
  level: MessageLevel,
  guard: { buyerNames: string[] },
  model?: LanguageModel,
): Promise<MessageTemplate> {
  const fixed = fixedTemplate(hypothesisWording, level);
  const out = await generateStructured({
    schema: DraftSchema,
    system: SYSTEM,
    user: [`Level: ${level}`, `Approved wording of the issue: ${hypothesisWording}`].join('\n'),
    kind: 'text',
    component: 'message_drafter',
    fallback: () => ({ subject: fixed.subject, body: fixed.body }),
    model,
  });
  if (out.usedFallback || !usable(out.value, guard.buyerNames)) return fixed;
  return { subject: out.value.subject, body: out.value.body, usedTemplate: false };
}
