import fs from 'node:fs';
import path from 'node:path';
import { getCodexHome } from './paths.js';

const SERVER_NAME = 'autotest-flow';
const TABLE_NAME = `mcp_servers.${SERVER_NAME}`;

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function getCodexConfigPath(env = process.env) {
  return path.join(getCodexHome(env), 'config.toml');
}

/**
 * @param {string} value
 */
function tomlQuote(value) {
  return JSON.stringify(String(value));
}

/**
 * 生成 autotest-flow 的 MCP 段（不含 PM_API_KEY）。
 * @param {string} cliPath
 */
export function buildAutotestFlowTomlSection(cliPath) {
  return [
    `[${TABLE_NAME}]`,
    `command = "node"`,
    `args = [${tomlQuote(cliPath)}, "mcp"]`,
    '',
  ].join('\n');
}

/**
 * 删除指定表及其子表，保留其余内容。
 * @param {string} content
 * @param {string} tableName
 */
export function removeTomlTable(content, tableName) {
  const lines = String(content || '').split(/\r?\n/);
  const result = [];
  let skipping = false;

  for (const line of lines) {
    const header = line.match(/^\[([^\]]+)\]\s*$/);
    if (header) {
      const name = header[1].trim();
      skipping = name === tableName || name.startsWith(`${tableName}.`);
      if (skipping) {
        continue;
      }
    }
    if (!skipping) {
      result.push(line);
    }
  }

  return result.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
}

/**
 * @param {string} content
 */
export function tomlHasAutotestFlow(content) {
  return new RegExp(
    `^\\[mcp_servers\\.${SERVER_NAME}(?:\\.[^\\]]+)?\\]\\s*$`,
    'm'
  ).test(String(content || ''));
}

/**
 * 安全合并 Codex config.toml：只更新 autotest-flow，保留其他配置。
 * @param {{ cliPath: string, env?: NodeJS.ProcessEnv }} options
 */
export function installCodexMcpToml(options) {
  const env = options.env || process.env;
  const configPath = getCodexConfigPath(env);
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });

  let content = '';
  let existed = false;
  if (fs.existsSync(configPath)) {
    content = fs.readFileSync(configPath, 'utf8');
    existed = tomlHasAutotestFlow(content);
    const backup = `${configPath}.bak.${Date.now()}`;
    fs.copyFileSync(configPath, backup);
  }

  const without = removeTomlTable(content, TABLE_NAME).trimEnd();
  const section = buildAutotestFlowTomlSection(options.cliPath).trimEnd();
  const next = without ? `${without}\n\n${section}\n` : `${section}\n`;

  if (next.includes('PM_API_KEY')) {
    throw new Error('Codex 配置异常：禁止写入 PM_API_KEY');
  }

  fs.writeFileSync(configPath, next, 'utf8');
  return {
    path: configPath,
    added: !existed,
    existed,
    mode: 'toml',
  };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function uninstallCodexMcpToml(env = process.env) {
  const configPath = getCodexConfigPath(env);
  if (!fs.existsSync(configPath)) {
    return { removed: false, path: configPath };
  }
  const content = fs.readFileSync(configPath, 'utf8');
  if (!tomlHasAutotestFlow(content)) {
    return { removed: false, path: configPath };
  }
  const backup = `${configPath}.bak.${Date.now()}`;
  fs.copyFileSync(configPath, backup);
  const next = removeTomlTable(content, TABLE_NAME);
  fs.writeFileSync(configPath, next.endsWith('\n') ? next : `${next}\n`, 'utf8');
  return { removed: true, path: configPath, backup };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function hasCodexMcpToml(env = process.env) {
  const configPath = getCodexConfigPath(env);
  if (!fs.existsSync(configPath)) {
    return false;
  }
  try {
    return tomlHasAutotestFlow(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return false;
  }
}
