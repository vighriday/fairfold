// Model result cache keyed by input hash (architecture section 21: "cache attestation and extraction results by
// input hash; record the video from cached runs"). Off unless AI_CACHE_DIR is set. Only schema-valid model
// answers are stored; a fallback is never cached. A cached answer is re-validated against the schema on read.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toJSONSchema, type z } from 'zod';

export function cacheDir(env: Record<string, string | undefined> = process.env): string | null {
  return env.AI_CACHE_DIR?.trim() || null;
}

/** Same provider, model, prompt, inputs and output schema → same key. */
export function cacheKey(parts: {
  provider: string;
  modelId: string;
  inputHash: string;
  schema: z.ZodType;
}): string {
  let schemaText: string;
  try {
    schemaText = JSON.stringify(toJSONSchema(parts.schema));
  } catch {
    schemaText = 'unrepresentable';
  }
  return createHash('sha256')
    .update([parts.provider, parts.modelId, parts.inputHash, schemaText].join('\n'))
    .digest('hex');
}

export function readCached<T>(dir: string, key: string, schema: z.ZodType<T>): T | null {
  try {
    const parsed = schema.safeParse(
      (JSON.parse(readFileSync(join(dir, `${key}.json`), 'utf8')) as { value: unknown }).value,
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null; // missing or unreadable entry: ask the model
  }
}

export function writeCached(dir: string, key: string, value: unknown): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${key}.json`), JSON.stringify({ value }), 'utf8');
}
