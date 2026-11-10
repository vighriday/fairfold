import { describe, expect, it, vi } from 'vitest';
import {
  beginShopperRun,
  completeShopperRun,
  createMcpShopperTools,
  McpToolError,
  sanitizeTranscript,
} from '../src/index.js';

const item = (merchantId: string, storeBand: 'verified' | 'standard' | 'caution') => ({
  merchantId,
  sku: 'NAVY-HOODIE',
  name: 'Navy hoodie',
  price: { currency_code: 'USD', value: '40.00' },
  storeBand,
});
const report = (merchantId: string, band: 'verified' | 'standard' | 'caution') => ({
  merchantId,
  band,
  facts: { domain: `${merchantId}.example`, domainRegisteredAt: null, policies: [] },
  fulfilment: {
    ordersSealed90d: 2,
    medianHoursCaptureToSeal: 4,
    pctTrackingWithin72h: 1,
    pctWithPackingEvidence: 1,
    disputeRate90d: 0,
    proactiveFixes90d: 1,
    unansweredNotReceived: 0,
  },
  reviews: { count: 0, average: null, themes: [] },
  sources: [],
  computedAt: '2026-11-10T00:00:00.000Z',
});

describe('shopper policy loop', () => {
  it('adapts authenticated MCP tool calls without exposing the bearer token', async () => {
    const fetchImpl = vi.fn(async (_input, init) => {
      expect(init?.headers).toMatchObject({ 'content-type': 'application/json' });
      expect(init?.headers?.authorization).toBe('Bearer secret-token');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          jsonrpc: '2.0',
          id: 'shopper-search_catalog',
          result: {
            content: [{ type: 'text', text: JSON.stringify([item('merchant-1', 'verified')]) }],
          },
        }),
      };
    });
    const tools = createMcpShopperTools({
      endpoint: 'http://localhost:3110/mcp',
      bearerToken: 'secret-token',
      fetchImpl,
    });
    await expect(tools('search_catalog', { query: 'hoodie', maxPrice: '45.00' })).resolves.toEqual([
      item('merchant-1', 'verified'),
    ]);
  });

  it('surfaces MCP error envelopes and malformed tool results', async () => {
    const errorTools = createMcpShopperTools({
      endpoint: 'http://localhost:3110/mcp',
      bearerToken: 'secret-token',
      fetchImpl: vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: 'MCP_TOOL_NOT_FOUND', message: 'Unsupported MCP tool' },
        }),
      })),
    });
    await expect(errorTools('search_catalog', { query: 'hoodie' })).rejects.toMatchObject({
      name: 'McpToolError',
      code: 'MCP_TOOL_NOT_FOUND',
      status: 400,
    } satisfies Partial<McpToolError>);

    const malformedTools = createMcpShopperTools({
      endpoint: 'http://localhost:3110/mcp',
      bearerToken: 'secret-token',
      fetchImpl: vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ result: { content: [{ type: 'text', text: 'not-json' }] } }),
      })),
    });
    await expect(malformedTools('search_catalog', { query: 'hoodie' })).rejects.toMatchObject({
      code: 'MCP_RESULT_INVALID',
    });
  });

  it('skips caution stores and pauses before PayPal approval', async () => {
    const createOrder = vi.fn(async () => ({
      orderId: 'order-1',
      approvalUrl: 'https://paypal.test/approve',
    }));
    const run = await beginShopperRun(
      async (name, args) =>
        name === 'search_catalog'
          ? [
              item('00000000-0000-4000-8000-000000000001', 'caution'),
              item('00000000-0000-4000-8000-000000000002', 'verified'),
            ]
          : report(
              args.merchantId!,
              args.merchantId === '00000000-0000-4000-8000-000000000002' ? 'verified' : 'caution',
            ),
      { createOrder, capture: vi.fn() },
      { query: 'navy hoodie', maxPrice: '45.00' },
    );
    expect(run.status).toBe('awaiting_paypal_approval');
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: '00000000-0000-4000-8000-000000000002',
        context: { sandbox: true },
      }),
    );
    expect(run.transcript).toContainEqual({
      type: 'skip_store',
      merchantId: '00000000-0000-4000-8000-000000000001',
      reason: 'caution',
    });
  });

  it('requires explicit human approval and passes sandbox context to capture', async () => {
    const capture = vi.fn(async () => ({ status: 'captured' }));
    const run = {
      status: 'awaiting_paypal_approval' as const,
      orderId: 'order-1',
      approvalUrl: 'https://paypal.test/approve',
      merchantId: '00000000-0000-4000-8000-000000000002',
      item: item('00000000-0000-4000-8000-000000000002', 'verified'),
      transcript: [],
    };
    await expect(completeShopperRun({ createOrder: vi.fn(), capture }, run, [])).rejects.toThrow(
      'Human PayPal approval is required',
    );
    const complete = await completeShopperRun({ createOrder: vi.fn(), capture }, run, [
      'paypal-approved',
    ]);
    expect(capture).toHaveBeenCalledWith({ orderId: 'order-1', context: { sandbox: true } });
    expect(complete.status).toBe('captured');
    expect(sanitizeTranscript(complete.transcript)).toEqual(complete.transcript);
  });
});
