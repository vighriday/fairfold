// Approved shared-cause actions (section 8 F5): release_orders clears the hypothesis's holds and switches off the
// inspection rules it created (`inspectionRuleIds`, DECISIONS.md I-D34), with or without held orders.
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fixedClock } from '@fairfold/contracts';
import {
  actions,
  complaint_clusters,
  createDatabase,
  hypotheses,
  inspection_rules,
  inventory_batches,
  ledger_entries,
  merchants,
  migrateDatabase,
  order_items,
  orders,
  products,
} from '@fairfold/db';
import { testDatabaseUrl } from '../../db/test/environment.js';
import { createActionHandler } from '../src/action-execution.js';

const url = testDatabaseUrl();

describe.skipIf(!url)('approved release_orders against PostgreSQL', () => {
  let database: ReturnType<typeof createDatabase>;
  beforeAll(async () => {
    database = createDatabase(url!);
    await migrateDatabase(database.db);
  });
  afterAll(async () => {
    await database?.close();
  });

  const handler = () =>
    createActionHandler({
      database,
      jobs: { publish: vi.fn() },
      forMerchant: async () => {
        throw new Error('release_orders makes no PayPal call');
      },
      clock: fixedClock('2026-11-11T06:00:00.000Z'),
    });

  /** A merchant with a B17 hypothesis that holds `held` orders and created one active inspection rule. */
  async function world(held: number) {
    const merchantId = randomUUID();
    await database.db.insert(merchants).values({
      id: merchantId,
      slug: 'release-' + merchantId,
      name: 'Synthetic release merchant',
      domain: 'release.invalid',
      country: 'IN',
      is_simulated: true,
    });
    const [product] = await database.db
      .insert(products)
      .values({
        merchant_id: merchantId,
        sku: 'HD-IND-01',
        name: 'Block-print cotton hoodie',
        description: 'Synthetic',
        unit_value: '38.00',
      })
      .returning();
    const [cluster] = await database.db
      .insert(complaint_clusters)
      .values({
        merchant_id: merchantId,
        product_id: product!.id,
        category: 'product_defect',
        label: 'sleeve seam: stitching came apart',
        centroid: [1, 0],
      })
      .returning();
    await database.db.insert(inventory_batches).values({
      merchant_id: merchantId,
      product_id: product!.id,
      batch_code: 'B17',
      qty_remaining: 100,
      qty_received: 100,
      received_at: new Date('2026-11-01T00:00:00Z'),
      status: 'on_hold',
    });
    const [hypothesis] = await database.db
      .insert(hypotheses)
      .values({
        merchant_id: merchantId,
        cluster_id: cluster!.id,
        dimension: 'batch_code',
        value: 'B17',
        status: 'dismissed',
        strength: 'strong',
        stats: {},
        alternatives: [],
        affected: {},
        explanation: 'Synthetic shared cause.',
      })
      .returning();
    const orderIds: string[] = [];
    for (let i = 0; i < held; i++) {
      const id = randomUUID();
      await database.db.insert(orders).values({
        id,
        merchant_id: merchantId,
        paypal_order_id: 'SEED-' + id,
        invoice_id: 'FF-' + id,
        status: 'captured',
        amount_value: '38.00',
        currency: 'USD',
        hold_reason: 'Synthetic shared cause.',
        held_by_hypothesis_id: hypothesis!.id,
        captured_at: new Date('2026-11-10T00:00:00Z'),
      });
      await database.db.insert(order_items).values({
        order_id: id,
        product_id: product!.id,
        sku: 'HD-IND-01',
        name: 'Block-print cotton hoodie',
        quantity: 1,
        unit_value: '38.00',
        listing_version: 'v1',
      });
      orderIds.push(id);
    }
    const [rule] = await database.db
      .insert(inspection_rules)
      .values({
        merchant_id: merchantId,
        product_id: product!.id,
        batch_code: 'B17',
        instruction: 'Photograph the sleeve seam',
        required_photo_label: 'seam_closeup',
        created_by_hypothesis_id: hypothesis!.id,
      })
      .returning();
    return { merchantId, hypothesisId: hypothesis!.id, orderIds, ruleId: rule!.id };
  }

  async function approvedRelease(hypothesisId: string, payload: Record<string, unknown>) {
    const [hypothesis] = await database.db
      .select()
      .from(hypotheses)
      .where(eq(hypotheses.id, hypothesisId));
    const [action] = await database.db
      .insert(actions)
      .values({
        hypothesis_id: hypothesisId,
        type: 'release_orders',
        status: 'approved',
        payload,
        approved_by: 'merchant:' + hypothesis!.merchant_id,
      })
      .returning();
    return action!.id;
  }

  const ruleActive = async (id: string) =>
    (await database.db.select().from(inspection_rules).where(eq(inspection_rules.id, id)))[0]!
      .active;

  it('clears the holds and switches off the inspection rules the hypothesis created', async () => {
    const w = await world(2);
    const actionId = await approvedRelease(w.hypothesisId, {
      orderIds: w.orderIds,
      inspectionRuleIds: [w.ruleId],
      reason: 'Inspected 12 units, all fine',
    });
    await handler()({ actionId });

    const released = await database.db.select().from(orders).where(inArray(orders.id, w.orderIds));
    expect(released.every((o) => o.held_by_hypothesis_id === null && o.hold_reason === null)).toBe(
      true,
    );
    const entries = await database.db
      .select()
      .from(ledger_entries)
      .where(inArray(ledger_entries.order_id, w.orderIds));
    expect(entries.map((e) => e.type)).toEqual(['released', 'released']);
    expect(await ruleActive(w.ruleId)).toBe(false);
    const [done] = await database.db.select().from(actions).where(eq(actions.id, actionId));
    expect(done).toMatchObject({
      status: 'done',
      result: { orderIds: w.orderIds, inspectionRuleIds: [w.ruleId] },
    });
  });

  it('switches off the rule when the hypothesis holds no orders', async () => {
    const w = await world(0);
    const actionId = await approvedRelease(w.hypothesisId, {
      orderIds: [],
      inspectionRuleIds: [w.ruleId],
      reason: 'Supplier fixed the machine',
    });
    await handler()({ actionId });
    expect(await ruleActive(w.ruleId)).toBe(false);
    const [done] = await database.db.select().from(actions).where(eq(actions.id, actionId));
    expect(done).toMatchObject({
      status: 'done',
      result: { orderIds: [], inspectionRuleIds: [w.ruleId] },
    });
  });

  it('refuses a rule of another merchant and changes nothing', async () => {
    const w = await world(1);
    const other = await world(0);
    const actionId = await approvedRelease(w.hypothesisId, {
      orderIds: w.orderIds,
      inspectionRuleIds: [other.ruleId],
      reason: 'x',
    });
    await expect(handler()({ actionId })).rejects.toMatchObject({
      code: 'ACTION_OWNERSHIP_FAILED',
    });
    expect(await ruleActive(other.ruleId)).toBe(true);
    const [order] = await database.db.select().from(orders).where(eq(orders.id, w.orderIds[0]!));
    expect(order!.held_by_hypothesis_id).toBe(w.hypothesisId);
    const [action] = await database.db.select().from(actions).where(eq(actions.id, actionId));
    expect(action!.status).toBe('approved');
  });

  it('refuses a release with neither orders nor rules', async () => {
    const w = await world(0);
    const actionId = await approvedRelease(w.hypothesisId, { orderIds: [], reason: 'x' });
    await expect(handler()({ actionId })).rejects.toMatchObject({ code: 'ACTION_PAYLOAD_INVALID' });
  });
});
