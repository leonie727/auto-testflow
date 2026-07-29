import { z } from 'zod';
import { sanitizeErrorMessage } from '../config/env.js';
import { inspectPmIssueAccess, readPmIssue } from '../services/pm-service.js';

/**
 * @param {unknown} error
 * @param {string} fallback
 */
function toolError(error, fallback) {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: sanitizeErrorMessage(error) || fallback,
      },
    ],
  };
}

/**
 * 注册 PM 相关 MCP 工具。
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 */
export function registerPmTools(server) {
  server.registerTool(
    'inspect_pm_issue_access',
    {
      description:
        '探测超星 PM 需求页面是否可以直接访问，并判断是否需要身份认证。若已配置环境变量 PM_API_KEY，将使用 API Key 进行认证访问。',
      inputSchema: {
        issue: z
          .string()
          .describe(
            'PM编号（如 470985）或完整地址（如 http://pm.chaoxing.com/issues/470985）'
          ),
      },
    },
    async ({ issue }) => {
      try {
        const result = await inspectPmIssueAccess(issue);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return toolError(error, '未知错误，页面探测失败');
      }
    }
  );

  server.registerTool(
    'read_pm_issue',
    {
      description:
        '读取并结构化返回超星 PM 需求内容（标题、描述、状态、优先级、指派人、附件、关联需求等）。需要配置 PM_API_KEY。',
      inputSchema: {
        issue: z
          .string()
          .describe(
            'PM编号（如 470985）或完整地址（如 http://pm.chaoxing.com/issues/470985）'
          ),
      },
    },
    async ({ issue }) => {
      try {
        const result = await readPmIssue(issue);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return toolError(error, '未知错误，读取需求失败');
      }
    }
  );
}
