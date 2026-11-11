import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptSecret } from '@fairfold/contracts';
import { products, type Database } from '@fairfold/db';
import { createSandboxShopperCheckout } from '../src/shopper-toolkit.js';

const key = Buffer.alloc(32, 4);
vi.mock('../src/credentials.js', () => ({
  databaseCredentials: () => ({
    lookup: async () => ({
      clientId: 'synthetic-client',
      secretEncrypted: encryptSecret('synthetic-secret', key),
      simulated: false,
    }),
  }),
}));

describe('sandbox shopper toolkit boundary', () => {
  beforeEach(() => vi.stubEnv('DEBUG', ''));
  afterEach(() => vi.unstubAllEnvs());
  function fixture(approval = 'https://www.sandbox.paypal.com/checkoutnow?token=SYNTHETIC') {
    const orderId = 'SYNTHETICORDER12345';
    const database = {
      select: () => ({
        from: (table: unknown) => ({
          where: async () =>
            table === products
              ? [{ name: 'Synthetic hoodie', unit_value: '38.00', currency: 'USD' }]
              : [{ slug: 'neel-block-prints' }],
        }),
      }),
    } as unknown as Database;
    const create = vi.fn(async (_args: unknown) =>
      JSON.stringify({ id: orderId, links: [{ rel: 'approve', href: approval }] }),
    );
    const capture = vi.fn(async () =>
      JSON.stringify({ status: 'success', response: { id: orderId, status: 'COMPLETED' } }),
    );
    const factory = vi.fn((_config: unknown) => ({
      getTools: () => ({ create_order: { execute: create }, pay_order: { execute: capture } }),
    }));
    const checkout = createSandboxShopperCheckout({
      database,
      encryptionKey: key,
      appBaseUrl: 'http://localhost:3110',
      toolkitFactory: factory as unknown as NonNullable<
        Parameters<typeof createSandboxShopperCheckout>[0]['toolkitFactory']
      >,
    });
    return { checkout, factory, create, capture, orderId };
  }
  const input = {
    merchantId: '00000000-0000-4000-8000-000000000001',
    sku: 'HD-IND-01',
    quantity: 1,
    context: { sandbox: true as const },
  };
  it('enables only sandbox create/capture and consumes the capture context once', async () => {
    const f = fixture();
    const created = await f.checkout.createOrder(input);
    expect(f.factory.mock.calls[0]?.[0]).toMatchObject({
      configuration: {
        context: { sandbox: true, debug: false },
        actions: { orders: { create: true, capture: true } },
      },
    });
    expect(f.create.mock.calls[0]?.[0]).toMatchObject({
      currencyCode: 'USD',
      items: [{ quantity: 1, itemCost: 38, itemTotal: 38 }],
    });
    expect(f.capture).not.toHaveBeenCalled();
    await expect(
      f.checkout.capture({ orderId: created.orderId, context: input.context }),
    ).resolves.toEqual({ status: 'COMPLETED' });
    await expect(
      f.checkout.capture({ orderId: created.orderId, context: input.context }),
    ).rejects.toMatchObject({ code: 'SHOPPER_APPROVAL_CONTEXT_REQUIRED' });
    expect(f.capture).toHaveBeenCalledOnce();
  });
  it('rejects live approval links before allowing capture', async () => {
    const f = fixture('https://www.paypal.com/checkoutnow?token=SYNTHETIC');
    await expect(f.checkout.createOrder(input)).rejects.toMatchObject({
      code: 'PAYPAL_TOOLKIT_RESPONSE_INVALID',
    });
    expect(f.capture).not.toHaveBeenCalled();
  });
});
