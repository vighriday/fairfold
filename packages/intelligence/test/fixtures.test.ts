import { describe, expect, it } from 'vitest';
import { closeSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ComplaintExtractionSchema } from '@fairfold/contracts';

function load<T>(rel: string): T {
  return JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')) as T;
}

type Complaint = {
  id: string;
  text: string;
  product: string;
  category: string;
  expectedCluster: string | null;
};
type SeedComplaint = {
  id: string;
  text: string;
  product: string;
  batch: string;
  carrier: string;
  category: string;
  daysAfterDelivery: number;
  model: string;
  extracted: unknown;
};
type ReviewFx = {
  id: string;
  merchant: string;
  buyerRef: string;
  rating: number;
  text: string;
  merchantReply: string | null;
};
type BuyerFx = {
  id: string;
  name: string;
  features: Record<string, unknown>;
  expectedBand: string;
  expectedPoints: number;
  expectedCodes: string[];
};
type DisputeFx = { id: string; facts: Record<string, unknown>; expectedRecommendation: string };
type PhotoSet = {
  id: string;
  deliberatelyWrong: string | null;
  expectedStatus: string;
  expectedBatchLabel: string | null;
};

const REASON_CODES = [
  'PAYER_UNVERIFIED',
  'OWN_DISPUTES_FILED',
  'OWN_DISPUTES_LOST',
  'OWN_REFUND_RATIO',
  'VELOCITY',
  'NEW_ADDRESS',
  'HIGH_VALUE',
  'NETWORK_DISPUTES_LOST',
  'OWN_HISTORY_CLEAN',
  'PAYER_VERIFIED',
];

describe('complaints.json', () => {
  const fx = load<{ eval: Complaint[]; seed: SeedComplaint[] }>('../eval/fixtures/complaints.json');

  it('has 24 eval texts forming 3 true clusters plus noise', () => {
    expect(fx.eval).toHaveLength(24);
    const clusters = new Set(fx.eval.map((c) => c.expectedCluster).filter((c) => c !== null));
    expect(clusters.size).toBe(3);
    for (const label of clusters)
      expect(fx.eval.filter((c) => c.expectedCluster === label).length).toBeGreaterThanOrEqual(5);
    expect(fx.eval.filter((c) => c.expectedCluster === null).length).toBeGreaterThanOrEqual(4);
    expect(new Set(fx.eval.map((c) => c.id)).size).toBe(24);
  });

  it('has the seed complaints of section 19', () => {
    const seam = fx.seed.filter((c) => c.category === 'product_defect');
    expect(seam.filter((c) => c.batch === 'B17')).toHaveLength(5);
    expect(
      new Set(seam.filter((c) => c.batch === 'B17').map((c) => c.carrier)).size,
    ).toBeGreaterThanOrEqual(4);
    for (const c of seam.filter((x) => x.batch === 'B17'))
      expect(c.daysAfterDelivery).toBeGreaterThanOrEqual(3);
    for (const c of seam.filter((x) => x.batch === 'B17'))
      expect(c.daysAfterDelivery).toBeLessThanOrEqual(12);
    expect(seam.filter((c) => c.batch === 'B15')).toHaveLength(1);
    expect(fx.seed.filter((c) => c.category === 'size_fit')).toHaveLength(3);
    const late = fx.seed.filter((c) => c.category === 'late');
    expect(late).toHaveLength(2);
    expect(new Set(late.map((c) => c.carrier)).size).toBe(2);
    expect(fx.seed.filter((c) => c.category === 'not_as_pictured')).toHaveLength(1);
  });

  it('every seed complaint carries a pre-read extraction marked model seed', () => {
    for (const c of fx.seed) {
      expect(c.model).toBe('seed');
      const e = ComplaintExtractionSchema.parse(c.extracted);
      expect(e.category).toBe(c.category);
    }
    // the six seam complaints share one fault, so they group together as section 19 expects
    const seam = fx.seed.filter((c) => c.category === 'product_defect');
    const faults = seam.map((c) => {
      const e = ComplaintExtractionSchema.parse(c.extracted);
      return `${e.component} | ${e.failureMode}`;
    });
    expect(new Set(faults)).toEqual(new Set(['sleeve seam | stitching came apart']));
  });
});

describe('reviews.json', () => {
  const fx = load<{ reviews: ReviewFx[] }>('../eval/fixtures/reviews.json');
  const neel = fx.reviews.filter((r) => r.merchant === 'neel-block-prints');
  const quick = fx.reviews.filter((r) => r.merchant === 'quicktees-outlet');

  it('has 60 Neel reviews averaging about 4.4 with two negative ones answered', () => {
    expect(neel).toHaveLength(60);
    const avg = neel.reduce((s, r) => s + r.rating, 0) / neel.length;
    expect(avg).toBeGreaterThanOrEqual(4.3);
    expect(avg).toBeLessThanOrEqual(4.5);
    const negative = neel.filter((r) => r.rating <= 2);
    expect(negative).toHaveLength(2);
    for (const r of negative) expect(r.merchantReply).toBeTruthy();
  });

  it('has 25 QuickTees reviews with 4 unanswered never-arrived complaints', () => {
    expect(quick).toHaveLength(25);
    const never = quick.filter((r) => /never arrived/i.test(r.text));
    expect(never).toHaveLength(4);
    for (const r of never) expect(r.merchantReply).toBeNull();
  });

  it('carries exactly one prompt-injection review, and ids are unique', () => {
    expect(
      fx.reviews.filter((r) => /ignore (all|your) (previous )?instructions/i.test(r.text)),
    ).toHaveLength(1);
    expect(new Set(fx.reviews.map((r) => r.id)).size).toBe(fx.reviews.length);
    for (const r of fx.reviews)
      expect(Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5).toBe(true);
  });
});

describe('buyers.json', () => {
  const fx = load<{ profiles: BuyerFx[] }>('../eval/fixtures/buyers.json');

  it('has 30 profiles covering every band and every reason code', () => {
    expect(fx.profiles).toHaveLength(30);
    expect(new Set(fx.profiles.map((p) => p.id)).size).toBe(30);
    expect(new Set(fx.profiles.map((p) => p.expectedBand))).toEqual(
      new Set(['green', 'yellow', 'red', 'grey']),
    );
    const codes = new Set(fx.profiles.flatMap((p) => p.expectedCodes));
    for (const code of REASON_CODES) expect(codes.has(code)).toBe(true);
  });

  it('includes Alex R. as yellow with 25 points (DECISIONS.md I-D2)', () => {
    const alex = fx.profiles.find((p) => p.name === 'Alex R.');
    expect(alex?.expectedBand).toBe('yellow');
    expect(alex?.expectedPoints).toBe(25);
    expect(alex?.expectedCodes).toEqual(
      expect.arrayContaining(['OWN_DISPUTES_LOST', 'OWN_REFUND_RATIO', 'NEW_ADDRESS']),
    );
  });

  it('never labels a buyer with no history red', () => {
    for (const p of fx.profiles) {
      if (p.features.priorOrders === 0 && p.features.network === null)
        expect(p.expectedBand).toBe('grey');
    }
  });
});

describe('disputes.json', () => {
  const fx = load<{ now: string; cases: DisputeFx[] }>('../eval/fixtures/disputes.json');

  it('has 8 cases that between them expect every recommendation', () => {
    expect(fx.cases).toHaveLength(8);
    expect(new Set(fx.cases.map((c) => c.expectedRecommendation))).toEqual(
      new Set([
        'provide_evidence',
        'make_offer',
        'accept_claim',
        'inspect_first',
        'merchant_decides',
      ]),
    );
    expect(Number.isNaN(Date.parse(fx.now))).toBe(false);
  });
});

describe('photos/expected.json', () => {
  const fx = load<{ sets: PhotoSet[]; inspection: { id: string; expectedDefectVisible: boolean } }>(
    '../eval/fixtures/photos/expected.json',
  );

  it('has 20 sets, 5 of them deliberately wrong, plus the open-stitch inspection photo', () => {
    expect(fx.sets).toHaveLength(20);
    const wrong = fx.sets.filter((s) => s.deliberatelyWrong !== null);
    expect(wrong.map((s) => s.deliberatelyWrong).sort()).toEqual([
      'missing_item',
      'visible_defect',
      'wrong_batch_tag',
      'wrong_colour',
      'wrong_size',
    ]);
    expect(fx.sets.filter((s) => s.expectedBatchLabel !== null)).toHaveLength(20);
    expect(fx.inspection.expectedDefectVisible).toBe(true);
  });

  it('every set has its four photos and the inspection close-up, each a JPEG under 12 MB', () => {
    const files = load<{ files: string[] }>('../eval/fixtures/photos/expected.json').files;
    const paths = [
      ...fx.sets.flatMap((s) => files.map((f) => `../eval/fixtures/photos/${s.id}/${f}`)),
      '../eval/fixtures/photos/inspection/seam_closeup.jpg',
    ];
    expect(paths).toHaveLength(81);
    for (const rel of paths) {
      const path = fileURLToPath(new URL(rel, import.meta.url));
      const head = Buffer.alloc(2);
      const fd = openSync(path, 'r');
      readSync(fd, head, 0, 2, 0);
      closeSync(fd);
      expect([head[0], head[1]], rel).toEqual([0xff, 0xd8]);
      expect(statSync(path).size, rel).toBeLessThan(12 * 1024 * 1024);
    }
  });
});

describe('shared cause fixtures', () => {
  type Order = {
    orderId: string;
    batchCode: string;
    packer: string;
    shipWeek: string;
    listingVersion: string;
    deliveredAt: string;
  };
  type Fx = {
    now: string;
    horizonDays: number;
    orders: Order[];
    complaints: Array<{ orderId: string; createdAt: string }>;
    expected: Record<string, unknown>;
  };
  const b17 = load<Fx>('./fixtures/sharedcause-b17.json');
  const nul = load<Fx>('./fixtures/sharedcause-null.json');

  it('B17 fixture reproduces the section 9 worked example counts', () => {
    expect(b17.orders).toHaveLength(240);
    const b17Ids = new Set(b17.orders.filter((o) => o.batchCode === 'B17').map((o) => o.orderId));
    expect(b17Ids.size).toBe(40);
    expect(b17.complaints.filter((c) => b17Ids.has(c.orderId))).toHaveLength(6);
    expect(b17.complaints.filter((c) => !b17Ids.has(c.orderId))).toHaveLength(1);
    expect(b17.expected).toMatchObject({
      primary: { dimension: 'batch_code', value: 'B17' },
      testsRun: 12,
      rateRatio: 30,
    });
    const now = Date.parse(b17.now);
    for (const o of b17.orders)
      expect((now - Date.parse(o.deliveredAt)) / 86_400_000).toBeGreaterThanOrEqual(14);
  });

  it('null fixture has the same volume and expects no hypothesis', () => {
    expect(nul.orders).toHaveLength(240);
    expect(nul.expected).toMatchObject({ hypothesis: null });
  });
});
