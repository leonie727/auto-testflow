import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Windows 下可执行文件名（.cmd），其他平台原名。
 * @param {'npm'|'npx'|'codex'} name
 */
export function resolveToolBin(name) {
  const isWindows = os.platform() === 'win32';
  if (!isWindows) {
    return name;
  }
  if (name === 'npm') {
    return 'npm.cmd';
  }
  if (name === 'npx') {
    return 'npx.cmd';
  }
  if (name === 'codex') {
    return 'codex.cmd';
  }
  return name;
}

/**
 * @param {string} filePath
 */
function isCmdOrBat(filePath) {
  return /\.(cmd|bat)$/i.test(filePath);
}

/**
 * 为 cmd.exe /c 转义单个参数（不拼接未转义用户输入）。
 * @param {string} arg
 */
export function escapeCmdArgument(arg) {
  const text = String(arg);
  if (!text.length) {
    return '""';
  }
  if (!/[ \t"]/g.test(text) && !/[&<>^|!()%]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * 在 PATH 中查找可执行文件（Windows 用 where.exe）。
 * @param {string} name
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string|null}
 */
export function whichCommand(name, env = process.env) {
  const isWindows = os.platform() === 'win32';
  if (isWindows) {
    const result = spawnSync('where.exe', [name], {
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
      env,
    });
    if (result.status !== 0) {
      return null;
    }
    const first = String(result.stdout || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    return first || null;
  }
  const result = spawnSync('which', [name], {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    env,
  });
  if (result.status !== 0) {
    return null;
  }
  return String(result.stdout || '').trim() || null;
}

/**
 * 优先用 node + npm-cli.js / npx-cli.js，彻底避开 .cmd + shell。
 * @param {'npm'|'npx'} name
 * @returns {{ command: string, argsPrefix: string[] }|null}
 */
function resolveNpmViaNode(name) {
  const cliName = name === 'npx' ? 'npx-cli.js' : 'npm-cli.js';
  const candidate = path.join(
    path.dirname(process.execPath),
    'node_modules',
    'npm',
    'bin',
    cliName
  );
  if (fs.existsSync(candidate)) {
    return { command: process.execPath, argsPrefix: [candidate] };
  }
  return null;
}

/**
 * 将 Windows 上的 codex.cmd 解析为 node + codex.js。
 * @param {string} cmdPath
 * @returns {{ command: string, argsPrefix: string[] }|null}
 */
function resolveCodexViaNode(cmdPath) {
  try {
    const content = fs.readFileSync(cmdPath, 'utf8');
    const match = content.match(/%dp0%\\([^\s"']+codex\.js)/i);
    if (!match) {
      return null;
    }
    const jsPath = path.resolve(path.dirname(cmdPath), match[1]);
    if (!fs.existsSync(jsPath)) {
      return null;
    }
    return { command: process.execPath, argsPrefix: [jsPath] };
  } catch {
    return null;
  }
}

/**
 * 解析工具为「真实可执行文件 + 参数前缀」，Windows 下尽量避开直接 spawn .cmd。
 * @param {'npm'|'npx'|'codex'|string} name
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveSpawnTarget(name, env = process.env) {
  if (name === 'npm' || name === 'npx') {
    const viaNode = resolveNpmViaNode(name);
    if (viaNode) {
      return viaNode;
    }
  }

  const bin = name === 'npm' || name === 'npx' || name === 'codex'
    ? resolveToolBin(name)
    : name;
  const located = whichCommand(bin, env) || whichCommand(name, env);
  const command = located || bin;

  if (os.platform() === 'win32' && name === 'codex' && located && isCmdOrBat(located)) {
    const viaNode = resolveCodexViaNode(located);
    if (viaNode) {
      return viaNode;
    }
  }

  return { command, argsPrefix: [] };
}

/**
 * 统一 spawnSync：始终 shell:false。
 * Windows 若目标仍是 .cmd/.bat，则通过 ComSpec /d /s /c 执行（参数逐个转义，不触发 DEP0190）。
 *
 * @param {string} command
 * @param {string[]} args
 * @param {{ env?: NodeJS.ProcessEnv, cwd?: string, stdio?: import('node:child_process').StdioOptions }} [options]
 */
export function runCommand(command, args, options = {}) {
  const env = options.env || process.env;
  let spawnCommand = command;
  let spawnArgs = args;
  /** @type {import('node:child_process').SpawnSyncOptionsWithStringEncoding} */
  const spawnOptions = {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    env,
    cwd: options.cwd,
    stdio: options.stdio,
  };

  if (os.platform() === 'win32' && isCmdOrBat(command)) {
    const comSpec = env.ComSpec || process.env.ComSpec || 'cmd.exe';
    const commandLine = [escapeCmdArgument(command), ...args.map(escapeCmdArgument)].join(' ');
    spawnCommand = comSpec;
    spawnArgs = ['/d', '/s', '/c', commandLine];
  }

  const result = spawnSync(spawnCommand, spawnArgs, spawnOptions);
  return {
    status: result.status,
    error: result.error,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

/**
 * @param {string} name
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function commandExists(name, env = process.env) {
  return Boolean(whichCommand(name, env));
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function detectClients(env = process.env) {
  const cursor = commandExists('cursor', env);
  const codexBin = resolveToolBin('codex');
  const codex = commandExists(codexBin, env) || commandExists('codex', env);
  return { cursor, codex };
}

/**
 * @param {string[]} args
 * @param {NodeJS.ProcessEnv} [env]
 */
export function runCodex(args, env = process.env) {
  const target = resolveSpawnTarget('codex', env);
  return runCommand(target.command, [...target.argsPrefix, ...args], { env });
}

/**
 * @param {string[]} args
 * @param {{ env?: NodeJS.ProcessEnv, cwd?: string, stdio?: import('node:child_process').StdioOptions }} [options]
 */
export function runNpm(args, options = {}) {
  const env = options.env || process.env;
  const target = resolveSpawnTarget('npm', env);
  return runCommand(target.command, [...target.argsPrefix, ...args], options);
}

/**
 * @param {string[]} args
 * @param {{ env?: NodeJS.ProcessEnv, cwd?: string, stdio?: import('node:child_process').StdioOptions }} [options]
 */
export function runNpx(args, options = {}) {
  const env = options.env || process.env;
  const target = resolveSpawnTarget('npx', env);
  return runCommand(target.command, [...target.argsPrefix, ...args], options);
}

/**
 * 从错误输出中移除可能的密钥片段。
 * @param {string} text
 * @param {string} [secret]
 */
export function redact(text, secret) {
  let out = String(text || '');
  if (secret) {
    out = out.split(secret).join('[REDACTED]');
  }
  out = out.replace(/PM_API_KEY\s*=\s*\S+/gi, 'PM_API_KEY=[REDACTED]');
  out = out.replace(/X-Redmine-API-Key\s*[:=]\s*\S+/gi, 'X-Redmine-API-Key=[REDACTED]');
  return out;
}
