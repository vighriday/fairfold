import { randomUUID } from 'node:crypto';
import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { createApi } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { DevCheckoutScript } from '../src/dev/page.js';
import { createDevRoutes } from '../src/dev/routes.js';

class Element {
  value = '';
  textContent = '';
  hidden = false;
  disabled = false;
  src = '';
  listeners = new Map<string, Array<(event: unknown) => unknown>>();
  addEventListener(type: string, callback: (event: unknown) => unknown) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), callback]);
  }
  async emit(type: string, event: unknown = {}) {
    for (const callback of this.listeners.get(type) ?? []) await callback(event);
  }
  set innerHTML(_value: string) {
    throw new Error('Unsafe HTML rendering is forbidden');
  }
}
function fixture() {
  const elements = Object.fromEntries(
    ['setup', 'pay', 'retry', 'load', 'status', 'result', 'merchant', 'sku'].map((id) => [
      id,
      new Element(),
    ]),
  );
  const element = (id: string) => elements[id]!;
  element('merchant').value = 'neel-block-prints';
  element('sku').value = 'HD-IND-01';
  element('pay').hidden = element('retry').hidden = true;
  const merchantId = randomUUID(),
    orderId = randomUUID(),
    paypalOrderId = 'SYNTHETICV6ORDER';
  const state = {
    mode: 'approve',
    eligible: true,
    configError: false,
    captureFailures: 0,
    createGate: undefined as Promise<void> | undefined,
    summary: {
      id: orderId,
      merchantId,
      status: 'captured',
      amount: { currency_code: 'USD', value: '38.00' },
      createdAt: '2026-11-09T16:40:00.000Z',
      items: [{ sku: 'HD-IND-01', name: 'Synthetic hoodie', quantity: 1 }],
    },
  };
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const fetcher = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const path = String(input);
    calls.push({ path, init });
    if (path.startsWith('/api/checkout/config?'))
      return state.configError
        ? Response.json(
            {
              error: { code: 'PAYPAL_CREDENTIALS_MISSING', message: 'Synthetic setup incomplete' },
            },
            { status: 503 },
          )
        : Response.json({ clientId: 'synthetic-public-client', merchantId, currency: 'USD' });
    if (path === '/api/checkout/orders') {
      await state.createGate;
      return Response.json({ orderId, paypalOrderId }, { status: 201 });
    }
    if (path === '/api/checkout/orders/' + paypalOrderId + '/capture') {
      if (state.captureFailures-- > 0)
        return Response.json(
          { error: { code: 'CAPTURE_JOB_NOT_CREATED', message: 'Synthetic queue failure' } },
          { status: 503 },
        );
      return Response.json(state.summary);
    }
    throw new Error('Unexpected browser request');
  });
  type Callbacks = {
    onApprove: (data: unknown) => Promise<unknown>;
    onCancel: () => unknown;
    onError: (error: unknown) => unknown;
  };
  let callbacks: Callbacks;
  const start = vi.fn(async (_options: unknown, promise: Promise<{ orderId: string }>) => {
    const created = await promise;
    expect(created).toEqual({ orderId: paypalOrderId });
    if (state.mode === 'cancel') {
      callbacks.onCancel();
      return;
    }
    if (state.mode === 'sdk-error') {
      callbacks.onError({
        code: 'UNTRUSTED-CODE',
        message: 'private@example.invalid Synthetic Street',
      });
      throw new Error('private@example.invalid');
    }
    return callbacks.onApprove({
      orderId: state.mode === 'mismatch' ? 'OTHERPAYPALORDER' : created.orderId,
      payerId: 'EXCLUDED-SDK-PAYER',
    });
  });
  const session = vi.fn((input: Callbacks) => {
    callbacks = input;
    return { start };
  });
  const eligibility = vi.fn(async () => ({
    isEligible: (method: string) => method === 'paypal' && state.eligible,
  }));
  const createInstance = vi.fn(async () => ({
    findEligibleMethods: eligibility,
    createPayPalOneTimePaymentSession: session,
  }));
  const window: { paypal?: { createInstance: typeof createInstance } } = {};
  const scripts: Element[] = [];
  const consoleMock = { log: vi.fn(), error: vi.fn(), warn: vi.fn() };
  new Script(DevCheckoutScript).runInContext(
    createContext({
      window,
      fetch: fetcher,
      console: consoleMock,
      document: {
        getElementById: element,
        createElement: () => new Element(),
        head: {
          appendChild: (script: Element) => {
            scripts.push(script);
            queueMicrotask(() => {
              window.paypal = { createInstance };
              void script.emit('load');
            });
          },
        },
      },
    }),
  );
  async function setup() {
    await element('setup').emit('submit', { preventDefault() {} });
  }
  return {
    element,
    state,
    calls,
    scripts,
    start,
    session,
    eligibility,
    createInstance,
    setup,
    consoleMock,
    merchantId,
    orderId,
    paypalOrderId,
  };
}

describe('unstyled sandbox checkout harness', () => {
  it('gates both HTML and script routes with DEMO_MODE and serves noncached assets', async () => {
    const config = readConfig({
      DATABASE_URL: 'postgres://synthetic:synthetic@127.0.0.1/fairfold_test',
      APP_BASE_URL: 'http://localhost:3000',
      FRONTEND_ORIGIN: 'http://localhost:3000',
      APP_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString('base64'),
      DEMO_TOKEN_SECRET: 'synthetic-dev-route-signing-key-not-a-real-secret',
    });
    for (const enabled of [true, false]) {
      const app = await createApi({
        config,
        logger: false,
        checkDatabase: async () => {},
        routes: createDevRoutes(enabled),
      });
      try {
        const html = await app.inject('/dev');
        const js = await app.inject('/dev/checkout.js');
        expect(html.statusCode).toBe(enabled ? 200 : 404);
        expect(js.statusCode).toBe(enabled ? 200 : 404);
        if (enabled) {
          expect(html.headers['cache-control']).toBe('no-store');
          expect(js.headers['content-type']).toContain('application/javascript');
          expect(html.body).toContain('HD-IND-01');
          expect(html.body).not.toContain('<style');
          expect(js.body).toContain('https://www.sandbox.paypal.com/web-sdk/v6/core');
          expect(js.body).not.toContain('clientToken');
        }
      } finally {
        await app.close();
      }
    }
  });
  it('loads only the sandbox SDK and uses client ID, the one payment component and configured currency eligibility', async () => {
    const f = fixture();
    await f.setup();
    expect(f.scripts).toHaveLength(1);
    expect(f.scripts[0]!.src).toBe('https://www.sandbox.paypal.com/web-sdk/v6/core');
    expect(f.createInstance).toHaveBeenCalledExactlyOnceWith({
      clientId: 'synthetic-public-client',
      components: ['paypal-payments'],
    });
    expect(f.eligibility).toHaveBeenCalledExactlyOnceWith({ currencyCode: 'USD' });
    expect(f.element('pay').hidden).toBe(false);
  });
  it('starts the SDK before awaiting create and maps the PayPal ID into its required promise object', async () => {
    const f = fixture();
    await f.setup();
    let release!: () => void;
    f.state.createGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const click = f.element('pay').emit('click');
    expect(f.start).toHaveBeenCalledTimes(1);
    expect(f.calls.filter((row) => row.path.endsWith('/capture'))).toHaveLength(0);
    release();
    await click;
    const request = f.calls.find((row) => row.path === '/api/checkout/orders')!;
    expect(JSON.parse(String(request.init!.body))).toEqual({
      merchantId: f.merchantId,
      items: [{ sku: 'HD-IND-01', quantity: 1 }],
    });
    const capture = f.calls.find((row) => row.path.endsWith('/capture'))!;
    expect(capture.path).toContain(f.paypalOrderId);
    expect(capture.init!.body).toBeUndefined();
    expect(JSON.parse(f.element('result').textContent).id).toBe(f.orderId);
    expect(f.element('status').textContent).toContain('capture recorded');
  });
  it('prevents double clicks from creating a second order during an active payment', async () => {
    const f = fixture();
    await f.setup();
    let release!: () => void;
    f.state.createGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = f.element('pay').emit('click');
    await f.element('pay').emit('click');
    expect(f.calls.filter((row) => row.path === '/api/checkout/orders')).toHaveLength(1);
    release();
    await first;
    expect(f.start).toHaveBeenCalledTimes(1);
  });
  it('retries only the approved capture after failure and blocks a fresh purchase until recovery', async () => {
    const f = fixture();
    await f.setup();
    f.state.captureFailures = 1;
    await f.element('pay').emit('click');
    expect(f.element('retry').hidden).toBe(false);
    expect(f.element('load').disabled).toBe(true);
    expect(f.element('result').textContent).toBe('');
    await f.element('setup').emit('submit', { preventDefault() {} });
    await f.element('pay').emit('click');
    await f.element('retry').emit('click');
    expect(f.calls.filter((row) => row.path === '/api/checkout/orders')).toHaveLength(1);
    expect(f.calls.filter((row) => row.path.endsWith('/capture')).map((row) => row.path)).toEqual(
      Array(2).fill('/api/checkout/orders/' + f.paypalOrderId + '/capture'),
    );
    expect(f.element('retry').hidden).toBe(true);
    expect(f.element('load').disabled).toBe(false);
    expect(f.start).toHaveBeenCalledTimes(1);
  });
  it('does not capture when the SDK reports cancellation', async () => {
    const f = fixture();
    await f.setup();
    f.state.mode = 'cancel';
    await f.element('pay').emit('click');
    expect(f.calls.filter((row) => row.path.endsWith('/capture'))).toHaveLength(0);
    expect(f.element('status').textContent).toContain('cancelled');
    expect(f.element('pay').hidden).toBe(false);
  });
  it('does not print raw SDK errors or claim completion', async () => {
    const f = fixture();
    await f.setup();
    f.state.mode = 'sdk-error';
    await f.element('pay').emit('click');
    expect(f.element('status').textContent).not.toContain('@example.invalid');
    expect(f.element('status').textContent).not.toContain('Synthetic Street');
    expect(f.element('result').textContent).toBe('');
    expect(f.consoleMock.error).not.toHaveBeenCalled();
    expect(f.calls.filter((row) => row.path.endsWith('/capture'))).toHaveLength(0);
  });
  it('does not initialize PayPal or create an order while merchant setup is missing', async () => {
    const f = fixture();
    f.state.configError = true;
    await f.setup();
    await f.element('pay').emit('click');
    expect(f.element('status').textContent).toContain('PAYPAL_CREDENTIALS_MISSING');
    expect(f.scripts).toHaveLength(0);
    expect(f.createInstance).not.toHaveBeenCalled();
    expect(f.calls).toHaveLength(1);
  });
  it('does not start an ineligible payment method', async () => {
    const f = fixture();
    f.state.eligible = false;
    await f.setup();
    await f.element('pay').emit('click');
    expect(f.element('pay').hidden).toBe(true);
    expect(f.session).not.toHaveBeenCalled();
    expect(f.start).not.toHaveBeenCalled();
  });
  it('rejects an approval for a different order before capture', async () => {
    const f = fixture();
    await f.setup();
    f.state.mode = 'mismatch';
    await f.element('pay').emit('click');
    expect(f.calls.filter((row) => row.path.endsWith('/capture'))).toHaveLength(0);
    expect(f.element('status').textContent).toContain('APPROVAL_CONTEXT_MISMATCH');
  });
  it('renders capture JSON as text and handles a later stored state without recapturing', async () => {
    const f = fixture();
    await f.setup();
    f.state.summary.status = 'refunded';
    f.state.summary.items[0]!.name = '<img src=x onerror=alert(1)>';
    await f.element('pay').emit('click');
    expect(f.element('status').textContent).toContain('Current order state: refunded');
    expect(f.element('result').textContent).toContain('<img');
    expect(f.element('retry').hidden).toBe(true);
  });
  it('does not confirm a capture summary belonging to a different internal order', async () => {
    const f = fixture();
    await f.setup();
    f.state.summary.id = randomUUID();
    await f.element('pay').emit('click');
    expect(f.element('result').textContent).toBe('');
    expect(f.element('retry').hidden).toBe(false);
    expect(f.element('status').textContent).toContain('completion was not confirmed');
  });
});
