/// <reference lib="dom" />
import { DemoSubjects } from '@fairfold/contracts/common';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export type Activity = { m: string; p: string; c: string; t: string };
export class ApiClient {
  private token = '';
  private expiresAt = 0;
  private signingIn?: Promise<void>;
  constructor(
    private demo: boolean,
    private activity: (entry: Activity) => void,
    private send: typeof fetch = (input, init) => globalThis.fetch(input, init),
  ) {}
  private async authenticate() {
    if (this.token && Date.now() < this.expiresAt) return;
    if (!this.demo)
      throw new ApiError('DEMO_DISABLED', 'Demo access is disabled on this server.', 403);
    this.signingIn ??= (async () => {
      const response = await this.send('/api/auth/demo-login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'merchant', subjectId: DemoSubjects.merchant }),
        credentials: 'same-origin',
      });
      if (!response.ok)
        throw new ApiError('SIGN_IN_FAILED', 'Demo sign-in is unavailable.', response.status);
      const result: { token: string } = await response.json();
      this.token = result.token;
      this.expiresAt = Date.now() + 50 * 60_000;
    })().finally(() => {
      this.signingIn = undefined;
    });
    return this.signingIn;
  }
  async request<T>(path: string, body?: object | FormData, publicRead = false): Promise<T> {
    if (!path.startsWith('/api/'))
      throw new Error('Only same-origin Fairfold API paths are allowed');
    if (!publicRead) await this.authenticate();
    const method = body === undefined ? 'GET' : 'POST';
    const multipart = typeof FormData !== 'undefined' && body instanceof FormData;
    let response: Response;
    try {
      response = await this.send(path, {
        method,
        headers: {
          ...(!publicRead ? { authorization: 'Bearer ' + this.token } : {}),
          ...(body !== undefined && !multipart ? { 'content-type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: multipart ? body : JSON.stringify(body) } : {}),
        credentials: 'same-origin',
      });
    } catch {
      throw new ApiError(
        'NETWORK_ERROR',
        method === 'POST'
          ? 'Connection lost. The outcome is unknown; refresh and check the record before trying again.'
          : 'Cannot reach Fairfold. Check your connection and refresh.',
        0,
      );
    }
    this.activity({
      m: method,
      p: path.split('?')[0]!,
      c: String(response.status),
      t: new Date().toISOString().slice(11, 19),
    });
    if (!response.ok) {
      if (response.status === 401) {
        this.token = '';
        this.expiresAt = 0;
      }
      const error = (await response.json().catch(() => null)) as {
        error?: { code?: string; message?: string };
      } | null;
      throw new ApiError(
        error?.error?.code ?? 'REQUEST_FAILED',
        error?.error?.message ?? 'The request failed.',
        response.status,
      );
    }
    return response.json() as Promise<T>;
  }
  async list<T extends { id: string }>(path: string): Promise<T[]> {
    const items: T[] = [];
    const seen = new Set<string>();
    for (let page = 0; page < 100; page++) {
      const cursor = items.at(-1)?.id;
      const batch = await this.request<T[]>(
        `${path}?limit=100${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`,
      );
      for (const item of batch) {
        if (seen.has(item.id))
          throw new ApiError(
            'PAGINATION_CHANGED',
            'Records changed while loading. Refresh to try again.',
            409,
          );
        seen.add(item.id);
        items.push(item);
      }
      if (batch.length < 100) return items;
    }
    throw new ApiError(
      'LIST_LIMIT',
      'Too many records for this demo view. Use the API for the full list.',
      413,
    );
  }
  async pdf(path: string): Promise<Blob> {
    await this.authenticate();
    const response = await this.send(path, {
      headers: { authorization: 'Bearer ' + this.token },
      credentials: 'same-origin',
    });
    if (!response.ok)
      throw new ApiError('PDF_UNAVAILABLE', 'Could not load the evidence PDF.', response.status);
    return response.blob();
  }
}
