import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import type {
  AttestationResult, BuyerSignal, CatalogItem, ComplaintExtraction, EvidencePackDraft,
  HypothesisDetail, HypothesisSummary, Review, SignalContest, StoreReport, ValueTest,
} from '../src/contracts.ts';
import * as S from '../src/schemas/intel.ts';

const uuid = '3f6c1f0e-8a1b-4c2d-9e3f-0a1b2c3d4e5f';
const iso = '2026-11-09T10:00:00.000Z';

const valueTest: ValueTest = {
  dimension: 'batch_code', value: 'B17', n: 40, k: 6, exposureDays: 560, nRest: 200, kRest: 1, exposureDaysRest: 2800,
  rateRatio: 30, p: 0.000129, q: 0.00154, wilson95: [0.07, 0.29], wilson95Rest: [0.001, 0.028],
};

const storeReport: StoreReport = {
  merchantId: uuid, band: 'verified',
  facts: { domain: 'neelblockprints.example', domainRegisteredAt: iso, policies: [{ kind: 'returns', url: 'https://neelblockprints.example/returns' }] },
  fulfilment: { ordersSealed90d: 120, medianHoursCaptureToSeal: 20.5, pctTrackingWithin72h: 0.97, pctWithPackingEvidence: 0.95,
    disputeRate90d: 0.008, proactiveFixes90d: 1, unansweredNotReceived: 0 },
  reviews: { count: 60, average: 4.4, themes: [{ label: 'Fabric quality', count: 12, tone: 'positive', reviewIds: [uuid, uuid] }] },
  sources: [{ label: 'Returns policy', url: 'https://neelblockprints.example/returns' }],
  computedAt: iso,
};

const buyerSignal: BuyerSignal = {
  band: 'yellow', points: 25, reasons: [{ code: 'OWN_DISPUTES_LOST', label: 'Lost a dispute with this store', points: 15 }],
  recommendation: 'Capture extra packing evidence and ship tracked', sentence: 'One earlier dispute was decided for the store.', simulatedNetworkUsed: false,
};

const attestation: AttestationResult = {
  items: [{ orderItemId: uuid, seen: { itemType: 'hoodie', colour: 'navy', sizeLabel: 'M', quantity: 1 }, matches: true, confidence: 0.92, notes: '' }],
  batchLabelText: 'B17', shippingLabel: { visible: true, trackingNumberText: '1Z999' },
  defects: [], inspection: null, couldNotVerify: [], confidence: 0.9,
};

const extraction: ComplaintExtraction = {
  category: 'product_defect', component: 'left sleeve seam', failureMode: 'stitching came apart', locationOnItem: 'left sleeve',
  severity: 'functional', summary: 'Seam on the left sleeve opened after one wash.', language: 'en',
};

const pack: EvidencePackDraft = {
  recommendation: 'inspect_first', rationale: ['Batch B17 is under investigation'], evidences: [], files: [],
  actionParams: null, narrative: 'Order shipped on 2026-11-01.', sharedContext: { hypothesisId: uuid, status: 'open', summary: 'Possible issue in B17' },
  confidence: 0.6,
};

const hypothesisDetail: HypothesisDetail = {
  id: uuid, status: 'open', strength: 'strong', headline: 'Possible shared product issue: batch B17', explanation: 'Six of forty B17 orders reported a seam fault.',
  cluster: { id: uuid, label: 'sleeve seam opening', category: 'product_defect', complaints: [{ id: uuid, orderId: uuid, summary: 'Seam opened', createdAt: iso, source: 'dispute' }] },
  stats: { horizonDays: 14, testsRun: 12, primary: valueTest,
    confounders: { medianDaysSinceDelivery: { value: 20, rest: 40 }, spread: [{ dimension: 'carrier', distinctValues: 4, topShare: 0.3 }], coincidesWithListingChange: false } },
  alternatives: [], affected: { unshipped: [uuid], inTransit: [], deliveredNoComplaint: [], openDisputes: [] },
  actions: [{ id: uuid, type: 'hold_orders', status: 'proposed', payload: { orderIds: [uuid] } }], safetyFlag: false,
};

const summary: HypothesisSummary = {
  id: uuid, headline: 'Possible shared product issue: batch B17', status: 'open', strength: 'strong', dimension: 'batch_code', value: 'B17',
  complaintCount: 5, unshippedCount: 18, safetyFlag: false, createdAt: iso,
};

const review: Review = { id: uuid, merchantId: uuid, orderId: uuid, rating: 5, text: 'Lovely print', merchantReply: null, createdAt: iso, weight: 1 };
const contest: SignalContest = { id: uuid, buyerId: uuid, signalId: uuid, text: 'That dispute was a courier error', status: 'open', merchantNote: null, createdAt: iso };
const catalogItem: CatalogItem = { merchantId: uuid, sku: 'HD-IND-01', name: 'Block-print cotton hoodie', price: { currency_code: 'USD', value: '38.00' }, storeBand: 'verified' };

describe('schemas mirror the contract types', () => {
  it('inferred types equal sections 9-11', () => {
    expectTypeOf<z.infer<typeof S.StoreReportSchema>>().toEqualTypeOf<StoreReport>();
    expectTypeOf<z.infer<typeof S.BuyerSignalSchema>>().toEqualTypeOf<BuyerSignal>();
    expectTypeOf<z.infer<typeof S.AttestationResultSchema>>().toEqualTypeOf<AttestationResult>();
    expectTypeOf<z.infer<typeof S.ComplaintExtractionSchema>>().toEqualTypeOf<ComplaintExtraction>();
    expectTypeOf<z.infer<typeof S.HypothesisDetailSchema>>().toEqualTypeOf<HypothesisDetail>();
    expectTypeOf<z.infer<typeof S.HypothesisSummarySchema>>().toEqualTypeOf<HypothesisSummary>();
    expectTypeOf<z.infer<typeof S.ValueTestSchema>>().toEqualTypeOf<ValueTest>();
    expectTypeOf<z.infer<typeof S.ReviewSchema>>().toEqualTypeOf<Review>();
    expectTypeOf<z.infer<typeof S.SignalContestSchema>>().toEqualTypeOf<SignalContest>();
    expectTypeOf<z.infer<typeof S.CatalogItemSchema>>().toEqualTypeOf<CatalogItem>();
  });
});

describe('response schemas', () => {
  it.each([
    ['StoreReportSchema', S.StoreReportSchema, storeReport, { ...storeReport, band: 'great' }],
    ['BuyerSignalSchema', S.BuyerSignalSchema, buyerSignal, { ...buyerSignal, band: 'blue' }],
    ['EvidencePackDraftSchema', S.EvidencePackDraftSchema, pack, { ...pack, narrative: 'x'.repeat(2001) }],
    ['HypothesisDetailSchema', S.HypothesisDetailSchema, hypothesisDetail, { ...hypothesisDetail, strength: 'weak' }],
    ['HypothesisSummarySchema', S.HypothesisSummarySchema, summary, { ...summary, dimension: 'colour' }],
    ['ReviewSchema', S.ReviewSchema, review, { ...review, rating: 0 }],
    ['SignalContestSchema', S.SignalContestSchema, contest, { ...contest, status: 'rejected' }],
    ['CatalogItemSchema', S.CatalogItemSchema, catalogItem, { ...catalogItem, price: { currency_code: 'USD', value: 38 } }],
    ['BuyerSignalViewSchema', S.BuyerSignalViewSchema, { band: 'grey', reasons: [], simulatedNetworkUsed: true }, { band: 'grey', reasons: [] }],
    ['TrendSchema', S.TrendSchema, { weeks: [{ weekStart: '2026-11-02', value: 'B17', rate: 0.15, n: 40, k: 6 }] }, { weeks: [{ weekStart: '2026-11-02' }] }],
  ] as const)('%s accepts a valid sample and rejects an invalid one', (_name, schema, good, bad) => {
    expect(schema.safeParse(good).success).toBe(true);
    expect(schema.safeParse(bad).success).toBe(false);
  });
});

describe('request schemas', () => {
  it('ReviewBodySchema rejects rating 6', () => {
    expect(S.ReviewBodySchema.safeParse({ rating: 5, text: 'Great' }).success).toBe(true);
    expect(S.ReviewBodySchema.safeParse({ rating: 6, text: 'Great' }).success).toBe(false);
    expect(S.ReviewBodySchema.safeParse({ rating: 4.5, text: 'Great' }).success).toBe(false);
  });

  it('ContestBodySchema needs a signal id and non-empty text', () => {
    expect(S.ContestBodySchema.safeParse({ signalId: uuid, text: 'Courier lost it' }).success).toBe(true);
    expect(S.ContestBodySchema.safeParse({ signalId: uuid, text: '' }).success).toBe(false);
  });

  it('ResolveContestBodySchema allows only upheld or corrected', () => {
    expect(S.ResolveContestBodySchema.safeParse({ status: 'corrected', merchantNote: 'Fixed' }).success).toBe(true);
    expect(S.ResolveContestBodySchema.safeParse({ status: 'open', merchantNote: 'x' }).success).toBe(false);
  });

  it('CatalogQuerySchema coerces maxPrice from the query string', () => {
    expect(S.CatalogQuerySchema.parse({ q: 'navy hoodie', maxPrice: '45' })).toEqual({ q: 'navy hoodie', maxPrice: 45 });
    expect(S.CatalogQuerySchema.safeParse({ maxPrice: '-1' }).success).toBe(false);
  });

  it('BuyerSignalQuerySchema requires merchantId', () => {
    expect(S.BuyerSignalQuerySchema.safeParse({ merchantId: uuid }).success).toBe(true);
    expect(S.BuyerSignalQuerySchema.safeParse({}).success).toBe(false);
  });

  it('simple text bodies reject empty text', () => {
    for (const schema of [S.DismissBodySchema, S.ReviewReplyBodySchema]) {
      const key = schema === S.DismissBodySchema ? 'reason' : 'text';
      expect(schema.safeParse({ [key]: 'ok' }).success).toBe(true);
      expect(schema.safeParse({ [key]: '' }).success).toBe(false);
    }
    expect(S.ReportProblemFieldsSchema.safeParse({ text: 'Seam split' }).success).toBe(true);
    expect(S.ReportProblemFieldsSchema.safeParse({ text: '' }).success).toBe(false);
  });
});

describe('model output schemas', () => {
  it('AttestationResultSchema accepts a valid attestation and rejects confidence above 1', () => {
    expect(S.AttestationResultSchema.safeParse(attestation).success).toBe(true);
    expect(S.AttestationResultSchema.safeParse({ ...attestation, confidence: 1.2 }).success).toBe(false);
  });

  it('ComplaintExtractionSchema rejects a 141-char summary', () => {
    expect(S.ComplaintExtractionSchema.safeParse(extraction).success).toBe(true);
    expect(S.ComplaintExtractionSchema.safeParse({ ...extraction, summary: 'x'.repeat(140) }).success).toBe(true);
    expect(S.ComplaintExtractionSchema.safeParse({ ...extraction, summary: 'x'.repeat(141) }).success).toBe(false);
    expect(S.ComplaintExtractionSchema.safeParse({ ...extraction, category: 'rude' }).success).toBe(false);
  });
});

describe('route table', () => {
  it('lists every Ishaan endpoint from section 11 exactly once', () => {
    expect(Object.keys(S.INTEL_ROUTES).map(Number).sort((a, b) => a - b)).toEqual([5, 6, 9, 19, 20, 22, 23, 24, 26, 27, 29, 32, 33, 34, 35, 40, 41, 42]);
  });
});
