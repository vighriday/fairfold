import { MockEmbeddingModelV4, MockLanguageModelV4 } from 'ai/test';
import type { LanguageModelV4CallOptions, LanguageModelV4GenerateResult } from '@ai-sdk/provider';

/** Builds a generate result whose text content is `text` (the JSON the model "returned"). */
export function result(text: string): LanguageModelV4GenerateResult {
  return {
    content: [{ type: 'text', text }],
    finishReason: { unified: 'stop', raw: 'stop' },
    usage: {
      inputTokens: { total: 11, noCache: 11, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 7, text: 7, reasoning: undefined },
    },
    warnings: [],
  };
}

/** A mock language model that answers each call with the next text in `texts` (last one repeats). */
export function mockModel(texts: string[]) {
  const calls: LanguageModelV4CallOptions[] = [];
  let i = 0;
  const model = new MockLanguageModelV4({
    provider: 'mock',
    modelId: 'mock-model',
    doGenerate: async (options) => {
      calls.push(options);
      const text = texts[Math.min(i, texts.length - 1)] ?? '';
      i += 1;
      return result(text);
    },
  });
  return { model, calls };
}

/** A mock model that never answers until its abort signal fires. */
export function hangingModel() {
  const calls: LanguageModelV4CallOptions[] = [];
  const model = new MockLanguageModelV4({
    provider: 'mock',
    modelId: 'hanging-model',
    doGenerate: (options) => {
      calls.push(options);
      return new Promise((_, reject) => {
        options.abortSignal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    },
  });
  return { model, calls };
}

export function mockEmbedder(dimensions = 3) {
  return new MockEmbeddingModelV4({
    provider: 'mock',
    modelId: 'mock-embed',
    doEmbed: async ({ values }) => ({
      embeddings: values.map((v, i) =>
        Array.from({ length: dimensions }, (_, d) => (v.length + i + d) / 10),
      ),
      warnings: [],
    }),
  });
}
