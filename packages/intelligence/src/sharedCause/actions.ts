// Shared Cause proposals that need drafting (section 9 stage 5, F5). Code picks the buyers and the level; the
// Message Drafter writes each buyer's own message. Nothing is sent here: Hriday sends after merchant approval.
import { and, eq, inArray } from 'drizzle-orm';
import {
  AffectedOrdersSchema,
  AppError,
  ComplaintExtractionSchema,
  DimensionSchema,
  type Message,
} from '@fairfold/contracts';
import {
  actions,
  buyers,
  complaints,
  hypotheses,
  messages,
  orders,
  order_items,
} from '@fairfold/db';
import { getIntelRuntime, type IntelRuntime } from '../runtime.js';
import { draftTemplate, fillTemplate, type MessageLevel, type MessageTemplate } from './drafter.js';
import { buyerWording } from './wording.js';

type MessageRow = typeof messages.$inferSelect;

export function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    orderId: row.order_id,
    buyerId: row.buyer_id,
    disputeId: row.dispute_id,
    actionId: row.action_id,
    channel: row.channel as Message['channel'],
    subject: row.subject,
    body: row.body,
    status: row.status,
    sentAt: row.sent_at?.toISOString() ?? null,
  };
}

interface SendPayload {
  messageIds: string[];
  level?: MessageLevel;
  /** The template every draft at this level is filled from, so a re-run spends no model call. */
  template?: MessageTemplate;
}

/** The cluster's first readable extraction: the fault the buyer wording describes. */
async function clusterFault(rt: IntelRuntime, clusterId: string) {
  const rows = await rt.db
    .select({ extracted: complaints.extracted })
    .from(complaints)
    .where(eq(complaints.cluster_id, clusterId))
    .orderBy(complaints.created_at);
  for (const r of rows) {
    const parsed = ComplaintExtractionSchema.safeParse(r.extracted);
    if (parsed.success) return parsed.data;
  }
  throw new AppError('CLUSTER_EMPTY', 'The hypothesis cluster has no read complaints', 409);
}

/**
 * Drafts one in-app message per buyer for the hypothesis's in-transit and delivered-without-complaint orders, at
 * `level`, under a proposed send_buyer_messages action ({ messageIds, level, template }). Buyers who already have a
 * message at this level for this hypothesis are skipped, so re-running adds only new buyers. Template-first: the
 * Message Drafter is called at most once per hypothesis and level; its template is kept in the action payload and
 * each buyer's message is that template filled with their own order. Safety-flagged: no drafts.
 */
export async function draftBuyerMessagesWith(
  rt: IntelRuntime,
  hypothesisId: string,
  level: MessageLevel,
): Promise<Message[]> {
  const [h] = await rt.db.select().from(hypotheses).where(eq(hypotheses.id, hypothesisId));
  if (!h) throw new AppError('HYPOTHESIS_NOT_FOUND', 'Hypothesis not found', 404);
  if (h.safety_flag) return [];
  const affected = AffectedOrdersSchema.parse(h.affected);
  const orderIds = [...affected.inTransit, ...affected.deliveredNoComplaint];
  if (!orderIds.length) return [];

  const sendActions = (
    await rt.db
      .select()
      .from(actions)
      .where(and(eq(actions.hypothesis_id, h.id), eq(actions.type, 'send_buyer_messages')))
  ).filter((a) => (a.payload as SendPayload).level === level);
  const messaged = new Set(
    sendActions.length
      ? (
          await rt.db
            .select({ buyerId: messages.buyer_id })
            .from(messages)
            .where(
              inArray(
                messages.action_id,
                sendActions.map((a) => a.id),
              ),
            )
        ).map((m) => m.buyerId)
      : [],
  );

  const rows = await rt.db
    .select({
      orderId: orders.id,
      invoiceId: orders.invoice_id,
      buyerId: orders.buyer_id,
      displayName: buyers.display_name,
      productName: order_items.name,
    })
    .from(orders)
    .innerJoin(order_items, eq(order_items.order_id, orders.id))
    .leftJoin(buyers, eq(buyers.id, orders.buyer_id))
    .where(inArray(orders.id, orderIds))
    .orderBy(orders.created_at, orders.id);
  const names = [...new Set(rows.map((r) => r.displayName).filter((n): n is string => !!n))];
  const targets = new Map<string, (typeof rows)[number]>();
  for (const r of rows)
    if (r.buyerId && !messaged.has(r.buyerId) && !targets.has(r.buyerId)) targets.set(r.buyerId, r);
  if (!targets.size) return [];

  const stored = sendActions
    .map((a) => (a.payload as SendPayload).template)
    .find((t): t is MessageTemplate => t !== undefined);
  let template = stored;
  if (!template) {
    const fault = await clusterFault(rt, h.cluster_id);
    const wording = buyerWording(level, DimensionSchema.parse(h.dimension), fault);
    template = await draftTemplate(wording, level, { buyerNames: names }, rt.models.text);
  }
  const drafts = [...targets.values()].map((target) => ({
    target,
    ...fillTemplate(template, { orderRef: target.invoiceId, productName: target.productName }),
  }));

  const now = rt.clock.now();
  return rt.db.transaction(async (tx) => {
    let action = sendActions.find((a) => a.status === 'proposed');
    if (!action) {
      [action] = await tx
        .insert(actions)
        .values({
          hypothesis_id: h.id,
          type: 'send_buyer_messages',
          payload: { messageIds: [], level, template } satisfies SendPayload,
          created_at: now,
        })
        .returning();
    }
    const inserted = await tx
      .insert(messages)
      .values(
        drafts.map((d) => ({
          merchant_id: h.merchant_id,
          order_id: d.target.orderId,
          buyer_id: d.target.buyerId,
          action_id: action!.id,
          channel: 'in_app',
          subject: d.subject,
          body: d.body,
          status: 'draft',
          created_at: now,
        })),
      )
      .returning();
    const payload = action!.payload as SendPayload;
    await tx
      .update(actions)
      .set({
        payload: {
          messageIds: [...payload.messageIds, ...inserted.map((m) => m.id)],
          level,
          template: payload.template ?? template,
        } satisfies SendPayload,
      })
      .where(eq(actions.id, action!.id));
    return inserted.map(toMessage);
  });
}

/** Section 15: draftBuyerMessages(hypothesisId, level) on the process runtime; suspected unless confirmed. */
export function draftBuyerMessages(
  hypothesisId: string,
  level: MessageLevel = 'suspected',
): Promise<Message[]> {
  return draftBuyerMessagesWith(getIntelRuntime(), hypothesisId, level);
}
