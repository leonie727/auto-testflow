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
 * 将脱敏后的 Markdown 记录保存到 ~/.autotest-flow/records/YYYY-MM-DD/
 * @param {{
 *   markdown: string,
 *   category?: string,
 *   issueId?: string,
 *   title?: string,
 *   filename?: string
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
    '---',
    '',
  ].join('\n');

  fs.writeFileSync(filePath, `${header}${markdown}\n`, 'utf8');

  return {
    ok: true,
    path: filePath,
    relativePath: path.join('records', day, filename),
    day,
    bytes: Buffer.byteLength(`${header}${markdown}\n`, 'utf8'),
    message: '诊断记录已脱敏保存',
  };
}
