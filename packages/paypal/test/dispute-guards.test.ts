// Pure, synthetic cases; no vendor operation, persistence or real spike fixture.
import { describe, expect, it } from 'vitest';
import { assertDisputeActionAvailable, type DisputeOperation } from '../src/dispute-guards.js';

const id = 'PP-D-SYNTHETIC-GUARDS';
function detail() {
  return {
    dispute_id: id,
    status: 'WAITING_FOR_SELLER_RESPONSE',
    dispute_life_cycle_stage: 'INQUIRY',
    allowed_response_options: {
      make_offer: {
        offer_types: ['REFUND', 'REFUND_WITH_REPLACEMENT', 'REPLACEMENT_WITHOUT_REFUND'],
      },
      accept_claim: { accept_claim_types: ['REFUND', 'PARTIAL_REFUND'] },
    },
  };
}
const actions: Array<{ operation: DisputeOperation; variant?: string }> = [
  { operation: 'provide_evidence' },
  { operation: 'send_message' },
  { operation: 'make_offer', variant: 'REFUND' },
  { operation: 'make_offer', variant: 'REFUND_WITH_REPLACEMENT' },
  { operation: 'make_offer', variant: 'REPLACEMENT_WITHOUT_REFUND' },
  { operation: 'accept_claim' },
  { operation: 'accept_claim', variant: 'PARTIAL_REFUND' },
];
describe('H4 fresh-state action guards', () => {
  it.each(actions)('accepts an eligible current state/options: %j', (action) => {
    expect(() =>
      assertDisputeActionAvailable(detail(), { disputeId: id, ...action }),
    ).not.toThrow();
  });
  it.each(['OPEN', 'WAITING_FOR_BUYER_RESPONSE', 'UNDER_REVIEW', 'RESOLVED'])(
    'blocks all actions in %s even with stale INQUIRY/options',
    (status) => {
      for (const action of actions)
        expect(() =>
          assertDisputeActionAvailable({ ...detail(), status }, { disputeId: id, ...action }),
        ).toThrowError(expect.objectContaining({ code: 'STAGE_CHANGED' }));
    },
  );
  it.each(['CHARGEBACK', 'PRE_ARBITRATION', 'ARBITRATION'])(
    'blocks offers/messages outside INQUIRY: %s',
    (stage) => {
      for (const action of [
        { operation: 'make_offer', variant: 'REFUND' },
        { operation: 'send_message' },
      ] as const)
        expect(() =>
          assertDisputeActionAvailable(
            { ...detail(), dispute_life_cycle_stage: stage },
            { disputeId: id, ...action },
          ),
        ).toThrowError(expect.objectContaining({ code: 'STAGE_CHANGED' }));
    },
  );
  it('requires current explicit option lists for offers and claim types', () => {
    for (const action of actions.filter((a) =>
      ['make_offer', 'accept_claim'].includes(a.operation),
    ))
      expect(() =>
        assertDisputeActionAvailable(
          { ...detail(), allowed_response_options: {} },
          { disputeId: id, ...action },
        ),
      ).toThrowError(expect.objectContaining({ code: 'STAGE_CHANGED' }));
    const changed = detail();
    changed.allowed_response_options.make_offer.offer_types = ['REPLACEMENT_WITHOUT_REFUND'];
    expect(() =>
      assertDisputeActionAvailable(changed, {
        disputeId: id,
        operation: 'make_offer',
        variant: 'REFUND',
      }),
    ).toThrowError(expect.objectContaining({ code: 'STAGE_CHANGED' }));
  });
  it.each(['make_offer', 'accept_claim'] as const)(
    'preserves the pre-operation Q2 return gate for %s',
    (operation) => {
      expect(() =>
        assertDisputeActionAvailable(null, {
          disputeId: id,
          operation,
          variant: 'REFUND_WITH_RETURN',
        }),
      ).toThrowError(expect.objectContaining({ code: 'PAYPAL_RETURN_ADDRESS_REVIEW_REQUIRED' }));
    },
  );
  it.each([
    null,
    {},
    { ...detail(), dispute_id: 'PP-D-FOREIGN' },
    { ...detail(), status: 'excluded@example.invalid' },
  ])('rejects invalid or foreign detail: %j', (value) => {
    expect(() =>
      assertDisputeActionAvailable(value, { disputeId: id, operation: 'provide_evidence' }),
    ).toThrowError(expect.objectContaining({ code: 'PAYPAL_DISPUTE_DETAIL_INVALID' }));
  });
  it('rejects invalid/misplaced action variants before examining vendor data', () => {
    for (const action of [
      { operation: 'make_offer' },
      { operation: 'accept_claim', variant: 'UNKNOWN' },
      { operation: 'provide_evidence', variant: 'REFUND' },
    ] as const)
      expect(() => assertDisputeActionAvailable(null, { disputeId: id, ...action })).toThrowError(
        expect.objectContaining({ code: 'DISPUTE_ACTION_INVALID' }),
      );
  });
  it('does not mutate the transient detail or follow any vendor links', () => {
    const value = { ...detail(), links: [{ href: 'https://excluded.invalid/?token=excluded' }] };
    const before = structuredClone(value);
    assertDisputeActionAvailable(value, { disputeId: id, operation: 'provide_evidence' });
    expect(value).toEqual(before);
  });
});
