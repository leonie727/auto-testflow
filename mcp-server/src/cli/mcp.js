import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { startMcpServer } from '../server.js';
import { loadEnvFile, sanitizeErrorMessage } from '../config/env.js';

/**
 * MCP stdio 入口：供 Cursor / Codex 通过 `node <cli> mcp` 启动。
 */
export async function runMcp() {
  loadEnvFile();
  await startMcpServer();
}

/**
 * 判断当前文件是否被直接执行。
 * @param {string} metaUrl
 */
export function isMainModule(metaUrl) {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  try {
    return pathToFileURL(path.resolve(entry)).href === metaUrl;
  } catch {
    return false;
  }
}

export { sanitizeErrorMessage };
