import { runInstall } from './install.js';
import { detectClients } from './process.js';

/**
 * update：重新安装 runtime 并刷新 MCP / Skills（密钥已存在则仍需验证输入或沿用验证流程）。
 * @param {string[]} args
 * @param {{ env?: NodeJS.ProcessEnv, skipNpm?: boolean, stdinApiKey?: string }} [options]
 */
export async function runUpdate(args, options = {}) {
  const env = options.env || process.env;
  const clients = detectClients(env);
  if (!clients.cursor && !clients.codex) {
    throw new Error('未检测到 cursor 或 codex，无法 update');
  }
  console.error('开始更新 AutoTestFlow（将重新校验 API Key 并刷新运行时）...');
  return runInstall(args, options);
}
