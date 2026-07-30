import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  getAutotestFlowHome,
  getUserEnvPath,
  getPackageRoot,
  readPackageVersion,
} from './paths.js';
import { resolveLayoutFromImportMeta } from './layout.js';
import { readEnvFile, mergeEnvFile } from './prompt.js';
import { resolveValidatedApiKey } from './api-key.js';
import { installCursorMcp } from './cursor-mcp.js';
import { installCodexMcp, hasCodexCli } from './codex-mcp.js';
import { installSkills } from './skills-install.js';
import { runDoctor } from './doctor.js';
import { StageError, runStage, formatStageFailure } from './stage.js';
import { runNpm, redact } from './process.js';

/**
 * @param {string[]} args
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   mcpServerRoot?: string,
 *   repoRoot?: string,
 *   skipDeps?: boolean,
 *   skipDoctor?: boolean,
 *   stdinApiKey?: string,
 *   keepExistingKey?: boolean,
 *   importMetaUrl?: string|URL,
 * }} [options]
 */
export async function runSetup(args = [], options = {}) {
  const env = options.env || process.env;

  if (args.includes('--api-key') || args.some((a) => a.startsWith('--api-key='))) {
    throw new StageError(
      '参数检查',
      '出于安全考虑，不允许通过 --api-key 传递密钥，请在提示时输入。',
      '重新执行 npm run setup，在终端交互输入密钥。'
    );
  }

  let mcpServerRoot = options.mcpServerRoot;
  let repoRoot = options.repoRoot;
  if (!mcpServerRoot || !repoRoot) {
    if (options.importMetaUrl) {
      const layout = resolveLayoutFromImportMeta(options.importMetaUrl);
      mcpServerRoot = mcpServerRoot || layout.mcpServerRoot;
      repoRoot = repoRoot || layout.repoRoot;
    } else {
      mcpServerRoot = mcpServerRoot || getPackageRoot();
      repoRoot = repoRoot || path.resolve(mcpServerRoot, '..');
    }
  }

  mcpServerRoot = path.resolve(mcpServerRoot);
  repoRoot = path.resolve(repoRoot);

  assertNoNestedMcpServer(mcpServerRoot);

  await runStage(
    '检查 Node.js',
    () => {
      const major = Number(process.versions.node.split('.')[0]);
      if (major < 20) {
        throw new Error(`需要 Node.js >= 20，当前为 ${process.version}`);
      }
    },
    '请安装 Node.js 20 或更高版本后重试。'
  );

  if (!options.skipDeps) {
    await runStage(
      '安装依赖',
      () => installMcpServerDeps(mcpServerRoot, env),
      '请确认可访问 npm 源，然后在仓库根目录重新执行 npm run setup。'
    );

    await runStage(
      '准备 Skills 资源',
      () => preparePackageAssets(mcpServerRoot, env),
      '请确认仓库包含 .agents/skills 与 references，然后重试。'
    );
  }

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
    '请确认密钥正确且可访问 http://pm.chaoxing.com，然后重新执行 setup。'
  );

  await runStage(
    '写入个人配置',
    () => {
      const existing = readEnvFile(envPath);
      mergeEnvFile(envPath, {
        PM_API_KEY: apiKey,
        PM_BASE_URL: existing.PM_BASE_URL || 'http://pm.chaoxing.com',
      });
      console.error(`已写入用户配置：${envPath}（不打印密钥）`);
      const stored = readEnvFile(envPath);
      if (!stored.PM_API_KEY) {
        throw new Error('配置写入异常：未找到 PM_API_KEY 键（不显示值）');
      }
    },
    '请检查对 ~/.autotest-flow 目录的写权限。'
  );

  const cliPath = path.join(mcpServerRoot, 'bin', 'autotest-flow.js');
  if (!fs.existsSync(cliPath)) {
    throw new StageError(
      '定位 MCP 入口',
      `未找到 CLI：${cliPath}`,
      '请确认仓库完整，并在根目录执行 npm run setup。'
    );
  }

  await runStage(
    '配置 Cursor MCP',
    () => {
      const mcpPath = installCursorMcp({ cliPath, env });
      console.error(`Cursor MCP 已更新：${mcpPath}`);
    },
    '请检查 ~/.cursor/mcp.json 是否可写；若 JSON 损坏请根据 .bak 备份修复。'
  );

  await runStage(
    '配置 Codex MCP',
    () => {
      const result = installCodexMcp({ cliPath, env });
      if (result.mode === 'toml') {
        console.error(
          result.added
            ? `Codex config.toml 已写入 autotest-flow：${result.path || 'config.toml'}`
            : 'Codex config.toml 已更新 autotest-flow（保留其他配置）'
        );
      } else {
        console.error(
          result.added
            ? 'Codex MCP 已通过 CLI 注册 autotest-flow'
            : 'Codex MCP 已存在 autotest-flow，已跳过或已校正'
        );
      }
      if (!hasCodexCli(env)) {
        console.error('提示：未安装 Codex CLI 不影响本次配置；重启 Codex 客户端后生效。');
      }
    },
    '可忽略 Codex CLI 安装；若仍失败请检查 CODEX_HOME/config.toml 写权限。'
  );

  await runStage(
    '安装 Skills',
    () => {
      installSkills(env);
      console.error('Skills 已安装到 Cursor 与 Codex 技能目录（仅更新 AutoTestFlow 自有 Skill）');
    },
    '请先确保 package-assets/skills 存在（setup 会自动 prepare:package）。'
  );

  let doctorResult = null;
  if (!options.skipDoctor) {
    await runStage(
      'doctor 检查',
      async () => {
        doctorResult = await runDoctor({ env, cliPath });
      },
      '请根据 doctor 输出逐项修复后，再次执行 npm run doctor。'
    );
  }

  console.error('');
  console.error(`AutoTestFlow setup 完成（v${safeVersion()}）。`);
  console.error(`个人密钥位置：${envPath}`);
  console.error('请重启 Cursor / Codex 后验证 MCP 工具。');

  return {
    home,
    envPath,
    cliPath,
    mcpServerRoot,
    repoRoot,
    doctorResult,
  };
}

/**
 * @param {string} mcpServerRoot
 */
function assertNoNestedMcpServer(mcpServerRoot) {
  const normalized = path.normalize(mcpServerRoot);
  if (/mcp-server[\\/]+mcp-server/i.test(normalized)) {
    throw new StageError(
      '目录定位',
      `检测到错误路径 mcp-server/mcp-server：${normalized}`,
      '请从仓库根目录执行 npm run setup，不要手动拼接 mcp-server 路径。'
    );
  }
  const pkgPath = path.join(mcpServerRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    throw new StageError(
      '目录定位',
      `mcp-server 目录无效：${mcpServerRoot}`,
      '请确认仓库结构完整。'
    );
  }
}

/**
 * @param {string} mcpServerRoot
 * @param {NodeJS.ProcessEnv} env
 */
function installMcpServerDeps(mcpServerRoot, env) {
  const result = runNpm(['install'], {
    cwd: mcpServerRoot,
    env,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `npm install 失败：${redact(result.stderr || result.stdout || result.error?.message || '')}`
    );
  }
}

/**
 * @param {string} mcpServerRoot
 * @param {NodeJS.ProcessEnv} env
 */
function preparePackageAssets(mcpServerRoot, env) {
  const script = path.join(mcpServerRoot, 'scripts', 'prepare-package.js');
  if (!fs.existsSync(script)) {
    throw new Error(`缺少 prepare-package 脚本：${script}`);
  }
  const result = spawnSync(process.execPath, [script], {
    cwd: mcpServerRoot,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    env,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `prepare:package 失败：${redact(result.stderr || result.stdout || result.error?.message || '')}`
    );
  }
}

function safeVersion() {
  try {
    return readPackageVersion();
  } catch {
    return '0.1.0';
  }
}

/**
 * 从脚本入口启动（供根目录 / mcp-server scripts 使用）。
 * @param {string|URL} importMetaUrl
 * @param {string[]} [args]
 * @param {object} [options]
 */
export async function runSetupFromScript(importMetaUrl, args = [], options = {}) {
  try {
    const layout = resolveLayoutFromImportMeta(importMetaUrl);
    return await runSetup(args, {
      ...options,
      mcpServerRoot: layout.mcpServerRoot,
      repoRoot: layout.repoRoot,
      importMetaUrl,
    });
  } catch (error) {
    console.error('');
    console.error(formatStageFailure(error));
    throw error;
  }
}

export { resolveLayoutFromImportMeta };
