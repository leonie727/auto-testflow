import { runCodex, redact } from './process.js';

/**
 * @param {string} listText
 * @returns {boolean}
 */
export function listHasAutotestFlow(listText) {
  return /(?:^|[\s"'`/\\])autotest-flow(?:[\s"'`/\\]|$)/i.test(String(listText || ''));
}

/**
 * @param {{ cliPath: string, env?: NodeJS.ProcessEnv }} options
 */
export function installCodexMcp(options) {
  const env = options.env || process.env;
  const listResult = runCodex(['mcp', 'list'], env);
  if (listResult.error || listResult.status !== 0) {
    throw new Error(
      `执行 codex mcp list 失败：${redact(listResult.stderr || listResult.stdout || listResult.error?.message)}`
    );
  }

  const listText = `${listResult.stdout}\n${listResult.stderr}`;
  if (listHasAutotestFlow(listText)) {
    const entryLooksCorrect =
      listText.includes(options.cliPath) ||
      /autotest-flow[\s\S]{0,200}mcp/i.test(listText);
    if (entryLooksCorrect || listHasAutotestFlow(listText)) {
      // 已存在：若入口不含当前 cliPath，尝试安全更新
      if (!listText.includes(options.cliPath)) {
        const removeResult = runCodex(['mcp', 'remove', 'autotest-flow'], env);
        if (removeResult.error || (removeResult.status !== 0 && removeResult.status !== null)) {
          throw new Error(
            `已存在 autotest-flow 但入口可能过期，自动更新失败。请手动执行 codex mcp remove autotest-flow 后重装。`
          );
        }
      } else {
        return { added: false, existed: true };
      }
    }
  }

  const addResult = runCodex(
    ['mcp', 'add', 'autotest-flow', '--', 'node', options.cliPath, 'mcp'],
    env
  );
  if (addResult.error || addResult.status !== 0) {
    throw new Error(
      `注册 Codex MCP 失败：${redact(addResult.stderr || addResult.stdout || addResult.error?.message)}`
    );
  }

  const verify = runCodex(['mcp', 'list'], env);
  return {
    added: true,
    existed: false,
    listOk: verify.status === 0,
  };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function uninstallCodexMcp(env = process.env) {
  const listResult = runCodex(['mcp', 'list'], env);
  if (listResult.error || listResult.status !== 0) {
    return { removed: false, reason: 'list_failed' };
  }
  const listText = `${listResult.stdout}\n${listResult.stderr}`;
  if (!listHasAutotestFlow(listText)) {
    return { removed: false, reason: 'not_found' };
  }
  const removeResult = runCodex(['mcp', 'remove', 'autotest-flow'], env);
  if (removeResult.error || removeResult.status !== 0) {
    throw new Error(
      `移除 Codex MCP 失败：${redact(removeResult.stderr || removeResult.stdout || removeResult.error?.message)}`
    );
  }
  return { removed: true };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function hasCodexMcp(env = process.env) {
  const listResult = runCodex(['mcp', 'list'], env);
  if (listResult.error || listResult.status !== 0) {
    return false;
  }
  return listHasAutotestFlow(`${listResult.stdout}\n${listResult.stderr}`);
}
