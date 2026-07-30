#!/usr/bin/env node
/**
 * 仓库根目录 doctor 入口。通过 import.meta.url 定位 mcp-server。
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveLayoutFromImportMeta } from '../mcp-server/src/cli/layout.js';

async function main() {
  try {
    const layout = resolveLayoutFromImportMeta(import.meta.url);
    if (/mcp-server[\\/]+mcp-server/i.test(layout.mcpServerRoot)) {
      throw new Error(`错误路径：${layout.mcpServerRoot}`);
    }
    const sdkMarker = path.join(
      layout.mcpServerRoot,
      'node_modules',
      '@modelcontextprotocol',
      'sdk'
    );
    if (!fs.existsSync(sdkMarker)) {
      throw new Error('依赖未安装。请先在仓库根目录执行：npm run setup');
    }
    const doctorModule = path.join(layout.mcpServerRoot, 'src', 'cli', 'doctor.js');
    const { runDoctor } = await import(pathToFileURL(doctorModule).href);
    const cliPath = path.join(layout.mcpServerRoot, 'bin', 'autotest-flow.js');
    const result = await runDoctor({ cliPath });
    if (result.conclusion !== '安装正常') {
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`错误：${message}`);
    process.exitCode = 1;
  }
}

main();
