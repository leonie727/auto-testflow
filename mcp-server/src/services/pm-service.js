import { getPmApiKey, getPmBaseUrl, sanitizeErrorMessage } from '../config/env.js';
import { normalizePmIssue } from '../utils/pm-url.js';
import {
  buildExternalReferences,
  cleanDescriptionPreserveLinks,
} from '../utils/external-url.js';

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_HTML_LENGTH = 200_000;
const DEFAULT_VALIDATE_ISSUE_ID = '470985';
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
 * 与 read_pm_issue 完全一致的请求头。
 * @param {string} accept
 * @param {string} [apiKeyOverride] 传入则用该密钥；否则读配置
 * @returns {Record<string, string>}
 */
export function buildPmHeaders(accept, apiKeyOverride) {
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: accept,
  };
  const apiKey =
    apiKeyOverride !== undefined
      ? String(apiKeyOverride || '').trim()
      : getPmApiKey();
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
export async function fetchWithTimeout(url, headers) {
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
      const timeoutError = new Error('请求超时（15秒），无法访问 PM 需求');
      timeoutError.code = 'PM_TIMEOUT';
      throw timeoutError;
    }
    const networkError = new Error(`请求失败：${sanitizeErrorMessage(error)}`);
    networkError.code = 'PM_NETWORK';
    throw networkError;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * @param {string} issueId
 */
export function buildPmIssueApiUrl(issueId) {
  const baseUrl = getPmBaseUrl();
  return `${baseUrl}/issues/${issueId}.json?include=attachments,relations,children`;
}

/**
 * @param {string} [issueId]
 */
export function resolveValidateIssueId(issueId) {
  const fromEnv = String(process.env.AUTOTEST_FLOW_VALIDATE_ISSUE || '').trim();
  const raw = String(issueId || fromEnv || DEFAULT_VALIDATE_ISSUE_ID).trim();
  if (!/^\d+$/.test(raw)) {
    throw new Error('验证用 PM 编号无效');
  }
  return raw;
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
 * @param {string} finalUrl
 * @param {string} [pageTitle]
 * @param {string} [snippet]
 */
function looksLikeLoginPage(finalUrl, pageTitle = '', snippet = '') {
  const urlLower = String(finalUrl || '').toLowerCase();
  if (/login|passport|auth/.test(urlLower)) {
    return true;
  }
  const text = `${pageTitle}\n${snippet}`.toLowerCase();
  return LOGIN_TEXT_HINTS.some((hint) => text.includes(hint.toLowerCase()));
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
  return looksLikeLoginPage(finalUrl, pageTitle, htmlSnippet);
}

/**
 * 组装安全诊断信息（不含密钥、Cookie、正文、敏感头）。
 * @param {{ httpStatus?: number|null, finalUrl?: string, contentType?: string, detail: string }} info
 */
export function formatPmDiagnosticMessage(info) {
  const parts = [info.detail];
  if (info.httpStatus != null) {
    parts.push(`HTTP ${info.httpStatus}`);
  }
  if (info.finalUrl) {
    parts.push(`URL: ${info.finalUrl}`);
  }
  if (info.contentType) {
    parts.push(`Content-Type: ${info.contentType}`);
  }
  return parts.join('；');
}

/**
 * 将 PM HTTP 响应分类为可读错误（安装验证与 read_pm_issue 共用）。
 * @param {{
 *   httpStatus: number,
 *   finalUrl: string,
 *   contentType: string,
 *   bodyText?: string,
 *   issueId?: string,
 *   requestedUrl?: string,
 * }} info
 * @returns {{ code: string, message: string, httpStatus: number, finalUrl: string, contentType: string }}
 */
export function classifyPmHttpResult(info) {
  const httpStatus = info.httpStatus;
  const finalUrl = info.finalUrl || info.requestedUrl || '';
  const contentType = info.contentType || '';
  const bodyText = String(info.bodyText || '');
  const pageTitle = extractPageTitle(bodyText.slice(0, MAX_HTML_LENGTH));
  const snippet = bodyText.slice(0, 4000);
  const isHtml =
    contentType.includes('text/html') ||
    /^\s*<(!doctype|html|head|body)\b/i.test(bodyText);
  const isJson = contentType.includes('application/json');

  const base = { httpStatus, finalUrl, contentType };

  if (httpStatus === 401 || httpStatus === 403) {
    return {
      ...base,
      code: 'unauthorized',
      message: formatPmDiagnosticMessage({
        ...base,
        detail: '密钥无效或当前账号无权限',
      }),
    };
  }

  if (
    (httpStatus >= 300 && httpStatus < 400) ||
    looksLikeLoginPage(finalUrl, pageTitle, snippet)
  ) {
    return {
      ...base,
      code: 'auth_ineffective',
      message: formatPmDiagnosticMessage({
        ...base,
        detail: '认证请求未生效（302或最终进入登录页）',
      }),
    };
  }

  if (httpStatus === 404) {
    return {
      ...base,
      code: 'not_found',
      message: formatPmDiagnosticMessage({
        ...base,
        detail: info.issueId
          ? `验证用的PM不存在或无访问权限（#${info.issueId}）`
          : '验证用的PM不存在或无访问权限',
      }),
    };
  }

  if (httpStatus === 200 && isHtml) {
    return {
      ...base,
      code: 'html_instead_of_json',
      message: formatPmDiagnosticMessage({
        ...base,
        detail: '验证地址或响应解析错误（200但返回HTML）',
      }),
    };
  }

  if (httpStatus === 200 && !isJson) {
    return {
      ...base,
      code: 'bad_content_type',
      message: formatPmDiagnosticMessage({
        ...base,
        detail: '验证地址或响应解析错误（未返回 JSON）',
      }),
    };
  }

  if (httpStatus < 200 || httpStatus >= 300) {
    return {
      ...base,
      code: 'http_error',
      message: formatPmDiagnosticMessage({
        ...base,
        detail: `PM 请求失败`,
      }),
    };
  }

  return {
    ...base,
    code: 'ok',
    message: '验证成功',
  };
}

/**
 * 发起与 read_pm_issue 相同的 issues JSON 请求。
 * @param {string} issueId
 * @param {string} [apiKeyOverride]
 */
export async function requestPmIssueJson(issueId, apiKeyOverride) {
  const apiUrl = buildPmIssueApiUrl(issueId);
  const response = await fetchWithTimeout(
    apiUrl,
    buildPmHeaders('application/json', apiKeyOverride)
  );
  const contentType = response.headers.get('content-type') || '';
  const finalUrl = response.url || apiUrl;
  const bodyText = await response.text();
  return {
    response,
    apiUrl,
    finalUrl,
    contentType,
    bodyText,
    httpStatus: response.status,
  };
}

/**
 * 使用给定 API Key 验证能否访问 PM（与 read_pm_issue 同地址、同认证头）。
 * 不写入配置，不打印密钥。
 * @param {string} apiKey
 * @param {{ issueId?: string }} [options]
 * @returns {Promise<{
 *   ok: boolean,
 *   message: string,
 *   code?: string,
 *   httpStatus?: number|null,
 *   finalUrl?: string,
 *   contentType?: string,
 *   issueId?: string,
 * }>}
 */
export async function validatePmApiKey(apiKey, options = {}) {
  const key = String(apiKey || '').trim();
  if (!key) {
    return { ok: false, code: 'empty', message: 'API Key 为空' };
  }

  let issueId;
  try {
    issueId = resolveValidateIssueId(options.issueId);
  } catch (error) {
    return {
      ok: false,
      code: 'bad_issue',
      message: error instanceof Error ? error.message : String(error),
    };
  }

  let result;
  try {
    result = await requestPmIssueJson(issueId, key);
  } catch (error) {
    if (error?.code === 'PM_TIMEOUT' || error?.name === 'AbortError') {
      return {
        ok: false,
        code: 'timeout',
        message: 'PM服务响应超时',
        httpStatus: null,
        finalUrl: buildPmIssueApiUrl(issueId),
        issueId,
      };
    }
    return {
      ok: false,
      code: 'network',
      message: formatPmDiagnosticMessage({
        detail: 'PM服务连接失败',
        finalUrl: buildPmIssueApiUrl(issueId),
      }),
      httpStatus: null,
      finalUrl: buildPmIssueApiUrl(issueId),
      issueId,
    };
  }

  const classified = classifyPmHttpResult({
    httpStatus: result.httpStatus,
    finalUrl: result.finalUrl,
    contentType: result.contentType,
    bodyText: result.bodyText,
    issueId,
    requestedUrl: result.apiUrl,
  });

  if (classified.code !== 'ok') {
    return {
      ok: false,
      code: classified.code,
      message: redactSecret(classified.message, key),
      httpStatus: classified.httpStatus,
      finalUrl: classified.finalUrl,
      contentType: classified.contentType,
      issueId,
    };
  }

  let payload;
  try {
    payload = JSON.parse(result.bodyText);
  } catch {
    return {
      ok: false,
      code: 'json_parse',
      message: formatPmDiagnosticMessage({
        httpStatus: result.httpStatus,
        finalUrl: result.finalUrl,
        contentType: result.contentType,
        detail: '验证地址或响应解析错误（JSON 解析失败）',
      }),
      httpStatus: result.httpStatus,
      finalUrl: result.finalUrl,
      contentType: result.contentType,
      issueId,
    };
  }

  if (!payload?.issue || payload.issue.id === undefined || payload.issue.id === null) {
    return {
      ok: false,
      code: 'missing_issue',
      message: formatPmDiagnosticMessage({
        httpStatus: result.httpStatus,
        finalUrl: result.finalUrl,
        contentType: result.contentType,
        detail: '验证地址或响应解析错误（缺少 issue 数据）',
      }),
      httpStatus: result.httpStatus,
      finalUrl: result.finalUrl,
      contentType: result.contentType,
      issueId,
    };
  }

  return {
    ok: true,
    code: 'ok',
    message: '验证成功',
    httpStatus: result.httpStatus,
    finalUrl: result.finalUrl,
    contentType: result.contentType,
    issueId,
  };
}

/**
 * @param {string} message
 * @param {string} secret
 */
function redactSecret(message, secret) {
  if (!secret) {
    return message;
  }
  return String(message).split(secret).join('[REDACTED]');
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
 * 清理需求描述：保留段落与换行，去除脚本/样式等无关内容，并保留链接。
 * @param {unknown} raw
 * @returns {string|null}
 */
function cleanDescription(raw) {
  return cleanDescriptionPreserveLinks(raw);
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

  let result;
  try {
    result = await requestPmIssueJson(issueId);
  } catch (error) {
    if (error?.code === 'PM_TIMEOUT' || error?.name === 'AbortError') {
      throw new Error('PM服务响应超时');
    }
    throw new Error(
      formatPmDiagnosticMessage({
        detail: 'PM服务连接失败',
        finalUrl: buildPmIssueApiUrl(issueId),
      })
    );
  }

  const classified = classifyPmHttpResult({
    httpStatus: result.httpStatus,
    finalUrl: result.finalUrl,
    contentType: result.contentType,
    bodyText: result.bodyText,
    issueId,
    requestedUrl: result.apiUrl,
  });

  if (classified.code !== 'ok') {
    throw new Error(sanitizeErrorMessage(classified.message));
  }

  let payload;
  try {
    payload = JSON.parse(result.bodyText);
  } catch {
    throw new Error(
      formatPmDiagnosticMessage({
        httpStatus: result.httpStatus,
        finalUrl: result.finalUrl,
        contentType: result.contentType,
        detail: '验证地址或响应解析错误（JSON 解析失败）',
      })
    );
  }

  const rawIssue = payload?.issue;
  if (!rawIssue || rawIssue.id === undefined || rawIssue.id === null) {
    throw new Error(
      formatPmDiagnosticMessage({
        httpStatus: result.httpStatus,
        finalUrl: result.finalUrl,
        contentType: result.contentType,
        detail: '验证地址或响应解析错误（缺少 issue 数据）',
      })
    );
  }

  const customFields = rawIssue.custom_fields;
  const moduleValue =
    textOrNull(rawIssue.category?.name) ||
    findCustomFieldValue(customFields, /模块|module/i);
  const acceptanceCriteria =
    findCustomFieldValue(customFields, /验收|acceptance/i);

  const description = cleanDescription(rawIssue.description);
  const externalReferences = buildExternalReferences(rawIssue.description);

  return {
    issueId: String(rawIssue.id),
    url,
    title: textOrNull(rawIssue.subject),
    description,
    status: textOrNull(rawIssue.status?.name),
    priority: textOrNull(rawIssue.priority?.name),
    assignee: textOrNull(rawIssue.assigned_to?.name),
    author: textOrNull(rawIssue.author?.name),
    module: moduleValue,
    acceptanceCriteria,
    attachments: mapAttachments(rawIssue.attachments),
    relatedIssues: mapRelatedIssues(rawIssue, String(rawIssue.id)),
    externalReferences,
  };
}

export { DEFAULT_VALIDATE_ISSUE_ID, USER_AGENT, REQUEST_TIMEOUT_MS };
