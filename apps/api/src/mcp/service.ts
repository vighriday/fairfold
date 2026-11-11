import { eq } from 'drizzle-orm';
import { AppError, UuidSchema } from '@fairfold/contracts';
import { orders, type Database } from '@fairfold/db';
import { searchCatalogWith, storeReportFor, type IntelRuntime } from '@fairfold/intelligence';
import type { Jobs } from '@fairfold/jobs';
import { provideDisputeEvidenceTool } from '@fairfold/paypal';
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
export function createMcpService(
  database: { db: Database },
  intelligence: IntelRuntime,
  options: { jobs?: Pick<Jobs, 'publish'> } = {},
) {
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
    evidenceTool(authInput: AuthContext | null) {
      const auth = allowed(authInput);
      if (auth.role !== 'merchant')
        throw new AppError('FORBIDDEN', 'Merchant access is required', 403);
      if (!options.jobs)
        throw new AppError('EVIDENCE_QUEUE_UNAVAILABLE', 'Evidence queue unavailable', 503);
      return provideDisputeEvidenceTool(auth.subjectId, {
        database: database.db,
        jobs: options.jobs,
      });
    },
  };
}
