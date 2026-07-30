import { isIP } from 'node:net';

const ALLOWED_DOMAIN_SUFFIXES = [
  'chaoxing.com',
  'feishu.cn',
  'feishu.com',
  'larksuite.com',
];

const PRIVATE_IPV4 = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
];

/**
 * @param {string} hostname
 */
export function isAllowedExternalDomain(hostname) {
  const host = String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  if (!host) {
    return false;
  }
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return false;
  }
  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    return !PRIVATE_IPV4.some((re) => re.test(host));
  }
  if (ipVersion === 6) {
    const normalized = host.toLowerCase();
    return !(
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80')
    );
  }
  return ALLOWED_DOMAIN_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );
}

/**
 * @param {string} hostname
 * @returns {'feishu'|'chaoxing'|'web'|'blocked'}
 */
export function classifyExternalUrlType(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!isAllowedExternalDomain(host)) {
    return 'blocked';
  }
  if (
    host === 'feishu.cn' ||
    host.endsWith('.feishu.cn') ||
    host === 'feishu.com' ||
    host.endsWith('.feishu.com') ||
    host === 'larksuite.com' ||
    host.endsWith('.larksuite.com')
  ) {
    return 'feishu';
  }
  if (host === 'chaoxing.com' || host.endsWith('.chaoxing.com')) {
    return 'chaoxing';
  }
  return 'web';
}

/**
 * 从描述中提取 http/https URL（保留原始描述由调用方负责）。
 * @param {unknown} raw
 * @returns {string[]}
 */
export function extractHttpUrls(raw) {
  const text = String(raw || '');
  if (!text.trim()) {
    return [];
  }

  /** @type {Set<string>} */
  const found = new Set();

  for (const match of text.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    addUrlCandidate(found, match[1]);
  }

  for (const match of text.matchAll(/https?:\/\/[^\s<>"'`)\]|]+/gi)) {
    addUrlCandidate(found, match[0]);
  }

  return [...found];
}

/**
 * @param {Set<string>} bucket
 * @param {string} candidate
 */
function addUrlCandidate(bucket, candidate) {
  let value = String(candidate || '').trim();
  if (!value) {
    return;
  }
  value = value.replace(/&amp;/gi, '&');
  value = value.replace(/[.,;:!?)\]}]+$/g, '');
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return;
    }
    bucket.add(parsed.toString());
  } catch {
    // ignore invalid
  }
}

/**
 * @param {string} url
 * @returns {{
 *   url: string,
 *   domain: string,
 *   type: 'feishu'|'chaoxing'|'web'|'blocked',
 *   accessStatus: 'allowed'|'blocked'|'unsafe',
 *   reason?: string,
 * }}
 */
export function describeExternalReference(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return {
      url: String(url || ''),
      domain: '',
      type: 'blocked',
      accessStatus: 'unsafe',
      reason: 'URL 无效',
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      url: parsed.toString(),
      domain: parsed.hostname,
      type: 'blocked',
      accessStatus: 'unsafe',
      reason: '仅允许 http/https',
    };
  }

  const type = classifyExternalUrlType(parsed.hostname);
  if (type === 'blocked') {
    return {
      url: parsed.toString(),
      domain: parsed.hostname,
      type,
      accessStatus: 'blocked',
      reason: '未知域名或不在允许列表，禁止直接访问',
    };
  }

  return {
    url: parsed.toString(),
    domain: parsed.hostname,
    type,
    accessStatus: 'allowed',
  };
}

/**
 * @param {unknown} rawDescription
 */
export function buildExternalReferences(rawDescription) {
  return extractHttpUrls(rawDescription).map((url) => describeExternalReference(url));
}

/**
 * 清理描述时保留链接：把 <a href> 展开为可读文本，并保留裸 URL。
 * @param {unknown} raw
 * @returns {string|null}
 */
export function cleanDescriptionPreserveLinks(raw) {
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
    .replace(
      /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_all, href, label) => {
        const plain = String(label || '')
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        const url = String(href || '').replace(/&amp;/gi, '&').trim();
        if (plain && url && plain !== url) {
          return `${plain} ${url}`;
        }
        return url || plain;
      }
    )
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

export { ALLOWED_DOMAIN_SUFFIXES };
