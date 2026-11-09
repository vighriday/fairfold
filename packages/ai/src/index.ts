// packages/ai — the only module that talks to a model provider (section 6, D9, D10).
export { getModel, readAiConfig, PROVIDERS } from './config.ts';
export type { AiConfig, Env, ModelKind, Provider } from './config.ts';
export { generateStructured, UNTRUSTED_SYSTEM_RULE, MODEL_TIMEOUT_MS } from './generate.ts';
export type { StructuredArgs, StructuredResult } from './generate.ts';
export { embed } from './embed.ts';
export { wrapUntrusted } from './untrusted.ts';
export { hashInput, logAi } from './log.ts';
