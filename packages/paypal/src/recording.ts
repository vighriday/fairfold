import { MoneySchema, UuidSchema, systemClock, type Clock } from '@fairfold/contracts';
import { isDeepStrictEqual } from 'node:util';
import { array, object, optionalObject, responseText, invalidResponse } from './validation.js';

export type OrderRecordOperation = 'create' | 'capture' | 'capture-get';
export interface SanitizedOrderRecord {
  version: 1;
  source: 'paypal-sandbox';
  operation: OrderRecordOperation;
  observedAt: string;
  redaction: 'buyer-and-shipping-replaced;other-fields-allowlisted';
  body: Record<string, unknown>;
}
export interface OrderRecording {
  /** Receives only the allowlisted record; never the raw response or an OAuth body. */
  write(record: SanitizedOrderRecord): Promise<void> | void;
  failed(): void;
  clock?: Clock;
}

function symbol(value: unknown): string {
  const text = responseText(value);
  if (!/^[A-Z][A-Z0-9_]{0,79}$/.test(text)) return invalidResponse();
  return text;
}
function identifier(value: unknown, maximum = 50): string {
  const text = responseText(value);
  if (!new RegExp(`^[A-Za-z0-9]{1,${maximum}}$`).test(text)) return invalidResponse();
  return text;
}
function syntheticName(value: unknown) {
  const input = optionalObject(value);
  return Object.fromEntries(
    ['full_name', 'given_name', 'surname']
      .filter((key) => typeof input[key] === 'string' && input[key] !== '')
      .map((key) => [key, key === 'surname' ? 'Buyer' : 'Synthetic']),
  );
}
function syntheticPayer(value: unknown, modern: boolean) {
  const input = object(value);
  const id = modern ? 'account_id' : 'payer_id';
  return {
    ...(input[id] ? { [id]: 'FIXTUREPAYER' } : {}),
    ...(input.email_address ? { email_address: 'synthetic@example.invalid' } : {}),
    ...(input.name != null ? { name: syntheticName(input.name) } : {}),
    ...(modern && input.account_status != null
      ? { account_status: symbol(input.account_status) }
      : {}),
  };
}

/** In-memory sanitization, also tested with synthetic adversarial vendor payloads. */
export function sanitizeOrderRecord(
  operation: OrderRecordOperation,
  input: unknown,
  clock: Clock = systemClock,
): SanitizedOrderRecord {
  const raw = object(input);
  const id = identifier(raw.id, 36);
  let body: Record<string, unknown> = { id, status: symbol(raw.status) };
  if (operation === 'create') {
    const links = array(raw.links).map(object);
    const link =
      links.find((link) => link.rel === 'payer-action') ??
      links.find((link) => link.rel === 'approve');
    if (!link) return invalidResponse();
    const url = new URL(responseText(link.href));
    if (
      !['https://www.sandbox.paypal.com', 'https://sandbox.paypal.com'].includes(url.origin) ||
      url.username ||
      url.password ||
      url.pathname !== '/checkoutnow' ||
      (link.method !== undefined && link.method !== 'GET')
    )
      return invalidResponse();
    // No contact, session, arbitrary query or fragment values survive the URL.
    const token = url.searchParams.get('token');
    url.search = '';
    url.hash = '';
    if (token === id) url.searchParams.set('token', id);
    body.links = [{ rel: link.rel, href: url.href, ...(link.method ? { method: 'GET' } : {}) }];
  } else {
    const units = array(raw.purchase_units);
    if (units.length !== 1) return invalidResponse();
    const unit = object(units[0]);
    const captures = array(object(unit.payments).captures);
    if (captures.length !== 1) return invalidResponse();
    const capture = object(captures[0]);
    const protection = optionalObject(capture.seller_protection);
    const safeCapture = {
      id: identifier(capture.id),
      status: symbol(capture.status),
      amount: MoneySchema.parse(capture.amount),
      ...(capture.seller_protection != null
        ? {
            seller_protection: {
              ...(protection.status != null ? { status: symbol(protection.status) } : {}),
              ...(protection.dispute_categories != null
                ? { dispute_categories: array(protection.dispute_categories).map(symbol) }
                : {}),
            },
          }
        : {}),
    };
    const safeUnit: Record<string, unknown> = { payments: { captures: [safeCapture] } };
    if (unit.reference_id != null) safeUnit.reference_id = UuidSchema.parse(unit.reference_id);
    if (unit.invoice_id != null) {
      const invoice = responseText(unit.invoice_id);
      UuidSchema.parse(invoice.slice(3));
      if (!invoice.startsWith('FF-')) return invalidResponse();
      safeUnit.invoice_id = invoice;
    }
    if (unit.custom_id != null) {
      const custom = responseText(unit.custom_id);
      if (!/^[a-z0-9-]{1,100}$/.test(custom)) return invalidResponse();
      safeUnit.custom_id = custom;
    }
    if (unit.shipping != null) {
      const shipping = object(unit.shipping);
      const address = optionalObject(shipping.address);
      const replacements: Record<string, string> = {
        address_line_1: 'SYNTHETIC STREET',
        address_line_2: 'SYNTHETIC UNIT',
        admin_area_1: 'SYNTHETIC REGION',
        admin_area_2: 'SYNTHETIC CITY',
        postal_code: '00000',
        country_code: 'US',
      };
      safeUnit.shipping = {
        ...(shipping.name != null ? { name: syntheticName(shipping.name) } : {}),
        ...(shipping.address != null
          ? {
              address: Object.fromEntries(
                Object.keys(replacements)
                  .filter((key) => typeof address[key] === 'string' && address[key] !== '')
                  .map((key) => [key, replacements[key]]),
              ),
            }
          : {}),
      };
    }
    body = {
      ...body,
      purchase_units: [safeUnit],
      ...(raw.payer != null ? { payer: syntheticPayer(raw.payer, false) } : {}),
    };
    const wallet = optionalObject(raw.payment_source).paypal;
    if (wallet != null) body.payment_source = { paypal: syntheticPayer(wallet, true) };
  }
  return {
    version: 1,
    source: 'paypal-sandbox',
    operation,
    observedAt: clock.now().toISOString(),
    redaction: 'buyer-and-shipping-replaced;other-fields-allowlisted',
    body,
  };
}

/** Recording failure must not turn a successful payment into a retryable vendor failure. */
export async function recordOrderSafely(
  recording: OrderRecording | undefined,
  operation: OrderRecordOperation,
  raw: unknown,
) {
  if (!recording) return;
  try {
    await recording.write(sanitizeOrderRecord(operation, raw, recording.clock));
  } catch {
    try {
      recording.failed();
    } catch {
      /* Diagnostics cannot change payment semantics. */
    }
  }
}

/** Reject edited/unsanitized files before a fixture can be replayed or reviewed. */
export function parseOrderRecord(input: unknown): SanitizedOrderRecord {
  const raw = object(input);
  if (!['create', 'capture', 'capture-get'].includes(String(raw.operation)))
    return invalidResponse();
  const observedAt = responseText(raw.observedAt);
  const instant = new Date(observedAt);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString() !== observedAt)
    return invalidResponse();
  const sanitized = sanitizeOrderRecord(raw.operation as OrderRecordOperation, raw.body, {
    now: () => instant,
  });
  if (!isDeepStrictEqual(raw, sanitized)) return invalidResponse();
  return sanitized;
}
