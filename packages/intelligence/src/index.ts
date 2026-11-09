// Public surface of packages/intelligence (section 15 contract).
export { handlers, createHandlers } from './handlers.js';
export { createIntelRuntime, getIntelRuntime, lazyPublisher, setIntelRuntime } from './runtime.js';
export type { Env, IntelRuntime, Publisher } from './runtime.js';
export { attestPackingPhotos } from './evidence/attest.js';
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
  storeReportFor,
} from './storeReport/index.js';
export { searchCatalog, searchCatalogWith } from './catalog.js';
export { upsertComplaint } from './complaints/create.js';
