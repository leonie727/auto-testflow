import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 根据任意安装脚本的 import.meta.url 定位仓库根与 mcp-server，
 * 不依赖 process.cwd()，避免出现 mcp-server/mcp-server。
 *
 * @param {string|URL} importMetaUrl
 * @returns {{ repoRoot: string, mcpServerRoot: string, scriptDir: string }}
 */
export function resolveLayoutFromImportMeta(importMetaUrl) {
  const scriptPath = fileURLToPath(importMetaUrl);
  const scriptDir = path.dirname(scriptPath);
  const parent = path.resolve(scriptDir, '..');
  const parentPkg = path.join(parent, 'package.json');

  // 情况 A：脚本位于 mcp-server/scripts/
  if (looksLikeMcpServerRoot(parent)) {
    const mcpServerRoot = parent;
    const repoRoot = path.resolve(mcpServerRoot, '..');
    return { repoRoot, mcpServerRoot, scriptDir };
  }

  // 情况 B：脚本位于仓库根 scripts/
  const mcpFromRepo = path.join(parent, 'mcp-server');
  if (looksLikeMcpServerRoot(mcpFromRepo)) {
    return { repoRoot: parent, mcpServerRoot: mcpFromRepo, scriptDir };
  }

  // 情况 C：脚本位于更深路径，向上查找
  let cursor = scriptDir;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(cursor, 'mcp-server');
    if (looksLikeMcpServerRoot(candidate)) {
      return { repoRoot: cursor, mcpServerRoot: candidate, scriptDir };
    }
    if (looksLikeMcpServerRoot(cursor)) {
      return {
        repoRoot: path.resolve(cursor, '..'),
        mcpServerRoot: cursor,
        scriptDir,
      };
    }
    const next = path.resolve(cursor, '..');
    if (next === cursor) {
      break;
    }
    cursor = next;
  }

  throw new Error(
    `无法根据脚本位置定位 mcp-server（脚本：${scriptPath}，父目录 package：${parentPkg}）。请从仓库根执行 npm run setup。`
  );
}

/**
 * @param {string} dir
 */
function looksLikeMcpServerRoot(dir) {
  if (!dir || !fs.existsSync(dir)) {
    return false;
  }
  const pkgPath = path.join(dir, 'package.json');
  const binPath = path.join(dir, 'bin', 'autotest-flow.js');
  if (!fs.existsSync(pkgPath) || !fs.existsSync(binPath)) {
    return false;
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.name === '@chaoxing/autotest-flow';
  } catch {
    return false;
  }
}

/**
 * 规范化绝对路径，避免 Windows 下重复拼接。
 * @param {string} base
 * @param {...string} parts
 */
export function joinSafe(base, ...parts) {
  return path.normalize(path.join(base, ...parts));
}
