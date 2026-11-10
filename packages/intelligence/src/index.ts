// Public surface of packages/intelligence (section 15 contract).
export { handlers, createHandlers } from './handlers.js';
export { createIntelRuntime, getIntelRuntime, lazyPublisher, setIntelRuntime } from './runtime.js';
export type { Env, IntelRuntime, Publisher } from './runtime.js';
export { attestPackingPhotos, attestPackingPhotosWith } from './evidence/attest.js';
export type { Attestation, AttestDeps } from './evidence/attest.js';
export type { AttestationRow, EvidenceStore } from './evidence/handlers.js';
export { dbEvidenceStore } from './evidence/store.js';
export {
  buyerOwnSignal,
  computeBuyerSignal,
  computeBuyerSignalWith,
  contestSignal,
  listContests,
  orderSignalForMerchant,
  resolveContest,
} from './buyerSignal/index.js';
export { RECOMMENDATIONS, scoreBuyer } from './buyerSignal/points.js';
export type { BuyerFeatures } from './buyerSignal/points.js';
export {
  buildStoreReport,
  buildStoreReportWith,
  createReview,
  listReviews,
  replyToReview,
  reviewPage,
  storeReportFor,
} from './storeReport/index.js';
export { catalogCursor, searchCatalog, searchCatalogWith } from './catalog.js';
export { upsertComplaint } from './complaints/create.js';
export { reportProblem } from './complaints/report.js';
export { buildEvidencePack, buildEvidencePackWith } from './dispute/build.js';
export type { EvidencePackResult } from './dispute/build.js';
export { decide } from './dispute/decide.js';
export type { Decision, DisputeFacts } from './dispute/decide.js';
export {
  readComplaint,
  readComplaintWith,
  runSharedCauseScan,
  runSharedCauseScanWith,
  sweepSharedCauses,
} from './sharedCause/scan.js';
export { draftBuyerMessages, draftBuyerMessagesWith } from './sharedCause/actions.js';
export { confirmHypothesis, dismissHypothesis, inspectionCounts } from './sharedCause/confirm.js';
export { hypothesisTrend } from './sharedCause/trend.js';
export { hypothesisDetail, listHypotheses } from './sharedCause/views.js';
export {
  packPdfForMerchant,
  rebuildPackForMerchant,
  rebuildPacks,
  syncDispute,
} from './dispute/handlers.js';
