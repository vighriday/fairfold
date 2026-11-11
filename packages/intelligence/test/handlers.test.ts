// The worker registers the intelligence handler map beside the platform's own handlers (apps/worker/src/runtime.ts).
// Each job has one owner: these nine are intelligence's, the other seven of section 8 are the platform's.
import { describe, expect, it } from 'vitest';
import { JobNames } from '@fairfold/contracts';
import { handlers } from '../src/handlers.js';

const INTELLIGENCE_JOBS = [
  'complaint.created',
  'dispute.synced',
  'evidence.rebuild',
  'inspection.uploaded',
  'order.captured',
  'pack.photos_uploaded',
  'sharedcause.scan',
  'sharedcause.sweep',
  'storereport.refresh',
];
const PLATFORM_JOBS = [
  'action.approved',
  'disputes.poll',
  'evidence.submit',
  'paypal.event',
  'retention.sweep',
  'tracking.push',
  'watchdog.sweep',
];

describe('intelligence job handlers', () => {
  it('handle exactly the nine intelligence jobs and none of the platform jobs', () => {
    expect(Object.keys(handlers).sort()).toEqual(INTELLIGENCE_JOBS);
    expect([...INTELLIGENCE_JOBS, ...PLATFORM_JOBS].sort()).toEqual([...JobNames].sort());
  });
});
