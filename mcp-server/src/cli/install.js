import fs from 'node:fs';
import {
  getAutotestFlowHome,
  getUserEnvPath,
  getPackageRoot,
  readPackageVersion,
} from './paths.js';
import { readEnvFile, mergeEnvFile } from './prompt.js';
import { resolveValidatedApiKey } from './api-key.js';
import { installRuntime } from './runtime.js';
import { installCursorMcp } from './cursor-mcp.js';
import { installCodexMcp } from './codex-mcp.js';
import { installSkills } from './skills-install.js';
import { StageError, runStage, formatStageFailure } from './stage.js';

/**
 * 发布包安装（npx @chaoxing/autotest-flow install）。
 * 本地仓库请使用根目录 npm run setup。
 *
 * @param {string[]} args
 * @param {{ env?: NodeJS.ProcessEnv, skipNpm?: boolean, stdinApiKey?: string, keepExistingKey?: boolean }} [options]
 */
export async function runInstall(args, options = {}) {
  const env = options.env || process.env;

  try {
    if (args.includes('--api-key') || args.some((a) => a.startsWith('--api-key='))) {
      throw new StageError(
        '参数检查',
        '出于安全考虑，不允许通过 --api-key 传递密钥，请在提示时输入。',
        '重新执行 install，在终端交互输入密钥。'
      );
    }

    await runStage('检查 Node.js', () => {
      const major = Number(process.versions.node.split('.')[0]);
      if (major < 20) {
        throw new Error(`需要 Node.js >= 20，当前为 ${process.version}`);
      }
    });

    const home = getAutotestFlowHome(env);
    fs.mkdirSync(home, { recursive: true });
    const envPath = getUserEnvPath(env);

    const apiKey = await runStage(
      '配置 PM_API_KEY',
      () =>
        resolveValidatedApiKey({
          envPath,
          stdinApiKey: options.stdinApiKey,
          keepExistingKey: options.keepExistingKey,
        }),
      '请确认密钥正确且可访问 PM 服务后重试。'
    );

    await runStage('写入个人配置', () => {
      const existing = readEnvFile(envPath);
      mergeEnvFile(envPath, {
        PM_API_KEY: apiKey,
        PM_BASE_URL: existing.PM_BASE_URL || 'http://pm.chaoxing.com',
      });
      console.error(`已写入用户配置：${envPath}（不打印密钥）`);
    });

    console.error('阶段：安装用户运行时...');
    const runtime = installRuntime(env, {
      skipNpm: options.skipNpm === true,
      packageRoot: options.skipNpm ? getPackageRoot() : undefined,
      version: readPackageVersion(),
    });
    console.error(`运行时就绪：${runtime.cliPath}`);

    await runStage('配置 Cursor MCP', () => {
      const mcpPath = installCursorMcp({ cliPath: runtime.cliPath, env });
      console.error(`Cursor MCP 已更新：${mcpPath}`);
    });

    await runStage('配置 Codex MCP', () => {
      const result = installCodexMcp({ cliPath: runtime.cliPath, env });
      console.error(
        result.mode === 'toml'
          ? result.added
            ? 'Codex config.toml 已写入 autotest-flow'
            : 'Codex config.toml 已更新 autotest-flow'
          : result.added
            ? 'Codex MCP 已注册 autotest-flow'
            : 'Codex MCP 已存在 autotest-flow，已跳过或已校正'
      );
    });

    await runStage('安装 Skills', () => {
      installSkills(env);
      console.error('Skills 已安装到 Cursor 与 Codex 技能目录（仅更新 AutoTestFlow 自有 Skill）');
    });

    const stored = readEnvFile(envPath);
    if (!stored.PM_API_KEY) {
      throw new Error('配置写入异常：未找到 PM_API_KEY 键（不显示值）');
    }

    console.error('');
    console.error('安装完成。请重启 Cursor / Codex 后执行：autotest-flow doctor');
    return {
      home,
      envPath,
      cliPath: runtime.cliPath,
    };
  } catch (error) {
    console.error(formatStageFailure(error));
    throw error;
  }
}
