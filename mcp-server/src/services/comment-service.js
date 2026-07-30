import { getPmApiKey, getPmBaseUrl, sanitizeErrorMessage } from '../config/env.js';
import { normalizePmIssue } from '../utils/pm-url.js';
import {
  buildPmHeaders,
  classifyPmHttpResult,
  fetchWithTimeout,
  formatPmDiagnosticMessage,
} from './pm-service.js';

const MAX_COMMENT_LENGTH = 8_000;
const DEDUPE_WINDOW_MS = 5 * 60 * 1000;

/** @type {Map<string, number>} */
const recentCommentFingerprints = new Map();

/**
 * 回填评论模板（仅生成草稿，不自动提交）。
 */
export const COMMENT_TEMPLATES = {
  analysis_done: {
    id: 'analysis_done',
    title: '需求分析完成',
    build: (ctx = {}) =>
      [
        '【需求分析完成】',
        `PM：#${ctx.issueId || ''}`,
        ctx.title ? `标题：${ctx.title}` : null,
        ctx.summary ? `结论：${ctx.summary}` : '结论：已完成需求分析与测试点梳理。',
        ctx.nextStep ? `下一步：${ctx.nextStep}` : '下一步：待确认后进入脚本实现或继续补充信息。',
      ]
        .filter(Boolean)
        .join('\n'),
  },
  script_done: {
    id: 'script_done',
    title: '脚本编写完成',
    build: (ctx = {}) =>
      [
        '【脚本编写完成】',
        `PM：#${ctx.issueId || ''}`,
        ctx.files ? `修改文件：${ctx.files}` : null,
        ctx.summary ? `说明：${ctx.summary}` : '说明：已按确认方案完成脚本编写。',
        ctx.verify ? `验证：${ctx.verify}` : '验证：待执行目标测试。',
      ]
        .filter(Boolean)
        .join('\n'),
  },
  verify_pass: {
    id: 'verify_pass',
    title: '自动化验证通过',
    build: (ctx = {}) =>
      [
        '【自动化验证通过】',
        `PM：#${ctx.issueId || ''}`,
        ctx.command ? `执行命令：${ctx.command}` : null,
        ctx.summary ? `结果：${ctx.summary}` : '结果：目标测试通过。',
      ]
        .filter(Boolean)
        .join('\n'),
  },
  verify_fail: {
    id: 'verify_fail',
    title: '自动化验证失败',
    build: (ctx = {}) =>
      [
        '【自动化验证失败】',
        `PM：#${ctx.issueId || ''}`,
        ctx.command ? `执行命令：${ctx.command}` : null,
        ctx.summary ? `现象：${ctx.summary}` : '现象：目标测试未通过。',
        ctx.category ? `初步分类：${ctx.category}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
  },
  system_issue: {
    id: 'system_issue',
    title: '确认系统问题',
    build: (ctx = {}) =>
      [
        '【确认系统问题】',
        `PM：#${ctx.issueId || ''}`,
        ctx.summary ? `证据：${ctx.summary}` : '证据：手动与自动化均复现，倾向系统问题。',
        ctx.repro ? `复现：${ctx.repro}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
  },
  data_env_issue: {
    id: 'data_env_issue',
    title: '数据/环境问题',
    build: (ctx = {}) =>
      [
        '【数据/环境问题】',
        `PM：#${ctx.issueId || ''}`,
        ctx.summary ? `说明：${ctx.summary}` : '说明：当前更像数据或环境问题，暂不修改脚本断言。',
        ctx.action ? `建议：${ctx.action}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
  },
  data_issue: {
    id: 'data_issue',
    title: '确认数据问题',
    build: (ctx = {}) =>
      [
        '【数据问题通报】',
        `PM：#${ctx.issueId || ''}`,
        ctx.title ? `用例：${ctx.title}` : null,
        ctx.summary ? `现象：${ctx.summary}` : '现象：当前判定为数据问题。',
        ctx.repro ? `数据状态：${ctx.repro}` : null,
        ctx.action
          ? `结论：${ctx.action}`
          : '结论：数据问题，当前脚本暂不调整/待数据修复后复验。',
      ]
        .filter(Boolean)
        .join('\n'),
  },
  need_product: {
    id: 'need_product',
    title: '待产品确认',
    build: (ctx = {}) =>
      [
        '【待产品确认】',
        `PM：#${ctx.issueId || ''}`,
        ctx.summary ? `待确认点：${ctx.summary}` : '待确认点：需求信息不足，需产品补充。',
        ctx.questions ? `问题：${ctx.questions}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
  },
};

/**
 * @param {string} templateId
 * @param {Record<string, string>} [ctx]
 */
export function buildCommentDraft(templateId, ctx = {}) {
  const template = COMMENT_TEMPLATES[templateId];
  if (!template) {
    throw new Error(`未知回填模板：${templateId}`);
  }
  return {
    templateId: template.id,
    title: template.title,
    comment: template.build(ctx),
  };
}

/**
 * @param {string} issueId
 * @param {string} comment
 */
function fingerprint(issueId, comment) {
  return `${issueId}::${String(comment).trim()}`;
}

/**
 * @param {string} issueId
 * @param {string} comment
 */
export function isDuplicateComment(issueId, comment) {
  const key = fingerprint(issueId, comment);
  const last = recentCommentFingerprints.get(key);
  if (!last) {
    return false;
  }
  return Date.now() - last < DEDUPE_WINDOW_MS;
}

/**
 * @param {string} issueId
 * @param {string} comment
 */
function rememberComment(issueId, comment) {
  const key = fingerprint(issueId, comment);
  recentCommentFingerprints.set(key, Date.now());
  for (const [k, ts] of recentCommentFingerprints.entries()) {
    if (Date.now() - ts > DEDUPE_WINDOW_MS) {
      recentCommentFingerprints.delete(k);
    }
  }
}

/** 测试用 */
export function clearCommentDedupeCache() {
  recentCommentFingerprints.clear();
}

/**
 * @param {string} issueId
 */
async function fetchIssueWithJournals(issueId) {
  const baseUrl = getPmBaseUrl();
  const apiUrl = `${baseUrl}/issues/${issueId}.json?include=journals`;
  const response = await fetchWithTimeout(apiUrl, buildPmHeaders('application/json'));
  const bodyText = await response.text();
  const contentType = response.headers.get('content-type') || '';
  const classified = classifyPmHttpResult({
    httpStatus: response.status,
    finalUrl: response.url || apiUrl,
    contentType,
    bodyText,
    issueId,
    requestedUrl: apiUrl,
  });
  if (classified.code !== 'ok') {
    throw new Error(classified.message);
  }
  const payload = JSON.parse(bodyText);
  return payload?.issue;
}

/**
 * 仅向 PM 追加评论（notes），不改状态/指派人/优先级/完成度。
 * @param {string} issue
 * @param {string} comment
 * @param {{ confirmed?: boolean }} [options]
 */
export async function addPmComment(issue, comment, options = {}) {
  if (!getPmApiKey()) {
    throw new Error('未配置 PM_API_KEY，无法添加评论');
  }

  if (options.confirmed !== true) {
    throw new Error(
      '未确认回填：请先展示评论草稿，待用户明确回复「确认回填」或「提交评论」后再调用。'
    );
  }

  const notes = String(comment || '').trim();
  if (!notes) {
    throw new Error('评论内容为空，未提交');
  }
  if (notes.length > MAX_COMMENT_LENGTH) {
    throw new Error(`评论过长（>${MAX_COMMENT_LENGTH} 字），未提交`);
  }

  const { issueId } = normalizePmIssue(issue);

  if (isDuplicateComment(issueId, notes)) {
    throw new Error('检测到短时间内重复提交相同评论，已阻止');
  }

  const putUrl = `${getPmBaseUrl()}/issues/${issueId}.json`;

  let response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      response = await fetch(putUrl, {
        method: 'PUT',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          ...buildPmHeaders('application/json'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          issue: {
            notes,
          },
        }),
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('PM服务响应超时，评论未确认写入');
    }
    throw new Error(
      formatPmDiagnosticMessage({
        detail: `PM服务连接失败，评论未确认写入`,
        finalUrl: putUrl,
      })
    );
  }

  const contentType = response.headers.get('content-type') || '';
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      formatPmDiagnosticMessage({
        httpStatus: response.status,
        finalUrl: response.url || putUrl,
        contentType,
        detail: '无权限添加评论，或密钥无效',
      })
    );
  }
  if (response.status === 404) {
    throw new Error(
      formatPmDiagnosticMessage({
        httpStatus: response.status,
        finalUrl: response.url || putUrl,
        contentType,
        detail: `需求不存在或无访问权限（#${issueId}）`,
      })
    );
  }
  if (!response.ok && response.status !== 204) {
    throw new Error(
      formatPmDiagnosticMessage({
        httpStatus: response.status,
        finalUrl: response.url || putUrl,
        contentType,
        detail: '添加评论失败',
      })
    );
  }

  // 重新读取 journals，确认 notes 已出现
  let issuePayload;
  try {
    issuePayload = await fetchIssueWithJournals(issueId);
  } catch (error) {
    throw new Error(
      `评论请求已发送，但回读 journals 失败：${sanitizeErrorMessage(error)}`
    );
  }

  const journals = Array.isArray(issuePayload?.journals) ? issuePayload.journals : [];
  const matched = journals.some((item) => String(item?.notes || '').trim() === notes);
  if (!matched) {
    // 有些 Redmine 在 notes 完全相同或权限下可能延迟；仍以最近一条包含前缀作为弱确认
    const weak = journals.some((item) =>
      String(item?.notes || '').includes(notes.slice(0, Math.min(40, notes.length)))
    );
    if (!weak) {
      throw new Error('评论提交后未能在 journals 中确认写入成功');
    }
  }

  rememberComment(issueId, notes);

  return {
    ok: true,
    issueId,
    commentLength: notes.length,
    verifiedInJournals: true,
    message: '评论已添加并经 journals 确认',
  };
}

export { MAX_COMMENT_LENGTH, DEDUPE_WINDOW_MS };
