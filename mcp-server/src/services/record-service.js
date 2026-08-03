import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getAutotestFlowHome } from '../cli/paths.js';

const SENSITIVE_PATTERNS = [
  /PM_API_KEY\s*[:=]\s*\S+/gi,
  /(?:api[_-]?key|token|password|passwd|secret)\s*[:=]\s*\S+/gi,
  /(?:cookie|set-cookie)\s*[:=]\s*[^\n\r]+/gi,
  /authorization\s*:\s*[^\n\r]+/gi,
  /x-redmine-api-key\s*:\s*[^\n\r]+/gi,
];

const INDEX_FILENAME = 'index.json';
const CONTEXT_RECORD_META = 'record-meta.json';

/**
 * 脱敏 Markdown / 文本，移除密钥、Cookie、密码、敏感请求头。
 * @param {string} text
 */
export function sanitizeRecordMarkdown(text) {
  let out = String(text || '');
  for (const pattern of SENSITIVE_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  return out;
}

/**
 * @param {Date} [now]
 */
export function formatRecordDate(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * @param {unknown} value
 * @param {number} [max]
 */
function clip(value, max = 200) {
  if (value === undefined || value === null) return '';
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * @param {unknown} value
 * @param {number} [maxItems]
 * @param {number} [itemMax]
 */
function clipList(value, maxItems = 8, itemMax = 120) {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const items = value.slice(0, maxItems).map((item) => {
    if (typeof item === 'string') return clip(item, itemMax);
    try {
      return clip(JSON.stringify(item), itemMax);
    } catch {
      return clip(String(item), itemMax);
    }
  }).filter(Boolean);
  return items.length ? items : undefined;
}

/**
 * @param {Record<string, unknown>} obj
 */
function omitEmpty(obj) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, value] of Object.entries(obj || {})) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function recordsRoot(env = process.env) {
  return path.join(getAutotestFlowHome(env), 'records');
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function indexPath(env = process.env) {
  return path.join(recordsRoot(env), INDEX_FILENAME);
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function readIndex(env = process.env) {
  const file = indexPath(env);
  if (!fs.existsSync(file)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

/**
 * @param {Record<string, unknown>} index
 * @param {NodeJS.ProcessEnv} [env]
 */
function writeIndex(index, env = process.env) {
  const root = recordsRoot(env);
  fs.mkdirSync(root, { recursive: true });
  const tmp = `${indexPath(env)}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, indexPath(env));
}

/**
 * @param {{ issueId?: string, contextId?: string, record_key?: string }} [input]
 */
export function generateRecordKey(input = {}) {
  if (input.record_key && String(input.record_key).trim()) {
    return String(input.record_key).replace(/[^\w.-]+/g, '_').slice(0, 80);
  }
  const issue = String(input.issueId || 'na').replace(/[^\w.-]+/g, '_').slice(0, 32);
  const seed = String(input.contextId || randomUUID()).replace(/-/g, '').slice(0, 12);
  return `rk_${issue}_${seed}`;
}

/**
 * @param {string} contextDir
 */
export function readContextRecordMeta(contextDir) {
  const file = path.join(contextDir, CONTEXT_RECORD_META);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return raw && typeof raw === 'object' ? raw : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} contextDir
 * @param {{ record_key: string, record_ref: string, record_action?: string }} meta
 */
export function writeContextRecordMeta(contextDir, meta) {
  fs.mkdirSync(contextDir, { recursive: true });
  const file = path.join(contextDir, CONTEXT_RECORD_META);
  const tmp = `${file}.${process.pid}.tmp`;
  const body = {
    record_key: meta.record_key,
    record_ref: meta.record_ref,
    updated_at: new Date().toISOString(),
  };
  fs.writeFileSync(tmp, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

/**
 * @param {Record<string, unknown>} routing
 * @param {Record<string, unknown>} analysis
 * @param {Record<string, unknown>} [extra]
 */
export function inferRecordCategory(routing = {}, analysis = {}, extra = {}) {
  const blob = [
    extra.category,
    routing?.task_type,
    ...(Array.isArray(routing?.reasons) ? routing.reasons : []),
    analysis?.category,
    analysis?.issue_category,
  ]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();
  if (/\bSYSTEM(?:_|\b)/.test(blob)) return 'SYSTEM';
  if (/\bDATA(?:_|\b)/.test(blob)) return 'DATA';
  if (/\bENVIRONMENT(?:_|\b)/.test(blob)) return 'ENVIRONMENT';
  if (/\bSCRIPT(?:_|\b)/.test(blob)) return 'SCRIPT';
  if (/\bUNCONFIRMED(?:_|\b)/.test(blob)) return 'UNCONFIRMED';
  if (/\bANALY/.test(blob)) return 'ANALYZED';
  return 'TASK';
}

/**
 * 从 Context + 可选短摘要构造结构化记录（不含完整正文）。
 * @param {Record<string, unknown>} [context]
 * @param {Record<string, unknown>} [short]
 * @param {{ stage?: string }} [meta]
 */
export function buildRecordSummary(context = {}, short = {}, meta = {}) {
  const task = /** @type {Record<string, unknown>} */ (context.task || {});
  const source = /** @type {Record<string, unknown>} */ (context.source || {});
  const request = /** @type {Record<string, unknown>} */ (context.request || {});
  const project = /** @type {Record<string, unknown>} */ (context.project || {});
  const routing = /** @type {Record<string, unknown>} */ (context.routing || {});
  const analysis = /** @type {Record<string, unknown>} */ (context.analysis || {});
  const implementation = /** @type {Record<string, unknown>} */ (context.implementation || {});
  const verification = /** @type {Record<string, unknown>} */ (context.verification || {});

  const issueId = clip(short.issueId || task.issue_id || source.pm_issue_id, 40);
  const category = inferRecordCategory(routing, analysis, short);

  return omitEmpty({
    record_key: short.record_key ? clip(short.record_key, 80) : undefined,
    context_id: clip(context.context_id, 80) || undefined,
    stage: clip(meta.stage || short.stage, 40) || undefined,
    issueId: issueId || undefined,
    title: clip(short.title || task.title, 160) || undefined,
    category,
    user_intent: clip(short.user_intent || request.user_intent, 160) || undefined,
    entry: clip(source.entry, 40) || undefined,
    task_type: clip(routing.task_type, 80) || undefined,
    route_skill: clip(routing.route_skill, 80) || undefined,
    analysis_summary: clip(short.analysis_summary || short.conclusion || analysis.summary, 240) || undefined,
    conclusion: clip(short.conclusion, 240) || undefined,
    open_questions: clipList(short.open_questions || analysis.open_questions, 5),
    risks: clipList(short.risks || implementation.risks, 5),
    project: clip(short.project || project.name || project.root, 80) || undefined,
    project_root: clip(project.root, 200) || undefined,
    framework: clip(project.framework, 40) || undefined,
    implementation_status: clip(implementation.status, 40) || undefined,
    changed_files: clipList(short.changed_files || implementation.changed_files || implementation.target_files, 12),
    change_summary: clip(
      short.change_summary || implementation.summary || implementation.plan_summary,
      240
    ) || undefined,
    code_diff_ref: clip(implementation.code_diff_ref, 120) || undefined,
    verification_status: clip(verification.status, 40) || undefined,
    verification_summary: clip(
      short.verification_summary || verification.summary || verification.result_summary,
      240
    ) || undefined,
    command: clip(verification.command, 200) || undefined,
    passed: typeof verification.passed === 'number' ? verification.passed : undefined,
    failed: typeof verification.failed === 'number' ? verification.failed : undefined,
    blocked_reason: clip(short.blocked_reason, 240) || undefined,
    result_ref: clip(short.result_ref || verification.result_ref, 120) || undefined,
  });
}

/**
 * @param {Record<string, unknown>} base
 * @param {Record<string, unknown>} patch
 */
export function mergeRecordSummary(base = {}, patch = {}) {
  /** @type {Record<string, unknown>} */
  const out = { ...omitEmpty(base) };
  for (const [key, value] of Object.entries(omitEmpty(patch))) {
    if (Array.isArray(value)) {
      out[key] = value;
      continue;
    }
    out[key] = value;
  }
  return omitEmpty(out);
}

/**
 * @param {Record<string, unknown>} summary
 */
export function renderRecordMarkdown(summary) {
  const s = omitEmpty(summary);
  const lines = ['# AutoTestFlow 诊断记录', ''];

  const pushSection = (title, entries) => {
    const rows = entries.filter(([, v]) => v !== undefined && v !== '');
    if (!rows.length) return;
    lines.push(`## ${title}`);
    for (const [label, value] of rows) {
      if (Array.isArray(value)) {
        lines.push(`- ${label}: ${value.join(', ')}`);
      } else {
        lines.push(`- ${label}: ${value}`);
      }
    }
    lines.push('');
  };

  pushSection('任务', [
    ['record_key', s.record_key],
    ['context_id', s.context_id],
    ['stage', s.stage],
    ['issue_id', s.issueId],
    ['title', s.title],
    ['category', s.category],
    ['user_intent', s.user_intent],
    ['entry', s.entry],
  ]);
  pushSection('分析', [
    ['task_type', s.task_type],
    ['route_skill', s.route_skill],
    ['analysis_summary', s.analysis_summary],
    ['conclusion', s.conclusion],
    ['open_questions', s.open_questions],
    ['risks', s.risks],
    ['blocked_reason', s.blocked_reason],
  ]);
  pushSection('项目', [
    ['project', s.project],
    ['project_root', s.project_root],
    ['framework', s.framework],
  ]);
  pushSection('修改', [
    ['implementation_status', s.implementation_status],
    ['changed_files', s.changed_files],
    ['change_summary', s.change_summary],
    ['code_diff_ref', s.code_diff_ref],
  ]);
  pushSection('验证', [
    ['verification_status', s.verification_status],
    ['verification_summary', s.verification_summary],
    ['command', s.command],
    ['passed', s.passed],
    ['failed', s.failed],
    ['result_ref', s.result_ref],
  ]);
  lines.push('## 说明');
  lines.push('- 服务端渲染的结构化摘要；不含 PM 原文、完整脚本、完整 diff 或完整日志。');
  return `${lines.join('\n').trim()}\n`;
}

/**
 * 读取已有 record 的结构化摘要（若文件含 JSON 数据块）。
 * @param {string} absPath
 */
function readExistingSummary(absPath) {
  if (!fs.existsSync(absPath)) return null;
  try {
    const text = fs.readFileSync(absPath, 'utf8');
    const match = text.match(/<!--\s*atf-record-json\s*\n([\s\S]*?)\n\s*-->/);
    if (!match) return null;
    const parsed = JSON.parse(match[1]);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * upsert 诊断记录：生成/复用 key、合并、渲染、原子覆盖、脱敏。
 * @param {{
 *   summary?: Record<string, unknown>,
 *   record_key?: string,
 *   contextId?: string,
 *   issueId?: string,
 *   markdown?: string,
 *   category?: string,
 *   title?: string,
 *   filename?: string,
 *   project?: string,
 * }} input
 * @param {NodeJS.ProcessEnv} [env]
 */
export function upsertDiagnosticRecord(input = {}, env = process.env) {
  const index = readIndex(env);
  const recordKey = generateRecordKey({
    record_key: input.record_key || input.summary?.record_key,
    issueId: input.issueId || input.summary?.issueId,
    contextId: input.contextId || input.summary?.context_id,
  });

  const existingEntry = index[recordKey];
  let targetRel = existingEntry?.relativePath
    ? String(existingEntry.relativePath).replace(/\\/g, '/')
    : '';
  let absPath = targetRel ? path.join(getAutotestFlowHome(env), targetRel) : '';
  const existingSummary = absPath ? readExistingSummary(absPath) : null;

  const incoming = omitEmpty({
    ...(input.summary || {}),
    record_key: recordKey,
    issueId: input.issueId || input.summary?.issueId,
    category: input.category || input.summary?.category,
    title: input.title || input.summary?.title,
    project: input.project || input.summary?.project,
    context_id: input.contextId || input.summary?.context_id,
  });

  const merged = mergeRecordSummary(existingSummary || {}, incoming);
  merged.record_key = recordKey;

  let markdown;
  if (input.markdown && String(input.markdown).trim()) {
    // 兼容旧调用：仍接受 markdown，但优先与结构化摘要并存
    markdown = sanitizeRecordMarkdown(String(input.markdown));
  } else {
    markdown = sanitizeRecordMarkdown(renderRecordMarkdown(merged));
  }

  if (!markdown.trim()) {
    throw new Error('记录内容为空，未保存');
  }
  if (/PM_API_KEY\s*[:=]\s*\S+/i.test(markdown)) {
    throw new Error('记录仍包含 PM_API_KEY，已拒绝保存');
  }

  const now = new Date();
  const day = formatRecordDate(now);
  const action = existingEntry && absPath && fs.existsSync(absPath) ? 'updated' : 'created';

  if (!absPath || !fs.existsSync(absPath)) {
    const dayRoot = path.join(recordsRoot(env), day);
    fs.mkdirSync(dayRoot, { recursive: true });
    const safeKey = recordKey.replace(/[^\w.-]+/g, '_');
    const filename =
      input.filename && String(input.filename).trim()
        ? String(input.filename).replace(/[^\w.-]+/g, '_').replace(/\.md$/i, '') + '.md'
        : `${safeKey}.md`;
    absPath = path.join(dayRoot, filename);
    targetRel = path.join('records', day, filename).replace(/\\/g, '/');
  } else {
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
  }

  const header = [
    '---',
    `savedAt: ${now.toISOString()}`,
    `record_key: ${recordKey}`,
    `issueId: ${merged.issueId || ''}`,
    `category: ${merged.category || ''}`,
    `title: ${String(merged.title || '').replace(/\n/g, ' ')}`,
    merged.context_id ? `contextId: ${String(merged.context_id).replace(/\n/g, ' ')}` : null,
    merged.project ? `project: ${String(merged.project).replace(/\n/g, ' ')}` : null,
    '---',
    '',
    '<!-- atf-record-json',
    JSON.stringify(merged),
    '-->',
    '',
  ]
    .filter((line) => line !== null)
    .join('\n');

  const body = sanitizeRecordMarkdown(`${header}${markdown}\n`);
  if (/PM_API_KEY\s*[:=]\s*\S+/i.test(body)) {
    throw new Error('记录仍包含 PM_API_KEY，已拒绝保存');
  }

  const tmp = `${absPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, body, 'utf8');
  fs.renameSync(tmp, absPath);

  index[recordKey] = {
    relativePath: targetRel,
    updatedAt: now.toISOString(),
    issueId: merged.issueId || '',
    category: merged.category || '',
  };
  writeIndex(index, env);

  return {
    record_key: recordKey,
    record_ref: targetRel,
    record_action: action,
    // 兼容旧测试字段（不面向 Agent 父工具子结果）
    ok: true,
    path: absPath,
    relativePath: targetRel.replace(/\//g, path.sep),
    day,
    bytes: Buffer.byteLength(body, 'utf8'),
    message: action === 'updated' ? '诊断记录已更新' : '诊断记录已创建',
  };
}

/**
 * 兼容旧 API：保存/更新诊断记录。
 * @param {object} input
 * @param {NodeJS.ProcessEnv} [env]
 */
export function saveTestIssueRecord(input = {}, env = process.env) {
  const summary = input.summary
    ? input.summary
    : buildRecordSummary(
        {},
        omitEmpty({
          record_key: input.record_key,
          issueId: input.issueId,
          category: input.category,
          title: input.title,
          project: input.project,
          analysis_summary: input.analysis_summary || input.conclusion,
          conclusion: input.conclusion,
          change_summary: input.change_summary,
          changed_files: input.changed_files,
          verification_summary: input.verification_summary,
          blocked_reason: input.blocked_reason,
          result_ref: input.result_ref,
          user_intent: input.user_intent,
        })
      );

  return upsertDiagnosticRecord(
    {
      summary,
      record_key: input.record_key || summary.record_key,
      contextId: input.contextId || summary.context_id,
      issueId: input.issueId || summary.issueId,
      category: input.category || summary.category,
      title: input.title || summary.title,
      project: input.project || summary.project,
      filename: input.filename,
      markdown: input.markdown,
    },
    env
  );
}

/**
 * Context 收尾：从 Context 构建并 upsert，写 sidecar meta。
 * @param {Record<string, unknown>} context
 * @param {string} contextDir
 * @param {{ stage?: string, record?: Record<string, unknown> }} [options]
 * @param {NodeJS.ProcessEnv} [env]
 */
export function finalizeContextRecord(context, contextDir, options = {}, env = process.env) {
  const meta = readContextRecordMeta(contextDir) || {};
  const short = omitEmpty(options.record || {});
  if (meta.record_key) {
    short.record_key = meta.record_key;
  }
  const summary = buildRecordSummary(context, short, { stage: options.stage });
  const saved = upsertDiagnosticRecord(
    {
      summary,
      record_key: summary.record_key || short.record_key || meta.record_key,
      contextId: context.context_id,
      issueId: summary.issueId,
      category: summary.category,
      title: summary.title,
      project: summary.project,
    },
    env
  );
  writeContextRecordMeta(contextDir, {
    record_key: saved.record_key,
    record_ref: saved.record_ref,
    record_action: saved.record_action,
  });
  return {
    record_key: saved.record_key,
    record_ref: saved.record_ref,
    record_action: saved.record_action,
  };
}

/**
 * 把 records 子结果并入父工具响应；失败只附 record_warning。
 * @param {Record<string, unknown>} parent
 * @param {(() => {record_key:string, record_ref:string, record_action:string}) | null} finalizeFn
 */
export function attachRecordSubresult(parent, finalizeFn) {
  if (!finalizeFn) return parent;
  try {
    const sub = finalizeFn();
    parent.record_key = sub.record_key;
    parent.record_ref = sub.record_ref;
    parent.record_action = sub.record_action;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    parent.record_warning = clip(message, 160) || 'records 写入失败';
  }
  return parent;
}

/** @deprecated 使用 buildRecordSummary + renderRecordMarkdown */
export function buildStageDiagnosticRecord(context, meta = {}) {
  const summary = buildRecordSummary(context, {}, meta);
  return {
    markdown: renderRecordMarkdown(summary),
    category: summary.category,
    issueId: summary.issueId,
    title: summary.title,
    contextId: summary.context_id,
    project: summary.project,
    summary,
  };
}
