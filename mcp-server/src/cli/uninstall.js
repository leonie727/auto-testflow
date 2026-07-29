import fs from 'node:fs';
import { detectClients } from './process.js';
import { uninstallCursorMcp } from './cursor-mcp.js';
import { uninstallCodexMcp } from './codex-mcp.js';
import { uninstallSkills } from './skills-install.js';
import { promptConfirm } from './prompt.js';
import { getUserEnvPath, getRuntimePrefix } from './paths.js';

/**
 * @param {string[]} args
 * @param {{ env?: NodeJS.ProcessEnv, keepEnv?: boolean, removeRuntime?: boolean }} [options]
 */
export async function runUninstall(args, options = {}) {
  const env = options.env || process.env;
  const clients = detectClients(env);

  const cursor = uninstallCursorMcp(env);
  console.error(
    cursor.removed
      ? '已移除 Cursor MCP：autotest-flow'
      : 'Cursor 中未找到 autotest-flow MCP（跳过）'
  );

  if (clients.codex) {
    try {
      const codex = uninstallCodexMcp(env);
      console.error(
        codex.removed
          ? '已移除 Codex MCP：autotest-flow'
          : 'Codex 中未找到 autotest-flow MCP（跳过）'
      );
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
    }
  }

  const removedSkills = uninstallSkills(env);
  console.error(
    removedSkills.length
      ? `已删除 AutoTestFlow Skills：${removedSkills.length} 项`
      : '未找到 AutoTestFlow Skills（跳过）'
  );

  let keepEnv = options.keepEnv;
  if (keepEnv === undefined) {
    keepEnv = await promptConfirm('是否保留 ~/.autotest-flow/.env 密钥配置？', true);
  }

  const envPath = getUserEnvPath(env);
  if (!keepEnv && fs.existsSync(envPath)) {
    fs.unlinkSync(envPath);
    console.error('已删除用户 .env');
  } else {
    console.error('已保留用户 .env（默认）');
  }

  if (options.removeRuntime) {
    const runtime = getRuntimePrefix(env);
    if (fs.existsSync(runtime)) {
      fs.rmSync(runtime, { recursive: true, force: true });
      console.error('已删除 runtime 目录');
    }
  } else {
    console.error('保留 runtime 目录（可用 update 覆盖）。未删除任何业务测试项目。');
  }

  console.error('卸载完成。');
}
