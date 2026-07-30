#!/usr/bin/env node
/**
 * Codex 适配：委托统一 Codex MCP 安装（CLI 优先，否则合并 config.toml）。
 * 通过 import.meta.url 定位入口，不依赖 cwd。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installCodexMcp, hasCodexCli } from '../src/cli/codex-mcp.js';
import { sanitizeErrorMessage } from '../src/config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mcpServerRoot = path.resolve(__dirname, '..');
const cliPath = path.join(mcpServerRoot, 'bin', 'autotest-flow.js');

function main() {
  try {
    if (/mcp-server[\\/]+mcp-server/i.test(cliPath)) {
      throw new Error(`错误路径（mcp-server/mcp-server）：${cliPath}`);
    }
    if (!fs.existsSync(cliPath)) {
      throw new Error(`未找到 MCP CLI：${cliPath}`);
    }

    if (!hasCodexCli()) {
      console.error('未检测到 Codex CLI，将安全合并 ~/.codex/config.toml（或 CODEX_HOME）。');
    }

    const result = installCodexMcp({ cliPath });
    if (result.mode === 'toml') {
      console.error(
        result.added
          ? '已写入 Codex config.toml：autotest-flow'
          : '已更新 Codex config.toml：autotest-flow（保留其他配置）'
      );
    } else {
      console.error(
        result.added
          ? '已通过 Codex CLI 注册：autotest-flow'
          : 'Codex 已存在 autotest-flow，已跳过或已校正'
      );
    }
    console.error(`入口：${cliPath}`);
    console.error('未写入 PM_API_KEY；密钥由 ~/.autotest-flow/.env 或 mcp-server/.env 加载。');
  } catch (error) {
    console.error(`错误：${sanitizeErrorMessage(error)}`);
    process.exitCode = 1;
  }
}

main();
