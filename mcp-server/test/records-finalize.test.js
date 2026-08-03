import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  handleCreateTaskContext,
  handleGetTaskContextView,
  handleCompleteTaskStage,
  handlePatchTaskContext,
} from '../src/tools/context-tools.js';
import {
  saveTestIssueRecord,
  upsertDiagnosticRecord,
  finalizeContextRecord,
  readContextRecordMeta,
} from '../src/services/record-service.js';
import { getContextDir } from '../src/context/task-context-service.js';
import { TASK_CONTEXT_VIEWS as VIEWS } from '../src/context/task-context-schema.js';
import { getPackageRoot } from '../src/cli/paths.js';

function makeEnv() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'atf-rec-fin-'));
  return {
    home,
    env: {
      AUTOTEST_FLOW_TEST_HOME: home,
      AUTOTEST_FLOW_HOME: path.join(home, '.autotest-flow'),
    },
  };
}

function countRecordFiles(env) {
  const root = path.join(env.AUTOTEST_FLOW_HOME, 'records');
  if (!fs.existsSync(root)) return 0;
  let n = 0;
  for (const day of fs.readdirSync(root)) {
    const dir = path.join(root, day);
    if (!fs.statSync(dir).isDirectory()) continue;
    n += fs.readdirSync(dir).filter((f) => f.endsWith('.md')).length;
  }
  return n;
}

test('分析后继续修改验证：中间不留档，仅 complete 一次', () => {
  const { env } = makeEnv();
  const created = handleCreateTaskContext(
    {
      task: { issue_id: '700001', title: '分析后实施' },
      source: { pm_issue_id: '700001', entry: 'process-pm' },
      routing: { task_type: '需求变更', route_skill: 'implement-pm-requirement' },
      analysis: { summary: '需改登录 locator' },
      project: { root: '/repo', framework: 'playwright' },
      implementation: { status: 'planned', target_files: ['a.spec.js'] },
      // 移交实施：不 finalize
    },
    env
  );
  assert.equal(created.record_key, undefined);
  assert.equal(countRecordFiles(env), 0);

  const patched = handlePatchTaskContext(
    {
      context_id: created.context_id,
      expected_revision: created.revision,
      patch: { analysis: { summary: '补充测试点：登录成功' } },
    },
    env
  );
  assert.equal(patched.record_key, undefined);
  assert.equal(countRecordFiles(env), 0);

  const view = handleGetTaskContextView(
    { context_id: created.context_id, view: VIEWS.IMPLEMENT_LITE_VIEW },
    env
  );
  const done = handleCompleteTaskStage(
    {
      context_id: created.context_id,
      expected_revision: view.revision,
      stage: 'implement_and_verify',
      implementation: {
        status: 'code_completed',
        changed_files: ['a.spec.js'],
        summary: '更新 locator',
      },
      verification: { status: 'verified', passed: 1, failed: 0, summary: '通过' },
      run_result: { ok: true },
    },
    env
  );

  assert.equal(done.record_action, 'created');
  assert.ok(done.record_key);
  assert.ok(done.record_ref);
  assert.equal(countRecordFiles(env), 1);
  const text = fs.readFileSync(path.join(env.AUTOTEST_FLOW_HOME, done.record_ref), 'utf8');
  assert.match(text, /需改登录 locator|补充测试点/);
  assert.match(text, /更新 locator/);
  assert.equal(text.includes('FULL_'), false);
});

test('仅分析结束保存一次；后续 complete 更新同一 record', () => {
  const { env } = makeEnv();
  const created = handleCreateTaskContext(
    {
      task: { issue_id: '700002', title: '仅分析' },
      source: { pm_issue_id: '700002', entry: 'process-pm' },
      analysis: { summary: '建议新增导出用例' },
      routing: { task_type: '仅分析', route_skill: 'process-pm' },
      project: { name: 'demo', root: '/demo', framework: 'puppeteer' },
      finalize_record: true,
      record: { conclusion: '先评估后实施' },
    },
    env
  );
  assert.equal(created.record_action, 'created');
  assert.ok(created.record_key);
  assert.equal(countRecordFiles(env), 1);
  assert.equal(created.revision, 1);

  const meta = readContextRecordMeta(getContextDir(created.context_id, env));
  assert.equal(meta.record_key, created.record_key);

  const done = handleCompleteTaskStage(
    {
      context_id: created.context_id,
      expected_revision: created.revision,
      stage: 'implement',
      implementation: {
        status: 'code_completed',
        changed_files: ['export.spec.js'],
        summary: '补导出断言',
      },
    },
    env
  );
  assert.equal(done.record_key, created.record_key);
  assert.equal(done.record_action, 'updated');
  assert.equal(countRecordFiles(env), 1);
  const text = fs.readFileSync(path.join(env.AUTOTEST_FLOW_HOME, done.record_ref), 'utf8');
  assert.match(text, /建议新增导出用例|先评估后实施/);
  assert.match(text, /补导出断言/);
});

test('Context Lite 仍为 2 次 Context MCP；complete 内联 records', () => {
  const { env } = makeEnv();
  const created = handleCreateTaskContext(
    {
      task: { issue_id: '700003' },
      project: { root: '/r', framework: 'playwright' },
      request: { run_intent: 'run' },
      implementation: { status: 'planned', target_files: ['t.js'] },
      routing: { reasons: ['SCRIPT_CONFIRMED'] },
    },
    env
  );
  let reads = 0;
  let completes = 0;
  const view = handleGetTaskContextView(
    { context_id: created.context_id, view: VIEWS.IMPLEMENT_LITE_VIEW },
    env
  );
  reads += 1;
  const done = handleCompleteTaskStage(
    {
      context_id: created.context_id,
      expected_revision: view.revision,
      stage: 'implement',
      implementation: { status: 'code_completed', changed_files: ['t.js'], summary: 'fix' },
    },
    env
  );
  completes += 1;
  assert.equal(reads, 1);
  assert.equal(completes, 1);
  assert.equal(done.record_action, 'created');
  assert.ok(done.revision);
  assert.ok(done.implementation_status);
});

test('分析类 Context 用 create/patch finalize，不强制 complete_task_stage', () => {
  const { env } = makeEnv();
  const created = handleCreateTaskContext(
    {
      task: { issue_id: '700004', title: '分析停' },
      analysis: { summary: '信息不足，待确认环境' },
      finalize_record: true,
    },
    env
  );
  assert.equal(created.record_action, 'created');
  assert.equal(created.implementation_status, undefined);

  const patched = handlePatchTaskContext(
    {
      context_id: created.context_id,
      expected_revision: created.revision,
      patch: { analysis: { summary: '已确认缺测试数据', open_questions: ['谁补数据'] } },
      finalize_record: true,
      record: { category: 'DATA', blocked_reason: '缺账号数据' },
    },
    env
  );
  assert.equal(patched.record_key, created.record_key);
  assert.equal(patched.record_action, 'updated');
  assert.ok(patched.patched_keys.includes('analysis'));
  assert.ok(patched.revision > created.revision);
});

test('无 Context 任务本轮最多一次 save_test_issue_record，且可 upsert', () => {
  const { env } = makeEnv();
  const first = saveTestIssueRecord(
    {
      issueId: '700005',
      category: 'SYSTEM',
      conclusion: '接口 500，非脚本问题',
      analysis_summary: '复现稳定',
    },
    env
  );
  assert.equal(first.record_action, 'created');
  const second = saveTestIssueRecord(
    {
      record_key: first.record_key,
      issueId: '700005',
      category: 'SYSTEM',
      verification_summary: '手动复验仍失败',
      result_ref: 'artifacts/manual.json',
    },
    env
  );
  assert.equal(second.record_key, first.record_key);
  assert.equal(second.record_action, 'updated');
  assert.equal(countRecordFiles(env), 1);
});

test('records 请求/文件不含完整 PM/脚本/日志；子结果仅三字段', () => {
  const { env } = makeEnv();
  const created = handleCreateTaskContext(
    {
      task: { issue_id: '700006', title: '边界' },
      analysis: { summary: '短结论' },
      pm_snapshot: { issueId: '700006', description: 'FULL_PM_BODY_SHOULD_NOT_ENTER_RECORD' },
      finalize_record: true,
    },
    env
  );
  assert.deepEqual(
    Object.keys(created)
      .filter((k) => k.startsWith('record_'))
      .sort(),
    ['record_action', 'record_key', 'record_ref']
  );
  const text = fs.readFileSync(path.join(env.AUTOTEST_FLOW_HOME, created.record_ref), 'utf8');
  assert.equal(text.includes('FULL_PM_BODY_SHOULD_NOT_ENTER_RECORD'), false);
  assert.equal(JSON.stringify(created).includes('FULL_PM_BODY'), false);
});

test('写入失败只附 record_warning，不改 Context 状态', () => {
  const { env } = makeEnv();
  const created = handleCreateTaskContext(
    {
      task: { issue_id: '700007' },
      analysis: { summary: 'ok' },
    },
    env
  );
  const recordsDir = path.join(env.AUTOTEST_FLOW_HOME, 'records');
  fs.mkdirSync(recordsDir, { recursive: true });
  // 让 records 根变成文件，迫使写入失败
  fs.rmSync(recordsDir, { recursive: true, force: true });
  fs.writeFileSync(recordsDir, 'not-a-dir', 'utf8');

  const done = handleCompleteTaskStage(
    {
      context_id: created.context_id,
      expected_revision: created.revision,
      stage: 'implement',
      implementation: { status: 'code_completed', summary: 'x', changed_files: ['a.js'] },
    },
    env
  );
  assert.equal(done.implementation_status, 'code_completed');
  assert.equal(done.verification_status, 'not_run');
  assert.ok(done.revision);
  assert.ok(done.record_warning);
  assert.equal(done.record_key, undefined);
  assert.equal(String(done.record_warning).includes('\n'), false);
});

test('Skill 静态检查：共同原则与无高耗留档要求', () => {
  const root = path.join(getPackageRoot(), '..', '.agents', 'skills');
  const names = [
    'process-pm',
    'implement-pm-requirement',
    'auto-test-script-development',
  ];
  const principle =
    '本轮形成可交付结论并结束、暂停或等待后续处理时留存一次 record；继续实施时中间不重复保存。Agent 只提交本轮已有的短摘要，不读取旧 record、不生成完整 Markdown，也不为留档增加读取、分析、验证或 MCP 调用。';
  for (const name of names) {
    const text = fs.readFileSync(path.join(root, name, 'SKILL.md'), 'utf8');
    assert.ok(text.includes(principle), `${name} 缺少共同原则`);
    assert.equal(/请读取旧 record|扫描 records 目录|生成完整 Markdown 后提交/.test(text), false);
    assert.equal(/为留档重新?读取 PM|为留档重新运行/.test(text), false);
  }
  const processPm = fs.readFileSync(path.join(root, 'process-pm', 'SKILL.md'), 'utf8');
  assert.match(processPm, /finalize_record=true/);
  assert.match(processPm, /save_test_issue_record/);
  const implement = fs.readFileSync(
    path.join(root, 'implement-pm-requirement', 'SKILL.md'),
    'utf8'
  );
  assert.match(implement, /complete_task_stage/);
  assert.match(implement, /2 次 Context/);
  const auto = fs.readFileSync(
    path.join(root, 'auto-test-script-development', 'SKILL.md'),
    'utf8'
  );
  assert.match(auto, /complete_task_stage|finalize_record/);
});

test('finalizeContextRecord 复用 sidecar key', () => {
  const { env } = makeEnv();
  const created = handleCreateTaskContext(
    {
      task: { issue_id: '700008' },
      analysis: { summary: 'a1' },
      finalize_record: true,
    },
    env
  );
  const dir = getContextDir(created.context_id, env);
  const again = finalizeContextRecord(
    {
      context_id: created.context_id,
      task: { issue_id: '700008' },
      analysis: { summary: 'a2' },
      implementation: { status: 'code_completed', summary: 'm1', changed_files: ['x.js'] },
    },
    dir,
    { stage: 'implement' },
    env
  );
  assert.equal(again.record_key, created.record_key);
  assert.equal(again.record_action, 'updated');
});

test('upsert 脱敏且不返回 Markdown 正文给结构化 API', () => {
  const { env } = makeEnv();
  const saved = upsertDiagnosticRecord(
    {
      summary: {
        issueId: '700009',
        analysis_summary: 'PM_API_KEY=secret Cookie: a=b',
        conclusion: 'blocked',
      },
    },
    env
  );
  assert.equal(saved.record_action, 'created');
  const text = fs.readFileSync(saved.path, 'utf8');
  assert.equal(text.includes('secret'), false);
  assert.match(text, /\[REDACTED\]/);
});
