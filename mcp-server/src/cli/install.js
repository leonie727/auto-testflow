import fs from 'node:fs';
import {
  getAutotestFlowHome,
  getUserEnvPath,
  getPackageRoot,
  readPackageVersion,
} from './paths.js';
import { detectClients } from './process.js';
import { promptSecret, writeEnvFile, readEnvFile } from './prompt.js';
import { validatePmApiKey } from './pm-validate.js';
import { installRuntime } from './runtime.js';
import { installCursorMcp } from './cursor-mcp.js';
import { installCodexMcp } from './codex-mcp.js';
import { installSkills } from './skills-install.js';

/**
 * @param {string[]} args
 * @param {{ env?: NodeJS.ProcessEnv, skipNpm?: boolean, stdinApiKey?: string }} [options]
 */
export async function runInstall(args, options = {}) {
  const env = options.env || process.env;

  if (args.includes('--api-key') || args.some((a) => a.startsWith('--api-key='))) {
    throw new Error('出于安全考虑，不允许通过 --api-key 传递密钥，请在提示时输入。');
  }

  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) {
    throw new Error(`需要 Node.js >= 20，当前为 ${process.version}`);
  }

  const clients = detectClients(env);
  if (!clients.cursor && !clients.codex) {
    throw new Error('未检测到 cursor 或 codex 命令，请至少安装其中一个客户端后再执行 install。');
  }

  console.error(
    `检测到客户端：${[
      clients.cursor ? 'Cursor' : null,
      clients.codex ? 'Codex' : null,
    ]
      .filter(Boolean)
      .join('、')}`
  );

  const home = getAutotestFlowHome(env);
  fs.mkdirSync(home, { recursive: true });

  // 密钥：交互输入并验证
  let apiKey = options.stdinApiKey;
  if (!apiKey) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      apiKey = await promptSecret('请输入个人 PM_API_KEY（输入不会完整回显）: ');
      const validation = await validatePmApiKey(apiKey);
      if (validation.ok) {
        break;
      }
      console.error(`验证失败：${validation.message}`);
      apiKey = '';
      if (attempt === 3) {
        throw new Error('API Key 验证失败次数过多，未写入任何密钥配置。');
      }
    }
  } else {
    const validation = await validatePmApiKey(apiKey);
    if (!validation.ok) {
      throw new Error(`API Key 验证失败：${validation.message}。未写入配置。`);
    }
  }

  const envPath = getUserEnvPath(env);
  writeEnvFile(envPath, {
    PM_API_KEY: apiKey,
    PM_BASE_URL: 'http://pm.chaoxing.com',
  });
  // 立即清除内存中的明文引用用途之外的打印
  console.error(`已写入用户配置：${envPath}（权限尽量限制为当前用户）`);

  console.error('阶段：安装用户运行时...');
  const runtime = installRuntime(env, {
    skipNpm: options.skipNpm === true,
    packageRoot: options.skipNpm ? getPackageRoot() : undefined,
    version: readPackageVersion(),
  });
  console.error(`运行时就绪：${runtime.cliPath}`);

  if (clients.cursor) {
    console.error('阶段：配置 Cursor MCP...');
    const mcpPath = installCursorMcp({ cliPath: runtime.cliPath, env });
    console.error(`Cursor MCP 已更新：${mcpPath}`);
  }

  if (clients.codex) {
    console.error('阶段：配置 Codex MCP...');
    const result = installCodexMcp({ cliPath: runtime.cliPath, env });
    console.error(
      result.added
        ? 'Codex MCP 已注册 autotest-flow'
        : 'Codex MCP 已存在 autotest-flow，已跳过或已校正'
    );
  }

  console.error('阶段：安装 Skills...');
  installSkills(env);
  console.error('Skills 已安装到 Cursor 与 Codex 技能目录（仅更新 AutoTestFlow 自有 Skill）');

  // 确认不泄露
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
    clients,
  };
}
