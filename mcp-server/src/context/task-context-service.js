import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getContextsRoot } from '../cli/paths.js';
import {
  SCHEMA_VERSION,
  CONTEXT_STATUS,
  PATCHABLE_SECTIONS,
  VIEW_FIELD_MAP,
  TASK_CONTEXT_VIEWS,
  parseTaskContext,
  parseTaskContextPatch,
  isTaskContextView,
} from './task-context-schema.js';
import {
  canMarkVerified,
  resolveVerificationStatus,
} from './task-context-report.js';
import {
  buildStageDiagnosticRecord,
  saveTestIssueRecord,
} from '../services/record-service.js';

const CONTEXT_FILENAME = 'context.json';
const ARTIFACTS_DIR = 'artifacts';

export class TaskContextError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'TaskContextError';
    this.code = code;
  }
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function getContextDir(contextId, env = process.env) {
  const id = sanitizeContextId(contextId);
  return path.join(getContextsRoot(env), id);
}

/**
 * @param {string} contextId
 */
function sanitizeContextId(contextId) {
  const id = String(contextId || '').trim();
  if (!id || /[\\/]/.test(id) || id.includes('..')) {
    throw new TaskContextError('INVALID_CONTEXT_ID', `非法 context_id：${contextId}`);
  }
  return id;
}

/**
 * @param {string} contextId
 * @param {NodeJS.ProcessEnv} [env]
 */
function contextFilePath(contextId, env = process.env) {
  return path.join(getContextDir(contextId, env), CONTEXT_FILENAME);
}

/**
 * @param {unknown} a
 * @param {unknown} b
 */
function deepMergeSection(a, b) {
  if (b === undefined) {
    return a;
  }
  if (Array.isArray(b)) {
    return b;
  }
  if (b && typeof b === 'object' && !Array.isArray(b)) {
    const base =
      a && typeof a === 'object' && !Array.isArray(a) ? { ...a } : {};
    for (const [key, value] of Object.entries(b)) {
      if (value === undefined) {
        continue;
      }
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        base[key] &&
        typeof base[key] === 'object' &&
        !Array.isArray(base[key])
      ) {
        base[key] = deepMergeSection(base[key], value);
      } else {
        base[key] = value;
      }
    }
    return base;
  }
  return b;
}

/**
 * @param {Record<string, unknown>} current
 * @param {Record<string, unknown>} patch
 */
function applySectionPatch(current, patch) {
  const next = { ...current };
  for (const key of PATCHABLE_SECTIONS) {
    if (patch[key] !== undefined) {
      next[key] = deepMergeSection(current[key] || {}, patch[key]);
    }
  }
  return next;
}

/**
 * @param {string} contextId
 * @param {NodeJS.ProcessEnv} [env]
 */
function readContextFile(contextId, env = process.env) {
  const filePath = contextFilePath(contextId, env);
  if (!fs.existsSync(filePath)) {
    throw new TaskContextError('NOT_FOUND', `Task Context 不存在：${contextId}`);
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    throw new TaskContextError('CORRUPT', `Task Context 文件损坏：${contextId}`);
  }
  const parsed = parseTaskContext(raw);
  if (!parsed.success) {
    throw new TaskContextError(
      'INVALID_STATE',
      `Task Context 结构非法：${parsed.error.issues.map((i) => i.message).join('; ')}`
    );
  }
  return { context: parsed.data, filePath };
}

/**
 * @param {string} contextId
 * @param {Record<string, unknown>} context
 * @param {NodeJS.ProcessEnv} [env]
 */
function writeContextFile(contextId, context, env = process.env) {
  const dir = getContextDir(contextId, env);
  fs.mkdirSync(dir, { recursive: true });
  const parsed = parseTaskContext(context);
  if (!parsed.success) {
    throw new TaskContextError(
      'INVALID_STATE',
      `拒绝写入非法 Context：${parsed.error.issues.map((i) => i.message).join('; ')}`
    );
  }
  const filePath = contextFilePath(contextId, env);
  fs.writeFileSync(filePath, `${JSON.stringify(parsed.data, null, 2)}\n`, 'utf8');
  return parsed.data;
}

/**
 * 将原始内容写入 artifacts，返回相对 context 目录的引用路径。
 * @param {string} contextId
 * @param {string} name
 * @param {string|object} content
 * @param {NodeJS.ProcessEnv} [env]
 */
export function writeContextArtifact(contextId, name, content, env = process.env) {
  const id = sanitizeContextId(contextId);
  const safeName = String(name || '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^\.+/, '');
  if (!safeName) {
    throw new TaskContextError('INVALID_ARTIFACT', 'artifact 名称非法');
  }
  const dir = path.join(getContextDir(id, env), ARTIFACTS_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const filename = safeName.includes('.') ? safeName : `${safeName}.json`;
  const abs = path.join(dir, filename);
  const body =
    typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`;
  fs.writeFileSync(abs, body, 'utf8');
  return path.join(ARTIFACTS_DIR, filename).replace(/\\/g, '/');
}

/**
 * @param {{
 *   task?: object,
 *   source?: object,
 *   request?: object,
 *   project?: object,
 *   routing?: object,
 *   analysis?: object,
 *   references?: object,
 *   implementation?: object,
 *   verification?: object,
 *   pm_update?: object,
 *   controls?: object,
 *   artifacts?: Record<string, string|object>,
 *   context_id?: string,
 * }} [input]
 * @param {NodeJS.ProcessEnv} [env]
 */
export function createTaskContext(input = {}, env = process.env) {
  const now = new Date().toISOString();
  const contextId = sanitizeContextId(input.context_id || randomUUID());
  const dir = getContextDir(contextId, env);
  if (fs.existsSync(contextFilePath(contextId, env))) {
    throw new TaskContextError('ALREADY_EXISTS', `Task Context 已存在：${contextId}`);
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, ARTIFACTS_DIR), { recursive: true });

  /** @type {Record<string, unknown>} */
  const context = {
    schema_version: SCHEMA_VERSION,
    context_id: contextId,
    revision: 1,
    created_at: now,
    updated_at: now,
    status: CONTEXT_STATUS.OPEN,
    task: input.task || {},
    source: input.source || {},
    request: input.request || {},
    project: input.project || {},
    routing: input.routing || {},
    analysis: input.analysis || {},
    references: input.references || {},
    implementation: input.implementation || {},
    verification: input.verification || { verification_status: 'not_started' },
    pm_update: input.pm_update || {},
    controls: input.controls || {},
  };

  if (input.artifacts && typeof input.artifacts === 'object') {
    for (const [name, content] of Object.entries(input.artifacts)) {
      const ref = writeContextArtifact(contextId, name, content, env);
      if (name === 'pm_snapshot' || name === 'pm.json' || name === 'pm_snapshot.json') {
        context.source = {
          ...(context.source || {}),
          pm_snapshot_ref: ref,
        };
      }
    }
  }

  const saved = writeContextFile(contextId, context, env);
  return saved;
}

/**
 * @param {string} contextId
 * @param {NodeJS.ProcessEnv} [env]
 */
export function getTaskContext(contextId, env = process.env) {
  return readContextFile(contextId, env).context;
}

/**
 * @param {unknown} value
 */
function hasLiteValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  if (
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  ) {
    return false;
  }
  return true;
}

/**
 * 扁平最小 IMPLEMENT_LITE_VIEW：省略空字段与 Full 专属分区。
 * @param {Record<string, any>} context
 */
export function projectImplementLiteView(context) {
  const impl = context.implementation || {};
  const project = context.project || {};
  const request = context.request || {};
  const verification = context.verification || {};
  const task = context.task || {};

  /** @type {Record<string, unknown>} */
  const projected = {
    view: TASK_CONTEXT_VIEWS.IMPLEMENT_LITE_VIEW,
    context_id: context.context_id,
    revision: context.revision,
  };

  const candidates = {
    issue_id: task.issue_id,
    project_root: project.root,
    framework: project.framework,
    target_files: impl.target_files,
    target_symbols: impl.target_symbols,
    line_hints: impl.line_hints,
    allowed_files: impl.allowed_files,
    change_strategy: impl.change_strategy || impl.plan_summary,
    run_intent: request.run_intent,
    implementation_status: impl.status,
    verification_status: verification.status,
  };

  for (const [key, value] of Object.entries(candidates)) {
    if (hasLiteValue(value)) {
      projected[key] = value;
    }
  }

  return projected;
}

export function getTaskContextView(contextId, view, env = process.env) {
  if (!isTaskContextView(view)) {
    throw new TaskContextError(
      'INVALID_VIEW',
      `未知 View：${view}；支持：${Object.keys(VIEW_FIELD_MAP).join(', ')}`
    );
  }
  const context = getTaskContext(contextId, env);

  if (view === TASK_CONTEXT_VIEWS.IMPLEMENT_LITE_VIEW) {
    return projectImplementLiteView(context);
  }

  /** @type {Record<string, unknown>} */
  const projected = { view };
  for (const field of VIEW_FIELD_MAP[view]) {
    projected[field] = context[field];
  }
  return projected;
}

/**
 * 阶段级一次性提交实现/验证结果。同步路径不写入 verification.status=running。
 * 不返回完整 Context、日志或 artifact 正文。
 *
 * @param {string} contextId
 * @param {{
 *   expected_revision: number,
 *   stage: 'implement'|'verify'|'implement_and_verify',
 *   implementation?: Record<string, unknown>,
 *   verification?: Record<string, unknown>,
 *   run_result?: string|object,
 * }} input
 * @param {NodeJS.ProcessEnv} [env]
 */
export function completeTaskStage(contextId, input, env = process.env) {
  const expected = Number(input?.expected_revision);
  if (!Number.isInteger(expected) || expected < 1) {
    throw new TaskContextError('INVALID_PATCH', 'complete_task_stage 需要有效的 expected_revision');
  }

  const stage = String(input?.stage || '').trim();
  const allowedStages = ['implement', 'verify', 'implement_and_verify'];
  if (!allowedStages.includes(stage)) {
    throw new TaskContextError(
      'INVALID_STAGE',
      `stage 必须是 ${allowedStages.join(' | ')}`
    );
  }

  const wantImplement = stage === 'implement' || stage === 'implement_and_verify';
  const wantVerify = stage === 'verify' || stage === 'implement_and_verify';

  if (wantImplement && (!input.implementation || typeof input.implementation !== 'object')) {
    throw new TaskContextError('INVALID_PATCH', 'implement 阶段需要 implementation 对象');
  }
  if (wantVerify && (!input.verification || typeof input.verification !== 'object')) {
    throw new TaskContextError('INVALID_PATCH', 'verify 阶段需要 verification 对象');
  }

  const verificationInput = wantVerify
    ? { ...(input.verification || {}) }
    : undefined;

  if (verificationInput?.status === 'running') {
    throw new TaskContextError(
      'INVALID_STATE',
      '同步 complete_task_stage 禁止写入 verification.status=running；请直接提交最终状态'
    );
  }

  let resultRef;
  if (input.run_result !== undefined && input.run_result !== null) {
    resultRef = writeContextArtifact(contextId, 'run_result.json', input.run_result, env);
  }

  /** @type {Record<string, unknown>} */
  const patch = {};

  if (wantImplement) {
    patch.implementation = { ...input.implementation };
    if (!patch.implementation.status) {
      patch.implementation.status = 'code_completed';
    }
  }

  if (wantVerify) {
    const nextVerification = { ...verificationInput };
    if (resultRef) {
      nextVerification.result_ref = resultRef;
    }

    // 若调用方未给 status，按 run_result / 计数推导；未运行则为 not_run
    if (!nextVerification.status) {
      const ran = Boolean(resultRef) || typeof nextVerification.passed === 'number';
      nextVerification.status = resolveVerificationStatus({
        ran,
        passed: nextVerification.passed,
        failed: nextVerification.failed,
        blocked: nextVerification.blocked === true,
      });
    }

    if (nextVerification.status === 'verified') {
      const gate = {
        status: 'verified',
        passed: nextVerification.passed,
        failed: nextVerification.failed,
        result_ref: nextVerification.result_ref,
        ran: Boolean(nextVerification.result_ref) || Number(nextVerification.passed) > 0,
      };
      if (!canMarkVerified(gate)) {
        throw new TaskContextError(
          'INVALID_STATE',
          'code_completed ≠ verified：标记 verified 需要真实运行证据（result_ref 或 passed>0 且 failed=0）'
        );
      }
    }

    // 仅完成代码、明确未跑时，保持 implementation.code_completed + verification.not_run
    if (
      wantImplement &&
      patch.implementation?.status === 'code_completed' &&
      nextVerification.status === 'verified' &&
      !nextVerification.result_ref &&
      !(Number(nextVerification.passed) > 0)
    ) {
      throw new TaskContextError(
        'INVALID_STATE',
        '禁止将 code_completed 直接提升为 verified'
      );
    }

    patch.verification = nextVerification;
  } else if (wantImplement && patch.implementation?.status === 'code_completed') {
    // 只提交实现时，默认补 not_run，避免误读为已验证
    patch.verification = { status: 'not_run' };
  }

  const updated = patchTaskContext(
    contextId,
    {
      expected_revision: expected,
      patch,
    },
    env
  );

  /** @type {Record<string, unknown>} */
  const result = {
    context_id: updated.context_id,
    revision: updated.revision,
    stage,
  };
  if (updated.implementation?.status) {
    result.implementation_status = updated.implementation.status;
  }
  if (updated.verification?.status) {
    result.verification_status = updated.verification.status;
  }
  const ref = updated.verification?.result_ref || resultRef;
  if (ref) {
    result.result_ref = ref;
  }

  // Lite/Full 均在服务端落诊断记录，不增加 Agent 的 records MCP 调用
  try {
    const draft = buildStageDiagnosticRecord(updated, { stage });
    const saved = saveTestIssueRecord(
      {
        markdown: draft.markdown,
        category: draft.category,
        issueId: draft.issueId,
        title: draft.title,
        contextId: draft.contextId,
        project: draft.project,
      },
      env
    );
    result.record_ref = saved.relativePath;
  } catch {
    // 记录失败不阻断阶段提交
  }

  return result;
}

/**
 * 局部更新。必须提供 expected_revision；禁止无校验整体覆盖。
 * @param {string} contextId
 * @param {{ expected_revision: number, patch: Record<string, unknown> }} input
 * @param {NodeJS.ProcessEnv} [env]
 */
export function patchTaskContext(contextId, input, env = process.env) {
  if (input && typeof input === 'object' && input.context_id && input.schema_version) {
    throw new TaskContextError(
      'FULL_REPLACE_FORBIDDEN',
      '禁止无校验地整体覆盖 Context；请使用 expected_revision + 局部 patch'
    );
  }

  const parsedPatch = parseTaskContextPatch(input);
  if (!parsedPatch.success) {
    throw new TaskContextError(
      'INVALID_PATCH',
      `patch 非法：${parsedPatch.error.issues.map((i) => i.message).join('; ')}`
    );
  }

  const { context, filePath } = readContextFile(contextId, env);
  if (context.status === CONTEXT_STATUS.CLOSED) {
    throw new TaskContextError('INVALID_STATE', `Context 已关闭，禁止 patch：${contextId}`);
  }
  if (context.revision !== parsedPatch.data.expected_revision) {
    throw new TaskContextError(
      'REVISION_CONFLICT',
      `revision 冲突：期望 ${parsedPatch.data.expected_revision}，当前 ${context.revision}`
    );
  }

  const merged = applySectionPatch(context, parsedPatch.data.patch);
  const next = {
    ...merged,
    schema_version: SCHEMA_VERSION,
    context_id: context.context_id,
    created_at: context.created_at,
    status: context.status,
    revision: context.revision + 1,
    updated_at: new Date().toISOString(),
  };

  const saved = writeContextFile(contextId, next, env);
  // 确保原子性：同路径覆盖写入
  void filePath;
  return saved;
}

/**
 * @param {string} contextId
 * @param {{ expected_revision: number, reason?: string }} input
 * @param {NodeJS.ProcessEnv} [env]
 */
export function closeTaskContext(contextId, input, env = process.env) {
  const expected = Number(input?.expected_revision);
  if (!Number.isInteger(expected) || expected < 1) {
    throw new TaskContextError('INVALID_PATCH', 'close 需要有效的 expected_revision');
  }

  const { context } = readContextFile(contextId, env);
  if (context.status === CONTEXT_STATUS.CLOSED) {
    throw new TaskContextError('INVALID_STATE', `Context 已关闭：${contextId}`);
  }
  if (context.revision !== expected) {
    throw new TaskContextError(
      'REVISION_CONFLICT',
      `revision 冲突：期望 ${expected}，当前 ${context.revision}`
    );
  }

  const next = {
    ...context,
    status: CONTEXT_STATUS.CLOSED,
    revision: context.revision + 1,
    updated_at: new Date().toISOString(),
    controls: {
      ...(context.controls || {}),
      closed_reason: input?.reason || 'closed',
    },
  };
  return writeContextFile(contextId, next, env);
}
