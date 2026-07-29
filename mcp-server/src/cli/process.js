import { spawnSync } from 'node:child_process';
import os from 'node:os';

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ shell?: boolean, env?: NodeJS.ProcessEnv }} [options]
 */
export function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: Boolean(options.shell),
    windowsHide: true,
    env: options.env || process.env,
  });
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
  const isWindows = os.platform() === 'win32';
  if (isWindows) {
    const result = runCommand('where.exe', [name], { env, shell: false });
    return result.status === 0 && Boolean(result.stdout.trim());
  }
  const result = runCommand('which', [name], { env, shell: false });
  return result.status === 0 && Boolean(result.stdout.trim());
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function detectClients(env = process.env) {
  const cursor = commandExists('cursor', env);
  const codexBin = os.platform() === 'win32' ? 'codex.cmd' : 'codex';
  let codex = commandExists(codexBin, env) || commandExists('codex', env);
  return { cursor, codex };
}

/**
 * @param {string[]} args
 * @param {NodeJS.ProcessEnv} [env]
 */
export function runCodex(args, env = process.env) {
  const isWindows = os.platform() === 'win32';
  const bin = isWindows ? 'codex.cmd' : 'codex';
  let result = runCommand(bin, args, { env, shell: false });
  if (result.error && isWindows) {
    result = runCommand(bin, args, { env, shell: true });
  }
  return result;
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
  return out;
}
