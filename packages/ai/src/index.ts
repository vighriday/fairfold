// packages/ai — the only module that talks to a model provider (section 6, D9, D10).
export { getModel, hasModelConfig, readAiConfig, PROVIDERS } from './config.js';
export type { AiConfig, Env, ModelKind, Provider } from './config.js';
export { generateStructured, UNTRUSTED_SYSTEM_RULE, MODEL_TIMEOUT_MS } from './generate.js';
export type { StructuredArgs, StructuredResult } from './generate.js';
export { embed } from './embed.js';
export { wrapUntrusted } from './untrusted.js';
export { hashInput, logAi } from './log.js';
export type {
  LanguageModelV4 as LanguageModel,
  EmbeddingModelV4 as EmbeddingModel,
} from '@ai-sdk/provider';
