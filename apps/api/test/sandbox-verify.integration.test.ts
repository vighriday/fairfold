import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDatabase,
  migrateDatabase,
  orders,
  ledger_entries,
  order_items,
  products,
  merchants,
  buyers,
} from '@fairfold/db';
import { createJobs, type Jobs } from '@fairfold/jobs';
import { type SanitizedOrderRecord } from '@fairfold/paypal';
import { testDatabaseUrl } from '../../../packages/db/test/environment.js';
import { checkoutFixture } from './checkout-fixture.js';
import { verifySandboxCapture } from '../src/checkout/verify-sandbox.js';

const integrationUrl = testDatabaseUrl();
// Real PostgreSQL/client/ledger code, injected synthetic HTTP. Not real A4 evidence.
describe.skipIf(!integrationUrl)('read-only sandbox rehearsal verifier', () => {
  let database: ReturnType<typeof createDatabase>;
  let jobs: Jobs;
  let fixture: Awaited<ReturnType<typeof checkoutFixture>>;
  let orderId: string;
  const records: SanitizedOrderRecord[] = [];
  beforeAll(async () => {
    database = createDatabase(integrationUrl!);
    await migrateDatabase(database.db);
    jobs = createJobs(integrationUrl!, { schema: 'h2_verify_' + randomUUID().replaceAll('-', '') });
    await jobs.start();
    fixture = await checkoutFixture(database, jobs, {
      sourceMerchant: true,
      recording: {
        write: (record) => {
          records.push(record);
        },
        failed: () => {
          throw new Error('Synthetic recording failed');
        },
      },
    });
    const created = await fixture.service.create(null, fixture.input);
    orderId = created.orderId;
    await fixture.service.capture(null, created.paypalOrderId);
  });
  afterAll(async () => {
    await jobs?.stop();
    if (database && fixture) {
      await database.db.delete(ledger_entries).where(eq(ledger_entries.order_id, orderId));
      await database.db.delete(order_items).where(eq(order_items.order_id, orderId));
      await database.db.delete(orders).where(eq(orders.id, orderId));
      await database.db.delete(products).where(eq(products.id, fixture.product.id));
      await database.db.delete(merchants).where(eq(merchants.id, fixture.merchant.id));
      await database.db.delete(buyers).where(eq(buyers.paypal_payer_id, fixture.payerId));
    }
    await database?.close();
  });
  async function verify(input = records) {
    return verifySandboxCapture({ database: database.db, orderId, records: input });
  }
  it('audits the source hoodie, A4 fields, first captured ledger and matching sanitized observations', async () => {
    const result = await verify();
    expect(result.a4Database).toBe('PASS');
    expect(result.recordedCreateAndCapture).toBe('PASS');
    expect(result.mayaIdentity).toBe('NOT_VERIFIED');
    expect(result.actualSdkSession).toBe('NOT_VERIFIED');
    const text = JSON.stringify(result);
    for (const excluded of [
      'email',
      'ship_to',
      'Synthetic Street',
      fixture.payerId,
      'access_token',
    ])
      expect(text).not.toContain(excluded);
  });
  it('keeps missing fixtures or a recovered GET-only observation blocked', async () => {
    expect((await verify([])).recordedCreateAndCapture).toBe('BLOCKED');
    const getOnly = records.map((record) =>
      record.operation === 'capture' ? { ...record, operation: 'capture-get' as const } : record,
    );
    expect((await verify(getOnly)).recordedCreateAndCapture).toBe('BLOCKED');
  });
  it.each(['status', 'protection', 'account', 'amount', 'seed'])(
    'fails A4 for a missing or conflicting %s observation without repairing the row',
    async (reason) => {
      const [before] = await database.db.select().from(orders).where(eq(orders.id, orderId));
      const change =
        reason === 'status'
          ? { status: 'created' }
          : reason === 'protection'
            ? { seller_protection_status: null }
            : reason === 'account'
              ? { payer_account_status: null }
              : reason === 'amount'
                ? { amount_value: '39.00' }
                : { paypal_order_id: 'SEED-NOT-A-SANDBOX-ORDER' };
      await database.db.update(orders).set(change).where(eq(orders.id, orderId));
      try {
        expect((await verify()).a4Database).toBe('FAIL');
        const [after] = await database.db.select().from(orders).where(eq(orders.id, orderId));
        expect(after).toEqual({ ...before, ...change });
      } finally {
        await database.db.update(orders).set(before!).where(eq(orders.id, orderId));
      }
    },
  );
  it('reports ledger tampering instead of accepting a filled capture row', async () => {
    const [entry] = await database.db
      .select()
      .from(ledger_entries)
      .where(eq(ledger_entries.order_id, orderId));
    await database.db
      .update(ledger_entries)
      .set({ entry_hash: '0'.repeat(64) })
      .where(eq(ledger_entries.order_id, orderId));
    try {
      expect((await verify()).checks.ledgerVerified).toBe(false);
    } finally {
      await database.db
        .update(ledger_entries)
        .set({ entry_hash: entry!.entry_hash })
        .where(eq(ledger_entries.order_id, orderId));
    }
  });
  it.each(['id', 'amount', 'reference', 'pending'])(
    'blocks a mismatching recorded %s',
    async (reason) => {
      const edited = structuredClone(records);
      const record = edited.find((record) => record.operation === 'capture')!;
      const units = record.body.purchase_units as Array<{
        reference_id: string;
        payments: { captures: Array<{ id: string; status: string; amount: { value: string } }> };
      }>;
      const capture = units[0]!.payments.captures[0]!;
      if (reason === 'id') capture.id = 'DIFFERENTCAPTURE';
      if (reason === 'amount') capture.amount.value = '37.99';
      if (reason === 'reference') units[0]!.reference_id = randomUUID();
      if (reason === 'pending') capture.status = 'PENDING';
      expect((await verify(edited)).recordedCreateAndCapture).toBe('BLOCKED');
    },
  );
  it('compares recorded decimal amounts exactly without requiring identical padding', async () => {
    const edited = structuredClone(records);
    const record = edited.find((record) => record.operation === 'capture')!;
    const units = record.body.purchase_units as Array<{
      payments: { captures: Array<{ amount: { value: string } }> };
    }>;
    units[0]!.payments.captures[0]!.amount.value = '38';
    expect((await verify(edited)).recordedCreateAndCapture).toBe('PASS');
  });
  it('rejects absent/invalid order IDs and unsanitized fixture edits', async () => {
    await expect(
      verifySandboxCapture({ database: database.db, orderId: randomUUID(), records: [] }),
    ).rejects.toMatchObject({ code: 'SANDBOX_ORDER_NOT_FOUND' });
    await expect(
      verifySandboxCapture({ database: database.db, orderId: 'invalid', records: [] }),
    ).rejects.toMatchObject({ code: 'INVALID_ORDER_ID' });
    const edited = structuredClone(records);
    edited[0]!.body.email = 'synthetic-private-value';
    await expect(verify(edited)).rejects.toThrow();
  });
});
