import { embedMany } from 'ai';
import type { EmbeddingModelV4 } from '@ai-sdk/provider';
import { getModel } from './config.js';
import { hashInput, logAi } from './log.js';

/** Embeds texts in input order. Uses AI_EMBEDDING_PROVIDER (xai has no embedding model; see DECISIONS.md I-D1). */
export async function embed(
  texts: string[],
  opts: { model?: EmbeddingModelV4; component?: string } = {},
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const model = opts.model ?? getModel('embedding');
  const started = Date.now();
  const res = await embedMany({ model, values: texts });
  logAi({
    event: 'ai_embed',
    component: opts.component ?? 'embed',
    provider: model.provider,
    model: model.modelId,
    count: texts.length,
    latencyMs: Date.now() - started,
    tokens: res.usage?.tokens ?? null,
    inputHash: hashInput(texts),
  });
  return res.embeddings;
}
