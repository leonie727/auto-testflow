import fs from 'node:fs';
import path from 'node:path';
import { getCursorMcpPath } from './paths.js';

/**
 * @param {string} filePath
 * @returns {object}
 */
export function readJsonFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content);
}

/**
 * 合并写入 Cursor MCP 配置，保留其他 server。
 * @param {{ cliPath: string, env?: NodeJS.ProcessEnv }} options
 */
export function installCursorMcp(options) {
  const env = options.env || process.env;
  const mcpPath = getCursorMcpPath(env);
  const dir = path.dirname(mcpPath);
  fs.mkdirSync(dir, { recursive: true });

  let config = { mcpServers: {} };
  if (fs.existsSync(mcpPath)) {
    try {
      config = readJsonFile(mcpPath);
    } catch (error) {
      const backup = `${mcpPath}.bak.${Date.now()}`;
      fs.copyFileSync(mcpPath, backup);
      throw new Error(
        `Cursor MCP 配置 JSON 格式错误：${mcpPath}。已备份到 ${backup}，请修复后再安装。`
      );
    }
  }

  if (!config || typeof config !== 'object') {
    config = {};
  }
  if (!config.mcpServers || typeof config.mcpServers !== 'object') {
    config.mcpServers = {};
  }

  if (fs.existsSync(mcpPath)) {
    const backup = `${mcpPath}.bak.${Date.now()}`;
    fs.copyFileSync(mcpPath, backup);
  }

  config.mcpServers['autotest-flow'] = {
    command: 'node',
    args: [options.cliPath, 'mcp'],
  };

  fs.writeFileSync(mcpPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return mcpPath;
}

/**
 * 仅移除 autotest-flow 条目。
 * @param {NodeJS.ProcessEnv} [env]
 */
export function uninstallCursorMcp(env = process.env) {
  const mcpPath = getCursorMcpPath(env);
  if (!fs.existsSync(mcpPath)) {
    return { removed: false, path: mcpPath };
  }

  let config;
  try {
    config = readJsonFile(mcpPath);
  } catch {
    throw new Error(`Cursor MCP 配置 JSON 格式错误：${mcpPath}`);
  }

  if (!config?.mcpServers?.['autotest-flow']) {
    return { removed: false, path: mcpPath };
  }

  const backup = `${mcpPath}.bak.${Date.now()}`;
  fs.copyFileSync(mcpPath, backup);
  delete config.mcpServers['autotest-flow'];
  fs.writeFileSync(mcpPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return { removed: true, path: mcpPath, backup };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function hasCursorMcp(env = process.env) {
  const mcpPath = getCursorMcpPath(env);
  if (!fs.existsSync(mcpPath)) {
    return false;
  }
  try {
    const config = readJsonFile(mcpPath);
    return Boolean(config?.mcpServers?.['autotest-flow']);
  } catch {
    return false;
  }
}
