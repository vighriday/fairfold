import { describe, expectTypeOf, it } from 'vitest';
import type { AttestationResult, Band, ComplaintCategory, Dimension, Recommendation, StoreReport } from '../src/contracts.ts';
import { handlers } from '../src/handlers.ts';

describe('contracts shim', () => {
  it('contracts shim compiles with the section 10 unions', () => {
    expectTypeOf<Band>().toEqualTypeOf<'green' | 'yellow' | 'red' | 'grey'>();
    expectTypeOf<Recommendation>().toEqualTypeOf<
      'provide_evidence' | 'make_offer' | 'accept_claim' | 'inspect_first' | 'merchant_decides'
    >();
    expectTypeOf<StoreReport['band']>().toEqualTypeOf<'verified' | 'standard' | 'caution' | 'new'>();
    expectTypeOf<Dimension>().toEqualTypeOf<
      'batch_code' | 'carrier' | 'listing_version' | 'packer' | 'ship_week' | 'ship_to_country'
    >();
    expectTypeOf<ComplaintCategory>().toEqualTypeOf<
      'product_defect' | 'wrong_item' | 'size_fit' | 'not_as_pictured' | 'damaged_in_transit' | 'not_received' | 'late' | 'other'
    >();
    expectTypeOf<AttestationResult['batchLabelText']>().toEqualTypeOf<string | null>();
  });

  it('handler map starts empty', () => {
    expectTypeOf(handlers).toBeObject();
    if (Object.keys(handlers).length !== 0) throw new Error('expected empty handler map');
  });
});
