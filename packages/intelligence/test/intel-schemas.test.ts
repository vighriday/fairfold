import { describe, expect, it } from 'vitest';
import * as S from '@fairfold/contracts/intel';

const uuid = '3f6c1f0e-8a1b-4c2d-9e3f-0a1b2c3d4e5f';

describe('intel response schemas', () => {
  it('BuyerSignalViewSchema needs the simulated-network flag', () => {
    expect(
      S.BuyerSignalViewSchema.safeParse({ band: 'grey', reasons: [], simulatedNetworkUsed: true })
        .success,
    ).toBe(true);
    expect(S.BuyerSignalViewSchema.safeParse({ band: 'grey', reasons: [] }).success).toBe(false);
  });
  it('TrendSchema needs full week rows', () => {
    expect(
      S.TrendSchema.safeParse({
        weeks: [{ weekStart: '2026-11-02', value: 'B17', rate: 0.15, n: 40, k: 6 }],
      }).success,
    ).toBe(true);
    expect(S.TrendSchema.safeParse({ weeks: [{ weekStart: '2026-11-02' }] }).success).toBe(false);
  });
});

describe('intel request schemas', () => {
  it('ReviewBodySchema allows integer ratings 1-5 only', () => {
    expect(S.ReviewBodySchema.safeParse({ rating: 5, text: 'Great' }).success).toBe(true);
    expect(S.ReviewBodySchema.safeParse({ rating: 6, text: 'Great' }).success).toBe(false);
    expect(S.ReviewBodySchema.safeParse({ rating: 4.5, text: 'Great' }).success).toBe(false);
  });
  it('ContestBodySchema needs a signal uuid and non-blank text', () => {
    expect(S.ContestBodySchema.safeParse({ signalId: uuid, text: 'Courier lost it' }).success).toBe(
      true,
    );
    expect(S.ContestBodySchema.safeParse({ signalId: uuid, text: '   ' }).success).toBe(false);
    expect(S.ContestBodySchema.safeParse({ signalId: 'abc', text: 'x' }).success).toBe(false);
  });
  it('ResolveContestBodySchema allows only upheld or corrected', () => {
    expect(
      S.ResolveContestBodySchema.safeParse({ status: 'corrected', merchantNote: 'Fixed' }).success,
    ).toBe(true);
    expect(
      S.ResolveContestBodySchema.safeParse({ status: 'open', merchantNote: 'x' }).success,
    ).toBe(false);
  });
  it('CatalogQuerySchema coerces maxPrice from the query string', () => {
    expect(S.CatalogQuerySchema.parse({ q: 'navy hoodie', maxPrice: '45' })).toEqual({
      q: 'navy hoodie',
      maxPrice: 45,
      limit: 50,
    });
    expect(S.CatalogQuerySchema.safeParse({ maxPrice: '-1' }).success).toBe(false);
  });
  it('IntelListQuerySchema: section 11 default of 50, at most 100, cursor passed through', () => {
    expect(S.IntelListQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(S.IntelListQuerySchema.parse({ limit: '2', cursor: uuid })).toEqual({
      limit: 2,
      cursor: uuid,
    });
    expect(S.IntelListQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(S.IntelListQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });
  it('BuyerSignalQuerySchema requires a merchant uuid', () => {
    expect(S.BuyerSignalQuerySchema.safeParse({ merchantId: uuid }).success).toBe(true);
    expect(S.BuyerSignalQuerySchema.safeParse({}).success).toBe(false);
  });
  it('text bodies reject blank text', () => {
    expect(S.DismissBodySchema.safeParse({ reason: 'ok' }).success).toBe(true);
    expect(S.DismissBodySchema.safeParse({ reason: '' }).success).toBe(false);
    expect(S.ReviewReplyBodySchema.safeParse({ text: 'Thanks' }).success).toBe(true);
    expect(S.ReviewReplyBodySchema.safeParse({ text: ' ' }).success).toBe(false);
    expect(S.ReportProblemFieldsSchema.safeParse({ text: 'Seam split' }).success).toBe(true);
    expect(S.ReportProblemFieldsSchema.safeParse({ text: '' }).success).toBe(false);
  });
  it('dispute ids are PayPal strings, pack ids are uuids', () => {
    expect(S.PackParamsSchema.safeParse({ id: 'PP-D-1234', packId: uuid }).success).toBe(true);
    expect(S.PackParamsSchema.safeParse({ id: 'PP-D-1234', packId: 'x' }).success).toBe(false);
  });
});

describe('route table', () => {
  it('lists every Ishaan endpoint from section 11 exactly once', () => {
    expect(
      Object.keys(S.INTEL_ROUTES)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual([5, 6, 9, 19, 20, 22, 23, 24, 26, 27, 29, 32, 33, 34, 35, 40, 41, 42]);
  });
});
