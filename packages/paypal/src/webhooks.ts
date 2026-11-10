import { createHash, randomUUID } from 'node:crypto';
import { type PayPalClient } from '@fairfold/contracts';
import { type PayPalTransport, PAYPAL_SANDBOX_API } from './transport.js';
import {
  array,
  inputText,
  invalidInput,
  invalidResponse,
  object,
  responseText,
} from './validation.js';
import { dateTime } from './dispute-validation.js';

const certificateOrigins = new Set([PAYPAL_SANDBOX_API, 'https://api.sandbox.paypal.com']);
function verificationBody(
  headers: Record<string, string>,
  rawBody: string,
  webhookId: string,
): string | null {
  try {
    if (
      !headers ||
      typeof headers !== 'object' ||
      Array.isArray(headers) ||
      typeof webhookId !== 'string' ||
      !/^[A-Za-z0-9]{1,50}$/.test(webhookId)
    )
      return null;
    const selected = new Map<string, string>();
    for (const [key, value] of Object.entries(headers)) {
      const name = key.toLowerCase();
      if (
        ![
          'paypal-auth-algo',
          'paypal-cert-url',
          'paypal-transmission-id',
          'paypal-transmission-sig',
          'paypal-transmission-time',
        ].includes(name)
      )
        continue;
      if (
        selected.has(name) ||
        typeof value !== 'string' ||
        [...value].some(
          (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
        )
      )
        return null;
      selected.set(name, value);
    }
    const auth = selected.get('paypal-auth-algo') ?? '';
    const certificate = selected.get('paypal-cert-url') ?? '';
    const id = selected.get('paypal-transmission-id') ?? '';
    const signature = selected.get('paypal-transmission-sig') ?? '';
    const time = selected.get('paypal-transmission-time') ?? '';
    if (
      !/^[A-Za-z0-9]{1,100}$/.test(auth) ||
      !/^[A-Za-z0-9_-]{1,50}$/.test(id) ||
      !/^[A-Za-z0-9+/]{1,498}={0,2}$/.test(signature) ||
      time.length > 100 ||
      certificate.length > 500
    )
      return null;
    dateTime(time);
    const cert = new URL(certificate);
    if (
      !certificateOrigins.has(cert.origin) ||
      cert.username ||
      cert.password ||
      cert.search ||
      cert.hash ||
      !/^\/v1\/notifications\/certs\/[A-Za-z0-9-]+$/.test(cert.pathname)
    )
      return null;
    if (
      typeof rawBody !== 'string' ||
      Buffer.byteLength(rawBody) > 1024 * 1024 ||
      Buffer.from(rawBody, 'utf8').toString('utf8') !== rawBody
    )
      return null;
    const event = JSON.parse(rawBody);
    if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
    const envelope = JSON.stringify({
      auth_algo: auth,
      cert_url: certificate,
      transmission_id: id,
      transmission_sig: signature,
      transmission_time: time,
      webhook_id: webhookId,
    });
    // Validate JSON without reserializing the signed event. Preserve whitespace, escapes and key order.
    return envelope.slice(0, -1) + ',"webhook_event":' + rawBody + '}';
  } catch {
    return null;
  }
}

export function createWebhookOperations(transport: PayPalTransport): PayPalClient['webhooks'] {
  return {
    async verify(headers, rawBody, webhookId) {
      const rawJson = verificationBody(headers, rawBody, webhookId);
      if (rawJson === null) return false;
      return transport.requestValidated(
        {
          method: 'POST',
          path: '/v1/notifications/verify-webhook-signature',
          rawJson,
          opts: { requestId: 'ff-verify-' + createHash('sha256').update(rawJson).digest('hex') },
          retrySafe: true, // Verification has no payment, message or registration side effect.
        },
        (body) => {
          const status = object(body).verification_status;
          if (status !== 'SUCCESS' && status !== 'FAILURE') return invalidResponse();
          return status === 'SUCCESS';
        },
      );
    },
    register(inputUrl, eventTypes) {
      inputText(inputUrl, 'webhook URL', 2048);
      let url: URL;
      try {
        url = new URL(inputUrl);
      } catch {
        return invalidInput('webhook URL');
      }
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.hash ||
        (url.port && url.port !== '443') ||
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
        url.hostname.endsWith('.localhost')
      )
        return invalidInput('public HTTPS webhook URL');
      if (
        !Array.isArray(eventTypes) ||
        eventTypes.length < 1 ||
        eventTypes.length > 500 ||
        new Set(eventTypes).size !== eventTypes.length ||
        !eventTypes.every(
          (type) =>
            typeof type === 'string' &&
            (type === '*' || /^[A-Z][A-Z0-9_]*(\.[A-Z0-9_]+)*$/.test(type)),
        )
      )
        return invalidInput('webhook events');
      const selected = [...eventTypes];
      return transport.requestValidated(
        {
          method: 'POST',
          path: '/v1/notifications/webhooks',
          body: { url: url.href, event_types: selected.map((name) => ({ name })) },
          opts: { requestId: 'ff-register-' + randomUUID() },
          retrySafe: false,
        },
        (body) => {
          const webhook = object(body);
          const id = responseText(webhook.id);
          if (!/^[A-Za-z0-9]{1,50}$/.test(id) || webhook.url !== url.href) return invalidResponse();
          const events = array(webhook.event_types).map((item) => responseText(object(item).name));
          if (
            events.length !== selected.length ||
            new Set(events).size !== events.length ||
            !events.every((name) => selected.includes(name))
          )
            return invalidResponse();
          return { id };
        },
      );
    },
  };
}
