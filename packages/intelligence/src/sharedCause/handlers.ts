// Shared Cause job handlers (section 8): complaint.created, sharedcause.scan and the nightly sharedcause.sweep.
import type { HandlerMap } from '@fairfold/contracts';
import type { IntelRuntime } from '../runtime.js';
import { readComplaint, runSharedCauseScan, sweepSharedCauses } from './scan.js';

export function sharedCauseHandlers(
  runtime: () => IntelRuntime,
): Pick<HandlerMap, 'complaint.created' | 'sharedcause.scan' | 'sharedcause.sweep'> {
  return {
    'complaint.created': async ({ complaintId }) => {
      await readComplaint(runtime(), complaintId);
    },
    'sharedcause.scan': async ({ merchantId }) => {
      await runSharedCauseScan(runtime(), merchantId);
    },
    'sharedcause.sweep': async () => {
      await sweepSharedCauses(runtime());
    },
  };
}
