#!/usr/bin/env node
/**
 * 仓库根目录一键安装入口。
 * 先按 import.meta.url 定位并安装依赖，再动态加载 setup（避免未 install 时无法启动）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolveLayoutFromImportMeta } from '../mcp-server/src/cli/layout.js';

/**
 * Windows 避免直接 spawn npm.cmd（Node CVE 后会 EINVAL / DEP0190）。
 * 优先 node + npm-cli.js，始终 shell:false。
 */
function runNpmInstall(cwd) {
  const npmCli = path.join(
    path.dirname(process.execPath),
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js'
  );
  if (fs.existsSync(npmCli)) {
    return spawnSync(process.execPath, [npmCli, 'install'], {
      cwd,
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
      stdio: 'inherit',
    });
  }

  if (process.platform === 'win32') {
    const comSpec = process.env.ComSpec || 'cmd.exe';
    return spawnSync(comSpec, ['/d', '/s', '/c', '"npm.cmd" install'], {
      cwd,
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
      stdio: 'inherit',
    });
  }

  return spawnSync('npm', ['install'], {
    cwd,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    stdio: 'inherit',
  });
}

function ensureDeps(mcpServerRoot) {
  const marker = path.join(mcpServerRoot, 'node_modules', '@modelcontextprotocol', 'sdk');
  const inquirer = path.join(mcpServerRoot, 'node_modules', '@inquirer', 'prompts');
  if (fs.existsSync(marker) && fs.existsSync(inquirer)) {
    return;
  }
  console.error('阶段：安装依赖（首次或依赖缺失）...');
  const result = runNpmInstall(mcpServerRoot);
  if (result.error || result.status !== 0) {
    console.error('错误：mcp-server 依赖安装失败。请检查网络与 npm 源后重试。');
    process.exit(1);
  }
}

async function main() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) {
    console.error(`错误：需要 Node.js >= 20，当前为 ${process.version}`);
    process.exit(1);
  }

  let layout;
  try {
    layout = resolveLayoutFromImportMeta(import.meta.url);
  } catch (error) {
    console.error(`错误：${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  if (/mcp-server[\\/]+mcp-server/i.test(layout.mcpServerRoot)) {
    console.error(`错误：检测到错误路径 ${layout.mcpServerRoot}`);
    process.exit(1);
  }

  ensureDeps(layout.mcpServerRoot);

  const setupModule = path.join(layout.mcpServerRoot, 'src', 'cli', 'setup.js');
  const { runSetupFromScript } = await import(pathToFileURL(setupModule).href);
  try {
    await runSetupFromScript(import.meta.url, process.argv.slice(2), {
      mcpServerRoot: layout.mcpServerRoot,
      repoRoot: layout.repoRoot,
    });
  } catch {
    process.exitCode = 1;
  }
}

main();
