// Catalogue search across every store (section 15 searchCatalog; endpoint 6; MCP search_catalog).
import { and, asc, eq, ilike, lte, or, type SQL } from 'drizzle-orm';
import { StoreReportSchema, type CatalogItem } from '@fairfold/contracts';
import { products, store_reports } from '@fairfold/db';
import { getIntelRuntime, type IntelRuntime } from './runtime.js';
import { buildStoreReportWith } from './storeReport/index.js';

export const CATALOG_LIMIT = 50;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function searchCatalogWith(
  rt: IntelRuntime,
  input: { query?: string; maxPrice?: number },
): Promise<CatalogItem[]> {
  const filters: SQL[] = [];
  const q = input.query?.trim();
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    filters.push(or(ilike(products.name, pattern), ilike(products.sku, pattern))!);
  }
  if (input.maxPrice !== undefined)
    filters.push(lte(products.unit_value, input.maxPrice.toFixed(2)));
  const rows = await rt.db
    .select({ product: products, report: store_reports.report })
    .from(products)
    .leftJoin(store_reports, eq(store_reports.merchant_id, products.merchant_id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(products.name), asc(products.sku))
    .limit(CATALOG_LIMIT);

  const bands = new Map<string, CatalogItem['storeBand']>();
  for (const r of rows) {
    if (bands.has(r.product.merchant_id)) continue;
    const report = r.report
      ? StoreReportSchema.parse(r.report)
      : await buildStoreReportWith(rt, r.product.merchant_id);
    bands.set(r.product.merchant_id, report.band);
  }
  return rows.map((r) => ({
    merchantId: r.product.merchant_id,
    sku: r.product.sku,
    name: r.product.name,
    price: { currency_code: r.product.currency, value: r.product.unit_value },
    storeBand: bands.get(r.product.merchant_id)!,
  }));
}

/** Section 15: searchCatalog({ query, maxPrice }). */
export function searchCatalog(input: { query: string; maxPrice?: number }): Promise<CatalogItem[]> {
  return searchCatalogWith(getIntelRuntime(), input);
}
