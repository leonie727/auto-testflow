import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** 包根目录（mcp-server / 发布包根） */
export function getPackageRoot() {
  return path.resolve(__dirname, '../..');
}

/** 用户主目录（支持测试注入） */
export function getUserHome(env = process.env) {
  if (env.AUTOTEST_FLOW_TEST_HOME) {
    return path.resolve(env.AUTOTEST_FLOW_TEST_HOME);
  }
  if (env.HOME) {
    return path.resolve(env.HOME);
  }
  if (env.USERPROFILE) {
    return path.resolve(env.USERPROFILE);
  }
  return os.homedir();
}

export function getAutotestFlowHome(env = process.env) {
  if (env.AUTOTEST_FLOW_HOME) {
    return path.resolve(env.AUTOTEST_FLOW_HOME);
  }
  return path.join(getUserHome(env), '.autotest-flow');
}

export function getUserEnvPath(env = process.env) {
  return path.join(getAutotestFlowHome(env), '.env');
}

/** Task Context 根目录：~/.autotest-flow/contexts */
export function getContextsRoot(env = process.env) {
  return path.join(getAutotestFlowHome(env), 'contexts');
}

export function getRuntimePrefix(env = process.env) {
  return path.join(getAutotestFlowHome(env), 'runtime');
}

export function getRuntimePackageRoot(env = process.env) {
  return path.join(
    getRuntimePrefix(env),
    'node_modules',
    '@chaoxing',
    'autotest-flow'
  );
}

export function getStableCliPath(env = process.env) {
  return path.join(getRuntimePackageRoot(env), 'bin', 'autotest-flow.js');
}

export function getCursorConfigDir(env = process.env) {
  return path.join(getUserHome(env), '.cursor');
}

export function getCursorMcpPath(env = process.env) {
  return path.join(getCursorConfigDir(env), 'mcp.json');
}

export function getCursorSkillsDir(env = process.env) {
  return path.join(getCursorConfigDir(env), 'skills');
}

export function getCodexHome(env = process.env) {
  if (env.CODEX_HOME) {
    return path.resolve(env.CODEX_HOME);
  }
  return path.join(getUserHome(env), '.codex');
}

/** Codex 用户配置文件 */
export function getCodexConfigPath(env = process.env) {
  return path.join(getCodexHome(env), 'config.toml');
}

export function getCodexSkillsDir(env = process.env) {
  return path.join(getCodexHome(env), 'skills');
}

export function getPackageAssetsDir() {
  return path.join(getPackageRoot(), 'package-assets');
}

export function getDevProjectEnvPath() {
  return path.join(getPackageRoot(), '.env');
}

export function readPackageVersion() {
  const pkgPath = path.join(getPackageRoot(), 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  return pkg.version || '0.0.0';
}

export function getNpmRegistry(env = process.env) {
  return (
    env.AUTOTEST_FLOW_REGISTRY ||
    'http://npm.ans.chaoxing.com/'
  );
}
