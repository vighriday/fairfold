import { MockLanguageModelV4 } from 'ai/test';
import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';

/** A mock model answering each call with the next JSON value (last repeats). Strings are sent verbatim (to fake bad output). */
export function mockModel(answers: unknown[]) {
  const calls: LanguageModelV4CallOptions[] = [];
  let i = 0;
  const model = new MockLanguageModelV4({
    provider: 'mock',
    modelId: 'mock-vision',
    doGenerate: async (options) => {
      calls.push(options);
      const answer = answers[Math.min(i, answers.length - 1)];
      i += 1;
      return {
        content: [{ type: 'text', text: typeof answer === 'string' ? answer : JSON.stringify(answer) }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 1, text: 1, reasoning: undefined },
        },
        warnings: [],
      };
    },
  });
  return { model, calls };
}

/** The system prompt and the user message's text parts of a recorded call. */
export function promptOf(call: LanguageModelV4CallOptions): { system: string; userText: string; fileCount: number } {
  let system = '';
  let userText = '';
  let fileCount = 0;
  for (const m of call.prompt) {
    if (m.role === 'system') system += m.content;
    if (m.role === 'user') {
      for (const part of m.content) {
        if (part.type === 'text') userText += part.text;
        if (part.type === 'file') fileCount += 1;
      }
    }
  }
  return { system, userText, fileCount };
}
