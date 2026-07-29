import { getPmBaseUrl } from '../config/env.js';

/**
 * 使用给定 API Key 验证能否访问 PM（不写入配置，不打印密钥）。
 * @param {string} apiKey
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function validatePmApiKey(apiKey) {
  const key = String(apiKey || '').trim();
  if (!key) {
    return { ok: false, message: 'API Key 为空' };
  }

  const baseUrl = getPmBaseUrl();
  const url = `${baseUrl}/users/current.json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'X-Redmine-API-Key': key,
        'User-Agent': 'AutoTestFlow-CLI/0.1',
      },
    });

    if (response.status === 401 || response.status === 403) {
      return { ok: false, message: 'API Key 无效或无权限' };
    }
    if (!response.ok) {
      return { ok: false, message: `PM 返回 HTTP ${response.status}` };
    }
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return { ok: false, message: 'PM 未返回 JSON，无法确认密钥' };
    }
    return { ok: true, message: '验证成功' };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { ok: false, message: '验证超时' };
    }
    return {
      ok: false,
      message: `验证失败：${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
