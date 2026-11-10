import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  createDatabase,
  disputes,
  ledger_entries,
  merchants,
  migrateDatabase,
  orders,
} from '@fairfold/db';
import { fixedClock, type ForMerchant, type PayPalClient } from '@fairfold/contracts';
import type { Jobs } from '@fairfold/jobs';
import { testDatabaseUrl } from '../../db/test/environment.js';
import { createDisputeSynchronizer } from '../src/dispute-sync.js';

const url = testDatabaseUrl();
const clock = fixedClock('2026-11-10T02:03:04.005Z');

describe.skipIf(!url)('H4 authoritative dispute synchronization', () => {
  let database: ReturnType<typeof createDatabase>;

  beforeAll(async () => {
    database = createDatabase(url!);
    await migrateDatabase(database.db);
  });
  afterAll(async () => {
    await database?.close();
  });

  async function fixture() {
    const merchantId = randomUUID();
    const merchantSlug = 'h4-sync-' + merchantId;
    await database.db.insert(merchants).values({
      id: merchantId,
      slug: merchantSlug,
      name: 'Synthetic H4 merchant',
      domain: 'synthetic.invalid',
      country: 'US',
    });
    const [order] = await database.db
      .insert(orders)
      .values({
        merchant_id: merchantId,
        paypal_order_id: 'O' + randomUUID().replaceAll('-', '').toUpperCase(),
        paypal_capture_id: 'C' + randomUUID().replaceAll('-', '').toUpperCase(),
        invoice_id: 'FF-' + randomUUID(),
        status: 'captured',
        amount_value: '38.00',
        currency: 'USD',
      })
      .returning();
    const disputeId = 'PP-D-' + randomUUID().replaceAll('-', '').toUpperCase();
    const detail: Record<string, unknown> = {
      dispute_id: disputeId,
      reason: 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED',
      status: 'WAITING_FOR_SELLER_RESPONSE',
      dispute_life_cycle_stage: 'INQUIRY',
      dispute_amount: { currency_code: 'USD', value: '38.00' },
      disputed_transactions: [{ seller_transaction_id: order!.paypal_capture_id! }],
      allowed_response_options: {
        make_offer: { offer_types: ['REFUND'] },
        accept_claim: { accept_claim_types: ['REFUND'] },
      },
      messages: [
        {
          posted_by: 'BUYER',
          time_posted: '2026-11-10T01:00:00Z',
          content: 'The product is not as described.',
        },
      ],
      vendor_private_field: 'must not persist',
    };
    const get = vi.fn<PayPalClient['disputes']['get']>(async () => structuredClone(detail));
    const forMerchant = vi.fn(async (id: string) => {
      expect(id).toBe(merchantId);
      return { disputes: { get } };
    }) as unknown as ForMerchant;
    const publish = vi.fn<() => Promise<string | null>>(async () => 'job-' + randomUUID());
    const jobs = { publish } as unknown as Pick<Jobs, 'publish'>;
    const sync = createDisputeSynchronizer({
      database,
      jobs,
      forMerchant,
      clock,
    });
    return { merchantId, order: order!, disputeId, detail, get, publish, sync };
  }

  it('maps capture, persists sanitized detail, emits one buyer message and ledger entry', async () => {
    const f = await fixture();
    await f.sync({ merchantId: f.merchantId, disputeId: f.disputeId });
    const [row] = await database.db.select().from(disputes).where(eq(disputes.id, f.disputeId));
    const ledger = await database.db
      .select()
      .from(ledger_entries)
      .where(eq(ledger_entries.order_id, f.order.id));
    expect(row).toMatchObject({
      merchant_id: f.merchantId,
      order_id: f.order.id,
      reason: f.detail.reason,
      amount_value: '38.00',
    });
    expect(row!.raw).not.toHaveProperty('vendor_private_field');
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.type).toBe('dispute_opened');
    expect(f.publish).toHaveBeenCalledWith(
      'dispute.synced',
      expect.objectContaining({ disputeId: f.disputeId, isNew: true, newBuyerMessages: [expect.any(String)] }),
      expect.anything(),
    );
  });

  it('deduplicates overlapping messages and records the first observed resolution', async () => {
    const f = await fixture();
    await f.sync({ merchantId: f.merchantId, disputeId: f.disputeId });
    f.detail.status = 'RESOLVED';
    f.detail.dispute_outcome = { outcome_code: 'BUYER_FAVOR' };
    await f.sync({ merchantId: f.merchantId, disputeId: f.disputeId });
    const [row] = await database.db.select().from(disputes).where(eq(disputes.id, f.disputeId));
    const ledger = await database.db
      .select()
      .from(ledger_entries)
      .where(eq(ledger_entries.order_id, f.order.id));
    expect(row!.resolved_at?.toISOString()).toBe(clock.now().toISOString());
    expect(ledger.map((entry) => entry.type)).toEqual(['dispute_opened', 'resolved']);
    expect(f.publish).toHaveBeenCalledTimes(2);
    expect(f.publish).toHaveBeenLastCalledWith(
      'dispute.synced',
      { disputeId: f.disputeId, isNew: false, newBuyerMessages: [] },
      expect.anything(),
    );
  });

  it('uses the exact merchant invoice fallback when capture linkage is absent', async () => {
    const f = await fixture();
    f.detail.disputed_transactions = [{ seller_transaction_id: 'UNKNOWN-CAPTURE', invoice_number: f.order.invoice_id }];
    await f.sync({ merchantId: f.merchantId, disputeId: f.disputeId });
    const [row] = await database.db.select().from(disputes).where(eq(disputes.id, f.disputeId));
    expect(row!.order_id).toBe(f.order.id);
  });

  it('rolls back the dispute and ledger when the notification cannot be queued', async () => {
    const f = await fixture();
    f.publish.mockResolvedValue(null);
    await expect(f.sync({ merchantId: f.merchantId, disputeId: f.disputeId })).rejects.toMatchObject({
      code: 'DISPUTE_SYNC_QUEUE_FAILED',
    });
    const rows = await database.db.select().from(disputes).where(eq(disputes.id, f.disputeId));
    expect(rows).toHaveLength(0);
    const ledger = await database.db
      .select()
      .from(ledger_entries)
      .where(eq(ledger_entries.order_id, f.order.id));
    expect(ledger).toHaveLength(0);
  });

  it('rejects a detail for a different dispute before writing any row', async () => {
    const f = await fixture();
    f.detail.dispute_id = 'PP-D-FOREIGN';
    await expect(f.sync({ merchantId: f.merchantId, disputeId: f.disputeId })).rejects.toMatchObject({
      code: 'DISPUTE_DETAIL_INVALID',
    });
    const rows = await database.db.select().from(disputes).where(eq(disputes.id, f.disputeId));
    expect(rows).toHaveLength(0);
  });
});
