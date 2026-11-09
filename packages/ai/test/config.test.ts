import { describe, expect, it, vi } from 'vitest';
import { getModel, hasModelConfig, readAiConfig } from '../src/config.ts';
import { embed } from '../src/embed.ts';
import { mockEmbedder } from './helpers.ts';

const xaiEnv = {
  AI_PROVIDER: 'xai', XAI_API_KEY: 'test-key',
  AI_MODEL_VISION: 'grok-vision-test', AI_MODEL_TEXT: 'grok-text-test',
};

describe('readAiConfig', () => {
  it('reads provider and model ids from the environment', () => {
    expect(readAiConfig(xaiEnv)).toMatchObject({
      provider: 'xai', models: { vision: 'grok-vision-test', text: 'grok-text-test' }, embeddingProvider: 'xai',
    });
  });

  it('embedding provider defaults to AI_PROVIDER and can be overridden', () => {
    const cfg = readAiConfig({ ...xaiEnv, AI_EMBEDDING_PROVIDER: 'openai', AI_MODEL_EMBEDDING: 'text-embedding-3-small', OPENAI_API_KEY: 'k' });
    expect(cfg.embeddingProvider).toBe('openai');
    expect(cfg.models.embedding).toBe('text-embedding-3-small');
  });

  it('rejects an unknown provider', () => {
    expect(() => readAiConfig({ AI_PROVIDER: 'acme' })).toThrow(/AI_PROVIDER/);
  });
});

describe('getModel', () => {
  it('builds a Grok language model for vision and text', () => {
    const vision = getModel('vision', xaiEnv);
    const text = getModel('text', xaiEnv);
    expect(vision.modelId).toBe('grok-vision-test');
    expect(text.modelId).toBe('grok-text-test');
    expect(vision.provider).toMatch(/xai/);
  });

  it('throws a clear error when the model id is missing', () => {
    expect(() => getModel('text', { AI_PROVIDER: 'xai', XAI_API_KEY: 'k' })).toThrow(/AI_MODEL_TEXT/);
  });

  it('refuses embeddings from a provider without an embedding model (xai)', () => {
    expect(() => getModel('embedding', { ...xaiEnv, AI_MODEL_EMBEDDING: 'anything' })).toThrow(/EMBEDDING_PROVIDER_UNSUPPORTED/);
  });

  it('builds an OpenAI embedding model when AI_EMBEDDING_PROVIDER=openai', () => {
    const m = getModel('embedding', { ...xaiEnv, AI_EMBEDDING_PROVIDER: 'openai', AI_MODEL_EMBEDDING: 'text-embedding-3-small', OPENAI_API_KEY: 'k' });
    expect(m.modelId).toBe('text-embedding-3-small');
  });
});

describe('hasModelConfig', () => {
  it('needs the provider, the model id and the provider key', () => {
    expect(hasModelConfig('vision', xaiEnv)).toBe(true);
    expect(hasModelConfig('vision', { ...xaiEnv, XAI_API_KEY: undefined })).toBe(false);
    expect(hasModelConfig('vision', { ...xaiEnv, AI_MODEL_VISION: undefined })).toBe(false);
    expect(hasModelConfig('text', {})).toBe(false);
    expect(hasModelConfig('vision', { AI_PROVIDER: 'acme' })).toBe(false);
  });
  it('checks the embedding provider and its key for embeddings', () => {
    expect(hasModelConfig('embedding', { ...xaiEnv, AI_MODEL_EMBEDDING: 'e' })).toBe(false);
    expect(hasModelConfig('embedding', { ...xaiEnv, AI_EMBEDDING_PROVIDER: 'openai', AI_MODEL_EMBEDDING: 'e', OPENAI_API_KEY: 'k' })).toBe(true);
  });
});

describe('embed', () => {
  it('returns one vector per input, in order, and logs the call', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const vectors = await embed(['a', 'bb'], { model: mockEmbedder(3) });
    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toHaveLength(3);
    expect(write.mock.calls.some((c) => String(c[0]).includes('"ai_embed"'))).toBe(true);
    write.mockRestore();
  });

  it('returns an empty list without calling the model', async () => {
    expect(await embed([], { model: mockEmbedder() })).toEqual([]);
  });
});
