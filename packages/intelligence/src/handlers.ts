import type { JobName } from './contracts.ts';
import { createEvidenceHandlers, type EvidenceDeps } from './evidence/handlers.ts';

export type JobHandler = (payload: unknown) => Promise<void>;

/** Everything the intelligence handlers need from the platform (Hriday's packages), injected by the worker. */
export interface IntelligenceDeps {
  evidence: EvidenceDeps;
}

/** The job handlers Hriday's worker registers (section 15), keyed by the section 8 job names. */
export function createHandlers(deps: IntelligenceDeps): Partial<Record<JobName, JobHandler>> {
  return {
    ...createEvidenceHandlers(deps.evidence),
  };
}
