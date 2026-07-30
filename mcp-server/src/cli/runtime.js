import fs from 'node:fs';
import path from 'node:path';
import { runNpm, redact } from './process.js';
import {
  getRuntimePrefix,
  getRuntimePackageRoot,
  getStableCliPath,
  getNpmRegistry,
  readPackageVersion,
} from './paths.js';

/**
 * 将当前包版本安装到用户 runtime 目录（非全局）。
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ version?: string, skipNpm?: boolean, packageRoot?: string }} [options]
 */
export function installRuntime(env = process.env, options = {}) {
  const prefix = getRuntimePrefix(env);
  fs.mkdirSync(prefix, { recursive: true });

  const version = options.version || readPackageVersion();
  const registry = getNpmRegistry(env);
  const packageSpec = `@chaoxing/autotest-flow@${version}`;

  if (options.skipNpm && options.packageRoot) {
    // 测试/离线：直接复制当前包到 runtime 结构
    const target = getRuntimePackageRoot(env);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
    copyPackage(options.packageRoot, target);
    return { prefix, cliPath: getStableCliPath(env), mode: 'copy' };
  }

  const result = runNpm(
    [
      'install',
      '--prefix',
      prefix,
      '--omit=dev',
      `--registry=${registry}`,
      packageSpec,
    ],
    { env }
  );

  if (result.error || result.status !== 0) {
    throw new Error(
      `运行时安装失败（阶段：npm install --prefix runtime）：${redact(
        result.stderr || result.stdout || result.error?.message
      )}`
    );
  }

  const cliPath = getStableCliPath(env);
  if (!fs.existsSync(cliPath)) {
    throw new Error(`运行时安装后未找到 CLI：${cliPath}`);
  }

  return { prefix, cliPath, mode: 'npm' };
}

/**
 * @param {string} src
 * @param {string} dest
 */
function copyPackage(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.env') {
      continue;
    }
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyPackage(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function runtimeExists(env = process.env) {
  return fs.existsSync(getStableCliPath(env));
}
