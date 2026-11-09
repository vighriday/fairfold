import { PayPalOrderInputSchema, type CaptureResult, type PayPalClient } from '@fairfold/contracts';
import { formatMoney, moneyMinor } from './money.js';
import { type PayPalTransport } from './transport.js';
import { createTrackingOperation } from './tracking.js';
import { recordOrderSafely, type OrderRecording } from './recording.js';
import {
  array,
  inputText,
  invalidInput,
  invalidResponse,
  object,
  optionalObject,
  optionalText,
  orderId,
  responseText,
} from './validation.js';

type Orders = PayPalClient['orders'];

function shippingBody(input: NonNullable<Parameters<Orders['create']>[0]['shipping']>) {
  const limits: Record<string, number> = {
    address_line_1: 300,
    address_line_2: 300,
    admin_area_1: 300,
    admin_area_2: 120,
    postal_code: 60,
    country_code: 2,
  };
  const address: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.address)) {
    if (!Object.hasOwn(limits, key)) return invalidInput('shipping address field');
    address[key] = inputText(value, 'shipping address', limits[key]!);
  }
  if (!address.country_code || !/^[A-Z]{2}$/.test(address.country_code))
    return invalidInput('shipping country');
  return { name: { full_name: inputText(input.fullName, 'shipping name', 300) }, address };
}

function createBody(input: Parameters<Orders['create']>[0]) {
  const parsed = PayPalOrderInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput('order');
  const value = parsed.data;
  if (value.items.length > 32767) return invalidInput('item count');
  const currency = value.items[0]!.unitAmount.currency_code;
  let total = 0n;
  const items = value.items.map((item) => {
    if (!Number.isSafeInteger(item.quantity) || item.quantity > 9_999_999_999)
      return invalidInput('item quantity');
    if (item.unitAmount.currency_code !== currency) return invalidInput('mixed currencies');
    const unit = moneyMinor(item.unitAmount);
    total += unit * BigInt(item.quantity);
    return {
      name: inputText(item.name, 'item name', 127),
      sku: inputText(item.sku, 'item SKU', 127),
      quantity: item.quantity.toString(),
      unit_amount: formatMoney(currency, unit),
    };
  });
  if (total === 0n) return invalidInput('positive order total');
  const amount = formatMoney(currency, total);
  return {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: inputText(value.referenceId, 'reference ID', 256),
        custom_id: inputText(value.customId, 'custom ID', 255),
        invoice_id: inputText(value.invoiceId, 'invoice ID', 127),
        items,
        amount: { ...amount, breakdown: { item_total: { ...amount } } },
        ...(value.shipping ? { shipping: shippingBody(value.shipping) } : {}),
      },
    ],
  };
}

function parseCreated(body: unknown) {
  const order = object(body);
  const id = responseText(order.id);
  if (!/^[A-Z0-9]{1,36}$/.test(id)) return invalidResponse();
  const links = array(order.links).map(object);
  const link =
    links.find((link) => link.rel === 'payer-action') ??
    links.find((link) => link.rel === 'approve');
  if (!link || (link.method !== undefined && link.method !== 'GET')) return invalidResponse();
  const approveUrl = responseText(link.href);
  const url = new URL(approveUrl);
  if (
    !['https://www.sandbox.paypal.com', 'https://sandbox.paypal.com'].includes(url.origin) ||
    url.username ||
    url.password
  )
    return invalidResponse();
  return { id, status: responseText(order.status), approveUrl };
}

function fullName(input: unknown): string | null {
  const name = optionalObject(input);
  return (
    optionalText(name.full_name) ??
    ([optionalText(name.given_name), optionalText(name.surname)].filter(Boolean).join(' ') || null)
  );
}

function parseCaptured(body: unknown, expectedId: string): CaptureResult {
  const order = object(body);
  if (order.id !== expectedId) return invalidResponse();
  const units = array(order.purchase_units);
  if (units.length !== 1) return invalidResponse();
  const unit = object(units[0]);
  const captures = array(object(unit.payments).captures);
  if (captures.length !== 1) return invalidResponse();
  const capture = object(captures[0]);
  const captureId = responseText(capture.id);
  if (!/^[A-Za-z0-9]{1,50}$/.test(captureId)) return invalidResponse();
  const protection = optionalObject(capture.seller_protection);
  const wallet = optionalObject(optionalObject(order.payment_source).paypal);
  const payer = optionalObject(order.payer);
  const walletId = optionalText(wallet.account_id);
  const legacyId = optionalText(payer.payer_id);
  if (walletId && legacyId && walletId !== legacyId) return invalidResponse();
  let shipping: CaptureResult['shipping'] = null;
  if (unit.shipping !== undefined && unit.shipping !== null) {
    const detail = object(unit.shipping);
    const address = optionalObject(detail.address);
    const mapped: NonNullable<CaptureResult['shipping']>['address'] = {};
    for (const key of [
      'address_line_1',
      'admin_area_2',
      'admin_area_1',
      'postal_code',
      'country_code',
    ] as const) {
      const value = optionalText(address[key]);
      if (value !== null) mapped[key] = value;
    }
    shipping = { fullName: optionalText(optionalObject(detail.name).full_name), address: mapped };
  }
  return {
    orderId: expectedId,
    captureId,
    status: responseText(capture.status),
    sellerProtection: {
      status: optionalText(protection.status),
      disputeCategories:
        protection.dispute_categories === undefined || protection.dispute_categories === null
          ? []
          : array(protection.dispute_categories).map(responseText),
    },
    payerAccountStatus: optionalText(wallet.account_status),
    payerId: walletId ?? legacyId,
    payerEmail: optionalText(wallet.email_address) ?? optionalText(payer.email_address),
    payerName: fullName(wallet.name) ?? fullName(payer.name),
    shipping,
    raw: body,
  };
}

/** Authoritative checkout recovery; the raw GET response remains transient. */
export function readCapturedOrder(
  transport: PayPalTransport,
  id: string,
  recording?: OrderRecording,
): Promise<CaptureResult | null> {
  orderId(id);
  return transport
    .requestValidated(
      { method: 'GET', path: `/v2/checkout/orders/${id}?fields=payment_source` },
      (body) => {
        const order = object(body);
        if (order.id !== id) return invalidResponse();
        const status = responseText(order.status);
        const units = array(order.purchase_units);
        if (units.length !== 1) return invalidResponse();
        const payments = optionalObject(object(units[0]).payments);
        const captures = payments.captures === undefined ? [] : array(payments.captures);
        if (!captures.length) {
          if (!['CREATED', 'SAVED', 'APPROVED', 'PAYER_ACTION_REQUIRED'].includes(status))
            return invalidResponse();
          return null;
        }
        return parseCaptured(body, id);
      },
    )
    .then(async (result) => {
      if (result) await recordOrderSafely(recording, 'capture-get', result.raw);
      return result;
    });
}

export function createOrderOperations(
  transport: PayPalTransport,
  recording?: OrderRecording,
): Orders {
  return {
    addTracking: createTrackingOperation(transport),
    async create(input, opts) {
      let observed: unknown;
      const result = await transport.requestValidated(
        {
          method: 'POST',
          path: '/v2/checkout/orders',
          body: createBody(input),
          opts,
          retrySafe: true,
        },
        (body) => {
          const parsed = parseCreated(body);
          observed = body;
          return parsed;
        },
      );
      await recordOrderSafely(recording, 'create', observed);
      return result;
    },
    async capture(id, opts) {
      orderId(id);
      const result = await transport.requestValidated(
        {
          method: 'POST',
          path: `/v2/checkout/orders/${id}/capture`,
          body: {},
          opts,
          retrySafe: true,
        },
        (body) => parseCaptured(body, id),
      );
      await recordOrderSafely(recording, 'capture', result.raw);
      return result;
    },
    async get(id) {
      orderId(id);
      return transport.requestValidated(
        { method: 'GET', path: `/v2/checkout/orders/${id}` },
        (body) => {
          if (object(body).id !== id) return invalidResponse();
          responseText(object(body).status);
          return body;
        },
      );
    },
  };
}
