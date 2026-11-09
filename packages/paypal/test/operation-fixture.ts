import { randomBytes } from 'node:crypto';
import { expect, vi } from 'vitest';
import { DemoSubjects, encryptSecret } from '@fairfold/contracts';
import { PAYPAL_SANDBOX_API, createMerchantTransportFactory } from '../src/transport.js';

export function operationFixture() {
  const responses: Array<{ body: unknown; status: number }> = [];
  const calls: Array<{ url: URL; method: string; headers: Headers; body: unknown }> = [];
  const logger = { warn: vi.fn() };
  const key = randomBytes(32);
  const secretEncrypted = encryptSecret('synthetic-secret', key);
  const fetcher = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = new URL(String(input));
    expect(url.origin).toBe(PAYPAL_SANDBOX_API);
    if (url.pathname === '/v1/oauth2/token')
      return Response.json({
        access_token: 'SYNTHETIC-OPERATION-TOKEN',
        token_type: 'Bearer',
        expires_in: 3600,
      });
    calls.push({
      url,
      method: init!.method!,
      headers: new Headers(init!.headers),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    const response = responses.shift();
    if (!response) throw new Error('No synthetic operation response queued');
    return response.status === 204
      ? new Response(null, { status: 204 })
      : Response.json(response.body, {
          status: response.status,
          headers: { 'paypal-debug-id': 'synthetic-operation-debug' },
        });
  });
  const sleep = vi.fn(async (_ms: number) => {});
  const transport = createMerchantTransportFactory({
    credentials: {
      lookup: async () => ({ clientId: 'synthetic-client', secretEncrypted, simulated: false }),
    },
    encryptionKey: key,
    logger,
    fetch: fetcher,
    sleep,
    apiBase: PAYPAL_SANDBOX_API,
  })(DemoSubjects.merchant);
  return {
    transport,
    fetcher,
    logger,
    calls,
    sleep,
    respond: (body: unknown, status = 200) => responses.push({ body, status }),
  };
}
