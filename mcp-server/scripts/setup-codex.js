import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MCP_ENTRY = path.resolve(__dirname, '../src/index.js');
const isWindows = process.platform === 'win32';
const CODEX_BIN = isWindows ? 'codex.cmd' : 'codex';

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ shell?: boolean }} [options]
 */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: Boolean(options.shell),
    windowsHide: true,
  });

  return {
    status: result.status,
    error: result.error,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

/**
 * Windows 下优先 codex.cmd；若直接 spawn 失败再回退 shell。
 * @param {string[]} args
 */
function runCodex(args) {
  let result = run(CODEX_BIN, args, { shell: false });
  if (result.error && isWindows) {
    result = run(CODEX_BIN, args, { shell: true });
  }
  return result;
}

/**
 * @param {{ status: number|null, error?: Error, stdout: string, stderr: string }} result
 * @param {string} fallback
 */
function fail(result, fallback) {
  const detail = (result.stderr || result.stdout || result.error?.message || '')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(0, 3)
    .join(' | ');
  console.error(detail ? `${fallback}：${detail}` : fallback);
  process.exit(1);
}

function main() {
  if (!fs.existsSync(MCP_ENTRY)) {
    console.error(`未找到 MCP 入口文件：${MCP_ENTRY}`);
    process.exit(1);
  }

  const versionResult = runCodex(['--version']);
  if (versionResult.error || versionResult.status !== 0) {
    fail(versionResult, '未检测到 Codex CLI，请先安装并确保可在终端执行');
  }
  console.error(`Codex CLI：${(versionResult.stdout || versionResult.stderr).trim()}`);

  const listResult = runCodex(['mcp', 'list']);
  if (listResult.error || listResult.status !== 0) {
    fail(listResult, '执行 codex mcp list 失败');
  }

  const listText = `${listResult.stdout}\n${listResult.stderr}`;
  if (/(^|[\s/\\`"'])autotest-flow([\s/\\`"']|$)/i.test(listText)) {
    console.error('已存在 MCP 配置：autotest-flow');
    console.error('不会重复注册，也不会修改你的现有 Codex MCP 配置。');
    console.error('如需重建，请先手动移除后再运行 npm run setup:codex。');
    return;
  }

  const addResult = runCodex([
    'mcp',
    'add',
    'autotest-flow',
    '--',
    'node',
    MCP_ENTRY,
  ]);

  if (addResult.error || addResult.status !== 0) {
    fail(addResult, '注册 Codex MCP（autotest-flow）失败');
  }

  console.error('已注册 Codex MCP：autotest-flow');
  console.error(`入口：${MCP_ENTRY}`);
  console.error('未写入 PM_API_KEY；密钥继续由 mcp-server/.env 本地加载。');
  console.error('请执行 codex mcp list 确认，并重启 Codex 后验证。');
}

main();
