import {
  CatalogItemSchema,
  StoreReportSchema,
  type CatalogItem,
  type StoreReport,
} from '@fairfold/contracts';

export type SandboxContext = { readonly sandbox: true };
export type ShopperTool = (
  name: 'search_catalog' | 'get_store_report',
  args: Record<string, string>,
) => Promise<unknown>;

export type McpFetch = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export class McpToolError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'McpToolError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function createMcpShopperTools(options: {
  endpoint: string;
  bearerToken: string;
  fetchImpl?: McpFetch;
}): ShopperTool {
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as McpFetch | undefined);
  if (!fetchImpl) throw new McpToolError('Fetch is unavailable', 0, 'MCP_FETCH_UNAVAILABLE');
  if (!options.bearerToken)
    throw new McpToolError('Bearer token is required', 0, 'MCP_TOKEN_REQUIRED');

  return async (name, args) => {
    const response = await fetchImpl(options.endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${options.bearerToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `shopper-${name}`,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    });
    const payload = await response.json();
    if (!isRecord(payload)) {
      throw new McpToolError('MCP request failed', response.status, 'MCP_REQUEST_FAILED');
    }
    if ('error' in payload) {
      const error = isRecord(payload.error) ? payload.error : {};
      throw new McpToolError(
        typeof error.message === 'string' ? error.message : 'MCP tool failed',
        response.status,
        typeof error.code === 'string' ? error.code : 'MCP_TOOL_FAILED',
      );
    }
    if (!response.ok) {
      throw new McpToolError('MCP request failed', response.status, 'MCP_REQUEST_FAILED');
    }
    const result = payload.result;
    if (!isRecord(result) || !Array.isArray(result.content)) {
      throw new McpToolError('MCP response was malformed', response.status, 'MCP_RESPONSE_INVALID');
    }
    const text = result.content.find(
      (entry): entry is { type: 'text'; text: string } =>
        isRecord(entry) && entry.type === 'text' && typeof entry.text === 'string',
    )?.text;
    if (text === undefined) {
      throw new McpToolError(
        'MCP response contained no tool result',
        response.status,
        'MCP_RESULT_INVALID',
      );
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new McpToolError('MCP tool result was not JSON', response.status, 'MCP_RESULT_INVALID');
    }
  };
}
export type CheckoutAdapter = {
  createOrder(input: {
    merchantId: string;
    sku: string;
    quantity: number;
    context: SandboxContext;
  }): Promise<{ orderId: string; approvalUrl: string }>;
  capture(input: { orderId: string; context: SandboxContext }): Promise<{ status: string }>;
};
export type Approval = 'store-confirmed' | 'paypal-approved';
export type ShopperTranscriptEvent =
  | { type: 'search'; query: string; maxPrice: string; resultCount: number }
  | { type: 'store_report'; merchantId: string; band: StoreReport['band'] }
  | { type: 'skip_store'; merchantId: string; reason: 'caution' }
  | { type: 'awaiting_store_confirmation'; merchantId: string; reason: 'not_verified' }
  | { type: 'approval_required'; orderId: string; approvalUrl: string }
  | { type: 'captured'; orderId: string; status: string };

export type ShopperRun =
  | {
      status: 'awaiting_store_confirmation';
      merchantId: string;
      item: CatalogItem;
      transcript: ShopperTranscriptEvent[];
    }
  | {
      status: 'awaiting_paypal_approval';
      orderId: string;
      approvalUrl: string;
      merchantId: string;
      item: CatalogItem;
      transcript: ShopperTranscriptEvent[];
    }
  | {
      status: 'captured';
      orderId: string;
      merchantId: string;
      item: CatalogItem;
      transcript: ShopperTranscriptEvent[];
    }
  | { status: 'no_match'; transcript: ShopperTranscriptEvent[] };

function choose(items: CatalogItem[]) {
  return [...items].sort((a, b) => {
    const rank = { verified: 0, standard: 1, new: 2, caution: 3 };
    return rank[a.storeBand] - rank[b.storeBand] || Number(a.price.value) - Number(b.price.value);
  })[0];
}

export async function beginShopperRun(
  tools: ShopperTool,
  checkout: CheckoutAdapter,
  input: { query: string; maxPrice: string },
): Promise<ShopperRun> {
  const transcript: ShopperTranscriptEvent[] = [];
  const rawItems = await tools('search_catalog', input);
  const items = Array.isArray(rawItems)
    ? rawItems.map((item) => CatalogItemSchema.parse(item))
    : [];
  transcript.push({ type: 'search', ...input, resultCount: items.length });
  const reports = new Map<string, StoreReport>();
  for (const merchantId of [...new Set(items.map((item) => item.merchantId))]) {
    const report = StoreReportSchema.parse(await tools('get_store_report', { merchantId }));
    reports.set(merchantId, report);
    transcript.push({ type: 'store_report', merchantId, band: report.band });
  }
  const eligible = items.filter((item) => {
    const band = reports.get(item.merchantId)?.band ?? item.storeBand;
    if (band === 'caution') {
      transcript.push({ type: 'skip_store', merchantId: item.merchantId, reason: 'caution' });
      return false;
    }
    return true;
  });
  const item = choose(eligible);
  if (!item) return { status: 'no_match', transcript };
  const reportBand = reports.get(item.merchantId)?.band ?? item.storeBand;
  if (reportBand !== 'verified') {
    transcript.push({
      type: 'awaiting_store_confirmation',
      merchantId: item.merchantId,
      reason: 'not_verified',
    });
    return { status: 'awaiting_store_confirmation', merchantId: item.merchantId, item, transcript };
  }
  const created = await checkout.createOrder({
    merchantId: item.merchantId,
    sku: item.sku,
    quantity: 1,
    context: { sandbox: true },
  });
  transcript.push({ type: 'approval_required', ...created });
  return {
    status: 'awaiting_paypal_approval',
    orderId: created.orderId,
    approvalUrl: created.approvalUrl,
    merchantId: item.merchantId,
    item,
    transcript,
  };
}

export async function completeShopperRun(
  checkout: CheckoutAdapter,
  run: Extract<ShopperRun, { status: 'awaiting_paypal_approval' }>,
  approvals: readonly Approval[],
): Promise<Extract<ShopperRun, { status: 'captured' }>> {
  if (!approvals.includes('paypal-approved'))
    throw new Error('Human PayPal approval is required before capture');
  const result = await checkout.capture({ orderId: run.orderId, context: { sandbox: true } });
  const transcript = [
    ...run.transcript,
    { type: 'captured' as const, orderId: run.orderId, status: result.status },
  ];
  return {
    status: 'captured',
    orderId: run.orderId,
    merchantId: run.merchantId,
    item: run.item,
    transcript,
  };
}

export function sanitizeTranscript(transcript: readonly ShopperTranscriptEvent[]) {
  return transcript.map((event) => ({ ...event }));
}
