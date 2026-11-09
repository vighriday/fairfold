import type { JobName } from './contracts.ts';

export type JobHandler = (payload: unknown) => Promise<void>;

/** Job handlers Hriday's worker registers (section 15). Filled in by later phases. */
export const handlers: Partial<Record<JobName, JobHandler>> = {};
