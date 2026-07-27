import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({
  name: 'autotest-flow',
  version: '0.1.0',
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
            version: '0.1.0',
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('AutoTestFlow MCP Server started');
}

main().catch((error) => {
  console.error('Failed to start AutoTestFlow MCP Server:', error);
  process.exit(1);
});
