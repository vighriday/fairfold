import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createXai } from '@ai-sdk/xai';
import type { EmbeddingModelV4, LanguageModelV4 } from '@ai-sdk/provider';

// D10: the provider and model ids come from the environment. Grok (xai) is the team's choice (DECISIONS.md I-D1).
export const PROVIDERS = ['xai', 'openai', 'anthropic', 'google'] as const;
export type Provider = (typeof PROVIDERS)[number];
export type ModelKind = 'vision' | 'text' | 'embedding';

/** Providers whose AI SDK package offers an embedding model. xai and anthropic do not. */
const EMBEDDING_CAPABLE: ReadonlySet<Provider> = new Set(['openai', 'google']);

const KEY_VARS: Record<Provider, string> = {
  xai: 'XAI_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
};

export type Env = Record<string, string | undefined>;

export interface AiConfig {
  provider: Provider;
  embeddingProvider: Provider;
  models: { vision?: string; text?: string; embedding?: string };
}

function parseProvider(name: string, value: string | undefined): Provider {
  if (value && (PROVIDERS as readonly string[]).includes(value)) return value as Provider;
  throw new Error(`${name} must be one of ${PROVIDERS.join(', ')} (got ${value ?? 'nothing'})`);
}

export function readAiConfig(env: Env = process.env): AiConfig {
  const provider = parseProvider('AI_PROVIDER', env.AI_PROVIDER);
  const embeddingProvider = env.AI_EMBEDDING_PROVIDER
    ? parseProvider('AI_EMBEDDING_PROVIDER', env.AI_EMBEDDING_PROVIDER)
    : provider;
  return {
    provider,
    embeddingProvider,
    models: { vision: env.AI_MODEL_VISION, text: env.AI_MODEL_TEXT, embedding: env.AI_MODEL_EMBEDDING },
  };
}

function providerFactory(provider: Provider, env: Env) {
  const apiKey = env[KEY_VARS[provider]];
  switch (provider) {
    case 'xai': return createXai({ apiKey });
    case 'openai': return createOpenAI({ apiKey });
    case 'anthropic': return createAnthropic({ apiKey });
    case 'google': return createGoogleGenerativeAI({ apiKey });
  }
}

function requireModelId(kind: ModelKind, id: string | undefined): string {
  if (!id) throw new Error(`AI_MODEL_${kind.toUpperCase()} is not set`);
  return id;
}

export function getModel(kind: 'vision' | 'text', env?: Env): LanguageModelV4;
export function getModel(kind: 'embedding', env?: Env): EmbeddingModelV4;
export function getModel(kind: ModelKind, env: Env = process.env): LanguageModelV4 | EmbeddingModelV4 {
  const cfg = readAiConfig(env);
  if (kind === 'embedding') {
    if (!EMBEDDING_CAPABLE.has(cfg.embeddingProvider)) {
      throw new Error(
        `EMBEDDING_PROVIDER_UNSUPPORTED: ${cfg.embeddingProvider} has no embedding model; ` +
          'set AI_EMBEDDING_PROVIDER to openai or google and AI_MODEL_EMBEDDING to its model id',
      );
    }
    const id = requireModelId(kind, cfg.models.embedding);
    const factory = providerFactory(cfg.embeddingProvider, env) as { embeddingModel(id: string): EmbeddingModelV4 };
    return factory.embeddingModel(id);
  }
  const id = requireModelId(kind, cfg.models[kind]);
  return providerFactory(cfg.provider, env).languageModel(id) as LanguageModelV4;
}
