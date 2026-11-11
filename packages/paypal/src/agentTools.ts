import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '@fairfold/contracts';
import { createProvideDisputeEvidenceTool } from './dispute-tool.js';

/** Merchant context is supplied by authenticated code, never by tool arguments. */
export function provideDisputeEvidenceTool(
  merchantId: string,
  options: Parameters<typeof createProvideDisputeEvidenceTool>[0],
) {
  const parameters = z
    .object({
      dispute_id: z.string().regex(/^[A-Za-z0-9-]{1,255}$/),
      evidences: z.array(z.record(z.string(), z.unknown())).min(1).max(100),
      files: z
        .array(
          z
            .object({
              filename: z.string().regex(/^[^\\/\r\n\0]{1,255}$/u),
              mime: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
              base64: z.string().max(14_000_000),
            })
            .strict(),
        )
        .max(6),
    })
    .strict();
  const enqueue = createProvideDisputeEvidenceTool(options);
  return {
    name: 'provide_dispute_evidence',
    description:
      'Queue an exact existing human-approved evidence pack for the authenticated merchant. This tool cannot approve or change evidence.',
    parameters,
    async execute(input: z.infer<typeof parameters>) {
      const value = parameters.parse(input);
      let total = 0;
      const files = value.files.map(({ base64, filename, mime }) => {
        const bytes = Buffer.from(base64, 'base64');
        total += bytes.length;
        if (
          !base64 ||
          bytes.toString('base64') !== base64 ||
          bytes.length >= 10_000_000 ||
          total > 40_000_000
        )
          throw new AppError(
            'INVALID_DISPUTE_TOOL_INPUT',
            'Evidence encoding or byte limit is invalid',
            400,
          );
        return { filename, mime, sha256: createHash('sha256').update(bytes).digest('hex') };
      });
      return enqueue(merchantId, {
        dispute_id: value.dispute_id,
        evidences: value.evidences,
        files,
      });
    },
  };
}
