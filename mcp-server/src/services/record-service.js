import fs from 'node:fs';
import path from 'node:path';
import { getAutotestFlowHome } from '../cli/paths.js';

const SENSITIVE_PATTERNS = [
  /PM_API_KEY\s*[:=]\s*\S+/gi,
  /(?:api[_-]?key|token|password|passwd|secret)\s*[:=]\s*\S+/gi,
  /(?:cookie|set-cookie)\s*[:=]\s*[^\n\r]+/gi,
  /authorization\s*:\s*[^\n\r]+/gi,
  /x-redmine-api-key\s*:\s*[^\n\r]+/gi,
];

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
 * @param {Date} [now]
 */
function formatTimestamp(now = new Date()) {
  const h = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${h}${mi}${s}`;
}

/**
 * @param {unknown} value
 * @param {number} [max]
 */
function clip(value, max = 200) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * @param {unknown} value
 * @param {number} [maxItems]
 * @param {number} [itemMax]
 */
function clipList(value, maxItems = 8, itemMax = 120) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map((item) => {
    if (typeof item === 'string') return clip(item, itemMax);
    try {
      return clip(JSON.stringify(item), itemMax);
    } catch {
      return clip(String(item), itemMax);
    }
  });
}

/**
 * 从 Task Context 生成阶段诊断摘要（不含 PM 原文 / 完整日志 / 完整脚本）。
 * @param {Record<string, unknown>} context
 * @param {{ stage: string }} meta
 */
export function buildStageDiagnosticRecord(context, meta) {
  const task = /** @type {Record<string, unknown>} */ (context?.task || {});
  const source = /** @type {Record<string, unknown>} */ (context?.source || {});
  const request = /** @type {Record<string, unknown>} */ (context?.request || {});
  const project = /** @type {Record<string, unknown>} */ (context?.project || {});
  const routing = /** @type {Record<string, unknown>} */ (context?.routing || {});
  const analysis = /** @type {Record<string, unknown>} */ (context?.analysis || {});
  const implementation = /** @type {Record<string, unknown>} */ (context?.implementation || {});
  const verification = /** @type {Record<string, unknown>} */ (context?.verification || {});

  const issueId = String(task.issue_id || source.pm_issue_id || '').trim();
  const category = inferRecordCategory(routing, analysis);
  const lines = [
    '# AutoTestFlow 阶段诊断记录',
    '',
    '## 任务摘要',
    `- context_id: ${clip(context?.context_id, 80)}`,
    `- stage: ${clip(meta?.stage, 40)}`,
    `- issue_id: ${clip(issueId, 40)}`,
    `- title: ${clip(task.title, 160)}`,
    `- user_intent: ${clip(request.user_intent, 160)}`,
    `- entry: ${clip(source.entry, 40)}`,
    '',
    '## 分类与结论',
    `- task_type: ${clip(routing.task_type, 80)}`,
    `- route_skill: ${clip(routing.route_skill, 80)}`,
    `- category: ${category}`,
    `- analysis_summary: ${clip(analysis.summary, 240)}`,
    `- open_questions: ${clipList(analysis.open_questions, 5).join('；') || '(无)'}`,
    `- risks: ${clipList(implementation.risks, 5).join('；') || '(无)'}`,
    '',
    '## 项目',
    `- name: ${clip(project.name, 80)}`,
    `- root: ${clip(project.root, 200)}`,
    `- framework: ${clip(project.framework, 40)}`,
    '',
    '## 修改',
    `- implementation_status: ${clip(implementation.status, 40)}`,
    `- changed_files: ${clipList(implementation.changed_files || implementation.target_files, 12).join(', ') || '(无)'}`,
    `- summary: ${clip(implementation.summary || implementation.plan_summary, 240)}`,
    `- code_diff_ref: ${clip(implementation.code_diff_ref, 120) || '(无)'}`,
    '',
    '## 验证',
    `- verification_status: ${clip(verification.status, 40)}`,
    `- command: ${clip(verification.command, 200) || '(无)'}`,
    `- passed/failed/blocked: ${verification.passed ?? '-'}/${verification.failed ?? '-'}/${verification.blocked ?? '-'}`,
    `- result_ref: ${clip(verification.result_ref, 120) || '(无)'}`,
    `- summary: ${clip(verification.summary, 240) || '(无)'}`,
    '',
    '## 说明',
    '- 由 complete_task_stage 自动写入；不含 PM 原文、完整脚本或完整运行日志。',
    '- 证据详见 result_ref / code_diff_ref（若有）。',
  ];

  return {
    markdown: lines.join('\n'),
    category,
    issueId: issueId || undefined,
    title: clip(task.title || `stage:${meta?.stage}`, 120),
    contextId: String(context?.context_id || ''),
    project: clip(project.name || project.root, 80),
  };
}

/**
 * @param {Record<string, unknown>} routing
 * @param {Record<string, unknown>} analysis
 */
function inferRecordCategory(routing, analysis) {
  const blob = [
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
  return 'TASK';
}

/**
 * 将脱敏后的 Markdown 记录保存到 ~/.autotest-flow/records/YYYY-MM-DD/
 * @param {{
 *   markdown: string,
 *   category?: string,
 *   issueId?: string,
 *   title?: string,
 *   filename?: string,
 *   contextId?: string,
 *   project?: string,
 * }} input
 * @param {NodeJS.ProcessEnv} [env]
 */
export function saveTestIssueRecord(input, env = process.env) {
  const markdown = sanitizeRecordMarkdown(input?.markdown || '');
  if (!markdown.trim()) {
    throw new Error('记录内容为空，未保存');
  }

  // 再次检查是否仍含明显密钥字段名赋值
  if (/PM_API_KEY\s*[:=]\s*\S+/i.test(markdown)) {
    throw new Error('记录仍包含 PM_API_KEY，已拒绝保存');
  }

  const now = new Date();
  const day = formatRecordDate(now);
  const recordsRoot = path.join(getAutotestFlowHome(env), 'records', day);
  fs.mkdirSync(recordsRoot, { recursive: true });

  const safeIssue = String(input?.issueId || 'unknown').replace(/[^\w.-]+/g, '_');
  const safeCategory = String(input?.category || 'UNCONFIRMED').replace(/[^\w.-]+/g, '_');
  const baseName =
    input?.filename && String(input.filename).trim()
      ? String(input.filename).replace(/[^\w.-]+/g, '_')
      : `${safeIssue}_${safeCategory}_${formatTimestamp(now)}.md`;
  const filename = baseName.endsWith('.md') ? baseName : `${baseName}.md`;
  const filePath = path.join(recordsRoot, filename);

  const header = [
    '---',
    `savedAt: ${now.toISOString()}`,
    `issueId: ${input?.issueId || ''}`,
    `category: ${input?.category || ''}`,
    `title: ${String(input?.title || '').replace(/\n/g, ' ')}`,
    input?.contextId ? `contextId: ${String(input.contextId).replace(/\n/g, ' ')}` : null,
    input?.project ? `project: ${String(input.project).replace(/\n/g, ' ')}` : null,
    '---',
    '',
  ]
    .filter((line) => line !== null)
    .join('\n');

  const body = sanitizeRecordMarkdown(`${header}${markdown}\n`);
  if (/PM_API_KEY\s*[:=]\s*\S+/i.test(body)) {
    throw new Error('记录仍包含 PM_API_KEY，已拒绝保存');
  }

  fs.writeFileSync(filePath, body, 'utf8');

  return {
    ok: true,
    path: filePath,
    relativePath: path.join('records', day, filename),
    day,
    bytes: Buffer.byteLength(body, 'utf8'),
    message: '诊断记录已脱敏保存',
  };
}
