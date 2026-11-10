import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { DemoSubjects, encryptSecret } from '@fairfold/contracts';
import {
  PAYPAL_SANDBOX_API,
  PayPalError,
  createMerchantTransportFactory,
  type MerchantCredentials,
} from '../src/index.js';

// These credentials and vendor responses are synthetic, never recorded sandbox fixtures.
interface Call {
  path: string;
  method: string | undefined;
  headers: Headers;
  body: RequestInit['body'];
  redirect: RequestInit['redirect'];
  signal: RequestInit['signal'];
}
const merchantId = DemoSubjects.merchant;
const secondMerchantId = DemoSubjects.admin;
const get = { method: 'GET', path: '/v2/checkout/orders/SYNTHETIC-ORDER' } as const;
const post = {
  method: 'POST',
  path: '/v2/checkout/orders',
  body: { intent: 'CAPTURE', purchase_units: [] },
  opts: { requestId: 'ff-create-synthetic-order' },
  retrySafe: true,
} as const;

function fixture() {
  const key = randomBytes(32);
  const secret = 'synthetic-secret-not-a-real-credential';
  const credentials = new Map<string, MerchantCredentials>([
    [
      merchantId,
      {
        clientId: 'synthetic-client',
        secretEncrypted: encryptSecret(secret, key),
        simulated: false,
      },
    ],
    [
      secondMerchantId,
      {
        clientId: 'synthetic-second-client',
        secretEncrypted: encryptSecret('synthetic-second-secret', key),
        simulated: false,
      },
    ],
  ]);
  const lookup = vi.fn(async (id: string) => credentials.get(id) ?? null);
  const logger = { warn: vi.fn() };
  const time = { milliseconds: Date.parse('2026-11-09T00:00:00Z') };
  const calls: Call[] = [];
  const token = vi.fn((_call: Call): Response | Promise<Response> =>
    Response.json({
      access_token: 'SYNTHETIC-TOKEN-' + token.mock.calls.length,
      token_type: 'Bearer',
      expires_in: 3600,
    }),
  );
  const api = vi.fn((_call: Call): Response | Promise<Response> =>
    Response.json({ id: 'SYNTHETIC-ORDER' }),
  );
  const fetcher = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = new URL(String(input));
    expect(url.origin).toBe(PAYPAL_SANDBOX_API);
    const call: Call = {
      path: url.pathname,
      method: init?.method,
      headers: new Headers(init?.headers),
      body: init?.body,
      redirect: init?.redirect,
      signal: init?.signal,
    };
    calls.push(call);
    return await (url.pathname === '/v1/oauth2/token' ? token(call) : api(call));
  });
  const sleep = vi.fn(async (_milliseconds: number) => {});
  const options = {
    credentials: { lookup },
    encryptionKey: key,
    logger,
    fetch: fetcher,
    sleep,
    apiBase: PAYPAL_SANDBOX_API,
    clock: { now: () => new Date(time.milliseconds) },
  };
  const factory = createMerchantTransportFactory(options);
  return {
    key,
    secret,
    credentials,
    lookup,
    logger,
    time,
    calls,
    token,
    api,
    fetcher,
    sleep,
    options,
    factory,
    client: factory(merchantId),
  };
}

describe('H2 sandbox OAuth and transport', () => {
  it('rejects live/alternate hosts, invalid keys, merchant IDs and escaping paths before any request', async () => {
    const f = fixture();
    for (const apiBase of [
      'https://api-m.paypal.com',
      PAYPAL_SANDBOX_API + '/',
      'http://api-m.sandbox.paypal.com',
    ])
      expect(() => createMerchantTransportFactory({ ...f.options, apiBase })).toThrow('sandbox');
    expect(() =>
      createMerchantTransportFactory({ ...f.options, encryptionKey: Buffer.alloc(16) }),
    ).toThrow('32-byte');
    expect(() => f.factory('untrusted-secret-value')).toThrow('valid merchant ID');
    for (const path of [
      'https://other.example/v2/orders',
      '//other.example/v2/orders',
      '/\\other.example/v2/orders',
      '/v2/orders#fragment',
      '/other',
    ])
      await expect(f.client.request({ method: 'GET', path })).rejects.toMatchObject({
        code: 'INVALID_PAYPAL_PATH',
      });
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(f.lookup).not.toHaveBeenCalled();
  });

  it.each(['missing', 'client', 'secret', 'simulated', 'tampered'] as const)(
    'refuses %s merchant credentials without contacting PayPal',
    async (failure) => {
      const f = fixture();
      const record = f.credentials.get(merchantId)!;
      if (failure === 'missing') f.credentials.delete(merchantId);
      if (failure === 'client') record.clientId = null;
      if (failure === 'secret') record.secretEncrypted = null;
      if (failure === 'simulated') record.simulated = true;
      if (failure === 'tampered') record.secretEncrypted = encryptSecret(f.secret, randomBytes(32));
      await expect(f.client.request(get)).rejects.toMatchObject({ statusCode: 503 });
      expect(f.fetcher).not.toHaveBeenCalled();
    },
  );

  it('uses decrypted Basic credentials only for OAuth and Bearer authorization for resource requests', async () => {
    const f = fixture();
    await expect(f.client.request(post)).resolves.toEqual({ id: 'SYNTHETIC-ORDER' });
    expect(f.token).toHaveBeenCalledOnce();
    const oauth = f.calls[0]!;
    expect(oauth.headers.get('authorization')).toBe(
      'Basic ' + Buffer.from('synthetic-client:' + f.secret).toString('base64'),
    );
    expect(oauth.headers.get('content-type')).toBe('application/x-www-form-urlencoded');
    expect(oauth.body).toBe('grant_type=client_credentials');
    const request = f.calls[1]!;
    expect(request.headers.get('authorization')).toBe('Bearer SYNTHETIC-TOKEN-1');
    expect(request.headers.get('paypal-request-id')).toBe(post.opts.requestId);
    expect(request.headers.get('prefer')).toBe('return=representation');
    expect(request.body).toBe(JSON.stringify(post.body));
    for (const call of f.calls) {
      expect(call.redirect).toBe('error');
      expect(call.signal).toBeInstanceOf(AbortSignal);
      expect(call.headers.get('paypal-request-id')).toBeTruthy();
    }
  });

  it('coalesces simultaneous refreshes and isolates tokens by merchant', async () => {
    const f = fixture();
    await Promise.all(Array.from({ length: 8 }, () => f.client.request(get)));
    expect(f.token).toHaveBeenCalledOnce();
    expect(
      f.api.mock.calls.every(
        ([call]) => call.headers.get('authorization') === 'Bearer SYNTHETIC-TOKEN-1',
      ),
    ).toBe(true);
    await f.factory(secondMerchantId).request(get);
    expect(f.token).toHaveBeenCalledTimes(2);
    expect(f.api.mock.lastCall![0].headers.get('authorization')).toBe('Bearer SYNTHETIC-TOKEN-2');
    await f.client.request(get);
    expect(f.api.mock.lastCall![0].headers.get('authorization')).toBe('Bearer SYNTHETIC-TOKEN-1');
  });

  it('refreshes exactly 60 seconds early using returned expiry and the injected clock', async () => {
    const f = fixture();
    await f.client.request(get);
    f.time.milliseconds += 3_539_999;
    await f.client.request(get);
    expect(f.token).toHaveBeenCalledOnce();
    f.time.milliseconds += 1;
    await f.client.request(get);
    expect(f.token).toHaveBeenCalledTimes(2);
  });

  it('does not cache a token whose remaining lifetime is inside the safety window', async () => {
    const f = fixture();
    f.token.mockImplementation(() =>
      Response.json({ access_token: 'SYNTHETIC-SHORT', token_type: 'Bearer', expires_in: 60 }),
    );
    await f.client.request(get);
    await f.client.request(get);
    expect(f.token).toHaveBeenCalledTimes(2);
  });

  it('invalidates credentials on rotation/removal even for an existing transport', async () => {
    const f = fixture();
    await f.client.request(get);
    f.credentials.get(merchantId)!.secretEncrypted = encryptSecret(
      'synthetic-rotated-secret',
      f.key,
    );
    await f.client.request(get);
    expect(f.token).toHaveBeenCalledTimes(2);
    expect(f.token.mock.lastCall![0].headers.get('authorization')).toBe(
      'Basic ' + Buffer.from('synthetic-client:synthetic-rotated-secret').toString('base64'),
    );
    f.credentials.delete(merchantId);
    await expect(f.client.request(get)).rejects.toMatchObject({ code: 'PAYPAL_NOT_CONFIGURED' });
    expect(f.api).toHaveBeenCalledTimes(2);
  });

  it('does not replay a 401 mutation and refreshes its rejected token for the next call', async () => {
    const f = fixture();
    f.api.mockImplementationOnce(() =>
      Response.json({ name: 'AUTHENTICATION_FAILURE' }, { status: 401 }),
    );
    await expect(f.client.request(post)).rejects.toMatchObject({
      upstreamStatus: 401,
      outcomeUnknown: false,
    });
    expect(f.api).toHaveBeenCalledOnce();
    await f.client.request(get);
    expect(f.token).toHaveBeenCalledTimes(2);
    expect(f.api.mock.lastCall![0].headers.get('authorization')).toBe('Bearer SYNTHETIC-TOKEN-2');
  });

  it('clears a failed shared refresh so subsequent callers can recover', async () => {
    const f = fixture();
    f.token.mockImplementationOnce(() =>
      Response.json({ name: 'INVALID_CLIENT' }, { status: 401 }),
    );
    const results = await Promise.allSettled([f.client.request(get), f.client.request(get)]);
    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    expect(f.token).toHaveBeenCalledOnce();
    expect(f.api).not.toHaveBeenCalled();
    await f.client.request(get);
    expect(f.token).toHaveBeenCalledTimes(2);
    expect(f.api).toHaveBeenCalledOnce();
  });

  it.each([
    {},
    { access_token: '' },
    { access_token: 'unsafe\nheader' },
    { token_type: 'Basic' },
    { expires_in: '3600' },
    { expires_in: 0 },
    { expires_in: -1 },
    { expires_in: 1.5 },
  ])('rejects an invalid OAuth grant without caching or forwarding it: %j', async (invalid) => {
    const f = fixture();
    const body = Object.keys(invalid).length
      ? { access_token: 'SYNTHETIC-TOKEN', token_type: 'Bearer', expires_in: 3600, ...invalid }
      : {};
    f.token.mockImplementationOnce(() =>
      Response.json(body, { headers: { 'paypal-debug-id': 'grant-debug-1' } }),
    );
    await expect(f.client.request(get)).rejects.toMatchObject({
      code: 'PAYPAL_INVALID_RESPONSE',
      debugId: 'grant-debug-1',
    });
    expect(f.api).not.toHaveBeenCalled();
    await f.client.request(get);
    expect(f.token).toHaveBeenCalledTimes(2);
  });

  it('retries a retry-safe POST at most three times with unchanged request ID/body and exponential delay', async () => {
    const f = fixture();
    for (const status of [429, 500, 503])
      f.api.mockImplementationOnce(() =>
        Response.json(
          { name: 'TEMPORARY_FAILURE' },
          { status, headers: { 'paypal-debug-id': 'debug-' + status } },
        ),
      );
    await f.client.request(post);
    expect(f.api).toHaveBeenCalledTimes(4);
    expect(f.sleep.mock.calls.map(([ms]) => ms)).toEqual([500, 1000, 2000]);
    for (const [call] of f.api.mock.calls) {
      expect(call.headers.get('paypal-request-id')).toBe(post.opts.requestId);
      expect(call.body).toBe(JSON.stringify(post.body));
    }
    expect(f.logger.warn.mock.calls.map(([diagnostic]) => diagnostic.debugId)).toEqual([
      'debug-429',
      'debug-500',
      'debug-503',
    ]);
  });

  it('exhausts exactly four HTTP attempts and exposes only safe symbolic diagnostics', async () => {
    const f = fixture();
    const privateText = 'synthetic payer email and street must not escape';
    f.api.mockImplementation(() =>
      Response.json(
        {
          name: 'INTERNAL_SERVER_ERROR',
          message: privateText,
          details: [{ issue: 'SYNTHETIC_ISSUE', description: privateText, value: f.secret }],
        },
        { status: 500, headers: { 'paypal-debug-id': 'failure-debug' } },
      ),
    );
    const error = await f.client.request(post).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(PayPalError);
    expect(error).toMatchObject({
      upstreamStatus: 500,
      debugId: 'failure-debug',
      paypalName: 'INTERNAL_SERVER_ERROR',
      issues: ['SYNTHETIC_ISSUE'],
      outcomeUnknown: true,
    });
    expect(f.api).toHaveBeenCalledTimes(4);
    expect(f.logger.warn).toHaveBeenCalledTimes(4);
    const diagnostics = JSON.stringify([error, f.logger.warn.mock.calls]);
    for (const forbidden of [
      privateText,
      f.secret,
      'SYNTHETIC-TOKEN-1',
      'authorization',
      'purchase_units',
    ])
      expect(diagnostics).not.toContain(forbidden);
  });

  it('does not retry business validation failures or unconfirmed 5xx mutations', async () => {
    const f = fixture();
    f.api.mockImplementationOnce(() =>
      Response.json({ name: 'UNPROCESSABLE_ENTITY' }, { status: 422 }),
    );
    await expect(f.client.request(post)).rejects.toMatchObject({
      upstreamStatus: 422,
      outcomeUnknown: false,
    });
    f.api.mockImplementationOnce(() =>
      Response.json({ name: 'INTERNAL_SERVER_ERROR' }, { status: 500 }),
    );
    await expect(f.client.request({ ...post, retrySafe: false })).rejects.toMatchObject({
      upstreamStatus: 500,
      outcomeUnknown: true,
    });
    expect(f.api).toHaveBeenCalledTimes(2);
    expect(f.sleep).not.toHaveBeenCalled();
  });

  it('retries GET 5xx and unconfirmed POST rate-limit rejections within the same bound', async () => {
    const f = fixture();
    f.api.mockImplementationOnce(
      () => new Response('synthetic non-JSON gateway failure', { status: 502 }),
    );
    await f.client.request(get);
    f.api.mockImplementationOnce(() => Response.json({}, { status: 429 }));
    await f.client.request({ ...post, retrySafe: false });
    expect(f.api).toHaveBeenCalledTimes(4);
    expect(f.sleep.mock.calls.map(([ms]) => ms)).toEqual([500, 500]);
  });

  it('applies the retry bound to OAuth without changing its grant request ID', async () => {
    const f = fixture();
    for (let index = 0; index < 3; index++)
      f.token.mockImplementationOnce(() =>
        Response.json({}, { status: 503, headers: { 'paypal-debug-id': 'oauth-retry' } }),
      );
    await f.client.request(get);
    expect(f.token).toHaveBeenCalledTimes(4);
    expect(
      new Set(f.token.mock.calls.map(([call]) => call.headers.get('paypal-request-id'))).size,
    ).toBe(1);
    expect(f.logger.warn.mock.calls.every(([diagnostic]) => diagnostic.phase === 'oauth')).toBe(
      true,
    );
  });

  it.each(['GET', 'POST'] as const)(
    'sanitizes %s transport failures and never replays an ambiguous outcome',
    async (method) => {
      const f = fixture();
      f.api.mockImplementationOnce(() => {
        throw new Error(f.secret + ' SYNTHETIC-TOKEN-1');
      });
      const error = await f.client
        .request(method === 'GET' ? get : post)
        .catch((value: unknown) => value);
      expect(error).toMatchObject({
        code: 'PAYPAL_NETWORK_ERROR',
        outcomeUnknown: method === 'POST',
      });
      expect(f.api).toHaveBeenCalledOnce();
      expect(f.sleep).not.toHaveBeenCalled();
      expect(JSON.stringify([error, f.logger.warn.mock.calls])).not.toContain(f.secret);
    },
  );

  it('rejects a malformed successful response without replay and accepts an empty 204', async () => {
    const f = fixture();
    f.api.mockImplementationOnce(
      () =>
        new Response('synthetic-invalid-json', { headers: { 'paypal-debug-id': 'decode-debug' } }),
    );
    await expect(f.client.request(post)).rejects.toMatchObject({
      code: 'PAYPAL_INVALID_RESPONSE',
      debugId: 'decode-debug',
      outcomeUnknown: true,
    });
    expect(f.api).toHaveBeenCalledOnce();
    f.api.mockImplementationOnce(() => new Response(null, { status: 204 }));
    await expect(f.client.request(post)).resolves.toBeUndefined();
  });

  it('validates request IDs and serialization before credential access, and strips unsafe error metadata', async () => {
    const f = fixture();
    for (const requestId of ['', 'x'.repeat(109), 'unsafe\r\nheader'])
      await expect(f.client.request({ ...post, opts: { requestId } })).rejects.toMatchObject({
        code: 'INVALID_PAYPAL_REQUEST_ID',
      });
    await expect(f.client.request({ ...post, body: { value: 1n } })).rejects.toMatchObject({
      code: 'INVALID_PAYPAL_BODY',
    });
    expect(f.lookup).not.toHaveBeenCalled();
    f.api.mockImplementationOnce(() =>
      Response.json(
        { name: 'synthetic free text', details: [{ issue: 'synthetic free text' }] },
        { status: 400, headers: { 'paypal-debug-id': 'synthetic private text' } },
      ),
    );
    await expect(f.client.request(get)).rejects.toMatchObject({
      debugId: null,
      paypalName: null,
      issues: [],
    });
  });
});
