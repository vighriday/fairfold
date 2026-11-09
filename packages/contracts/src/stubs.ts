import type { AttestationResult, BuyerSignal, EvidencePackDraft, StoreReport } from './ai.js';
import type { AttestInput, CatalogItem, Hypothesis, Message } from './api.js';

export const INTELLIGENCE_IS_STUB = true;

export async function attestPackingPhotos(_input: AttestInput): Promise<AttestationResult> {
  return {
    items: [],
    batchLabelText: null,
    shippingLabel: { visible: false, trackingNumberText: null },
    defects: [],
    inspection: null,
    couldNotVerify: ['Intelligence implementation is not connected'],
    confidence: 0,
  };
}

export async function computeBuyerSignal(_orderId: string): Promise<BuyerSignal> {
  return {
    band: 'grey',
    points: 0,
    reasons: [
      {
        code: 'INTELLIGENCE_STUB',
        label: 'Intelligence implementation is not connected',
        points: 0,
      },
    ],
    recommendation: 'Ship normally with standard packing evidence',
    sentence: 'A live buyer signal has not been computed.',
    simulatedNetworkUsed: false,
  };
}

export async function buildStoreReport(merchantId: string): Promise<StoreReport> {
  return {
    merchantId,
    band: 'new',
    facts: { domain: 'stub.example', domainRegisteredAt: null, policies: [] },
    fulfilment: {
      ordersSealed90d: 0,
      medianHoursCaptureToSeal: null,
      pctTrackingWithin72h: 0,
      pctWithPackingEvidence: 0,
      disputeRate90d: 0,
      proactiveFixes90d: 0,
      unansweredNotReceived: 0,
    },
    reviews: { count: 0, average: null, themes: [] },
    sources: [],
    computedAt: '2000-01-01T00:00:00.000Z',
  };
}

export async function buildEvidencePack(_disputeId: string): Promise<EvidencePackDraft> {
  return {
    recommendation: 'merchant_decides',
    rationale: ['Intelligence implementation is not connected'],
    evidences: [],
    files: [],
    actionParams: null,
    narrative: 'No live evidence pack has been built.',
    sharedContext: null,
    confidence: 0,
  };
}

export async function readComplaint(_complaintId: string): Promise<void> {}
export async function runSharedCauseScan(_merchantId: string): Promise<Hypothesis[]> {
  return [];
}
export async function draftBuyerMessages(
  _hypothesisId: string,
  _level: 'suspected' | 'confirmed' = 'suspected',
): Promise<Message[]> {
  return [];
}
export async function searchCatalog(_input: {
  query: string;
  maxPrice?: number;
}): Promise<CatalogItem[]> {
  return [];
}
