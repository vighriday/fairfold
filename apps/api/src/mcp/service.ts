import { and, eq, ilike } from 'drizzle-orm';
import {
  AppError,
  CatalogItemSchema,
  StoreReportSchema,
  type CatalogItem,
} from '@fairfold/contracts';
import {
  evidence_packs,
  merchants,
  orders,
  products,
  store_reports,
  disputes,
  type Database,
} from '@fairfold/db';
import { createLedger } from '@fairfold/ledger';
import type { AuthContext } from '../auth.js';

function allowed(auth: AuthContext | null) {
  if (!auth || !['agent', 'buyer', 'merchant'].includes(auth.role))
    throw new AppError('UNAUTHENTICATED', 'A valid agent or user token is required', 401);
  return auth;
}

export function createMcpService(database: { db: Database }) {
  return {
    async searchCatalog(authInput: AuthContext | null, query: string, maxPrice?: string) {
      allowed(authInput);
      const rows = await database.db
        .select({ product: products, merchant: merchants, report: store_reports })
        .from(products)
        .innerJoin(merchants, eq(merchants.id, products.merchant_id))
        .leftJoin(store_reports, eq(store_reports.merchant_id, merchants.id))
        .where(ilike(products.name, `%${query}%`))
        .limit(50);
      const upper = maxPrice ? Number(maxPrice) : Number.POSITIVE_INFINITY;
      return rows
        .filter((row) => Number(row.product.unit_value) <= upper)
        .map((row): CatalogItem => {
          const report = row.report?.report;
          const storeBand =
            report && typeof report === 'object' && 'band' in report
              ? CatalogItemSchema.shape.storeBand.parse(report.band)
              : 'new';
          return CatalogItemSchema.parse({
            merchantId: row.merchant.id,
            sku: row.product.sku,
            name: row.product.name,
            price: { currency_code: row.product.currency, value: row.product.unit_value },
            storeBand,
          });
        });
    },
    async getStoreReport(authInput: AuthContext | null, merchantId: string) {
      allowed(authInput);
      const [row] = await database.db
        .select({ report: store_reports.report })
        .from(store_reports)
        .where(eq(store_reports.merchant_id, merchantId));
      if (!row) throw new AppError('STORE_REPORT_NOT_FOUND', 'Store report was not found', 404);
      return StoreReportSchema.parse(row.report);
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
