import { z } from 'zod';
import { sanitizeErrorMessage } from '../config/env.js';
import {
  createTaskContext,
  getTaskContext,
  getTaskContextView,
  patchTaskContext,
  writeContextArtifact,
  TaskContextError,
} from '../context/task-context-service.js';
import { TASK_CONTEXT_VIEWS } from '../context/task-context-schema.js';

/**
 * @param {unknown} error
 * @param {string} fallback
 */
function toolError(error, fallback) {
  const code = error instanceof TaskContextError ? error.code : undefined;
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ok: false,
          code: code || 'ERROR',
          message: sanitizeErrorMessage(error) || fallback,
        }),
      },
    ],
  };
}

/**
 * @param {unknown} data
 */
function ok(data) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ ok: true, ...data }),
      },
    ],
  };
}

const sectionObject = z.record(z.string(), z.unknown()).optional();

/**
 * 供测试与 MCP 复用的精简处理函数。
 * @param {object} args
 * @param {NodeJS.ProcessEnv} [env]
 */
export function handleCreateTaskContext(args, env = process.env) {
  const created = createTaskContext(
    {
      context_id: args.context_id,
      task: args.task,
      source: args.source,
      request: args.request,
      project: args.project,
      routing: args.routing,
      analysis: args.analysis,
      references: args.references,
      implementation: args.implementation,
      verification: args.verification,
      pm_update: args.pm_update,
      controls: args.controls,
      artifacts: args.pm_snapshot
        ? { pm_snapshot: args.pm_snapshot }
        : args.artifacts,
    },
    env
  );
  return {
    context_id: created.context_id,
    revision: created.revision,
    status: created.status,
    source: {
      pm_issue_id: created.source?.pm_issue_id,
      pm_snapshot_ref: created.source?.pm_snapshot_ref,
    },
  };
}

/**
 * @param {{ context_id: string, view: string }} args
 * @param {NodeJS.ProcessEnv} [env]
 */
export function handleGetTaskContextView(args, env = process.env) {
  const view = getTaskContextView(args.context_id, args.view, env);
  // 不附带 artifact 正文
  return view;
}

/**
 * @param {{ context_id: string, expected_revision: number, patch: object }} args
 * @param {NodeJS.ProcessEnv} [env]
 */
export function handlePatchTaskContext(args, env = process.env) {
  const updated = patchTaskContext(
    args.context_id,
    {
      expected_revision: args.expected_revision,
      patch: args.patch,
    },
    env
  );
  return {
    context_id: updated.context_id,
    revision: updated.revision,
    updated_at: updated.updated_at,
    status: updated.status,
    patched_keys: Object.keys(args.patch || {}),
  };
}

/**
 * 写入当前 Context 的 artifacts，不回传正文。
 * @param {{ context_id: string, name: string, content: string|object }} args
 * @param {NodeJS.ProcessEnv} [env]
 */
export function handleWriteTaskContextArtifact(args, env = process.env) {
  // 确保 Context 存在
  getTaskContext(args.context_id, env);
  const artifact_ref = writeContextArtifact(
    args.context_id,
    args.name,
    args.content,
    env
  );
  return {
    context_id: args.context_id,
    artifact_ref,
  };
}

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 */
export function registerContextTools(server) {
  server.registerTool(
    'create_task_context',
    {
      description:
        '创建 Task Context。完整 PM 等原始数据请放 pm_snapshot（写入 artifact），主 Context 只存结构化结论。返回 context_id 与 revision。',
      inputSchema: {
        context_id: z.string().optional().describe('可选；默认自动生成'),
        task: sectionObject,
        source: sectionObject,
        request: sectionObject,
        project: sectionObject,
        routing: sectionObject,
        analysis: sectionObject,
        references: sectionObject,
        implementation: sectionObject,
        verification: sectionObject,
        pm_update: sectionObject,
        controls: sectionObject,
        pm_snapshot: z
          .unknown()
          .optional()
          .describe('完整 PM 原始结果；写入 artifact，主文件仅保留 pm_snapshot_ref'),
      },
    },
    async (args) => {
      try {
        return ok(handleCreateTaskContext(args));
      } catch (error) {
        return toolError(error, '创建 Task Context 失败');
      }
    }
  );

  server.registerTool(
    'get_task_context_view',
    {
      description:
        '按 View 投影读取 Task Context，必须指定 view。不返回完整 context.json，不返回 artifact 正文。',
      inputSchema: {
        context_id: z.string().describe('Task Context ID'),
        view: z
          .enum([
            TASK_CONTEXT_VIEWS.ROUTE_VIEW,
            TASK_CONTEXT_VIEWS.IMPLEMENT_VIEW,
            TASK_CONTEXT_VIEWS.VERIFY_VIEW,
            TASK_CONTEXT_VIEWS.REPORT_VIEW,
          ])
          .describe('ROUTE_VIEW | IMPLEMENT_VIEW | VERIFY_VIEW | REPORT_VIEW'),
      },
    },
    async (args) => {
      try {
        return ok(handleGetTaskContextView(args));
      } catch (error) {
        return toolError(error, '读取 Task Context View 失败');
      }
    }
  );

  server.registerTool(
    'patch_task_context',
    {
      description:
        '局部更新 Task Context。必须传 expected_revision；冲突时返回错误，调用方应重新 get View 后再 patch，禁止整体覆盖。',
      inputSchema: {
        context_id: z.string(),
        expected_revision: z.number().int().positive(),
        patch: z
          .record(z.string(), z.unknown())
          .describe('局部字段，如 { implementation: { status, changed_files, summary } }'),
      },
    },
    async (args) => {
      try {
        return ok(handlePatchTaskContext(args));
      } catch (error) {
        return toolError(error, '更新 Task Context 失败');
      }
    }
  );

  server.registerTool(
    'write_task_context_artifact',
    {
      description:
        '将运行日志、评论草稿等写入指定 Task Context 的 artifacts/，返回 artifact_ref。不回传完整大文本。',
      inputSchema: {
        context_id: z.string(),
        name: z
          .string()
          .describe('文件名，如 run_result.json / pm_comment_draft.md'),
        content: z
          .union([z.string(), z.record(z.string(), z.unknown())])
          .describe('要写入的文本或 JSON 对象；响应中不会回传该正文'),
      },
    },
    async (args) => {
      try {
        return ok(handleWriteTaskContextArtifact(args));
      } catch (error) {
        return toolError(error, '写入 Task Context artifact 失败');
      }
    }
  );
}
