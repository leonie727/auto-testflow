import { z } from 'zod';
import { sanitizeErrorMessage } from '../config/env.js';
import {
  createTaskContext,
  getTaskContext,
  getTaskContextView,
  patchTaskContext,
  completeTaskStage,
  writeContextArtifact,
  TaskContextError,
} from '../context/task-context-service.js';
import { TASK_CONTEXT_VIEWS, TASK_STAGE } from '../context/task-context-schema.js';

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
 * 阶段级一次性提交实现/验证结果（Lite 路径默认终点）。
 * @param {{
 *   context_id: string,
 *   expected_revision: number,
 *   stage: string,
 *   implementation?: object,
 *   verification?: object,
 *   run_result?: string|object,
 * }} args
 * @param {NodeJS.ProcessEnv} [env]
 */
export function handleCompleteTaskStage(args, env = process.env) {
  return completeTaskStage(
    args.context_id,
    {
      expected_revision: args.expected_revision,
      stage: args.stage,
      implementation: args.implementation,
      verification: args.verification,
      run_result: args.run_result,
    },
    env
  );
}

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 */
export function registerContextTools(server) {
  server.registerTool(
    'create_task_context',
    {
      description:
        '创建 Task Context。pm_snapshot 存完整原文到 artifact；主文件只写结构化结论。返回 context_id/revision。',
      inputSchema: {
        context_id: z.string().optional(),
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
        pm_snapshot: z.unknown().optional(),
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
        '按 view 投影读取 Context（无完整正文/artifact）。普通实施用 IMPLEMENT_LITE_VIEW。',
      inputSchema: {
        context_id: z.string(),
        view: z.enum([
          TASK_CONTEXT_VIEWS.ROUTE_VIEW,
          TASK_CONTEXT_VIEWS.IMPLEMENT_VIEW,
          TASK_CONTEXT_VIEWS.IMPLEMENT_LITE_VIEW,
          TASK_CONTEXT_VIEWS.VERIFY_VIEW,
          TASK_CONTEXT_VIEWS.REPORT_VIEW,
        ]),
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
    'complete_task_stage',
    {
      description:
        '一次提交 implementation/verification（可附 run_result→artifact）。同步禁止 status=running；verified 需运行证据。',
      inputSchema: {
        context_id: z.string(),
        expected_revision: z.number().int().positive(),
        stage: z.enum([
          TASK_STAGE.IMPLEMENT,
          TASK_STAGE.VERIFY,
          TASK_STAGE.IMPLEMENT_AND_VERIFY,
        ]),
        implementation: sectionObject,
        verification: sectionObject,
        run_result: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
      },
    },
    async (args) => {
      try {
        return ok(handleCompleteTaskStage(args));
      } catch (error) {
        return toolError(error, '提交 Task Context 阶段结果失败');
      }
    }
  );

  server.registerTool(
    'patch_task_context',
    {
      description:
        '局部 patch（须 expected_revision）。Lite 同步任务优先 complete_task_stage，勿拆成多次 patch。',
      inputSchema: {
        context_id: z.string(),
        expected_revision: z.number().int().positive(),
        patch: z.record(z.string(), z.unknown()),
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
      description: '写入 artifacts/，只返回 artifact_ref（不回传正文）。Lite 运行结果优先走 complete_task_stage.run_result。',
      inputSchema: {
        context_id: z.string(),
        name: z.string(),
        content: z.union([z.string(), z.record(z.string(), z.unknown())]),
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
