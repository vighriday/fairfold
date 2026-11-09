// TEMPORARY SHIM (DECISIONS.md I-D4).
// Verbatim copy of the shared contract types from the architecture doc, sections 3, 9, 10 and 11.
// When Hriday's H1 lands, replace this whole file with:  export * from '@fairfold/contracts';
// Every Ishaan module imports contract types from here and nowhere else.

// --- section 3 (packages/contracts/src/paypal.ts) ---
export type Money = { currency_code: string; value: string };

// --- section 14 conventions: injected clock ---
export interface Clock { now(): Date }
export const systemClock: Clock = { now: () => new Date() };

// --- section 9 (packages/contracts/src/sharedCause.ts) ---
export type Dimension = 'batch_code' | 'carrier' | 'listing_version' | 'packer' | 'ship_week' | 'ship_to_country';
export interface ValueTest {
  dimension: Dimension; value: string;
  n: number; k: number; exposureDays: number;
  nRest: number; kRest: number; exposureDaysRest: number;
  rateRatio: number; p: number; q: number;
  wilson95: [number, number]; wilson95Rest: [number, number];
}
export interface HypothesisStats {
  horizonDays: number; testsRun: number; primary: ValueTest;
  confounders: {
    medianDaysSinceDelivery: { value: number; rest: number };
    spread: Array<{ dimension: Dimension; distinctValues: number; topShare: number }>;
    coincidesWithListingChange: boolean;
  };
}
export interface AffectedOrders { unshipped: string[]; inTransit: string[]; deliveredNoComplaint: string[]; openDisputes: string[] }

// --- section 10 (packages/contracts/src/ai.ts) ---
export interface AttestationResult {
  items: Array<{ orderItemId: string; seen: { itemType: string; colour: string; sizeLabel: string | null; quantity: number };
                 matches: boolean; confidence: number; notes: string }>;
  batchLabelText: string | null;
  shippingLabel: { visible: boolean; trackingNumberText: string | null };
  defects: Array<{ component: string; description: string; severity: 'cosmetic' | 'functional' | 'safety' }>;
  inspection: null | { instruction: string; defectVisible: boolean; matchesCluster: boolean };
  couldNotVerify: string[];
  confidence: number;
}

export type ComplaintCategory = 'product_defect' | 'wrong_item' | 'size_fit' | 'not_as_pictured' |
  'damaged_in_transit' | 'not_received' | 'late' | 'other';
export interface ComplaintExtraction {
  category: ComplaintCategory;
  component: string | null;
  failureMode: string | null;
  locationOnItem: string | null;
  severity: 'cosmetic' | 'functional' | 'safety';
  summary: string;
  language: string;
}

export type Recommendation = 'provide_evidence' | 'make_offer' | 'accept_claim' | 'inspect_first' | 'merchant_decides';
export interface EvidencePackDraft {
  recommendation: Recommendation;
  rationale: string[];
  evidences: unknown[];
  files: Array<{ sha256: string; filename: string; mime: 'application/pdf' | 'image/jpeg' | 'image/png' }>;
  actionParams: null | { offerType?: string; acceptClaimType?: string; amount?: { currency_code: string; value: string }; note: string };
  narrative: string;
  sharedContext: null | { hypothesisId: string; status: 'open' | 'confirmed'; summary: string };
  confidence: number;
}

export type Band = 'green' | 'yellow' | 'red' | 'grey';
export interface BuyerSignal { band: Band; points: number; reasons: Array<{ code: string; label: string; points: number }>;
  recommendation: string; sentence: string; simulatedNetworkUsed: boolean }

export interface StoreReport {
  merchantId: string; band: 'verified' | 'standard' | 'caution' | 'new';
  facts: { domain: string; domainRegisteredAt: string | null; policies: Array<{ kind: 'returns' | 'shipping' | 'contact'; url: string }> };
  fulfilment: { ordersSealed90d: number; medianHoursCaptureToSeal: number | null; pctTrackingWithin72h: number;
                pctWithPackingEvidence: number; disputeRate90d: number; proactiveFixes90d: number; unansweredNotReceived: number };
  reviews: { count: number; average: number | null;
             themes: Array<{ label: string; count: number; tone: 'positive' | 'negative'; reviewIds: string[] }> };
  sources: Array<{ label: string; url: string }>;
  computedAt: string;
}

// --- section 11 (packages/contracts/src/api.ts) ---
export interface OrderDetail {
  id: string; paypalOrderId: string; paypalCaptureId: string | null; status: string;
  amount: { currency_code: string; value: string };
  items: Array<{ id: string; sku: string; name: string; quantity: number; batchCode: string | null }>;
  buyer: { id: string; displayName: string | null; payerAccountStatus: string | null } | null;
  sellerProtection: { status: string | null; disputeCategories: string[] };
  buyerSignal: BuyerSignal | null;
  shipment: { carrier: string; trackingNumber: string; status: string; lastScanAt: string | null } | null;
  hold: { reason: string; hypothesisId: string } | null;
  ledger: { length: number; verified: boolean };
  disputes: Array<{ id: string; reason: string; status: string; dueAt: string | null }>;
  sharedCauses: Array<{ hypothesisId: string; label: string; status: string }>;
}
export interface HypothesisDetail {
  id: string; status: 'open' | 'confirmed' | 'dismissed' | 'resolved'; strength: 'strong' | 'possible';
  headline: string;
  explanation: string;
  cluster: { id: string; label: string; category: string; complaints: Array<{ id: string; orderId: string; summary: string; createdAt: string; source: string }> };
  stats: HypothesisStats;
  alternatives: ValueTest[];
  affected: AffectedOrders;
  actions: Array<{ id: string; type: string; status: string; payload: unknown }>;
  safetyFlag: boolean;
}
export interface OrderSummary { id: string; merchantId: string; status: string; amount: Money; createdAt: string; items: Array<{ sku: string; name: string; quantity: number }> }
export interface OrderRow extends OrderSummary { buyerDisplayName: string | null; buyerSignal: { band: Band; topReasons: string[] } | null;
  hold: { reason: string; hypothesisId: string } | null; alertCount: number; disputeOpen: boolean }
export interface DisputeRow { id: string; orderId: string | null; reason: string; status: string; lifeCycleStage: string | null;
  dueAt: string | null; latestPack: { id: string; status: string; recommendation: Recommendation } | null }
export interface Alert { id: string; type: string; orderId: string | null; refId: string | null; message: string; createdAt: string; acknowledgedAt: string | null }
export interface HypothesisSummary { id: string; headline: string; status: string; strength: 'strong' | 'possible';
  dimension: Dimension; value: string; complaintCount: number; unshippedCount: number; safetyFlag: boolean; createdAt: string }
export interface Message { id: string; orderId: string | null; buyerId: string | null; disputeId: string | null; actionId: string | null;
  channel: 'in_app' | 'email_outbox' | 'paypal_dispute'; subject: string | null; body: string; status: string; sentAt: string | null }
export interface Review { id: string; merchantId: string; orderId: string; rating: number; text: string; merchantReply: string | null; createdAt: string; weight: number }
export interface SignalContest { id: string; buyerId: string; signalId: string; text: string; status: 'open' | 'upheld' | 'corrected'; merchantNote: string | null; createdAt: string }
export interface Hypothesis { id: string; merchantId: string; clusterId: string; dimension: Dimension; value: string;
  status: 'open' | 'confirmed' | 'dismissed' | 'resolved' | 'superseded'; strength: 'strong' | 'possible'; stats: HypothesisStats; affected: AffectedOrders }
export interface AttestInput { orderId: string | null; hypothesisId: string | null; step: 'pack' | 'inspection' | 'buyer_photo';
  items: Array<{ orderItemId: string; name: string; sku: string; colour: string | null; size: string | null; quantity: number }>;
  batchCodes: Record<string, string>; photos: Array<{ sha256: string; label: string; mime: string }>;
  inspectionRule: { instruction: string; requiredPhotoLabel: string; clusterLabel: string } | null; expectedTrackingNumber: string | null }
export interface CatalogItem { merchantId: string; sku: string; name: string; price: Money; storeBand: StoreReport['band'] }

// --- section 8 job names (packages/contracts/src/jobs.ts) ---
export const JOBS = [
  'order.captured', 'pack.photos_uploaded', 'tracking.push', 'paypal.event', 'dispute.synced', 'disputes.poll',
  'evidence.submit', 'evidence.rebuild', 'complaint.created', 'sharedcause.scan', 'sharedcause.sweep',
  'inspection.uploaded', 'action.approved', 'storereport.refresh', 'watchdog.sweep', 'retention.sweep',
] as const;
export type JobName = (typeof JOBS)[number];
