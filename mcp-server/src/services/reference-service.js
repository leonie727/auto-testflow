import { fetchWithTimeout, USER_AGENT } from '../services/pm-service.js';
import { describeExternalReference } from '../utils/external-url.js';

const REFERENCE_TIMEOUT_MS = 15_000;
const MAX_CONTENT_LENGTH = 20_000;

const LOGIN_HINTS = [
  '请登录',
  '重新登录',
  '用户登录',
  '账号登录',
  '身份认证',
  '登录后访问',
  '需要登录',
  '无权限',
  '没有权限',
  'access denied',
  'sign in',
  'log in',
  'please login',
  'please log in',
];

/**
 * @param {string} html
 */
function extractTitle(html) {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) {
    return null;
  }
  return match[1].replace(/\s+/g, ' ').trim() || null;
}

/**
 * @param {string} html
 */
function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * @param {string} finalUrl
 * @param {string} title
 * @param {string} text
 * @param {number} status
 */
function requiresAuth(finalUrl, title, text, status) {
  if (status === 401 || status === 403) {
    return true;
  }
  const urlLower = String(finalUrl || '').toLowerCase();
  if (/login|passport|auth|signin/.test(urlLower)) {
    return true;
  }
  const hay = `${title}\n${text}`.toLowerCase();
  return LOGIN_HINTS.some((hint) => hay.includes(hint.toLowerCase()));
}

/**
 * 读取 PM 关联外部资料（公开页优先 fetch）。
 * 不返回 Cookie、Token、完整响应头。
 * @param {string} url
 */
export async function readPmReference(url) {
  const meta = describeExternalReference(url);
  if (meta.accessStatus !== 'allowed') {
    return {
      url: meta.url,
      domain: meta.domain,
      type: meta.type,
      title: null,
      content: null,
      finalUrl: meta.url,
      contentType: null,
      requiresAuth: false,
      ok: false,
      accessStatus: meta.accessStatus,
      error: meta.reason || '不允许访问该地址',
    };
  }

  let response;
  try {
    response = await fetchWithTimeout(meta.url, {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    });
  } catch (error) {
    const code = error?.code;
    return {
      url: meta.url,
      domain: meta.domain,
      type: meta.type,
      title: null,
      content: null,
      finalUrl: meta.url,
      contentType: null,
      requiresAuth: false,
      ok: false,
      accessStatus: code === 'PM_TIMEOUT' ? 'timeout' : 'network_error',
      error:
        code === 'PM_TIMEOUT'
          ? '外部资料请求超时'
          : '外部资料连接失败',
    };
  }

  const contentType = response.headers.get('content-type') || '';
  const finalUrl = response.url || meta.url;
  const raw = await response.text();
  const truncated = raw.slice(0, MAX_CONTENT_LENGTH);
  const title = extractTitle(truncated);
  const content = htmlToText(truncated).slice(0, MAX_CONTENT_LENGTH);
  const authRequired = requiresAuth(finalUrl, title || '', content, response.status);

  if (authRequired) {
    return {
      url: meta.url,
      domain: meta.domain,
      type: meta.type,
      title,
      content: null,
      finalUrl,
      contentType,
      requiresAuth: true,
      ok: false,
      accessStatus: 'requires_auth',
      httpStatus: response.status,
      error: '页面需要登录或权限不足，未猜测正文',
    };
  }

  if (response.status < 200 || response.status >= 400) {
    return {
      url: meta.url,
      domain: meta.domain,
      type: meta.type,
      title,
      content: null,
      finalUrl,
      contentType,
      requiresAuth: false,
      ok: false,
      accessStatus: 'http_error',
      httpStatus: response.status,
      error: `外部资料读取失败（HTTP ${response.status}）`,
    };
  }

  return {
    url: meta.url,
    domain: meta.domain,
    type: meta.type,
    title,
    content,
    finalUrl,
    contentType,
    requiresAuth: false,
    ok: true,
    accessStatus: 'fetched',
    httpStatus: response.status,
  };
}

export { MAX_CONTENT_LENGTH, REFERENCE_TIMEOUT_MS };
