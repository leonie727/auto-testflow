import fs from 'node:fs';
import path from 'node:path';
import {
  getUserEnvPath,
  getAutotestFlowHome,
  getDevProjectEnvPath,
} from '../cli/paths.js';
import { applyEnvFile, parseEnvContent } from '../cli/prompt.js';

const DEFAULT_PM_BASE_URL = 'http://pm.chaoxing.com';

/**
 * 按优先级加载 PM 配置（不覆盖已存在的 process.env）：
 * 1. process.env（已有）
 * 2. AUTOTEST_FLOW_HOME 下 .env
 * 3. ~/.autotest-flow/.env
 * 4. 开发项目 mcp-server/.env
 *
 * 启动时不强制要求 PM_API_KEY。
 */
export function loadEnvFile() {
  const candidates = [];

  if (process.env.AUTOTEST_FLOW_HOME) {
    candidates.push(path.join(path.resolve(process.env.AUTOTEST_FLOW_HOME), '.env'));
  }

  candidates.push(getUserEnvPath());
  candidates.push(getDevProjectEnvPath());

  const seen = new Set();
  for (const filePath of candidates) {
    const resolved = path.resolve(filePath);
    if (seen.has(resolved)) {
      continue;
    }
    seen.add(resolved);
    if (fs.existsSync(resolved)) {
      applyEnvFile(resolved);
    }
  }
}

/**
 * @returns {string}
 */
export function getPmApiKey() {
  return String(process.env.PM_API_KEY || '').trim();
}

/**
 * @returns {string}
 */
export function getPmBaseUrl() {
  const raw = String(process.env.PM_BASE_URL || DEFAULT_PM_BASE_URL).trim();
  return raw.replace(/\/+$/, '') || DEFAULT_PM_BASE_URL;
}

/**
 * 从错误文案中移除 API Key，避免泄露。
 * @param {unknown} errorOrMessage
 * @returns {string}
 */
export function sanitizeErrorMessage(errorOrMessage) {
  let message =
    errorOrMessage instanceof Error
      ? errorOrMessage.message
      : String(errorOrMessage || '未知错误');

  const apiKey = getPmApiKey();
  if (apiKey) {
    message = message.split(apiKey).join('[REDACTED]');
  }

  return message;
}

export { parseEnvContent, getAutotestFlowHome };
