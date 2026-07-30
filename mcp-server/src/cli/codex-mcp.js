import { commandExists, runCodex } from './process.js';
import {
  hasCodexMcpToml,
  installCodexMcpToml,
  uninstallCodexMcpToml,
} from './codex-toml.js';
import os from 'node:os';

/**
 * @param {string} listText
 * @returns {boolean}
 */
export function listHasAutotestFlow(listText) {
  return /(?:^|[\s"'`/\\])autotest-flow(?:[\s"'`/\\]|$)/i.test(String(listText || ''));
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function hasCodexCli(env = process.env) {
  const isWindows = os.platform() === 'win32';
  if (isWindows) {
    return commandExists('codex.cmd', env) || commandExists('codex', env);
  }
  return commandExists('codex', env);
}

/**
 * 配置 Codex MCP：优先 CLI；无 CLI 时安全合并 config.toml。
 * 不输出 Windows 原始乱码 stderr，只抛出统一中文错误。
 * @param {{ cliPath: string, env?: NodeJS.ProcessEnv }} options
 */
export function installCodexMcp(options) {
  const env = options.env || process.env;

  if (env.AUTOTEST_FLOW_FORCE_CODEX_TOML === '1' || !hasCodexCli(env)) {
    if (!hasCodexCli(env) && env.AUTOTEST_FLOW_FORCE_CODEX_TOML !== '1') {
      console.error('未检测到 Codex CLI，改为安全合并 config.toml（无需额外安装 CLI）。');
    } else if (env.AUTOTEST_FLOW_FORCE_CODEX_TOML === '1') {
      console.error('已启用 config.toml 合并模式。');
    }
    return installCodexMcpToml(options);
  }

  try {
    return installCodexMcpViaCli(options);
  } catch (error) {
    console.error('Codex CLI 注册失败，回退为安全合并 config.toml。');
    console.error(
      `说明：${error instanceof Error ? error.message : 'CLI 调用异常'}`
    );
    return installCodexMcpToml(options);
  }
}

/**
 * @param {{ cliPath: string, env?: NodeJS.ProcessEnv }} options
 */
function installCodexMcpViaCli(options) {
  const env = options.env || process.env;
  const listResult = runCodex(['mcp', 'list'], env);
  if (listResult.error || listResult.status !== 0) {
    throw new Error('执行 codex mcp list 失败，请检查 Codex CLI 是否可用');
  }

  const listText = `${listResult.stdout}\n${listResult.stderr}`;
  if (listHasAutotestFlow(listText)) {
    if (listText.includes(options.cliPath)) {
      return { added: false, existed: true, mode: 'cli' };
    }
    const removeResult = runCodex(['mcp', 'remove', 'autotest-flow'], env);
    if (removeResult.error || (removeResult.status !== 0 && removeResult.status !== null)) {
      throw new Error(
        '已存在 autotest-flow 但入口可能过期，自动更新失败。请手动执行 codex mcp remove autotest-flow 后重装'
      );
    }
  }

  const addResult = runCodex(
    ['mcp', 'add', 'autotest-flow', '--', 'node', options.cliPath, 'mcp'],
    env
  );
  if (addResult.error || addResult.status !== 0) {
    throw new Error('注册 Codex MCP（codex mcp add）失败');
  }

  return {
    added: true,
    existed: false,
    mode: 'cli',
  };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function uninstallCodexMcp(env = process.env) {
  if (hasCodexCli(env)) {
    const listResult = runCodex(['mcp', 'list'], env);
    if (!listResult.error && listResult.status === 0) {
      const listText = `${listResult.stdout}\n${listResult.stderr}`;
      if (listHasAutotestFlow(listText)) {
        const removeResult = runCodex(['mcp', 'remove', 'autotest-flow'], env);
        if (removeResult.error || removeResult.status !== 0) {
          throw new Error('移除 Codex MCP 失败，请手动执行 codex mcp remove autotest-flow');
        }
        uninstallCodexMcpToml(env);
        return { removed: true, mode: 'cli' };
      }
    }
  }

  const toml = uninstallCodexMcpToml(env);
  return {
    removed: Boolean(toml.removed),
    mode: 'toml',
    reason: toml.removed ? undefined : 'not_found',
  };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function hasCodexMcp(env = process.env) {
  if (hasCodexCli(env)) {
    const listResult = runCodex(['mcp', 'list'], env);
    if (!listResult.error && listResult.status === 0) {
      if (listHasAutotestFlow(`${listResult.stdout}\n${listResult.stderr}`)) {
        return true;
      }
    }
  }
  return hasCodexMcpToml(env);
}
