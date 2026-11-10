import { z } from 'zod';
import { AppError } from '@fairfold/contracts';
import { type FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../auth.js';
import { type createMcpService } from './service.js';

const RequestSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    id: z.union([z.string(), z.number()]),
    method: z.string(),
    params: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export function createMcpRoutes(service: ReturnType<typeof createMcpService>): FastifyPluginAsync {
  return async (app) => {
    app.post(
      '/mcp',
      {
        preHandler: requireAuth(['agent', 'buyer', 'merchant']),
        schema: {
          tags: ['MCP'],
          security: [{ bearerAuth: [] }],
          body: RequestSchema,
          response: { 200: z.record(z.string(), z.unknown()) },
        },
      },
      async (request) => {
        const body = RequestSchema.parse(request.body);
        const params = body.params ?? {};
        if (body.method === 'initialize')
          return {
            jsonrpc: '2.0',
            id: body.id,
            result: { protocolVersion: '2025-03-26', capabilities: { tools: {} } },
          };
        if (body.method === 'tools/list')
          return {
            jsonrpc: '2.0',
            id: body.id,
            result: {
              tools: [
                {
                  name: 'search_catalog',
                  inputSchema: {
                    type: 'object',
                    properties: { query: { type: 'string' }, maxPrice: { type: 'string' } },
                    required: ['query'],
                  },
                },
                {
                  name: 'get_store_report',
                  inputSchema: {
                    type: 'object',
                    properties: { merchantId: { type: 'string' } },
                    required: ['merchantId'],
                  },
                },
                {
                  name: 'get_order_proof',
                  inputSchema: {
                    type: 'object',
                    properties: { orderId: { type: 'string' } },
                    required: ['orderId'],
                  },
                },
                {
                  name: 'provide_dispute_evidence',
                  inputSchema: {
                    type: 'object',
                    properties: { packId: { type: 'string' } },
                    required: ['packId'],
                  },
                },
              ],
            },
          };
        if (body.method !== 'tools/call')
          throw new AppError('MCP_METHOD_NOT_FOUND', 'Unsupported MCP method', 400);
        const name = z.string().parse(params.name);
        const args = z.record(z.string(), z.unknown()).parse(params.arguments ?? {});
        let value: unknown;
        if (name === 'search_catalog')
          value = await service.searchCatalog(
            request.auth,
            z.string().parse(args.query),
            args.maxPrice ? z.string().parse(args.maxPrice) : undefined,
          );
        else if (name === 'get_store_report')
          value = await service.getStoreReport(request.auth, z.string().parse(args.merchantId));
        else if (name === 'get_order_proof')
          value = await service.getOrderProof(request.auth, z.string().parse(args.orderId));
        else if (name === 'provide_dispute_evidence')
          value = await service.provideDisputeEvidence(request.auth, z.string().parse(args.packId));
        else throw new AppError('MCP_TOOL_NOT_FOUND', 'Unsupported MCP tool', 400);
        return {
          jsonrpc: '2.0',
          id: body.id,
          result: { content: [{ type: 'text', text: JSON.stringify(value) }] },
        };
      },
    );
  };
}
