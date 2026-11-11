import { afterEach, describe, expect, it, vi } from 'vitest';
import { APICallError } from 'ai';
import { MockEmbeddingModelV4 } from 'ai/test';
import { embed } from '../src/embed.js';
import { mockEmbedder } from './helpers.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** An embedding model that never answers until its abort signal fires. */
function hangingEmbedder() {
  return new MockEmbeddingModelV4({
    provider: 'mock',
    modelId: 'hanging-embed',
    doEmbed: ({ abortSignal }) =>
      new Promise((_, reject) => {
        abortSignal?.addEventListener('abort', () => reject(new Error('aborted')));
      }),
  });
}

/** An embedding model whose provider refuses every call (e.g. 429 quota exhausted). */
function refusingEmbedder(statusCode: number) {
  return new MockEmbeddingModelV4({
    provider: 'mock',
    modelId: 'refusing-embed',
    doEmbed: async () => {
      throw new APICallError({
        message: 'quota exceeded',
        url: 'https://example.invalid/embed',
        requestBodyValues: {},
        statusCode,
        isRetryable: statusCode === 429,
      });
    },
  });
}

const logLines = (write: { mock: { calls: unknown[][] } }) =>
  write.mock.calls
    .map((c) => String(c[0]))
    .filter((l) => l.includes('"ai_embed"'))
    .map((l) => JSON.parse(l) as Record<string, unknown>);

describe('embed timeout and refusals', () => {
  it('gives up after 30 seconds, without a retry, and logs the failure', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.useFakeTimers();
    const model = hangingEmbedder();
    const pending = embed(['a'], { model, component: 'test' });
    const settled = pending.then(
      () => 'resolved',
      () => 'rejected',
    );
    await vi.advanceTimersByTimeAsync(29_999);
    expect(model.doEmbedCalls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await settled).toBe('rejected');
    expect(model.doEmbedCalls).toHaveLength(1);
    expect(logLines(write)).toEqual([expect.objectContaining({ ok: false, component: 'test' })]);
  });

  it('does not retry a provider refusal such as a 429 quota error, and logs its status', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const model = refusingEmbedder(429);
    await expect(embed(['a', 'b'], { model })).rejects.toThrow();
    expect(model.doEmbedCalls).toHaveLength(1);
    expect(logLines(write)).toEqual([
      expect.objectContaining({ ok: false, error: 'AI_APICallError', status: 429, count: 2 }),
    ]);
  });

  it('logs a successful call with ok true', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await embed(['a'], { model: mockEmbedder(3), component: 'test' });
    expect(logLines(write)).toEqual([
      expect.objectContaining({ ok: true, component: 'test', count: 1 }),
    ]);
  });
});
