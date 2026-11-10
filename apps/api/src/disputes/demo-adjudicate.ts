import { eq } from 'drizzle-orm';
import { AppError, type ForMerchant } from '@fairfold/contracts';
import { disputes, merchants, type Database } from '@fairfold/db';
import { type AuthContext } from '../auth.js';

export function createDemoDisputeAdjudication(options: {
  database: Database;
  forMerchant: ForMerchant;
}) {
  return async (
    auth: AuthContext | null,
    disputeId: string,
    outcome: 'BUYER_FAVOR' | 'SELLER_FAVOR',
  ) => {
    if (!auth) throw new AppError('UNAUTHENTICATED', 'A valid bearer token is required', 401);
    if (auth.role !== 'merchant')
      throw new AppError('FORBIDDEN', 'Only a merchant may adjudicate a dispute', 403);
    const [row] = await options.database
      .select({
        dispute: disputes,
        simulated: merchants.is_simulated,
      })
      .from(disputes)
      .innerJoin(merchants, eq(disputes.merchant_id, merchants.id))
      .where(eq(disputes.id, disputeId));
    if (!row || row.dispute.merchant_id !== auth.subjectId)
      throw new AppError('DISPUTE_NOT_FOUND', 'Dispute was not found', 404);
    if (!row.simulated)
      throw new AppError(
        'DEMO_ROUTE_REQUIRES_SIMULATED_MERCHANT',
        'Demo adjudication is available only for simulated merchants',
        409,
      );
    const paypal = await options.forMerchant(auth.subjectId);
    const response = await paypal.disputes.sandboxAdjudicate(disputeId, outcome, {
      requestId: `fairfold-demo-adjudicate-${disputeId}`,
    });
    const safe = response && typeof response === 'object' ? response : {};
    const status: string | null =
      typeof (safe as Record<string, unknown>).status === 'string'
        ? ((safe as Record<string, unknown>).status as string)
        : null;
    return { disputeId, outcome, status };
  };
}
