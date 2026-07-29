import { getPmBaseUrl } from '../config/env.js';

/**
 * 规范化超星 PM 需求编号或 URL。
 * @param {string} issue
 * @returns {{ issueId: string, url: string }}
 */
export function normalizePmIssue(issue) {
  if (typeof issue !== 'string') {
    throw new Error('issue 必须是字符串');
  }

  const trimmed = issue.trim();
  if (!trimmed) {
    throw new Error('issue 不能为空');
  }

  const baseUrl = getPmBaseUrl();
  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    throw new Error('PM_BASE_URL 配置无效');
  }

  if (/^\d+$/.test(trimmed)) {
    return {
      issueId: trimmed,
      url: `${baseUrl}/issues/${trimmed}`,
    };
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      `非法的 issue 输入："${trimmed}"。请提供 PM 编号（如 470985）或完整地址（如 ${baseUrl}/issues/470985）`
    );
  }

  if (parsed.hostname !== base.hostname) {
    throw new Error(
      `不允许的主机名："${parsed.hostname}"。仅支持 ${base.hostname}`
    );
  }

  const match = parsed.pathname.match(/^\/issues\/(\d+)\/?$/);
  if (!match) {
    throw new Error(
      `路径格式不正确："${parsed.pathname}"。应为 /issues/{数字}`
    );
  }

  const issueId = match[1];
  return {
    issueId,
    url: `${baseUrl}/issues/${issueId}`,
  };
}
