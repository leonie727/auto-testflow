import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { installCursorMcp, uninstallCursorMcp, hasCursorMcp } from '../src/cli/cursor-mcp.js';
import { listHasAutotestFlow } from '../src/cli/codex-mcp.js';
import { writeEnvFile, readEnvFile } from '../src/cli/prompt.js';
import { runInstall } from '../src/cli/install.js';
import { runUninstall } from '../src/cli/uninstall.js';
import { validatePmApiKey } from '../src/cli/pm-validate.js';
import { getPackageRoot } from '../src/cli/paths.js';
import {
  quarantineConflictingPmFlow,
  hasPmFlowOverlap,
} from '../src/cli/skills-install.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.join(getPackageRoot(), 'bin', 'autotest-flow.js');

function makeTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'atf-home-'));
}

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('CLI help', () => {
  const result = runCli(['help']);
  assert.equal(result.status, 0);
  assert.match(result.stderr + result.stdout, /install/);
  assert.match(result.stderr + result.stdout, /doctor/);
});

test('CLI version', () => {
  const result = runCli(['version']);
  assert.equal(result.status, 0);
  assert.match((result.stderr + result.stdout).trim(), /^\d+\.\d+\.\d+/);
});

test('CLI unknown command', () => {
  const result = runCli(['not-a-command']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /未知命令/);
});

test('install 不覆盖已有 Cursor MCP 其他项', () => {
  const home = makeTempHome();
  const cursorDir = path.join(home, '.cursor');
  fs.mkdirSync(cursorDir, { recursive: true });
  const mcpPath = path.join(cursorDir, 'mcp.json');
  fs.writeFileSync(
    mcpPath,
    JSON.stringify(
      {
        mcpServers: {
          other: { command: 'node', args: ['other.js'] },
        },
      },
      null,
      2
    )
  );

  const cli = path.join(home, 'space path', 'autotest-flow.js');
  fs.mkdirSync(path.dirname(cli), { recursive: true });
  fs.writeFileSync(cli, '#!/usr/bin/env node\n');

  installCursorMcp({
    cliPath: cli,
    env: { AUTOTEST_FLOW_TEST_HOME: home },
  });

  const config = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
  assert.ok(config.mcpServers.other);
  assert.ok(config.mcpServers['autotest-flow']);
  assert.deepEqual(config.mcpServers['autotest-flow'].args[0], cli);
  assert.equal(config.mcpServers['autotest-flow'].args[1], 'mcp');
  assert.ok(!JSON.stringify(config).includes('PM_API_KEY'));
});

test('listHasAutotestFlow 识别已有 Codex 列表', () => {
  assert.equal(listHasAutotestFlow('autotest-flow  node /tmp/x mcp'), true);
  assert.equal(listHasAutotestFlow('context7\nplaywright'), false);
});

test('重复 install Cursor MCP 幂等且保留其他项', () => {
  const home = makeTempHome();
  const env = { AUTOTEST_FLOW_TEST_HOME: home };
  const cli = path.join(home, 'bin', 'autotest-flow.js');
  fs.mkdirSync(path.dirname(cli), { recursive: true });
  fs.writeFileSync(cli, 'console.log(1)\n');

  const mcpPath = path.join(home, '.cursor', 'mcp.json');
  fs.mkdirSync(path.dirname(mcpPath), { recursive: true });
  fs.writeFileSync(
    mcpPath,
    JSON.stringify({ mcpServers: { keepme: { command: 'echo' } } }, null, 2)
  );

  installCursorMcp({ cliPath: cli, env });
  installCursorMcp({ cliPath: cli, env });
  const config = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
  assert.ok(config.mcpServers.keepme);
  assert.ok(config.mcpServers['autotest-flow']);
  assert.equal(Object.keys(config.mcpServers).length, 2);
});

test('.env 已存在时 readEnvFile 不把内容打到断言消息外', () => {
  const home = makeTempHome();
  const envPath = path.join(home, '.autotest-flow', '.env');
  writeEnvFile(envPath, { PM_API_KEY: 'secret-value-should-not-log', PM_BASE_URL: 'http://pm.chaoxing.com' });
  const values = readEnvFile(envPath);
  assert.equal(values.PM_API_KEY, 'secret-value-should-not-log');
  // 测试本身不 console 输出该值
});

test('错误 API Key 验证失败', async () => {
  const result = await validatePmApiKey('definitely-invalid-key-000');
  assert.equal(result.ok, false);
});

test('uninstall 只删除自己的 Cursor MCP', () => {
  const home = makeTempHome();
  const env = { AUTOTEST_FLOW_TEST_HOME: home };
  const mcpPath = path.join(home, '.cursor', 'mcp.json');
  fs.mkdirSync(path.dirname(mcpPath), { recursive: true });
  fs.writeFileSync(
    mcpPath,
    JSON.stringify(
      {
        mcpServers: {
          keepme: { command: 'echo' },
          'autotest-flow': { command: 'node', args: ['x', 'mcp'] },
        },
      },
      null,
      2
    )
  );

  const result = uninstallCursorMcp(env);
  assert.equal(result.removed, true);
  const config = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
  assert.ok(config.mcpServers.keepme);
  assert.equal(config.mcpServers['autotest-flow'], undefined);
});

test('Windows 风格含空格路径可写入 MCP', () => {
  const home = makeTempHome();
  const spaced = path.join(home, 'My Tools', 'Auto Test', 'autotest-flow.js');
  fs.mkdirSync(path.dirname(spaced), { recursive: true });
  fs.writeFileSync(spaced, 'ok\n');
  installCursorMcp({
    cliPath: spaced,
    env: { AUTOTEST_FLOW_TEST_HOME: home },
  });
  assert.equal(hasCursorMcp({ AUTOTEST_FLOW_TEST_HOME: home }), true);
  const config = JSON.parse(
    fs.readFileSync(path.join(home, '.cursor', 'mcp.json'), 'utf8')
  );
  assert.equal(config.mcpServers['autotest-flow'].args[0], spaced);
});

test('install 拒绝 --api-key 参数', async () => {
  await assert.rejects(
    () => runInstall(['--api-key', 'abc'], { env: { AUTOTEST_FLOW_TEST_HOME: makeTempHome() } }),
    /不允许通过 --api-key/
  );
});

test('doctor CLI 不输出 PM_API_KEY 字面赋值', () => {
  const home = makeTempHome();
  const envPath = path.join(home, '.autotest-flow', '.env');
  writeEnvFile(envPath, { PM_API_KEY: 'doctor-secret-key-xyz', PM_BASE_URL: 'http://pm.chaoxing.com' });
  const result = runCli(['doctor'], {
    AUTOTEST_FLOW_TEST_HOME: home,
    AUTOTEST_FLOW_HOME: path.join(home, '.autotest-flow'),
  });
  const out = `${result.stdout}\n${result.stderr}`;
  assert.equal(out.includes('doctor-secret-key-xyz'), false);
  assert.match(out, /已配置|未配置|结论/);
});

test('共存 pm-flow 会被隔离出 skills 根目录', () => {
  const home = makeTempHome();
  const skillsRoot = path.join(home, '.codex', 'skills');
  fs.mkdirSync(path.join(skillsRoot, 'process-pm'), { recursive: true });
  fs.mkdirSync(path.join(skillsRoot, 'pm-flow'), { recursive: true });
  fs.writeFileSync(path.join(skillsRoot, 'process-pm', 'SKILL.md'), 'name: process-pm\n');
  fs.writeFileSync(path.join(skillsRoot, 'pm-flow', 'SKILL.md'), 'name: pm-flow\n');
  assert.equal(hasPmFlowOverlap(skillsRoot), true);
  const result = quarantineConflictingPmFlow(skillsRoot);
  assert.equal(result.quarantined, true);
  assert.equal(hasPmFlowOverlap(skillsRoot), false);
  assert.equal(fs.existsSync(path.join(skillsRoot, 'pm-flow', 'SKILL.md')), false);
  assert.equal(fs.existsSync(path.join(result.to, 'SKILL.md')), true);
});
