import { describe, expect, it } from 'vitest';
import { renderCostTable, summariseCalls } from '../eval/cost.js';

const line = (o: Record<string, unknown>) => JSON.stringify({ ts: '2026-11-10T00:00:00Z', ...o });

describe('call-log cost summary', () => {
  it('groups model calls by component and model, counting tokens, failures and fallbacks', () => {
    const rows = summariseCalls([
      line({
        event: 'ai_call',
        component: 'evidence',
        provider: 'xai',
        model: 'grok-v',
        attempt: 1,
        ok: true,
        latencyMs: 1200,
        inputTokens: 900,
        outputTokens: 120,
      }),
      line({
        event: 'ai_call',
        component: 'evidence',
        provider: 'xai',
        model: 'grok-v',
        attempt: 1,
        ok: false,
        latencyMs: 300,
        error: 'AI_NoObjectGeneratedError',
      }),
      line({
        event: 'ai_call',
        component: 'evidence',
        provider: 'xai',
        model: 'grok-v',
        attempt: 2,
        ok: true,
        latencyMs: 800,
        inputTokens: 950,
        outputTokens: 100,
      }),
      line({
        event: 'ai_call',
        component: 'message_drafter',
        model: 'none',
        attempt: 0,
        ok: false,
        latencyMs: 0,
        error: 'model_not_configured',
      }),
      line({
        event: 'ai_embed',
        component: 'complaint_reader',
        provider: 'openai',
        model: 'text-embedding-3-small',
        count: 3,
        latencyMs: 90,
        tokens: 30,
      }),
      line({
        event: 'ai_embed',
        component: 'complaint_reader',
        embedding: 'local',
        dimensions: 256,
      }),
      'not json at all',
      '{"msg":"pino line without an event"}',
    ]);
    expect(rows).toEqual([
      {
        component: 'complaint_reader',
        model: 'local',
        calls: 1,
        ok: 1,
        failed: 0,
        notConfigured: 0,
        inputTokens: 0,
        outputTokens: 0,
        medianLatencyMs: 0,
      },
      {
        component: 'complaint_reader',
        model: 'openai/text-embedding-3-small',
        calls: 1,
        ok: 1,
        failed: 0,
        notConfigured: 0,
        inputTokens: 30,
        outputTokens: 0,
        medianLatencyMs: 90,
      },
      {
        component: 'evidence',
        model: 'xai/grok-v',
        calls: 3,
        ok: 2,
        failed: 1,
        notConfigured: 0,
        inputTokens: 1850,
        outputTokens: 220,
        medianLatencyMs: 800,
      },
      {
        component: 'message_drafter',
        model: 'none',
        calls: 1,
        ok: 0,
        failed: 0,
        notConfigured: 1,
        inputTokens: 0,
        outputTokens: 0,
        medianLatencyMs: 0,
      },
    ]);
  });

  it('renders a Markdown table with totals; an empty log says so', () => {
    const table = renderCostTable(
      summariseCalls([
        line({
          event: 'ai_call',
          component: 'evidence',
          provider: 'xai',
          model: 'grok-v',
          attempt: 1,
          ok: true,
          latencyMs: 10,
          inputTokens: 5,
          outputTokens: 2,
        }),
      ]),
    );
    expect(table).toContain('| evidence | xai/grok-v | 1 | 1 | 0 | 0 | 5 | 2 | 10 |');
    expect(table).toContain('| **Total** | | 1 | 1 | 0 | 0 | 5 | 2 | |');
    expect(renderCostTable([])).toBe('No model calls in the log.\n');
  });
});
