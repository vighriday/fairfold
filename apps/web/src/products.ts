/** Drawn illustrations of the fictional catalogue products, keyed by SKU. Not packing evidence. */
const bySku: Record<string, string> = {
  'HD-IND-01': 'product-hd-ind-01.svg',
  'TS-IND-02': 'product-ts-ind-02.svg',
};
export const productImages = Object.values(bySku);
/** The original striped placeholder is kept for any SKU without an illustration. */
const PLACEHOLDER =
  'repeating-linear-gradient(135deg,rgba(21,19,29,.1) 0 5px,rgba(21,19,29,.03) 5px 10px)';
export function productThumb(sku: string | undefined): string {
  const image = sku ? bySku[sku] : undefined;
  return image ? `#f3f1f6 url(/assets/${image}) center/cover no-repeat` : PLACEHOLDER;
}
