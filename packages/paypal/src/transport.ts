import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  AppError,
  PostOptsSchema,
  decryptSecret,
  systemClock,
  type Clock,
  type PostOpts,
} from '@fairfold/contracts';
import { validateMerchantId, type PayPalCredentials } from './credentials.js';
import {
  PayPalError,
  errorSymbols,
  safeDebugId,
  type PayPalDiagnostic,
  type PayPalLogger,
} from './errors.js';

export const PAYPAL_SANDBOX_API = 'https://api-m.sandbox.paypal.com';

export type PayPalRequest =
  | { method: 'GET'; path: string }
  | {
      method: 'POST';
      path: string;
      body?: unknown;
      opts: PostOpts;
      // Set true only when the operation documents server-side idempotency.
      retrySafe: boolean;
    };

export interface PayPalTransport {
  request(input: PayPalRequest): Promise<unknown>;
  requestValidated<T>(input: PayPalRequest, parse: (body: unknown) => T): Promise<T>;
}

interface Token {
  value: string;
  usableUntil: number;
}
interface CacheEntry {
  fingerprint: string;
  token?: Token;
  pending?: Promise<Token>;
}
interface Exchange {
  merchantId: string;
  phase: 'oauth' | 'api';
  method: 'GET' | 'POST';
  url: URL;
  headers: Headers;
  body?: string;
  retrySafe: boolean;
}
interface ExchangeResult {
  body: unknown;
  status: number;
  debugId: string | null;
  attempt: number;
}

export interface PayPalTransportOptions {
  credentials: PayPalCredentials;
  encryptionKey: Buffer;
  logger: PayPalLogger;
  apiBase?: string;
  clock?: Clock;
  fetch?: typeof globalThis.fetch;
  sleep?: (milliseconds: number) => Promise<unknown>;
}

export function createMerchantTransportFactory(options: PayPalTransportOptions) {
  const apiBase = options.apiBase ?? process.env.PAYPAL_API_BASE ?? PAYPAL_SANDBOX_API;
  if (apiBase !== PAYPAL_SANDBOX_API)
    throw new AppError('PAYPAL_SANDBOX_REQUIRED', 'Only the PayPal sandbox API is allowed', 500);
  if (options.encryptionKey.length !== 32)
    throw new AppError('INVALID_ENCRYPTION_KEY', 'AES-256 requires a 32-byte key', 500);
  const encryptionKey = Buffer.from(options.encryptionKey);
  const clock = options.clock ?? systemClock;
  const fetcher = options.fetch ?? globalThis.fetch;
  const sleep = options.sleep ?? delay;
  const cache = new Map<string, CacheEntry>();

  function urlFor(path: string): URL {
    if (!path.startsWith('/') || path.startsWith('//') || /[\\#]/.test(path))
      throw new AppError('INVALID_PAYPAL_PATH', 'A sandbox API resource path is required');
    const url = new URL(path, apiBase);
    if (url.origin !== apiBase || !/^\/v[12]\//.test(url.pathname))
      throw new AppError('INVALID_PAYPAL_PATH', 'A sandbox API resource path is required');
    return url;
  }

  async function exchange(input: Exchange): Promise<ExchangeResult> {
    const isMutation = input.phase === 'api' && input.method === 'POST';
    for (let attempt = 1; attempt <= 4; attempt++) {
      const diagnostic: PayPalDiagnostic = {
        event: 'paypal.request_error',
        merchantId: input.merchantId,
        phase: input.phase,
        method: input.method,
        upstreamStatus: null,
        debugId: null,
        paypalName: null,
        issues: [],
        attempt,
      };
      let response: Response;
      try {
        response = await fetcher(input.url, {
          method: input.method,
          headers: new Headers(input.headers),
          body: input.body,
          redirect: 'error',
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        options.logger.warn(diagnostic, 'PayPal sandbox request failed');
        // A timeout can follow a completed mutation. Do not blindly replay it.
        throw new PayPalError('PAYPAL_NETWORK_ERROR', null, null, null, [], isMutation);
      }
      diagnostic.upstreamStatus = response.status;
      diagnostic.debugId = safeDebugId(response.headers.get('paypal-debug-id'));
      let body: unknown;
      let invalidJson = false;
      if (response.status !== 204) {
        try {
          body = await response.json();
        } catch {
          invalidJson = true;
        }
      }
      if (response.ok) {
        if (!invalidJson)
          return { body, status: response.status, debugId: diagnostic.debugId, attempt };
        options.logger.warn(diagnostic, 'PayPal sandbox response could not be decoded');
        throw new PayPalError(
          'PAYPAL_INVALID_RESPONSE',
          response.status,
          diagnostic.debugId,
          null,
          [],
          isMutation,
        );
      }
      Object.assign(diagnostic, errorSymbols(body));
      options.logger.warn(diagnostic, 'PayPal sandbox request failed');
      const retry =
        response.status === 429 ||
        (response.status >= 500 && response.status <= 599 && input.retrySafe);
      if (retry && attempt <= 3) {
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      throw new PayPalError(
        'PAYPAL_HTTP_ERROR',
        response.status,
        diagnostic.debugId,
        diagnostic.paypalName,
        diagnostic.issues,
        isMutation && response.status >= 500,
      );
    }
    throw new Error('Unreachable PayPal retry state');
  }

  async function getToken(merchantId: string): Promise<{ token: Token; entry: CacheEntry }> {
    const credentials = await options.credentials.lookup(merchantId);
    if (!credentials?.clientId || !credentials.secretEncrypted || credentials.simulated) {
      cache.delete(merchantId);
      throw new AppError('PAYPAL_NOT_CONFIGURED', 'Sandbox credentials are unavailable', 503);
    }
    const { clientId, secretEncrypted } = credentials;
    const fingerprint = createHash('sha256')
      .update(JSON.stringify([credentials.clientId, credentials.secretEncrypted]))
      .digest('hex');
    let entry = cache.get(merchantId);
    if (!entry || entry.fingerprint !== fingerprint) {
      entry = { fingerprint };
      cache.set(merchantId, entry);
    }
    if (entry.token && clock.now().getTime() < entry.token.usableUntil)
      return { token: entry.token, entry };
    if (entry.pending) return { token: await entry.pending, entry };
    const current = entry;
    const startedAt = clock.now().getTime();
    const pending = (async (): Promise<Token> => {
      let secret: string;
      try {
        secret = decryptSecret(secretEncrypted, encryptionKey);
        if (!secret) throw new Error();
      } catch {
        cache.delete(merchantId);
        throw new AppError(
          'PAYPAL_CREDENTIALS_INVALID',
          'Sandbox credentials are unavailable',
          503,
        );
      }
      const result = await exchange({
        merchantId,
        phase: 'oauth',
        method: 'POST',
        url: urlFor('/v1/oauth2/token'),
        headers: new Headers({
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + Buffer.from(clientId + ':' + secret).toString('base64'),
          Prefer: 'return=representation',
          'PayPal-Request-Id': 'ff-token-' + randomUUID(),
        }),
        body: 'grant_type=client_credentials',
        retrySafe: true,
      });
      const grant =
        result.body && typeof result.body === 'object'
          ? (result.body as Record<string, unknown>)
          : {};
      if (
        typeof grant.access_token !== 'string' ||
        !/^[\x21-\x7e]+$/.test(grant.access_token) ||
        grant.token_type !== 'Bearer' ||
        typeof grant.expires_in !== 'number' ||
        !Number.isSafeInteger(grant.expires_in) ||
        grant.expires_in <= 0 ||
        !Number.isSafeInteger(startedAt + grant.expires_in * 1000)
      ) {
        options.logger.warn(
          {
            event: 'paypal.request_error',
            merchantId,
            phase: 'oauth',
            method: 'POST',
            upstreamStatus: result.status,
            debugId: result.debugId,
            paypalName: null,
            issues: [],
            attempt: result.attempt,
          },
          'PayPal sandbox token response was invalid',
        );
        throw new PayPalError(
          'PAYPAL_INVALID_RESPONSE',
          result.status,
          result.debugId,
          null,
          [],
          false,
        );
      }
      const token = {
        value: grant.access_token,
        usableUntil: startedAt + grant.expires_in * 1000 - 60_000,
      };
      current.token = token;
      return token;
    })();
    current.pending = pending;
    try {
      return { token: await pending, entry: current };
    } finally {
      if (current.pending === pending) current.pending = undefined;
    }
  }

  return function merchantTransport(merchantId: string): PayPalTransport {
    validateMerchantId(merchantId);
    async function perform(input: PayPalRequest): Promise<ExchangeResult> {
      const url = urlFor(input.path);
      if (
        input.method === 'POST' &&
        (!PostOptsSchema.safeParse(input.opts).success ||
          !/^[\x21-\x7e]+$/.test(input.opts.requestId))
      )
        throw new AppError('INVALID_PAYPAL_REQUEST_ID', 'A valid PayPal request ID is required');
      let body: string | undefined;
      try {
        body = input.method === 'POST' ? JSON.stringify(input.body ?? {}) : undefined;
        if (input.method === 'POST' && body === undefined) throw new Error();
      } catch {
        throw new AppError('INVALID_PAYPAL_BODY', 'The PayPal request must be JSON serializable');
      }
      const lease = await getToken(merchantId);
      const headers = new Headers({
        Accept: 'application/json',
        Authorization: 'Bearer ' + lease.token.value,
        Prefer: 'return=representation',
      });
      if (input.method === 'POST') {
        headers.set('Content-Type', 'application/json');
        headers.set('PayPal-Request-Id', input.opts.requestId);
      }
      try {
        return await exchange({
          merchantId,
          phase: 'api',
          method: input.method,
          url,
          headers,
          body,
          retrySafe: input.method === 'GET' || input.retrySafe,
        });
      } catch (error) {
        if (
          error instanceof PayPalError &&
          error.upstreamStatus === 401 &&
          lease.entry.token === lease.token
        )
          lease.entry.token = undefined;
        throw error;
      }
    }
    return {
      async request(input) {
        return (await perform(input)).body;
      },
      async requestValidated(input, parse) {
        const result = await perform(input);
        try {
          return await parse(result.body);
        } catch {
          options.logger.warn(
            {
              event: 'paypal.request_error',
              merchantId,
              phase: 'api',
              method: input.method,
              upstreamStatus: result.status,
              debugId: result.debugId,
              paypalName: null,
              issues: [],
              attempt: result.attempt,
            },
            'PayPal sandbox response shape was invalid',
          );
          throw new PayPalError(
            'PAYPAL_INVALID_RESPONSE',
            result.status,
            result.debugId,
            null,
            [],
            input.method === 'POST',
          );
        }
      },
    };
  };
}
