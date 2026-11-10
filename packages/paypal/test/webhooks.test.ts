import { describe, expect, it } from 'vitest';
import { createWebhookOperations } from '../src/index.js';
import { operationFixture } from './operation-fixture.js';

// Synthetic signature responses only; no real webhook has been verified or registered.
const webhookId = 'SYNTHETICWEBHOOK2026';
const raw =
  '{\n "id":"WH-SYNTHETIC", "event_type":"PAYMENT.CAPTURE.COMPLETED", "n":2.00, "text":"caf\\u00e9", "resource":{"private":"SYNTHETIC-PRIVATE-CONTACT"}\n}  ';
function headers() {
  return {
    'PayPal-Auth-Algo': 'SHA256withRSA',
    'PAYPAL-CERT-URL': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-SYNTHETIC',
    'paypal-transmission-id': 'synthetic-transmission-2026',
    'paypal-transmission-sig': Buffer.from('synthetic-signature').toString('base64'),
    'paypal-transmission-time': '2026-11-09T13:00:00+05:30',
  };
}
const url = 'https://fairfold.example.invalid/api/webhooks/paypal/merchant';
const types = ['PAYMENT.CAPTURE.COMPLETED', 'CUSTOMER.DISPUTE.CREATED'];
function registered() {
  return { id: webhookId, url, event_types: types.map((name) => ({ name })) };
}
describe('H2 webhook client bindings', () => {
  it('posts exact original event bytes inside the verification envelope, with no certificate fetch', async () => {
    const f = operationFixture();
    f.respond({ verification_status: 'SUCCESS' });
    expect(await createWebhookOperations(f.transport).verify(headers(), raw, webhookId)).toBe(true);
    const wire = f.fetcher.mock.calls.at(-1)![1]!.body as string;
    expect(wire.endsWith(',"webhook_event":' + raw + '}')).toBe(true);
    expect(wire).toContain('2.00');
    expect(wire).toContain('caf\\u00e9');
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.url.pathname).toBe('/v1/notifications/verify-webhook-signature');
    expect(f.calls[0]!.body).toMatchObject({
      webhook_id: webhookId,
      transmission_time: headers()['paypal-transmission-time'],
    });
    expect(f.calls[0]!.headers.get('paypal-request-id')).toMatch(/^ff-verify-[a-f0-9]{64}$/);
    expect(f.logger.warn).not.toHaveBeenCalled();
  });
  it('returns false for provider failure and never converts malformed status into success', async () => {
    const f = operationFixture();
    const client = createWebhookOperations(f.transport);
    f.respond({ verification_status: 'FAILURE' });
    expect(await client.verify(headers(), raw, webhookId)).toBe(false);
    f.respond({ verification_status: 'UNKNOWN', private: 'SYNTHETIC-PRIVATE' });
    await expect(client.verify(headers(), raw, webhookId)).rejects.toMatchObject({
      code: 'PAYPAL_INVALID_RESPONSE',
    });
    expect(JSON.stringify(f.logger.warn.mock.calls)).not.toContain('SYNTHETIC-PRIVATE');
  });
  it.each([
    'missing',
    'duplicate',
    'algorithm',
    'certificate',
    'live-cert',
    'cert-path',
    'header-injection',
    'time',
    'json',
    'array',
    'encoding',
    'oversize',
    'webhook-id',
  ])('rejects malformed verification input before OAuth: %s', async (reason) => {
    const f = operationFixture();
    const values: Record<string, string> = headers();
    let body = raw;
    let id = webhookId;
    if (reason === 'missing') delete values['PayPal-Auth-Algo'];
    if (reason === 'duplicate') values['paypal-auth-algo'] = 'SHA256withRSA';
    if (reason === 'algorithm') values['PayPal-Auth-Algo'] = 'SHA256 with RSA';
    if (reason === 'certificate')
      values['PAYPAL-CERT-URL'] = 'https://untrusted.invalid/v1/notifications/certs/CERT-SYNTHETIC';
    if (reason === 'live-cert')
      values['PAYPAL-CERT-URL'] = 'https://api.paypal.com/v1/notifications/certs/CERT-SYNTHETIC';
    if (reason === 'cert-path') values['PAYPAL-CERT-URL'] += '?unexpected=1';
    if (reason === 'header-injection') values['paypal-transmission-id'] = 'bad\r\nheader';
    if (reason === 'time') values['paypal-transmission-time'] = '2026-02-30T00:00:00Z';
    if (reason === 'json') body = '{invalid';
    if (reason === 'array') body = '[]';
    if (reason === 'encoding') body = '{"text":"\ud800"}';
    if (reason === 'oversize') body = '{"text":"' + 'x'.repeat(1024 * 1024) + '"}';
    if (reason === 'webhook-id') id = 'WEBHOOK_ID';
    expect(await createWebhookOperations(f.transport).verify(values, body, id)).toBe(false);
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it('retries read-only verification with the exact raw body and stable request ID', async () => {
    const f = operationFixture();
    f.respond({ name: 'INTERNAL_SERVER_ERROR' }, 500);
    f.respond({ verification_status: 'SUCCESS' });
    expect(await createWebhookOperations(f.transport).verify(headers(), raw, webhookId)).toBe(true);
    expect(f.fetcher.mock.calls.at(-1)![1]!.body).toBe(f.fetcher.mock.calls.at(-2)![1]!.body);
    expect(f.calls[1]!.headers.get('paypal-request-id')).toBe(
      f.calls[0]!.headers.get('paypal-request-id'),
    );
    expect(JSON.stringify(f.logger.warn.mock.calls)).not.toContain('SYNTHETIC-PRIVATE-CONTACT');
  });
  it('registers a snapshot of the explicit event set and validates the actual returned resource', async () => {
    const f = operationFixture();
    f.respond(registered());
    const selected = [...types];
    const pending = createWebhookOperations(f.transport).register(url, selected);
    selected.push('CUSTOMER.DISPUTE.UPDATED');
    expect(await pending).toEqual({ id: webhookId });
    expect(f.calls[0]!.body).toEqual({ url, event_types: types.map((name) => ({ name })) });
    expect(f.calls[0]!.headers.get('paypal-request-id')).toMatch(/^ff-register-/);
  });
  it.each([
    'http',
    'credentials',
    'fragment',
    'local',
    'events-empty',
    'events-duplicate',
    'events-invalid',
  ])('rejects invalid registration before OAuth: %s', (reason) => {
    const f = operationFixture();
    let target = url;
    let events = [...types];
    if (reason === 'http') target = target.replace('https:', 'http:');
    if (reason === 'credentials') target = target.replace('https://', 'https://user:pass@');
    if (reason === 'fragment') target += '#fragment';
    if (reason === 'local') target = 'https://localhost/callback';
    if (reason === 'events-empty') events = [];
    if (reason === 'events-duplicate') events = [types[0]!, types[0]!];
    if (reason === 'events-invalid') events = ['lowercase-event'];
    expect(() => createWebhookOperations(f.transport).register(target, events)).toThrowError(
      expect.objectContaining({ code: 'INVALID_PAYPAL_REQUEST' }),
    );
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it.each(['id', 'url', 'events'])('rejects a mismatched registered %s', async (reason) => {
    const f = operationFixture();
    const result = registered();
    if (reason === 'id') result.id = '';
    if (reason === 'url') result.url += '/different';
    if (reason === 'events') result.event_types = [{ name: types[0]! }];
    f.respond(result);
    await expect(createWebhookOperations(f.transport).register(url, types)).rejects.toMatchObject({
      code: 'PAYPAL_INVALID_RESPONSE',
      outcomeUnknown: true,
    });
  });
  it('does not replay uncertain registration and rejects raw-JSON use on other operation paths', async () => {
    const f = operationFixture();
    f.respond({ name: 'INTERNAL_SERVER_ERROR' }, 500);
    await expect(createWebhookOperations(f.transport).register(url, types)).rejects.toMatchObject({
      outcomeUnknown: true,
    });
    expect(f.calls).toHaveLength(1);
    expect(f.sleep).not.toHaveBeenCalled();
    const before = f.fetcher.mock.calls.length;
    await expect(
      f.transport.request({
        method: 'POST',
        path: '/v2/checkout/orders',
        rawJson: '{}',
        opts: { requestId: 'synthetic-invalid-raw' },
        retrySafe: false,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PAYPAL_BODY' });
    expect(f.fetcher).toHaveBeenCalledTimes(before);
  });
});
