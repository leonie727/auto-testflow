import { z } from 'zod';
import { sanitizeErrorMessage } from '../config/env.js';
import { inspectPmIssueAccess, readPmIssue } from '../services/pm-service.js';
import { readPmReference } from '../services/reference-service.js';
import {
  addPmComment,
  buildCommentDraft,
  COMMENT_TEMPLATES,
} from '../services/comment-service.js';
import { saveTestIssueRecord } from '../services/record-service.js';

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
        '读取并结构化返回超星 PM 需求内容（标题、描述、状态、优先级、指派人、附件、关联需求、外部链接 externalReferences 等）。需要配置 PM_API_KEY。描述中的链接会保留；不会自动抓取外链正文。',
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

  server.registerTool(
    'read_pm_reference',
    {
      description:
        '读取 PM 关联的外部资料链接（普通允许域名网页、飞书分享、学习通/超星分享）。公开页优先 fetch；登录页或权限不足时返回 requiresAuth=true，不猜测正文。未知域名或不安全地址不会访问。不返回 Cookie/Token/完整响应头。',
      inputSchema: {
        url: z.string().describe('外部资料 URL（http/https）'),
      },
    },
    async ({ url }) => {
      try {
        const result = await readPmReference(url);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return toolError(error, '未知错误，外部资料读取失败');
      }
    }
  );

  server.registerTool(
    'add_pm_comment',
    {
      description:
        '【写操作】向超星 PM 追加评论（仅 notes，不修改状态/指派人/优先级/完成度）。必须在用户明确确认「确认回填/提交评论」后调用；首次「处理这个PM」不算确认。提交后会回读 journals 校验。需要 PM_API_KEY。',
      inputSchema: {
        issue: z
          .string()
          .describe(
            'PM编号（如 470985）或完整地址（如 http://pm.chaoxing.com/issues/470985）'
          ),
        comment: z.string().describe('要追加的评论文本（notes）'),
        confirmed: z
          .boolean()
          .describe(
            '必须为 true，表示用户已明确确认回填；未确认时工具拒绝执行'
          ),
      },
    },
    async ({ issue, comment, confirmed }) => {
      try {
        const result = await addPmComment(issue, comment, {
          confirmed: confirmed === true,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return toolError(error, '未知错误，添加评论失败');
      }
    }
  );

  server.registerTool(
    'list_pm_comment_templates',
    {
      description:
        '列出可用的 PM 评论回填模板（仅生成草稿，不会写入 PM）。',
      inputSchema: {},
    },
    async () => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              templates: Object.values(COMMENT_TEMPLATES).map((item) => ({
                id: item.id,
                title: item.title,
              })),
            },
            null,
            2
          ),
        },
      ],
    })
  );

  server.registerTool(
    'build_pm_comment_draft',
    {
      description:
        '按模板生成 PM 评论草稿（不会写入 PM）。展示给用户确认后，再调用 add_pm_comment。',
      inputSchema: {
        templateId: z
          .string()
          .describe(
            '模板 ID：analysis_done / script_done / verify_pass / verify_fail / system_issue / data_env_issue / data_issue / need_product'
          ),
        issueId: z.string().optional().describe('PM 编号'),
        title: z.string().optional(),
        summary: z.string().optional(),
        nextStep: z.string().optional(),
        files: z.string().optional(),
        verify: z.string().optional(),
        command: z.string().optional(),
        category: z.string().optional(),
        repro: z.string().optional(),
        action: z.string().optional(),
        questions: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const draft = buildCommentDraft(args.templateId, args);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(draft, null, 2),
            },
          ],
        };
      } catch (error) {
        return toolError(error, '未知错误，生成评论草稿失败');
      }
    }
  );

  server.registerTool(
    'save_test_issue_record',
    {
      description:
        '将脱敏后的自动化异常诊断 Markdown 记录保存到 ~/.autotest-flow/records/YYYY-MM-DD/。禁止保存 PM_API_KEY、Cookie、密码、完整敏感请求头。',
      inputSchema: {
        markdown: z.string().describe('脱敏后的 Markdown 记录正文'),
        category: z
          .string()
          .optional()
          .describe('问题分类：SYSTEM / SCRIPT / DATA / ENVIRONMENT / UNCONFIRMED'),
        issueId: z.string().optional().describe('PM 编号（可选）'),
        title: z.string().optional().describe('简短标题（可选）'),
        filename: z.string().optional().describe('可选文件名（不含路径）'),
      },
    },
    async ({ markdown, category, issueId, title, filename }) => {
      try {
        const result = saveTestIssueRecord({
          markdown,
          category,
          issueId,
          title,
          filename,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return toolError(error, '未知错误，诊断记录保存失败');
      }
    }
  );
}
