import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  AppError,
  ErrorEnvelopeSchema,
  ListQuerySchema,
  MessageSchema,
  UuidSchema,
} from '@fairfold/contracts';
import { messages, orders, type Database } from '@fairfold/db';
import { createLedger } from '@fairfold/ledger';
import { redactDisputeText } from '@fairfold/paypal';
import { requireAuth } from '../../auth.js';

export function createProofMessageRoutes(database: Database): FastifyPluginAsync {
  return async (server) => {
    const app = server.withTypeProvider<ZodTypeProvider>();
    const errors = {
      400: ErrorEnvelopeSchema,
      401: ErrorEnvelopeSchema,
      403: ErrorEnvelopeSchema,
      404: ErrorEnvelopeSchema,
    };
    app.get(
      '/api/orders/:id/ledger',
      {
        preHandler: requireAuth(['merchant', 'buyer']),
        schema: {
          tags: ['Orders'],
          security: [{ bearerAuth: [] }],
          params: z.object({ id: UuidSchema }),
          response: {
            200: z.object({
              entries: z.array(z.unknown()),
              verified: z.boolean(),
              brokenAtSeq: z.number().int().nullable(),
            }),
            ...errors,
          },
        },
      },
      async (request) => {
        const auth = request.auth!;
        const [order] = await database
          .select({ id: orders.id })
          .from(orders)
          .where(
            and(
              eq(orders.id, request.params.id),
              auth.role === 'merchant'
                ? eq(orders.merchant_id, auth.subjectId)
                : eq(orders.buyer_id, auth.subjectId),
            ),
          );
        if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order was not found', 404);
        return createLedger(database).verify(order.id);
      },
    );
    for (const role of ['merchant', 'buyer'] as const) {
      app.get(
        '/api/' + role + '/messages',
        {
          preHandler: requireAuth(role),
          schema: {
            tags: ['Messages'],
            security: [{ bearerAuth: [] }],
            querystring: ListQuerySchema.extend({
              status: z.enum(['draft', 'approved', 'sent', 'failed']).optional(),
            }),
            response: { 200: z.array(MessageSchema), ...errors },
          },
        },
        async (request) => {
          const { limit, cursor, status } = request.query;
          if (limit > 100)
            throw new AppError('INVALID_MESSAGE_QUERY', 'Use a bounded message list', 400);
          const owner =
            role === 'merchant'
              ? eq(messages.merchant_id, request.auth!.subjectId)
              : eq(messages.buyer_id, request.auth!.subjectId);
          const visibleStatus =
            role === 'buyer'
              ? eq(messages.status, 'sent')
              : status
                ? eq(messages.status, status)
                : undefined;
          const [anchor] = cursor
            ? await database
                .select({ id: messages.id, createdAt: messages.created_at })
                .from(messages)
                .where(and(owner, visibleStatus, eq(messages.id, UuidSchema.parse(cursor))))
            : [];
          if (cursor && !anchor)
            throw new AppError('INVALID_CURSOR', 'Message cursor is invalid', 400);
          const rows = await database
            .select()
            .from(messages)
            .where(
              and(
                owner,
                visibleStatus,
              anchor ? sql`(${messages.created_at}, ${messages.id}) > (select created_at, id from messages where id = ${anchor.id})` : undefined,
              ),
            )
            .orderBy(messages.created_at, messages.id)
            .limit(limit);
          return rows.map((row) =>
            MessageSchema.parse({
              id: row.id,
              orderId: row.order_id,
              buyerId: row.buyer_id,
              disputeId: row.dispute_id,
              actionId: row.action_id,
              channel: row.channel,
              subject: row.subject ? redactDisputeText(row.subject) : null,
              body: redactDisputeText(row.body),
              status: row.status,
              sentAt: row.sent_at?.toISOString() ?? null,
            }),
          );
        },
      );
    }
  };
}
