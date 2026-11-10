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
import type { IntelRuntime } from '../runtime.js';
import { draftMessage, type MessageLevel } from './drafter.js';
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
 * `level`, under a proposed send_buyer_messages action ({ messageIds, level }). Buyers who already have a message
 * at this level for this hypothesis are skipped, so re-running adds only new buyers. Safety-flagged: no drafts.
 */
export async function draftBuyerMessages(
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

  const fault = await clusterFault(rt, h.cluster_id);
  const wording = buyerWording(level, DimensionSchema.parse(h.dimension), fault);
  const drafts: Array<{ target: (typeof rows)[number]; subject: string; body: string }> = [];
  for (const target of targets.values()) {
    const draft = await draftMessage(
      { orderRef: target.invoiceId, productName: target.productName },
      wording,
      level,
      { otherBuyerNames: names.filter((n) => n !== target.displayName) },
      rt.models.text,
    );
    drafts.push({ target, subject: draft.subject, body: draft.body });
  }

  const now = rt.clock.now();
  return rt.db.transaction(async (tx) => {
    let action = sendActions.find((a) => a.status === 'proposed');
    if (!action) {
      [action] = await tx
        .insert(actions)
        .values({
          hypothesis_id: h.id,
          type: 'send_buyer_messages',
          payload: { messageIds: [], level } satisfies SendPayload,
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
        } satisfies SendPayload,
      })
      .where(eq(actions.id, action!.id));
    return inserted.map(toMessage);
  });
}
