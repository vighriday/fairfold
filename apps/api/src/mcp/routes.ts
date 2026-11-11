import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { AppError } from '@fairfold/contracts';
import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../auth.js';
import { type createMcpService } from './service.js';

export function createMcpRoutes(service: ReturnType<typeof createMcpService>): FastifyPluginAsync {
  return async (app) => {
    app.post(
      '/mcp',
      {
        preHandler: requireAuth(['agent', 'buyer', 'merchant']),
        bodyLimit: 54_000_000,
        schema: { tags: ['MCP'], security: [{ bearerAuth: [] }] },
      },
      async (request, reply) => {
        const server = new McpServer({ name: 'fairfold', version: '0.1.0' });
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        const call = async (work: () => Promise<unknown>) => {
          try {
            return { content: [{ type: 'text' as const, text: JSON.stringify(await work()) }] };
          } catch (error) {
            return {
              isError: true,
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    error: {
                      code: error instanceof AppError ? error.code : 'MCP_TOOL_FAILED',
                      message: error instanceof AppError ? error.message : 'Tool execution failed',
                    },
                  }),
                },
              ],
            };
          }
        };
        server.registerTool(
          'search_catalog',
          {
            description: 'Search the Fairfold catalogue and store bands.',
            inputSchema: {
              query: z.string().trim().min(1).max(200),
              maxPrice: z
                .string()
                .regex(/^\d{1,8}(?:\.\d{1,2})?$/)
                .optional(),
            },
          },
          async (args) =>
            call(() => service.searchCatalog(request.auth, args.query, args.maxPrice)),
        );
        server.registerTool(
          'get_store_report',
          {
            description: 'Read the fact-linked Store Report for a merchant.',
            inputSchema: { merchantId: z.uuid() },
          },
          async (args) => call(() => service.getStoreReport(request.auth, args.merchantId)),
        );
        server.registerTool(
          'get_order_proof',
          {
            description: 'Read proof only for an order owned by this authenticated user.',
            inputSchema: { orderId: z.uuid() },
          },
          async (args) => call(() => service.getOrderProof(request.auth, args.orderId)),
        );
        if (request.auth?.role === 'merchant') {
          const tool = service.evidenceTool(request.auth);
          server.registerTool(
            tool.name,
            { description: tool.description, inputSchema: tool.parameters.shape },
            async (args) => call(() => tool.execute(args)),
          );
        }
        await server.connect(transport);
        reply.hijack();
        reply.raw.on('close', () => {
          void server.close();
        });
        try {
          await transport.handleRequest(request.raw, reply.raw, request.body);
        } catch {
          if (!reply.raw.headersSent) {
            reply.raw.writeHead(500, { 'content-type': 'application/json' });
            reply.raw.end(
              JSON.stringify({
                jsonrpc: '2.0',
                id: null,
                error: { code: -32603, message: 'MCP transport failed' },
              }),
            );
          } else reply.raw.end();
        }
        return reply;
      },
    );
  };
}
