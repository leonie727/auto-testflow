#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPackageVersion } from '../src/cli/paths.js';
import { sanitizeErrorMessage, loadEnvFile } from '../src/config/env.js';
import { runInstall } from '../src/cli/install.js';
import { runDoctor } from '../src/cli/doctor.js';
import { runUninstall } from '../src/cli/uninstall.js';
import { runUpdate } from '../src/cli/update.js';
import { runMcp } from '../src/cli/mcp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function printHelp() {
  const version = safeVersion();
  console.error(`AutoTestFlow CLI v${version}

用法:
  autotest-flow <command>

命令:
  install     安装到 Cursor / Codex（交互输入 PM_API_KEY）
  doctor      检查安装与连通性
  update      更新运行时与配置
  uninstall   卸载 AutoTestFlow 自身 MCP/Skills
  mcp         启动 MCP Server（stdio，供客户端调用）
  help        显示帮助
  version     显示版本

组员安装示例:
  仓库根目录: npm run setup
  或: npx --yes --registry=http://npm.ans.chaoxing.com/ @chaoxing/autotest-flow@beta install
`);
}

function safeVersion() {
  try {
    return readPackageVersion();
  } catch {
    return '0.1.0';
  }
}

async function main() {
  const [, , command, ...rest] = process.argv;

  if (!command || command === 'help' || command === '-h' || command === '--help') {
    printHelp();
    return;
  }

  if (command === 'version' || command === '-v' || command === '--version') {
    console.error(safeVersion());
    return;
  }

  try {
    switch (command) {
      case 'install':
        await runInstall(rest);
        break;
      case 'doctor':
        await runDoctor();
        break;
      case 'update':
        await runUpdate(rest);
        break;
      case 'uninstall':
        await runUninstall(rest);
        break;
      case 'mcp':
        loadEnvFile();
        await runMcp();
        break;
      default:
        console.error(`未知命令：${command}`);
        console.error('执行 autotest-flow help 查看可用命令。');
        process.exitCode = 1;
    }
  } catch (error) {
    console.error(`错误：${sanitizeErrorMessage(error)}`);
    process.exitCode = 1;
  }
}

main();
