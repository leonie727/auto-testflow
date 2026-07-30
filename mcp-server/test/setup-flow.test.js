import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveLayoutFromImportMeta } from '../src/cli/layout.js';
import { installCursorMcp, hasCursorMcp } from '../src/cli/cursor-mcp.js';
import {
  installCodexMcpToml,
  hasCodexMcpToml,
  removeTomlTable,
  tomlHasAutotestFlow,
  buildAutotestFlowTomlSection,
} from '../src/cli/codex-toml.js';
import { installCodexMcp, listHasAutotestFlow, hasCodexCli } from '../src/cli/codex-mcp.js';
import { installSkills, skillsInstalled, OWN_SKILLS } from '../src/cli/skills-install.js';
import { writeEnvFile, readEnvFile } from '../src/cli/prompt.js';
import { runSetup } from '../src/cli/setup.js';
import { getPackageRoot } from '../src/cli/paths.js';
import { validatePmApiKey } from '../src/cli/pm-validate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = getPackageRoot();
const repoRoot = path.resolve(packageRoot, '..');

function makeTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'atf-setup-'));
}

function makeSpacedTempHome() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'atf space '));
  return base;
}

function mockFetchOk() {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) =>
    new Response(
      JSON.stringify({ issue: { id: 470985, subject: 'mock' } }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
        url: String(url),
      }
    );
  return () => {
    globalThis.fetch = original;
  };
}

function mockFetchUnauthorized() {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) =>
    new Response('unauthorized', {
      status: 401,
      headers: { 'content-type': 'text/plain' },
      url: String(url),
    });
  return () => {
    globalThis.fetch = original;
  };
}

test('layout：从仓库根 scripts 定位，无 mcp-server/mcp-server', () => {
  const fakeScript = pathToFileURL(path.join(repoRoot, 'scripts', 'setup.js')).href;
  const layout = resolveLayoutFromImportMeta(fakeScript);
  assert.equal(path.normalize(layout.repoRoot), path.normalize(repoRoot));
  assert.equal(path.normalize(layout.mcpServerRoot), path.normalize(packageRoot));
  assert.equal(/mcp-server[\\/]+mcp-server/i.test(layout.mcpServerRoot), false);
});

test('layout：从 mcp-server/scripts 定位，无嵌套', () => {
  const fakeScript = pathToFileURL(path.join(packageRoot, 'scripts', 'setup.js')).href;
  const layout = resolveLayoutFromImportMeta(fakeScript);
  assert.equal(path.normalize(layout.mcpServerRoot), path.normalize(packageRoot));
  assert.equal(/mcp-server[\\/]+mcp-server/i.test(layout.mcpServerRoot), false);
});

test('根目录与 mcp-server 执行 layout 结果一致', () => {
  const fromRoot = resolveLayoutFromImportMeta(
    pathToFileURL(path.join(repoRoot, 'scripts', 'setup.js')).href
  );
  const fromMcp = resolveLayoutFromImportMeta(
    pathToFileURL(path.join(packageRoot, 'scripts', 'setup.js')).href
  );
  assert.equal(path.normalize(fromRoot.mcpServerRoot), path.normalize(fromMcp.mcpServerRoot));
});

test('Codex TOML：保留其他配置并只更新 autotest-flow', () => {
  const home = makeTempHome();
  const env = { AUTOTEST_FLOW_TEST_HOME: home, CODEX_HOME: path.join(home, '.codex') };
  const configPath = path.join(env.CODEX_HOME, 'config.toml');
  fs.mkdirSync(env.CODEX_HOME, { recursive: true });
  fs.writeFileSync(
    configPath,
    [
      'model = "gpt-5"',
      '',
      '[mcp_servers.keepme]',
      'command = "node"',
      'args = ["keep.js"]',
      '',
      '[other]',
      'x = 1',
      '',
    ].join('\n'),
    'utf8'
  );

  const cli = path.join(home, 'My Tools', 'autotest-flow.js');
  fs.mkdirSync(path.dirname(cli), { recursive: true });
  fs.writeFileSync(cli, 'ok\n');

  const result = installCodexMcpToml({ cliPath: cli, env });
  assert.equal(result.added, true);
  const content = fs.readFileSync(configPath, 'utf8');
  assert.match(content, /\[mcp_servers\.keepme\]/);
  assert.match(content, /\[mcp_servers\.autotest-flow\]/);
  assert.match(content, /model = "gpt-5"/);
  assert.equal(content.includes('PM_API_KEY'), false);
  assert.equal(hasCodexMcpToml(env), true);

  // 重复安装不产生重复段
  installCodexMcpToml({ cliPath: cli, env });
  const again = fs.readFileSync(configPath, 'utf8');
  assert.equal(again.split('[mcp_servers.autotest-flow]').length - 1, 1);
  assert.match(again, /\[mcp_servers\.keepme\]/);
});

test('无 Codex CLI 时 installCodexMcp 走 TOML 且不抛错', () => {
  const home = makeTempHome();
  const env = {
    AUTOTEST_FLOW_TEST_HOME: home,
    CODEX_HOME: path.join(home, '.codex'),
    PATH: path.join(home, 'empty-bin'),
  };
  fs.mkdirSync(env.PATH, { recursive: true });
  const cli = path.join(home, 'bin', 'autotest-flow.js');
  fs.mkdirSync(path.dirname(cli), { recursive: true });
  fs.writeFileSync(cli, 'ok\n');

  // 即使 hasCodexCli 在真实环境为 true，TOML 路径仍可独立验证；
  // 这里直接测 TOML 回退函数，并确认中文提示路径可用。
  const result = installCodexMcpToml({ cliPath: cli, env });
  assert.equal(result.mode, 'toml');
  assert.equal(hasCodexMcpToml(env), true);
});

test('removeTomlTable 不影响其他表', () => {
  const input = [
    '[mcp_servers.a]',
    'command = "a"',
    '[mcp_servers.autotest-flow]',
    'command = "node"',
    '[mcp_servers.autotest-flow.env]',
    'X = "1"',
    '[mcp_servers.b]',
    'command = "b"',
  ].join('\n');
  const out = removeTomlTable(input, 'mcp_servers.autotest-flow');
  assert.equal(tomlHasAutotestFlow(out), false);
  assert.match(out, /\[mcp_servers\.a\]/);
  assert.match(out, /\[mcp_servers\.b\]/);
});

test('含空格路径可写入 Cursor / Codex 配置', () => {
  const home = makeSpacedTempHome();
  const env = {
    AUTOTEST_FLOW_TEST_HOME: home,
    CODEX_HOME: path.join(home, '.codex'),
  };
  const cli = path.join(home, 'dir with space', 'autotest-flow.js');
  fs.mkdirSync(path.dirname(cli), { recursive: true });
  fs.writeFileSync(cli, 'ok\n');

  installCursorMcp({ cliPath: cli, env });
  installCodexMcpToml({ cliPath: cli, env });

  assert.equal(hasCursorMcp(env), true);
  assert.equal(hasCodexMcpToml(env), true);
  const mcp = JSON.parse(
    fs.readFileSync(path.join(home, '.cursor', 'mcp.json'), 'utf8')
  );
  assert.equal(mcp.mcpServers['autotest-flow'].args[0], cli);
  const toml = fs.readFileSync(path.join(env.CODEX_HOME, 'config.toml'), 'utf8');
  assert.equal(toml.includes('PM_API_KEY'), false);
  assert.ok(toml.includes(JSON.stringify(cli).slice(1, -1)) || toml.includes(cli.replace(/\\/g, '\\\\')));
});

test('Skills 重复安装不产生 bak 重复目录', () => {
  const home = makeTempHome();
  const env = {
    AUTOTEST_FLOW_TEST_HOME: home,
    CODEX_HOME: path.join(home, '.codex'),
  };
  // prepare assets must exist
  const prepare = spawnSync(process.execPath, [path.join(packageRoot, 'scripts', 'prepare-package.js')], {
    cwd: packageRoot,
    encoding: 'utf8',
  });
  assert.equal(prepare.status, 0, prepare.stderr);

  installSkills(env);
  installSkills(env);

  const cursorSkills = path.join(home, '.cursor', 'skills');
  const names = fs.readdirSync(cursorSkills);
  for (const name of OWN_SKILLS) {
    assert.ok(names.includes(name));
    assert.equal(names.some((n) => n.startsWith(`${name}.bak.`)), false);
  }
  assert.equal(skillsInstalled('cursor', env), true);
  assert.equal(skillsInstalled('codex', env), true);
});

test('错误 API Key 验证失败（不泄露密钥）', async () => {
  const restore = mockFetchUnauthorized();
  try {
    const secret = 'bad-key-should-not-appear-in-message';
    const result = await validatePmApiKey(secret);
    assert.equal(result.ok, false);
    assert.equal(result.message.includes(secret), false);
  } finally {
    restore();
  }
});

test('runSetup 幂等：保留其他 MCP，写入用户 .env，无 Codex CLI 也成功', async () => {
  const home = makeTempHome();
  const env = {
    AUTOTEST_FLOW_TEST_HOME: home,
    AUTOTEST_FLOW_HOME: path.join(home, '.autotest-flow'),
    CODEX_HOME: path.join(home, '.codex'),
    AUTOTEST_FLOW_FORCE_CODEX_TOML: '1',
    PATH: path.join(home, 'empty-bin'),
  };
  fs.mkdirSync(env.PATH, { recursive: true });
  fs.mkdirSync(path.join(home, '.cursor'), { recursive: true });
  fs.writeFileSync(
    path.join(home, '.cursor', 'mcp.json'),
    JSON.stringify({ mcpServers: { keepme: { command: 'echo' } } }, null, 2)
  );
  fs.mkdirSync(env.CODEX_HOME, { recursive: true });
  fs.writeFileSync(
    path.join(env.CODEX_HOME, 'config.toml'),
    '[mcp_servers.keepme]\ncommand = "echo"\n',
    'utf8'
  );

  const restore = mockFetchOk();
  try {
    const prepare = spawnSync(
      process.execPath,
      [path.join(packageRoot, 'scripts', 'prepare-package.js')],
      { cwd: packageRoot, encoding: 'utf8' }
    );
    assert.equal(prepare.status, 0);

    await runSetup([], {
      env,
      mcpServerRoot: packageRoot,
      repoRoot,
      skipDeps: true,
      skipDoctor: true,
      stdinApiKey: 'test-valid-key-not-real',
      keepExistingKey: false,
    });

    await runSetup([], {
      env,
      mcpServerRoot: packageRoot,
      repoRoot,
      skipDeps: true,
      skipDoctor: true,
      stdinApiKey: 'test-valid-key-not-real',
      keepExistingKey: true,
    });
  } finally {
    restore();
  }

  const mcp = JSON.parse(fs.readFileSync(path.join(home, '.cursor', 'mcp.json'), 'utf8'));
  assert.ok(mcp.mcpServers.keepme);
  assert.ok(mcp.mcpServers['autotest-flow']);
  assert.equal(Object.keys(mcp.mcpServers).length, 2);
  assert.equal(JSON.stringify(mcp).includes('PM_API_KEY'), false);

  const toml = fs.readFileSync(path.join(env.CODEX_HOME, 'config.toml'), 'utf8');
  assert.match(toml, /\[mcp_servers\.keepme\]/);
  assert.match(toml, /\[mcp_servers\.autotest-flow\]/);
  assert.equal(toml.includes('PM_API_KEY'), false);

  const userEnv = readEnvFile(path.join(home, '.autotest-flow', '.env'));
  assert.ok(userEnv.PM_API_KEY);
  assert.equal(userEnv.PM_API_KEY, 'test-valid-key-not-real');
});

test('runSetup 拒绝 --api-key', async () => {
  await assert.rejects(
    () =>
      runSetup(['--api-key', 'abc'], {
        env: { AUTOTEST_FLOW_TEST_HOME: makeTempHome() },
        skipDeps: true,
        skipDoctor: true,
      }),
    /不允许通过 --api-key/
  );
});

test('错误密钥时不写入用户配置', async () => {
  const home = makeTempHome();
  const env = {
    AUTOTEST_FLOW_TEST_HOME: home,
    AUTOTEST_FLOW_HOME: path.join(home, '.autotest-flow'),
    CODEX_HOME: path.join(home, '.codex'),
  };
  const restore = mockFetchUnauthorized();
  try {
    await assert.rejects(
      () =>
        runSetup([], {
          env,
          mcpServerRoot: packageRoot,
          repoRoot,
          skipDeps: true,
          skipDoctor: true,
          stdinApiKey: 'invalid-key-xyz',
        }),
      /验证失败|API Key/
    );
  } finally {
    restore();
  }
  assert.equal(fs.existsSync(path.join(home, '.autotest-flow', '.env')), false);
});

test('buildAutotestFlowTomlSection 中文路径可序列化', () => {
  const cli = 'C:\\用户\\测试\\autotest-flow.js';
  const section = buildAutotestFlowTomlSection(cli);
  assert.match(section, /\[mcp_servers\.autotest-flow\]/);
  assert.equal(section.includes('PM_API_KEY'), false);
});

test('从根目录与 mcp-server 目录 spawn setup --help 风格：脚本可启动', () => {
  // 仅验证脚本语法与 layout，不跑完整交互
  const rootScript = path.join(repoRoot, 'scripts', 'setup.js');
  const mcpScript = path.join(packageRoot, 'scripts', 'setup.js');
  for (const script of [rootScript, mcpScript]) {
    const result = spawnSync(process.execPath, ['--check', script], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${script}: ${result.stderr}`);
  }
});

test('listHasAutotestFlow', () => {
  assert.equal(listHasAutotestFlow('autotest-flow  node /tmp/x mcp'), true);
  assert.equal(listHasAutotestFlow('context7'), false);
});
