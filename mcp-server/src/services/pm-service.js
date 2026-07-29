import { getPmApiKey, getPmBaseUrl, sanitizeErrorMessage } from '../config/env.js';
import { normalizePmIssue } from '../utils/pm-url.js';

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_HTML_LENGTH = 200_000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const LOGIN_TEXT_HINTS = [
  '请登录',
  '重新登录',
  '用户登录',
  '账号登录',
  '身份认证',
  '登录后访问',
  '需要登录',
  'sign in',
  'log in',
  'please login',
  'please log in',
];

/**
 * @returns {Record<string, string>}
 */
function buildPmHeaders(accept) {
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: accept,
  };
  const apiKey = getPmApiKey();
  if (apiKey) {
    headers['X-Redmine-API-Key'] = apiKey;
  }
  return headers;
}

/**
 * @param {string} url
 * @param {Record<string, string>} headers
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, headers) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('请求超时（15秒），无法访问 PM 需求');
    }
    throw new Error(`请求失败：${sanitizeErrorMessage(error)}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * @param {string} html
 * @returns {string}
 */
function extractPageTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) {
    return '';
  }
  return match[1].replace(/\s+/g, ' ').trim();
}

/**
 * @param {{ httpStatus: number, finalUrl: string, pageTitle: string, htmlSnippet: string }} info
 * @returns {boolean}
 */
function isAuthenticationRequired(info) {
  const { httpStatus, finalUrl, pageTitle, htmlSnippet } = info;

  if (httpStatus === 401 || httpStatus === 403) {
    return true;
  }

  const urlLower = String(finalUrl || '').toLowerCase();
  if (/login|passport|auth/.test(urlLower)) {
    return true;
  }

  const text = `${pageTitle}\n${htmlSnippet}`.toLowerCase();
  return LOGIN_TEXT_HINTS.some((hint) => text.includes(hint.toLowerCase()));
}

/**
 * @param {unknown} value
 * @returns {string|null}
 */
function textOrNull(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  return text ? text : null;
}

/**
 * 清理需求描述：保留段落与换行，去除脚本/样式等无关内容。
 * @param {unknown} raw
 * @returns {string|null}
 */
function cleanDescription(raw) {
  if (raw === undefined || raw === null) {
    return null;
  }

  let text = String(raw);
  if (!text.trim()) {
    return null;
  }

  text = text
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?(?:nav|footer|header|aside|menu)[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text || null;
}

/**
 * @param {Array<{id?: number, name?: string, value?: unknown}>|undefined} customFields
 * @param {RegExp} namePattern
 * @returns {string|null}
 */
function findCustomFieldValue(customFields, namePattern) {
  if (!Array.isArray(customFields)) {
    return null;
  }

  for (const field of customFields) {
    const name = String(field?.name || '');
    if (!namePattern.test(name)) {
      continue;
    }
    const value = field?.value;
    if (Array.isArray(value)) {
      const joined = value.map((item) => String(item).trim()).filter(Boolean).join(', ');
      return joined || null;
    }
    return textOrNull(value);
  }

  return null;
}

/**
 * @param {object} issue
 * @param {string} currentIssueId
 * @returns {Array<{ issueId: string, relationType: string }>}
 */
function mapRelatedIssues(issue, currentIssueId) {
  const related = [];
  const seen = new Set();

  const push = (issueId, relationType) => {
    const id = textOrNull(issueId);
    const type = textOrNull(relationType);
    if (!id || !type || id === currentIssueId) {
      return;
    }
    const key = `${type}:${id}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    related.push({ issueId: id, relationType: type });
  };

  if (issue?.parent?.id !== undefined && issue?.parent?.id !== null) {
    push(issue.parent.id, 'parent');
  }

  if (Array.isArray(issue?.children)) {
    for (const child of issue.children) {
      push(child?.id, 'child');
    }
  }

  if (Array.isArray(issue?.relations)) {
    for (const relation of issue.relations) {
      const left = textOrNull(relation?.issue_id);
      const right = textOrNull(relation?.issue_to_id);
      const otherId =
        left === currentIssueId ? right : right === currentIssueId ? left : right || left;
      push(otherId, relation?.relation_type || 'relates');
    }
  }

  return related;
}

/**
 * @param {Array<object>|undefined} attachments
 * @returns {Array<{ id: string, filename: string|null, contentType: string|null, filesize: number|null, contentUrl: string|null }>}
 */
function mapAttachments(attachments) {
  if (!Array.isArray(attachments)) {
    return [];
  }

  return attachments.map((item) => ({
    id: String(item?.id ?? ''),
    filename: textOrNull(item?.filename),
    contentType: textOrNull(item?.content_type),
    filesize: typeof item?.filesize === 'number' ? item.filesize : null,
    contentUrl: textOrNull(item?.content_url),
  }));
}

/**
 * 探测超星 PM 需求页面是否可直接访问，以及是否需要登录。
 * 若配置了 PM_API_KEY，则通过 X-Redmine-API-Key 请求头进行认证。
 * @param {string} issue
 */
export async function inspectPmIssueAccess(issue) {
  const { issueId, url } = normalizePmIssue(issue);
  const apiKeyConfigured = Boolean(getPmApiKey());
  const authenticatedWithApiKey = apiKeyConfigured;

  try {
    const response = await fetchWithTimeout(
      url,
      buildPmHeaders(
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      )
    );

    const rawText = await response.text();
    const htmlSnippet = rawText.slice(0, MAX_HTML_LENGTH);
    const pageTitle = extractPageTitle(htmlSnippet);
    const finalUrl = response.url || url;
    const httpStatus = response.status;
    const contentType = response.headers.get('content-type') || '';

    const authenticationRequired = isAuthenticationRequired({
      httpStatus,
      finalUrl,
      pageTitle,
      htmlSnippet,
    });

    const accessible =
      httpStatus >= 200 && httpStatus < 400 && !authenticationRequired;

    return {
      issueId,
      requestedUrl: url,
      finalUrl,
      httpStatus,
      contentType,
      accessible,
      authenticationRequired,
      pageTitle,
      apiKeyConfigured,
      authenticatedWithApiKey,
    };
  } catch (error) {
    throw new Error(sanitizeErrorMessage(error));
  }
}

/**
 * 读取并结构化返回 PM 需求内容（优先使用 Redmine JSON API）。
 * @param {string} issue
 */
export async function readPmIssue(issue) {
  if (!getPmApiKey()) {
    throw new Error('未配置 PM_API_KEY，无法读取需求详情');
  }

  const { issueId, url } = normalizePmIssue(issue);
  const baseUrl = getPmBaseUrl();
  const apiUrl = `${baseUrl}/issues/${issueId}.json?include=attachments,relations,children`;

  let response;
  try {
    response = await fetchWithTimeout(
      apiUrl,
      buildPmHeaders('application/json')
    );
  } catch (error) {
    throw new Error(sanitizeErrorMessage(error));
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error('PM API 认证失败，请检查 PM_API_KEY 是否有效');
  }

  if (response.status === 404) {
    throw new Error(`需求不存在：#${issueId}`);
  }

  if (!response.ok) {
    throw new Error(`读取需求失败，HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('PM 未返回 JSON 接口数据，无法结构化读取需求');
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('PM JSON 响应解析失败');
  }

  const rawIssue = payload?.issue;
  if (!rawIssue || rawIssue.id === undefined || rawIssue.id === null) {
    throw new Error('PM JSON 响应缺少 issue 数据');
  }

  const customFields = rawIssue.custom_fields;
  const moduleValue =
    textOrNull(rawIssue.category?.name) ||
    findCustomFieldValue(customFields, /模块|module/i);
  const acceptanceCriteria =
    findCustomFieldValue(customFields, /验收|acceptance/i);

  return {
    issueId: String(rawIssue.id),
    url,
    title: textOrNull(rawIssue.subject),
    description: cleanDescription(rawIssue.description),
    status: textOrNull(rawIssue.status?.name),
    priority: textOrNull(rawIssue.priority?.name),
    assignee: textOrNull(rawIssue.assigned_to?.name),
    author: textOrNull(rawIssue.author?.name),
    module: moduleValue,
    acceptanceCriteria,
    attachments: mapAttachments(rawIssue.attachments),
    relatedIssues: mapRelatedIssues(rawIssue, String(rawIssue.id)),
  };
}
