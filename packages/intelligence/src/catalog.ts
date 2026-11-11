// Catalogue search across every store (section 15 searchCatalog; endpoint 6; MCP search_catalog).
import { and, asc, eq, gt, ilike, lte, or, type SQL } from 'drizzle-orm';
import { StoreReportSchema, UuidSchema, type CatalogItem } from '@fairfold/contracts';
import { products, store_reports } from '@fairfold/db';
import { DEFAULT_PAGE, invalidCursor, type Page } from './paging.js';
import { getIntelRuntime, type IntelRuntime } from './runtime.js';
import { buildStoreReportWith } from './storeReport/index.js';

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** A catalogue item has no id of its own; `merchantId:sku` (unique per store) is the page cursor. */
export const catalogCursor = (item: Pick<CatalogItem, 'merchantId' | 'sku'>) =>
  `${item.merchantId}:${item.sku}`;

/** Products after the cursor's product in `name, sku, id` order. */
async function afterCursor(rt: IntelRuntime, cursor: string): Promise<SQL> {
  const split = cursor.indexOf(':');
  const merchantId = cursor.slice(0, split);
  const sku = cursor.slice(split + 1);
  if (split < 0 || !UuidSchema.safeParse(merchantId).success || sku === '') throw invalidCursor();
  const [anchor] = await rt.db
    .select({ id: products.id, name: products.name, sku: products.sku })
    .from(products)
    .where(and(eq(products.merchant_id, merchantId), eq(products.sku, sku)));
  if (!anchor) throw invalidCursor();
  return or(
    gt(products.name, anchor.name),
    and(eq(products.name, anchor.name), gt(products.sku, anchor.sku)),
    and(eq(products.name, anchor.name), eq(products.sku, anchor.sku), gt(products.id, anchor.id)),
  )!;
}

/**
 * Every word of the query must appear (case-insensitive substring) in the product's name, SKU, colour or listing
 * description, so "navy hoodie" finds a hoodie whose colour is navy (A13). Words are split on whitespace.
 */
function queryFilters(query: string | undefined): SQL[] {
  const words = query?.trim().split(/\s+/).filter(Boolean) ?? [];
  return words.map((word) => {
    const pattern = `%${escapeLike(word)}%`;
    return or(
      ilike(products.name, pattern),
      ilike(products.sku, pattern),
      ilike(products.colour, pattern),
      ilike(products.description, pattern),
    )!;
  });
}

export async function searchCatalogWith(
  rt: IntelRuntime,
  input: { query?: string; maxPrice?: number },
  page: Page = DEFAULT_PAGE,
): Promise<CatalogItem[]> {
  const filters = queryFilters(input.query);
  if (input.maxPrice !== undefined)
    filters.push(lte(products.unit_value, input.maxPrice.toFixed(2)));
  if (page.cursor !== undefined) filters.push(await afterCursor(rt, page.cursor));
  const rows = await rt.db
    .select({ product: products, report: store_reports.report })
    .from(products)
    .leftJoin(store_reports, eq(store_reports.merchant_id, products.merchant_id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(products.name), asc(products.sku), asc(products.id))
    .limit(page.limit);

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

/** Section 15: searchCatalog({ query, maxPrice }) — the first page (section 11's default of 50). */
export function searchCatalog(input: { query: string; maxPrice?: number }): Promise<CatalogItem[]> {
  return searchCatalogWith(getIntelRuntime(), input);
}
