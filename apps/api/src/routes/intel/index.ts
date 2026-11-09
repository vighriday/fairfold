import type { FastifyPluginAsync } from 'fastify';
import buyerSignalRoutes from './buyerSignal.js';
import disputeRoutes from './disputes.js';
import storeReportRoutes from './storeReport.js';

// Ishaan's endpoints (section 11). Each feature registers its own plugin here.
const intelligenceRoutes: FastifyPluginAsync = async (app) => {
  await app.register(buyerSignalRoutes);
  await app.register(storeReportRoutes);
  await app.register(disputeRoutes);
};
export default intelligenceRoutes;
