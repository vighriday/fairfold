import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { PayPalAgentToolkit } from '@paypal/agent-toolkit/ai-sdk';
import { AppError, decryptSecret } from '@fairfold/contracts';
import { merchants, products, type Database } from '@fairfold/db';
import { databaseCredentials } from './credentials.js';

type Factory = (
  config: ConstructorParameters<typeof PayPalAgentToolkit>[0],
) => Pick<PayPalAgentToolkit, 'getTools'>;
function body(value: unknown): Record<string, unknown> {
  try {
    const parsed = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || 'error' in parsed)
      throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new AppError(
      'PAYPAL_TOOLKIT_RESPONSE_INVALID',
      'PayPal toolkit response requires review',
      502,
    );
  }
}

/** Toolkit operations remain inside packages/paypal; no other PayPal tools are exposed. */
export function createSandboxShopperCheckout(options: {
  database: Database;
  encryptionKey: Buffer;
  appBaseUrl: string;
  toolkitFactory?: Factory;
}) {
  const bound = new Map<string, string>();
  const factory = options.toolkitFactory ?? ((config) => new PayPalAgentToolkit(config));
  async function tools(merchantId: string, requestId: string) {
    if (process.env.DEBUG)
      throw new AppError(
        'PAYPAL_TOOLKIT_DEBUG_FORBIDDEN',
        'Disable vendor debug logging before using the toolkit',
        409,
      );
    const [merchant] = await options.database
      .select({ slug: merchants.slug })
      .from(merchants)
      .where(eq(merchants.id, merchantId));
    const credentials = await databaseCredentials(options.database).lookup(merchantId);
    if (
      merchant?.slug !== 'neel-block-prints' ||
      !credentials ||
      credentials.simulated ||
      !credentials.clientId ||
      !credentials.secretEncrypted
    )
      throw new AppError(
        'PAYPAL_SANDBOX_ACCOUNTS_REQUIRED',
        'Configure Neel sandbox credentials before shopping',
        409,
      );
    const toolkit = factory({
      clientId: credentials.clientId,
      clientSecret: decryptSecret(credentials.secretEncrypted, options.encryptionKey),
      configuration: {
        context: { sandbox: true, debug: false, request_id: requestId },
        actions: { orders: { create: true, capture: true } },
      },
    });
    const enabled = toolkit.getTools();
    if (
      Object.keys(enabled).some((name) => !['create_order', 'pay_order'].includes(name)) ||
      !enabled.create_order?.execute ||
      !enabled.pay_order?.execute
    )
      throw new AppError(
        'PAYPAL_TOOLKIT_CONFIG_INVALID',
        'Only sandbox create/capture tools may be enabled',
        500,
      );
    return enabled;
  }
  return {
    async createOrder(input: {
      merchantId: string;
      sku: string;
      quantity: number;
      context: { readonly sandbox: true };
    }) {
      if (input.context.sandbox !== true || input.quantity !== 1)
        throw new AppError('SHOPPER_INPUT_INVALID', 'One sandbox item is required', 400);
      const [product] = await options.database
        .select()
        .from(products)
        .where(and(eq(products.merchant_id, input.merchantId), eq(products.sku, input.sku)));
      if (!product || product.currency !== 'USD')
        throw new AppError('SHOPPER_PRODUCT_INVALID', 'Selected USD product is unavailable', 409);
      const sdk = await tools(input.merchantId, 'ff-shopper-' + randomUUID());
      const result = body(
        await sdk.create_order!.execute!(
          {
            currencyCode: 'USD',
            items: [
              {
                name: product.name,
                quantity: 1,
                itemCost: Number(product.unit_value),
                itemTotal: Number(product.unit_value),
              },
            ],
            returnUrl: options.appBaseUrl + '/dev',
            cancelUrl: options.appBaseUrl + '/dev',
          },
          { toolCallId: 'fairfold-create', messages: [] },
        ),
      );
      const order = body(result.response ?? result);
      if (
        typeof order.id !== 'string' ||
        !/^[A-Z0-9]{17,32}$/.test(order.id) ||
        !Array.isArray(order.links)
      )
        throw new AppError(
          'PAYPAL_TOOLKIT_RESPONSE_INVALID',
          'Toolkit order response is invalid',
          502,
        );
      const link = order.links.find(
        (entry: unknown) =>
          entry &&
          typeof entry === 'object' &&
          'rel' in entry &&
          ['approve', 'payer-action'].includes(String(entry.rel)),
      ) as { href?: unknown } | undefined;
      const url = typeof link?.href === 'string' ? new URL(link.href) : undefined;
      if (
        !url ||
        !['https://www.sandbox.paypal.com', 'https://sandbox.paypal.com'].includes(url.origin) ||
        url.username ||
        url.password
      )
        throw new AppError(
          'PAYPAL_TOOLKIT_RESPONSE_INVALID',
          'Sandbox approval link is required',
          502,
        );
      bound.set(order.id, input.merchantId);
      return { orderId: order.id, approvalUrl: url.href };
    },
    async capture(input: { orderId: string; context: { readonly sandbox: true } }) {
      const merchantId = bound.get(input.orderId);
      if (!merchantId || input.context.sandbox !== true)
        throw new AppError(
          'SHOPPER_APPROVAL_CONTEXT_REQUIRED',
          'Capture must follow this shopper run',
          409,
        );
      // Consume before POST: uncertain capture requires authoritative recovery, never blind replay.
      bound.delete(input.orderId);
      const sdk = await tools(merchantId, 'ff-shopper-capture-' + input.orderId);
      const result = body(
        await sdk.pay_order!.execute!(
          { id: input.orderId },
          { toolCallId: 'fairfold-capture', messages: [] },
        ),
      );
      const captured = body(result.response ?? result);
      if (captured.id !== input.orderId || captured.status !== 'COMPLETED')
        throw new AppError(
          'PAYPAL_TOOLKIT_CAPTURE_PENDING',
          'Capture has not completed; reconcile before retrying',
          409,
        );
      return { status: 'COMPLETED' };
    },
  };
}
