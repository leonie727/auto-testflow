import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerPmTools } from './tools/pm-tools.js';
import { readPackageVersion } from './cli/paths.js';

/**
 * 创建并启动 MCP Server（stdio）。
 * 启动时不强制检查 PM_API_KEY。
 */
export async function startMcpServer() {
  let version = '0.1.0';
  try {
    version = readPackageVersion();
  } catch {
    // ignore
  }

  const server = new McpServer({
    name: 'autotest-flow',
    version,
  });

  server.registerTool(
    'auto_test_flow_status',
    {
      description: '获取 AutoTestFlow MCP Server 的运行状态和基础信息。',
    },
    async () => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              name: 'AutoTestFlow',
              version,
              status: 'running',
              runtime: 'Node.js',
              language: 'JavaScript',
            },
            null,
            2
          ),
        },
      ],
    })
  );

  registerPmTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('AutoTestFlow MCP Server started');
}
