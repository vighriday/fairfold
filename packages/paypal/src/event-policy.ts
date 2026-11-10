import { z } from 'zod';
import { AppError, MoneySchema } from '@fairfold/contracts';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,255}$/);
const kind = z
  .string()
  .max(128)
  .regex(/^[A-Z][A-Z0-9_]*(?:\.[A-Z0-9_]+){1,5}$/);
const envelope = z.object({ id, event_type: kind });
const record = z.record(z.string(), z.unknown());
const status = z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/);
const version = z.string().regex(/^\d{1,3}\.\d{1,3}$/);
const resourceType = z.string().regex(/^[a-z][a-z_]{0,63}$/);
const timestamp = z.iso.datetime({ offset: true, precision: null });

function optional<T>(schema: z.ZodType<T>, value: unknown): T | undefined {
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
}

/** Approved Q3 field allowlist; never stores arbitrary vendor nested objects. */
export function minimizeEvent(input: unknown, verified: boolean) {
  const meta = envelope.safeParse(input);
  if (!meta.success) throw new AppError('WEBHOOK_EVENT_INVALID', 'Event metadata is invalid', 400);
  if (!verified) return { ...meta.data };
  const source = record.parse(input);
  const resource = record.safeParse(source.resource);
  if (!resource.success)
    throw new AppError('WEBHOOK_EVENT_INVALID', 'Event resource is invalid', 400);
  const related = record.safeParse(
    record.safeParse(resource.data.supplementary_data).data?.related_ids,
  ).data;
  const createTime = optional(timestamp, source.create_time);
  const fields = {
    id: optional(id, resource.data.id),
    dispute_id: optional(id, resource.data.dispute_id),
    status: optional(status, resource.data.status),
    amount: optional(MoneySchema, resource.data.amount),
    supplementary_data: related
      ? {
          related_ids: {
            order_id: optional(id, related.order_id),
            capture_id: optional(id, related.capture_id),
          },
        }
      : undefined,
  };
  return JSON.parse(
    JSON.stringify({
      ...meta.data,
      create_time: createTime ? new Date(createTime).toISOString() : undefined,
      resource_type: optional(resourceType, source.resource_type),
      event_version: optional(version, source.event_version),
      resource_version: optional(version, source.resource_version),
      resource: fields,
    }),
  ) as VerifiedEvent;
}

export interface VerifiedEvent {
  id: string;
  event_type: string;
  create_time?: string;
  resource_type?: string;
  event_version?: string;
  resource_version?: string;
  resource: {
    id?: string;
    dispute_id?: string;
    status?: string;
    amount?: { currency_code: string; value: string };
    supplementary_data?: { related_ids: { order_id?: string; capture_id?: string } };
  };
}
