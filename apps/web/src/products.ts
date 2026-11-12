/** Drawn illustrations of the fictional catalogue products, keyed by SKU. Not packing evidence. */
const bySku: Record<string, string> = {
  'HD-IND-01': 'product-hd-ind-01.svg',
  'TS-IND-02': 'product-ts-ind-02.svg',
};
export const PARCEL_IMAGE = 'illustration-sealed-parcel.svg';
export const productImages = [...Object.values(bySku), PARCEL_IMAGE];
/** The original striped placeholder is kept for any SKU without an illustration. */
const PLACEHOLDER =
  'repeating-linear-gradient(135deg,rgba(21,19,29,.1) 0 5px,rgba(21,19,29,.03) 5px 10px)';
export function productThumb(sku: string | undefined): string {
  const image = sku ? bySku[sku] : undefined;
  return image ? `#f3f1f6 url(/assets/${image}) center/cover no-repeat` : PLACEHOLDER;
}
/** Illustrated landing views: the whole item, its neck/size area, its woven batch label, the parcel. */
export function landingView(view: 'item' | 'size' | 'batch' | 'parcel'): string {
  const hoodie = `url(/assets/${bySku['HD-IND-01']})`;
  return {
    item: `#f3f1f6 ${hoodie} center/cover no-repeat`,
    size: `#f3f1f6 ${hoodie} 50% 22%/230% no-repeat`,
    batch: `#f3f1f6 ${hoodie} 71% 93%/400% no-repeat`,
    parcel: `#f3f1f6 url(/assets/${PARCEL_IMAGE}) center/cover no-repeat`,
  }[view];
}
