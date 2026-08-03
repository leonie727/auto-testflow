import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { classifyPmTask, PM_TASK_TYPES } from '../src/utils/pm-classify.js';
import {
  classifyIssueEvidence,
  reportTitleForCategory,
  ISSUE_CATEGORIES,
} from '../src/utils/issue-classify.js';
import {
  saveTestIssueRecord,
  sanitizeRecordMarkdown,
  buildStageDiagnosticRecord,
} from '../src/services/record-service.js';
import { addPmComment, clearCommentDedupeCache } from '../src/services/comment-service.js';
import { installSkills, OWN_SKILLS, skillsInstalled } from '../src/cli/skills-install.js';
import { getPackageRoot } from '../src/cli/paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = getPackageRoot();

function makeTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'atf-script-dev-'));
}

test('新 PM 不会进入异常验证流程', () => {
  const result = classifyPmTask({
    title: '新需求：成绩单导出',
    description: '请编写新的自动化测试脚本',
  });
  assert.equal(result.taskType, PM_TASK_TYPES.NEW_REQUIREMENT);
  assert.equal(result.routeSkill, 'implement-pm-requirement');
  assert.equal(result.routeLabel, '需求分析与脚本实现流程');
  assert.notEqual(result.routeSkill, 'auto-test-script-development');
  assert.equal(result.routeLabel.includes('诊断流程'), false);
});

test('先不要改代码时 codeChangeAllowed=false', () => {
  const result = classifyIssueEvidence({
    manualResult: 'pass',
    dataStatus: 'ok',
    environmentStatus: 'ok',
    scriptEvidence: true,
    doNotModifyCode: true,
  });
  assert.equal(result.category, ISSUE_CATEGORIES.SCRIPT);
  assert.equal(result.codeChangeAllowed, false);
  assert.equal(result.gate, 'READ_ONLY');
});

test('本地成功不能直接判为系统问题', () => {
  const result = classifyIssueEvidence({
    localPass: true,
    onlineFail: true,
    manualResult: 'unknown',
    dataStatus: 'unknown',
  });
  assert.equal(result.category, ISSUE_CATEGORIES.UNCONFIRMED);
  assert.equal(result.systemReportRequired, false);
  assert.match(result.reasons.join(' '), /本地成功不能单独作为系统问题/);
});

test('系统问题生成系统通报', () => {
  const result = classifyIssueEvidence({
    manualResult: 'fail',
    dataStatus: 'ok',
    environmentStatus: 'ok',
    productExpectedConfirmed: true,
  });
  assert.equal(result.category, ISSUE_CATEGORIES.SYSTEM);
  assert.equal(result.systemReportRequired, true);
  assert.equal(result.codeChangeAllowed, false);
  assert.equal(reportTitleForCategory(result.category), '【系统异常通报】');
});

test('数据问题生成数据通报且不得称为系统问题', () => {
  const result = classifyIssueEvidence({
    dataStatus: 'bad',
    manualResult: 'fail',
  });
  assert.equal(result.category, ISSUE_CATEGORIES.DATA);
  assert.equal(result.dataReportRequired, true);
  assert.equal(result.systemReportRequired, false);
  assert.equal(result.mustNotCallSystemIssue, true);
  assert.equal(result.codeChangeAllowed, false);
  assert.equal(reportTitleForCategory(result.category), '【数据问题通报】');
});

test('脚本问题才允许最小修补', () => {
  const result = classifyIssueEvidence({
    manualResult: 'pass',
    dataStatus: 'ok',
    environmentStatus: 'ok',
    scriptEvidence: true,
    doNotModifyCode: false,
  });
  assert.equal(result.category, ISSUE_CATEGORIES.SCRIPT);
  assert.equal(result.codeChangeAllowed, true);
  assert.equal(result.gate, 'SCRIPT_CONFIRMED');
  assert.equal(result.scriptFixNoteRequired, true);
  assert.equal(reportTitleForCategory(result.category), '【脚本修复说明】');
});

test('未确认时不会回填 PM', async () => {
  process.env.PM_API_KEY = 'mock-key-for-test-not-real';
  clearCommentDedupeCache();
  let putCalled = false;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    putCalled = true;
    return new Response('', { status: 200 });
  };
  try {
    await assert.rejects(
      () => addPmComment('900010', '【系统异常通报】草稿', { confirmed: false }),
      /未确认回填/
    );
    assert.equal(putCalled, false);
  } finally {
    globalThis.fetch = original;
    delete process.env.PM_API_KEY;
  }
});

test('save_test_issue_record 脱敏并保存到 records/YYYY-MM-DD', () => {
  const home = makeTempHome();
  const env = { AUTOTEST_FLOW_TEST_HOME: home };
  const markdown = [
    '【数据问题通报】',
    '用例：导出名单',
    'PM_API_KEY=should-not-persist-abc',
    'Cookie: session=secret-cookie-value',
    'password=plain-secret',
    'Authorization: Bearer abc.def.ghi',
    '结论：数据问题，当前脚本暂不调整/待数据修复后复验。',
  ].join('\n');

  const result = saveTestIssueRecord(
    {
      markdown,
      category: 'DATA',
      issueId: '900011',
      title: '数据问题样例',
      filename: 'data-issue-sample.md',
    },
    env
  );

  assert.equal(result.ok, true);
  assert.match(result.relativePath.replace(/\\/g, '/'), /^records\/\d{4}-\d{2}-\d{2}\//);
  const content = fs.readFileSync(result.path, 'utf8');
  assert.match(content, /【数据问题通报】/);
  assert.equal(content.includes('should-not-persist-abc'), false);
  assert.equal(content.includes('secret-cookie-value'), false);
  assert.equal(content.includes('plain-secret'), false);
  assert.equal(content.includes('Bearer abc.def.ghi'), false);
  assert.match(content, /\[REDACTED\]/);
});

test('sanitizeRecordMarkdown 移除敏感字段', () => {
  const cleaned = sanitizeRecordMarkdown('PM_API_KEY=abc Cookie: a=b password=x');
  assert.equal(cleaned.includes('abc'), false);
  assert.equal(cleaned.includes('a=b'), false);
  assert.equal(cleaned.includes('password=x'), false);
});

test('complete_task_stage 自动 records 也会脱敏敏感字段', () => {
  const home = makeTempHome();
  const env = { AUTOTEST_FLOW_TEST_HOME: home };
  const draft = buildStageDiagnosticRecord(
    {
      context_id: 'ctx-sensitive',
      task: { issue_id: '900099', title: '敏感样例' },
      source: { entry: 'process-pm' },
      request: { user_intent: '验证脱敏 Cookie: session=leak password=x' },
      project: { name: 'demo', root: '/tmp/demo', framework: 'playwright' },
      routing: { task_type: '已有脚本失败', reasons: ['SCRIPT_CONFIRMED'], route_skill: 'auto-test-script-development' },
      analysis: { summary: 'PM_API_KEY=should-redact token=abc123' },
      implementation: { status: 'code_completed', changed_files: ['a.js'], summary: 'fix' },
      verification: { status: 'not_run' },
    },
    { stage: 'implement' }
  );
  const saved = saveTestIssueRecord(draft, env);
  const content = fs.readFileSync(saved.path, 'utf8');
  assert.equal(content.includes('should-redact'), false);
  assert.equal(content.includes('session=leak'), false);
  assert.equal(content.includes('password=x'), false);
  assert.equal(content.includes('abc123'), false);
  assert.match(content, /\[REDACTED\]/);
  assert.match(content, /contextId: ctx-sensitive/);
});

test('prepare-package 含新 Skill 且无真实密钥/本机绝对路径', () => {
  const prepare = spawnSync(
    process.execPath,
    [path.join(packageRoot, 'scripts', 'prepare-package.js')],
    { cwd: packageRoot, encoding: 'utf8' }
  );
  assert.equal(prepare.status, 0, prepare.stderr);

  const skillMd = path.join(
    packageRoot,
    'package-assets',
    'skills',
    'auto-test-script-development',
    'SKILL.md'
  );
  assert.equal(fs.existsSync(skillMd), true);
  const inputTpl = path.join(
    packageRoot,
    'package-assets',
    'skills',
    'auto-test-script-development',
    'references',
    'input-templates.md'
  );
  assert.equal(fs.existsSync(inputTpl), true);

  const assetsRoot = path.join(packageRoot, 'package-assets');
  /** @type {string[]} */
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  }
  walk(assetsRoot);

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    assert.equal(
      /[A-Za-z]:\\Users\\|[A-Za-z]:\\Work\\|\/Users\/[^/\s]+|\/home\/[^/\s]+/.test(content),
      false,
      `绝对路径泄漏: ${path.relative(packageRoot, file)}`
    );
    assert.equal(
      /PM_API_KEY\s*=\s*[A-Za-z0-9]{16,}/.test(content),
      false,
      `疑似真实密钥: ${path.relative(packageRoot, file)}`
    );
  }
});

test('Cursor 与 Codex 安装后均能识别 auto-test-script-development', () => {
  const home = makeTempHome();
  const env = {
    AUTOTEST_FLOW_TEST_HOME: home,
    CODEX_HOME: path.join(home, '.codex'),
  };
  const prepare = spawnSync(
    process.execPath,
    [path.join(packageRoot, 'scripts', 'prepare-package.js')],
    { cwd: packageRoot, encoding: 'utf8' }
  );
  assert.equal(prepare.status, 0, prepare.stderr);

  installSkills(env);
  assert.equal(OWN_SKILLS.includes('auto-test-script-development'), true);
  assert.equal(skillsInstalled('cursor', env), true);
  assert.equal(skillsInstalled('codex', env), true);

  for (const client of ['cursor', 'codex']) {
    const root =
      client === 'cursor'
        ? path.join(home, '.cursor', 'skills')
        : path.join(home, '.codex', 'skills');
    const skillPath = path.join(root, 'auto-test-script-development', 'SKILL.md');
    assert.equal(fs.existsSync(skillPath), true, skillPath);
    const text = fs.readFileSync(skillPath, 'utf8');
    assert.match(text, /name:\s*auto-test-script-development/);
    assert.match(text, /SCRIPT_CONFIRMED/);
  }
});
