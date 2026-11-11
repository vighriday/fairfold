import { and, eq } from 'drizzle-orm';
import { AppError, UuidSchema } from '@fairfold/contracts';
import { evidence_packs, orders, disputes, type Database } from '@fairfold/db';
import { searchCatalogWith, storeReportFor, type IntelRuntime } from '@fairfold/intelligence';
import { createLedger } from '@fairfold/ledger';
import type { AuthContext } from '../auth.js';

function allowed(auth: AuthContext | null) {
  if (!auth || !['agent', 'buyer', 'merchant'].includes(auth.role))
    throw new AppError('UNAUTHENTICATED', 'A valid agent or user token is required', 401);
  return auth;
}

/**
 * Section 16 H7: search_catalog → Ishaan's searchCatalog; get_store_report → the stored report, else
 * buildStoreReport. `intelligence` is the runtime the API bound at startup (DECISIONS.md I-D37).
 */
export function createMcpService(database: { db: Database }, intelligence: IntelRuntime) {
  return {
    async searchCatalog(authInput: AuthContext | null, query: string, maxPrice?: string) {
      allowed(authInput);
      const price = maxPrice === undefined ? undefined : Number(maxPrice);
      if (price !== undefined && !Number.isFinite(price))
        throw new AppError('VALIDATION_ERROR', 'maxPrice must be a number', 400);
      return searchCatalogWith(intelligence, { query, maxPrice: price });
    },
    async getStoreReport(authInput: AuthContext | null, merchantId: string) {
      allowed(authInput);
      if (!UuidSchema.safeParse(merchantId).success)
        throw new AppError('VALIDATION_ERROR', 'merchantId must be a store id', 400);
      return storeReportFor(intelligence, merchantId);
    },
    async getOrderProof(authInput: AuthContext | null, orderId: string) {
      const auth = allowed(authInput);
      const [order] = await database.db.select().from(orders).where(eq(orders.id, orderId));
      if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order was not found', 404);
      if (auth.role === 'buyer' && order.buyer_id !== auth.subjectId)
        throw new AppError('FORBIDDEN', 'This proof belongs to another buyer', 403);
      if (auth.role === 'merchant' && order.merchant_id !== auth.subjectId)
        throw new AppError('FORBIDDEN', 'This proof belongs to another merchant', 403);
      if (auth.role === 'agent')
        throw new AppError('FORBIDDEN', 'An agent cannot access private order proof', 403);
      return {
        orderId: order.id,
        status: order.status,
        paypalOrderId: order.paypal_order_id,
        paypalCaptureId: order.paypal_capture_id,
        ledger: await createLedger(database.db).verify(order.id),
      };
    },
    async provideDisputeEvidence(authInput: AuthContext | null, packId: string) {
      const auth = allowed(authInput);
      if (auth.role !== 'merchant')
        throw new AppError('FORBIDDEN', 'Only a merchant may provide dispute evidence', 403);
      const [row] = await database.db
        .select({ pack: evidence_packs })
        .from(evidence_packs)
        .innerJoin(disputes, eq(disputes.id, evidence_packs.dispute_id))
        .where(and(eq(evidence_packs.id, packId), eq(disputes.merchant_id, auth.subjectId)));
      if (!row) throw new AppError('EVIDENCE_PACK_NOT_FOUND', 'Evidence pack was not found', 404);
      return { packId: row.pack.id, status: row.pack.status, approvalRequired: true };
    },
  };
}
