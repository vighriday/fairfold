import type { FastifyPluginAsync } from 'fastify';
import buyerSignalRoutes from './buyerSignal.js';

// Ishaan's endpoints (section 11). Each feature registers its own plugin here.
const intelligenceRoutes: FastifyPluginAsync = async (app) => {
  await app.register(buyerSignalRoutes);
};
export default intelligenceRoutes;
