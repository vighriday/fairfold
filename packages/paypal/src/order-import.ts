import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  AppError,
  MoneySchema,
  UuidSchema,
  type CaptureResult,
  type Clock,
} from '@fairfold/contracts';
import { merchants, orders, order_items, products } from '@fairfold/db';
import { type CaptureContext } from './capture-store.js';
import { minimizeCapture } from './capture-policy.js';
import { moneyMinor, formatMoney } from './money.js';

const itemSchema = z.object({
  sku: z.string().min(1).max(127).optional(),
  name: z.string().min(1).max(127),
  quantity: z.string().regex(/^[1-9]\d{0,8}$/),
  unit_amount: MoneySchema,
});
const unitSchema = z.object({
  amount: MoneySchema,
  payee: z.object({ merchant_id: z.string().optional() }).optional(),
  items: z.array(itemSchema).min(1).max(100),
});
function mismatch(): never {
  throw new AppError(
    'PAYPAL_IMPORT_MISMATCH',
    'Order cannot be matched to the merchant catalogue',
    409,
  );
}

/** Called inside the capture transaction, after its PayPal-order advisory lock. */
export async function importOrderSnapshot(
  tx: CaptureContext['tx'],
  merchantId: string,
  generatedId: string,
  result: CaptureResult,
  clock: Clock,
) {
  const capture = minimizeCapture(result);
  const [existing] = await tx
    .select()
    .from(orders)
    .where(eq(orders.paypal_order_id, capture.orderId));
  if (existing) {
    if (existing.merchant_id !== merchantId) return mismatch();
    return existing.id;
  }
  const [merchant] = await tx
    .select()
    .from(merchants)
    .where(and(eq(merchants.id, merchantId), eq(merchants.is_simulated, false)));
  if (!merchant || (capture.customId && capture.customId !== merchant.slug)) return mismatch();
  const raw = z.object({ purchase_units: z.array(unitSchema).length(1) }).safeParse(result.raw);
  if (!raw.success) return mismatch();
  const unit = raw.data.purchase_units[0]!;
  if (
    unit.amount.currency_code !== capture.amount.currency_code ||
    moneyMinor(unit.amount) !== moneyMinor(capture.amount) ||
    (merchant.paypal_merchant_id && unit.payee?.merchant_id !== merchant.paypal_merchant_id)
  )
    return mismatch();
  const orderId = UuidSchema.safeParse(capture.referenceId).success
    ? capture.referenceId!
    : generatedId;
  const invoice = capture.invoiceId ?? 'FF-' + orderId;
  if (!/^[A-Za-z0-9_-]{1,127}$/.test(invoice)) return mismatch();
  const snapshots: Array<typeof order_items.$inferInsert> = [];
  let total = 0n;
  for (const item of unit.items) {
    const matches = await tx
      .select()
      .from(products)
      .where(
        and(
          eq(products.merchant_id, merchantId),
          item.sku ? eq(products.sku, item.sku) : eq(products.name, item.name),
        ),
      );
    if (matches.length !== 1) return mismatch();
    const product = matches[0]!;
    if (
      product.currency !== item.unit_amount.currency_code ||
      moneyMinor({ currency_code: product.currency, value: product.unit_value }) !==
        moneyMinor(item.unit_amount)
    )
      return mismatch();
    const quantity = Number(item.quantity);
    total += moneyMinor(item.unit_amount) * BigInt(quantity);
    snapshots.push({
      order_id: orderId,
      product_id: product.id,
      sku: product.sku,
      name: product.name,
      quantity,
      unit_value: product.unit_value,
      listing_version: product.listing_version,
    });
  }
  if (total !== moneyMinor(capture.amount) || total <= 0n) return mismatch();
  await tx.insert(orders).values({
    id: orderId,
    merchant_id: merchantId,
    paypal_order_id: capture.orderId,
    invoice_id: invoice,
    status: 'created',
    amount_value: formatMoney(capture.amount.currency_code, total).value,
    currency: capture.amount.currency_code,
    created_at: clock.now(),
  });
  await tx.insert(order_items).values(snapshots);
  return orderId;
}
