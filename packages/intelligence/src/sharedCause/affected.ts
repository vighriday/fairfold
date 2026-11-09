// Stage 5 affected sets (section 9): who a hypothesis touches, by order status and the hypothesis value.
import type { AffectedOrders, Dimension } from '@fairfold/contracts';
import { valueOf, type PopulationOrder } from './localise.js';

const UNSHIPPED = new Set(['captured', 'packing']);
const IN_TRANSIT = new Set(['sealed', 'shipped']);

export function affectedOrders(
  hypothesis: { dimension: Dimension; value: string },
  /** the cluster's product; null for transit clusters */
  productId: string | null,
  orders: PopulationOrder[],
  ctx: { complainedOrderIds: Set<string>; openDisputeIds: string[]; batchHasStock: boolean },
): AffectedOrders {
  const hasValue = (o: PopulationOrder) => valueOf(o, hypothesis.dimension) === hypothesis.value;
  const unshipped =
    hypothesis.dimension === 'batch_code' && ctx.batchHasStock && productId !== null
      ? orders
          .filter((o) => UNSHIPPED.has(o.status) && o.productId === productId)
          .map((o) => o.orderId)
      : [];
  return {
    unshipped,
    inTransit: orders.filter((o) => IN_TRANSIT.has(o.status) && hasValue(o)).map((o) => o.orderId),
    deliveredNoComplaint: orders
      .filter(
        (o) => o.status === 'delivered' && hasValue(o) && !ctx.complainedOrderIds.has(o.orderId),
      )
      .map((o) => o.orderId),
    openDisputes: ctx.openDisputeIds,
  };
}
