import { z } from 'zod';
import { UuidSchema } from './common.js';

const order = z.object({ orderId: UuidSchema }).strict();
const merchant = z.object({ merchantId: UuidSchema }).strict();
const hashes = z.array(z.string().regex(/^[a-f0-9]{64}$/));
const sweep = z.object({}).strict();
export const JobSchemas = {
  'order.captured': order,
  'pack.photos_uploaded': z
    .object({
      orderId: UuidSchema,
      photoShas: hashes,
      labels: z.array(z.string()),
      batchCodes: z.record(z.string(), z.string()),
    })
    .strict(),
  'tracking.push': order,
  'paypal.event': z.object({ eventId: z.string().min(1) }).strict(),
  'dispute.synced': z
    .object({
      disputeId: z.string().min(1),
      isNew: z.boolean(),
      newBuyerMessages: z.array(z.string()),
    })
    .strict(),
  'disputes.poll': merchant,
  'evidence.submit': z.object({ packId: UuidSchema }).strict(),
  'evidence.rebuild': z.union([
    z.object({ disputeId: z.string().min(1) }).strict(),
    z.object({ disputeIds: z.array(z.string().min(1)) }).strict(),
  ]),
  'complaint.created': z.object({ complaintId: UuidSchema }).strict(),
  'sharedcause.scan': merchant,
  'sharedcause.sweep': sweep,
  'inspection.uploaded': z
    .object({ hypothesisId: UuidSchema, batchCode: z.string().min(1), photoShas: hashes })
    .strict(),
  'action.approved': z.object({ actionId: UuidSchema }).strict(),
  'storereport.refresh': merchant,
  'watchdog.sweep': sweep,
  'retention.sweep': sweep,
} as const;
export type JobName = keyof typeof JobSchemas;
export const JobNames = Object.keys(JobSchemas) as JobName[];
export type JobPayload<N extends JobName> = z.infer<(typeof JobSchemas)[N]>;
export type HandlerMap = { [N in JobName]?: (payload: JobPayload<N>) => Promise<void> };
