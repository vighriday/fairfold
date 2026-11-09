// The intelligence job handlers Hriday's worker registers (section 8 jobs, section 15 contract).
import type { HandlerMap } from '@fairfold/contracts';
import { computeBuyerSignalWith } from './buyerSignal/index.js';
import { rebuildPacks, syncDispute } from './dispute/handlers.js';
import { createEvidenceHandlers } from './evidence/handlers.js';
import { buildStoreReportWith } from './storeReport/index.js';
import { dbEvidenceStore } from './evidence/store.js';
import { getIntelRuntime, type IntelRuntime } from './runtime.js';

/** Builds the handler map; `runtime` is resolved per job so the worker can import before the environment loads. */
export function createHandlers(runtime: () => IntelRuntime): HandlerMap {
  const evidence = () => {
    const rt = runtime();
    return createEvidenceHandlers({ store: dbEvidenceStore(rt), model: rt.models.vision });
  };
  return {
    'pack.photos_uploaded': (payload) => evidence()['pack.photos_uploaded'](payload),
    'inspection.uploaded': (payload) => evidence()['inspection.uploaded'](payload),
    'order.captured': async ({ orderId }) => {
      await computeBuyerSignalWith(runtime(), orderId);
    },
    'dispute.synced': async (payload) => {
      await syncDispute(runtime(), payload);
    },
    'evidence.rebuild': (payload) => rebuildPacks(runtime(), payload),
    'storereport.refresh': async ({ merchantId }) => {
      await buildStoreReportWith(runtime(), merchantId);
    },
  };
}

export const handlers: HandlerMap = createHandlers(getIntelRuntime);
