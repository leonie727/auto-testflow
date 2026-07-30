import { runInstall } from './install.js';

/**
 * update：刷新 MCP / Skills；密钥已存在时默认询问是否保留。
 * @param {string[]} args
 * @param {{ env?: NodeJS.ProcessEnv, skipNpm?: boolean, stdinApiKey?: string, keepExistingKey?: boolean }} [options]
 */
export async function runUpdate(args, options = {}) {
  console.error('开始更新 AutoTestFlow（将刷新运行时 / MCP / Skills）...');
  return runInstall(args, options);
}
