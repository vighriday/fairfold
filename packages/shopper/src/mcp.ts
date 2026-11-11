import { createMCPClient } from '@ai-sdk/mcp';
import { McpToolError, type ShopperTool } from './index.js';

/** The runnable shopper uses the AI SDK's official MCP client, including initialization. */
export async function connectMcpShopperTools(endpoint: string, bearerToken: string) {
  const url = new URL(endpoint);
  if (
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) ||
    url.username ||
    url.password ||
    !bearerToken
  )
    throw new McpToolError(
      'A trusted HTTPS or loopback MCP endpoint and bearer token are required',
      0,
      'MCP_CONFIG_INVALID',
    );
  const client = await createMCPClient({
    transport: { type: 'http', url: endpoint, headers: { authorization: 'Bearer ' + bearerToken } },
  });
  try {
    const sdkTools = await client.tools();
    const tools: ShopperTool = async (name, args) => {
      const tool = sdkTools[name];
      if (!tool?.execute)
        throw new McpToolError('Required MCP tool is unavailable', 0, 'MCP_TOOL_NOT_FOUND');
      const result = await tool.execute(args, {
        toolCallId: 'fairfold-shopper-' + name,
        messages: [],
        context: {},
      });
      if (
        !result ||
        typeof result !== 'object' ||
        !('content' in result) ||
        !Array.isArray(result.content)
      )
        throw new McpToolError('Invalid MCP result', 0, 'MCP_RESULT_INVALID');
      const entry = result.content.find(
        (item: unknown): item is { type: 'text'; text: string } =>
          !!item &&
          typeof item === 'object' &&
          'type' in item &&
          item.type === 'text' &&
          'text' in item &&
          typeof item.text === 'string',
      );
      if (!entry || ('isError' in result && result.isError))
        throw new McpToolError('MCP tool could not complete', 0, 'MCP_TOOL_FAILED');
      try {
        return JSON.parse(entry.text) as unknown;
      } catch {
        throw new McpToolError('Invalid MCP JSON result', 0, 'MCP_RESULT_INVALID');
      }
    };
    return { tools, client, close: () => client.close() };
  } catch (error) {
    await client.close();
    throw error;
  }
}
