// Public surface of packages/intelligence (section 15 contract). Functions are added phase by phase.
export * from './contracts.ts';
export { createHandlers } from './handlers.ts';
export type { IntelligenceDeps, JobHandler } from './handlers.ts';
export { attestPackingPhotos } from './evidence/attest.ts';
export type { Attestation, AttestDeps } from './evidence/attest.ts';
export type { EvidenceStore, AttestationRow } from './evidence/handlers.ts';
export * as intelSchemas from './schemas/intel.ts';
