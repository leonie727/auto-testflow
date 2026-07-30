import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

/**
 * 解析 .env 文本为对象（不打印值）。
 * @param {string} content
 * @returns {Record<string, string>}
 */
export function parseEnvContent(content) {
  const result = {};
  for (const rawLine of String(content || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) {
      continue;
    }
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * 将 KEY=VALUE 写入 .env（覆盖写）。
 * @param {string} filePath
 * @param {Record<string, string>} values
 */
export function writeEnvFile(filePath, values) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Windows 等平台可能不支持 chmod，忽略
  }
}

/**
 * 合并写入 .env：保留未提及的键。
 * @param {string} filePath
 * @param {Record<string, string>} values
 */
export function mergeEnvFile(filePath, values) {
  const current = readEnvFile(filePath);
  writeEnvFile(filePath, { ...current, ...values });
}

/**
 * @param {string} filePath
 * @returns {Record<string, string>}
 */
export function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  return parseEnvContent(fs.readFileSync(filePath, 'utf8'));
}

/**
 * 将 env 文件加载到 process.env（不覆盖已有键）。
 * @param {string} filePath
 */
export function applyEnvFile(filePath) {
  const values = readEnvFile(filePath);
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * 优先使用 @inquirer/prompts；不可用时回退到本地实现。
 * @returns {Promise<{ password: Function, confirm: Function }|null>}
 */
async function loadInquirer() {
  try {
    const mod = await import('@inquirer/prompts');
    return {
      password: mod.password,
      confirm: mod.confirm,
    };
  } catch {
    return null;
  }
}

/**
 * 密码式输入：隐藏输入内容。不通过命令行参数传递。
 * @param {string} message
 * @returns {Promise<string>}
 */
export async function promptSecret(message) {
  const inquirer = await loadInquirer();
  if (inquirer?.password && process.stdin.isTTY) {
    const value = await inquirer.password({
      message: message.replace(/:\s*$/, ''),
      mask: '*',
    });
    return String(value || '').trim();
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });
    return new Promise((resolve) => {
      rl.question(`${message}`, (answer) => {
        rl.close();
        resolve(String(answer || '').trim());
      });
    });
  }

  return promptSecretRaw(message);
}

/**
 * @param {string} message
 * @returns {Promise<string>}
 */
function promptSecretRaw(message) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    stdout.write(message.endsWith(' ') ? message : `${message} `);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.removeListener('data', onData);
    };

    const onData = (char) => {
      if (char === '\n' || char === '\r' || char === '\u0004') {
        cleanup();
        stdout.write('\n');
        resolve(value.trim());
        return;
      }
      if (char === '\u0003') {
        cleanup();
        stdout.write('\n');
        reject(new Error('已取消输入'));
        return;
      }
      if (char === '\u007f' || char === '\b') {
        if (value.length > 0) {
          value = value.slice(0, -1);
          stdout.write('\b \b');
        }
        return;
      }
      if (char === '\u0015') {
        while (value.length > 0) {
          value = value.slice(0, -1);
          stdout.write('\b \b');
        }
        return;
      }
      value += char;
      stdout.write('*');
    };

    stdin.on('data', onData);
  });
}

/**
 * @param {string} message
 * @param {boolean} defaultYes
 * @returns {Promise<boolean>}
 */
export async function promptConfirm(message, defaultYes = true) {
  const inquirer = await loadInquirer();
  if (inquirer?.confirm && process.stdin.isTTY) {
    return Boolean(
      await inquirer.confirm({
        message,
        default: defaultYes,
      })
    );
  }

  const hint = defaultYes ? 'Y/n' : 'y/N';
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await new Promise((resolve) => {
    rl.question(`${message} (${hint}): `, (value) => {
      rl.close();
      resolve(String(value || '').trim().toLowerCase());
    });
  });
  if (!answer) {
    return defaultYes;
  }
  return answer === 'y' || answer === 'yes';
}
