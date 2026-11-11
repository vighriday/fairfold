import { APICallError, embedMany } from 'ai';
import type { EmbeddingModelV4 } from '@ai-sdk/provider';
import { getModel } from './config.js';
import { MODEL_TIMEOUT_MS } from './generate.js';
import { hashInput, logAi } from './log.js';

/**
 * Embeds texts in input order. Uses AI_EMBEDDING_PROVIDER (xai has no embedding model; see DECISIONS.md I-D1).
 * Same policy as generateStructured: a 30-second timeout and no retry, so a timeout or a provider refusal (e.g. a
 * 429 quota error) costs one request. The failure is logged and thrown; callers keep the complaint unembedded and
 * the next shared-cause scan embeds it.
 */
export async function embed(
  texts: string[],
  opts: { model?: EmbeddingModelV4; component?: string } = {},
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const model = opts.model ?? getModel('embedding');
  const base = {
    event: 'ai_embed',
    component: opts.component ?? 'embed',
    provider: model.provider,
    model: model.modelId,
    count: texts.length,
    inputHash: hashInput(texts),
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await embedMany({
      model,
      values: texts,
      maxRetries: 0,
      abortSignal: controller.signal,
    });
    logAi({
      ...base,
      ok: true,
      latencyMs: Date.now() - started,
      tokens: res.usage?.tokens ?? null,
    });
    return res.embeddings;
  } catch (err) {
    logAi({
      ...base,
      ok: false,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.name : 'unknown',
      ...(APICallError.isInstance(err) && err.statusCode ? { status: err.statusCode } : {}),
    });
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
