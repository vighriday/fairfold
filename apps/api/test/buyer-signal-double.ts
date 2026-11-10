// A fixed Buyer Signal for API tests that check order reads, not the intelligence package: createOrderReads takes
// computeBuyerSignal as a dependency, and these tests pass this double so they need no runtime or model.
import type { BuyerSignal } from '@fairfold/contracts';

export async function computeBuyerSignal(_orderId: string): Promise<BuyerSignal> {
  return {
    band: 'grey',
    points: 0,
    reasons: [
      {
        code: 'INTELLIGENCE_STUB',
        label: 'Test double: no buyer signal is computed in this test',
        points: 0,
      },
    ],
    recommendation: 'Ship normally with standard packing evidence',
    sentence: 'A live buyer signal has not been computed.',
    simulatedNetworkUsed: false,
  };
}
