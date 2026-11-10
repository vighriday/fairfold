import { and, eq } from 'drizzle-orm';
import { AppError, UuidSchema, decryptSecret } from '@fairfold/contracts';
import { merchants, orders, order_items, products, type Database } from '@fairfold/db';
import { createLedger } from '@fairfold/ledger';
import { parseOrderRecord, type SanitizedOrderRecord } from '@fairfold/paypal';
import { SandboxHoodie } from './setup-sandbox.js';

function minor(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export async function inspectSandboxCheckout(options: {
  database: Database;
  clientId: string;
  clientSecret: string;
  encryptionKey: Buffer;
}) {
  const [merchant] = await options.database
    .select()
    .from(merchants)
    .where(eq(merchants.id, SandboxHoodie.merchantId));
  let credentialsMatch = false;
  try {
    credentialsMatch =
      !!merchant &&
      merchant.paypal_client_id === options.clientId &&
      !!merchant.paypal_client_secret_enc &&
      decryptSecret(merchant.paypal_client_secret_enc, options.encryptionKey) ===
        options.clientSecret;
  } catch {
    /* Report a boolean; do not expose a stored credential or crypto error. */
  }
  const catalogue = await options.database
    .select()
    .from(products)
    .where(eq(products.merchant_id, SandboxHoodie.merchantId));
  const checks = {
    sourceMerchant: !!merchant && merchant.slug === SandboxHoodie.slug && !merchant.is_simulated,
    credentialsMatch,
    sourceHoodie: catalogue.some(
      (product) =>
        product.sku === SandboxHoodie.sku &&
        product.unit_value === SandboxHoodie.value &&
        product.currency === SandboxHoodie.currency,
    ),
    oneCurrency:
      catalogue.length > 0 &&
      catalogue.every((product) => product.currency === SandboxHoodie.currency),
  };
  return { status: Object.values(checks).every(Boolean) ? 'LOCAL_SETUP_READY' : 'BLOCKED', checks };
}

/** Read-only A4 audit. Never repairs rows, captures a payment or infers who approved it. */
export async function verifySandboxCapture(options: {
  database: Database;
  orderId: string;
  records: readonly SanitizedOrderRecord[];
}) {
  if (!UuidSchema.safeParse(options.orderId).success)
    throw new AppError('INVALID_ORDER_ID', 'A Fairfold order UUID is required');
  const records = options.records.map(parseOrderRecord);
  return options.database.transaction(
    async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(
          and(eq(orders.id, options.orderId), eq(orders.merchant_id, SandboxHoodie.merchantId)),
        );
      if (!order)
        throw new AppError('SANDBOX_ORDER_NOT_FOUND', 'No source-merchant order found', 404);
      const items = await tx.select().from(order_items).where(eq(order_items.order_id, order.id));
      const chain = await createLedger(tx).verify(order.id);
      const [merchant] = await tx
        .select({ slug: merchants.slug, simulated: merchants.is_simulated })
        .from(merchants)
        .where(eq(merchants.id, order.merchant_id));
      const first = chain.entries[0];
      const payload = first?.payload as Record<string, unknown> | undefined;
      const amount = payload?.amount as { value?: string; currency_code?: string } | undefined;
      const protection = payload?.sellerProtection as
        { status?: string; disputeCategories?: string[] } | undefined;
      const checks = {
        sourceMerchant: merchant?.slug === SandboxHoodie.slug && merchant.simulated === false,
        captured: order.status === 'captured' && order.captured_at !== null,
        sandboxIdentifiers:
          /^[A-Z0-9]{1,36}$/.test(order.paypal_order_id) &&
          /^[A-Za-z0-9]{1,50}$/.test(order.paypal_capture_id ?? ''),
        sourceAmount:
          order.amount_value === SandboxHoodie.value && order.currency === SandboxHoodie.currency,
        sourceItem:
          items.length === 1 &&
          items[0]?.sku === SandboxHoodie.sku &&
          items[0]?.quantity === 1 &&
          items[0]?.unit_value === SandboxHoodie.value,
        sellerProtectionPresent: !!order.seller_protection_status?.trim(),
        payerAccountStatusPresent: !!order.payer_account_status?.trim(),
        capturedLedgerFirst:
          first?.seq === 1 &&
          first.type === 'captured' &&
          first.actor === 'paypal' &&
          chain.entries.filter((entry) => entry.type === 'captured').length === 1,
        ledgerCaptureMatches:
          payload?.paypalOrderId === order.paypal_order_id &&
          payload?.paypalCaptureId === order.paypal_capture_id,
        ledgerDetailsMatch:
          amount?.value === order.amount_value &&
          amount?.currency_code === order.currency &&
          payload?.payerAccountStatus === order.payer_account_status &&
          protection?.status === order.seller_protection_status &&
          JSON.stringify(protection?.disputeCategories) ===
            JSON.stringify(order.seller_protection_categories),
        ledgerVerified: chain.verified,
      };
      const matching = records.filter((record) => record.body.id === order.paypal_order_id);
      const created = matching.some((record) => record.operation === 'create');
      const capture = matching.some((record) => {
        // parseOrderRecord has already validated the allowlisted single-unit/capture shape.
        if (record.operation !== 'capture') return false;
        const units = record.body.purchase_units as Array<{
          reference_id?: string;
          invoice_id?: string;
          custom_id?: string;
          payments: {
            captures: Array<{
              id: string;
              status: string;
              amount: { currency_code: string; value: string };
            }>;
          };
        }>;
        const unit = units[0]!;
        const result = unit.payments.captures[0]!;
        return (
          result.id === order.paypal_capture_id &&
          result.status === 'COMPLETED' &&
          result.amount.currency_code === order.currency &&
          minor(result.amount.value) === minor(order.amount_value) &&
          (unit.reference_id === undefined || unit.reference_id === order.id) &&
          (unit.invoice_id === undefined || unit.invoice_id === order.invoice_id) &&
          (unit.custom_id === undefined || unit.custom_id === SandboxHoodie.slug)
        );
      });
      return {
        orderId: order.id,
        paypalOrderId: order.paypal_order_id,
        paypalCaptureId: order.paypal_capture_id,
        a4Database: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
        checks,
        recordedCreateAndCapture: created && capture ? 'PASS' : 'BLOCKED',
        mayaIdentity: 'NOT_VERIFIED',
        actualSdkSession: 'NOT_VERIFIED',
      };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}
