import type { FastifyPluginAsync } from 'fastify';
import buyerSignalRoutes from './buyerSignal.js';
import complaintRoutes from './complaints.js';
import disputeRoutes from './disputes.js';
import sharedCauseRoutes from './sharedCauses.js';
import storeReportRoutes from './storeReport.js';

// Ishaan's endpoints (section 11). Each feature registers its own plugin here.
const intelligenceRoutes: FastifyPluginAsync = async (app) => {
  await app.register(buyerSignalRoutes);
  await app.register(storeReportRoutes);
  await app.register(disputeRoutes);
  await app.register(sharedCauseRoutes);
  await app.register(complaintRoutes);
};
export default intelligenceRoutes;
