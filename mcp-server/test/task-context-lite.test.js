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
  handleWriteTaskContextArtifact,
} from '../src/tools/context-tools.js';
import { TaskContextError } from '../src/context/task-context-service.js';
import { TASK_CONTEXT_VIEWS as VIEWS } from '../src/context/task-context-schema.js';

function makeEnv() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'atf-lite-'));
  return {
    env: {
      AUTOTEST_FLOW_TEST_HOME: home,
      AUTOTEST_FLOW_HOME: path.join(home, '.autotest-flow'),
    },
  };
}

function seedLiteReadyContext(env, extras = {}) {
  return handleCreateTaskContext(
    {
      task: {
        issue_id: '516966',
        title: '登录流程修补',
        type: 'SCRIPT_FIX',
        status: '进行中',
      },
      source: {
        pm_issue_id: '516966',
        entry: 'process-pm',
        pm_snapshot_ref: 'artifacts/pm_snapshot.json',
      },
      request: {
        user_intent: '修复脚本选择器',
        pm_comment_format: 'brief',
        run_intent: extras.run_intent || 'run',
        hints: ['勿重扫项目'],
      },
      project: {
        name: 'e2e-auto-tests',
        root: 'E:/proj/e2e',
        framework: 'playwright',
        identify_basis: 'package.json + playwright.config',
        package_scripts_ref: 'artifacts/scripts.json',
      },
      routing: {
        task_type: '已有脚本失败',
        route_skill: 'auto-test-script-development',
        reasons: ['SCRIPT_CONFIRMED'],
      },
      analysis: {
        summary: 'FULL_ANALYSIS_MUST_NOT_APPEAR_IN_LITE',
        test_points: ['登录成功'],
        open_questions: ['是否改公共 helper'],
      },
      references: {
        external: [{ url: 'http://example.com', access_status: 'allowed' }],
      },
      implementation: {
        status: 'planned',
        target_files: ['tests/login.spec.js'],
        target_symbols: ['test login success'],
        line_hints: ['L120-L160'],
        plan_summary: '替换失效 locator',
        risks: ['可能影响相邻用例'],
        code_diff_ref: 'artifacts/diff.patch',
      },
      verification: { status: 'not_started' },
      controls: { allow_code_change: true, allow_pm_comment: false },
      pm_update: { status: 'idle' },
      pm_snapshot: { issueId: '516966', description: 'FULL_PM_BODY' },
      ...extras.create,
    },
    env
  );
}

test('IMPLEMENT_LITE_VIEW 扁平且不含 Full 字段/空字段', () => {
  const { env } = makeEnv();
  const created = seedLiteReadyContext(env);
  const view = handleGetTaskContextView(
    { context_id: created.context_id, view: VIEWS.IMPLEMENT_LITE_VIEW },
    env
  );

  assert.equal(view.view, 'IMPLEMENT_LITE_VIEW');
  assert.equal(view.context_id, created.context_id);
  assert.equal(view.revision, 1);
  assert.equal(view.issue_id, '516966');
  assert.equal(view.project_root, 'E:/proj/e2e');
  assert.equal(view.framework, 'playwright');
  assert.deepEqual(view.target_files, ['tests/login.spec.js']);
  assert.deepEqual(view.target_symbols, ['test login success']);
  assert.deepEqual(view.line_hints, ['L120-L160']);
  assert.equal(view.change_strategy, '替换失效 locator');
  assert.equal(view.run_intent, 'run');
  assert.equal(view.implementation_status, 'planned');
  assert.equal(view.verification_status, 'not_started');

  for (const forbidden of [
    'analysis',
    'references',
    'source',
    'routing',
    'pm_update',
    'controls',
    'task',
    'project',
    'implementation',
    'verification',
    'request',
    'schema_version',
    'updated_at',
    'status',
  ]) {
    assert.equal(view[forbidden], undefined, `不应包含 ${forbidden}`);
  }

  const json = JSON.stringify(view);
  assert.equal(json.includes('FULL_ANALYSIS'), false);
  assert.equal(json.includes('null'), false);
  assert.equal(json.includes('[]'), false);
  assert.equal(Buffer.byteLength(json, 'utf8') <= 2048, true, `Lite View 过大: ${Buffer.byteLength(json, 'utf8')}`);
});

test('Lite View 省略未设置可选字段且典型体积 < 2KB', () => {
  const { env } = makeEnv();
  const created = handleCreateTaskContext(
    {
      request: { run_intent: 'skip' },
      project: { root: '/repo', framework: 'puppeteer' },
      implementation: { target_files: ['a.js'], status: 'planned' },
      verification: {},
    },
    env
  );
  const view = handleGetTaskContextView(
    { context_id: created.context_id, view: VIEWS.IMPLEMENT_LITE_VIEW },
    env
  );
  assert.equal(view.target_symbols, undefined);
  assert.equal(view.line_hints, undefined);
  assert.equal(view.allowed_files, undefined);
  assert.equal(view.issue_id, undefined);
  assert.equal(view.verification_status, undefined);
  assert.ok(Buffer.byteLength(JSON.stringify(view), 'utf8') < 512);
});

test('Lite 一次 complete_task_stage 完成 implement+verify，无需 VERIFY/REPORT', () => {
  const { env } = makeEnv();
  const created = seedLiteReadyContext(env, { run_intent: 'run' });
  const view = handleGetTaskContextView(
    { context_id: created.context_id, view: VIEWS.IMPLEMENT_LITE_VIEW },
    env
  );

  let contextReads = 1;
  let completeCalls = 0;
  let verifyReads = 0;
  let reportReads = 0;
  let patches = 0;
  let writes = 0;

  const completed = handleCompleteTaskStage(
    {
      context_id: created.context_id,
      expected_revision: view.revision,
      stage: 'implement_and_verify',
      implementation: {
        status: 'code_completed',
        changed_files: ['tests/login.spec.js'],
        summary: '更新登录按钮 locator',
      },
      verification: {
        status: 'verified',
        mode: 'headed',
        command: 'npx playwright test tests/login.spec.js',
        passed: 1,
        failed: 0,
        summary: '目标用例通过',
      },
      run_result: { ok: true, passed: 1, failed: 0, log: 'FULL_RUN_LOG_MUST_NOT_RETURN' },
    },
    env
  );
  completeCalls += 1;

  assert.equal(contextReads, 1);
  assert.equal(completeCalls, 1);
  assert.equal(verifyReads, 0);
  assert.equal(reportReads, 0);
  assert.equal(patches, 0);
  assert.equal(writes, 0);
  assert.equal(completed.implementation_status, 'code_completed');
  assert.equal(completed.verification_status, 'verified');
  assert.ok(completed.result_ref);
  assert.ok(completed.record_ref);
  assert.match(String(completed.record_ref).replace(/\\/g, '/'), /^records\/\d{4}-\d{2}-\d{2}\//);
  assert.equal(completed.patched_keys, undefined);
  assert.equal(JSON.stringify(completed).includes('FULL_RUN_LOG'), false);

  const recordPath = path.join(env.AUTOTEST_FLOW_HOME, completed.record_ref);
  assert.equal(fs.existsSync(recordPath), true);
  const recordText = fs.readFileSync(recordPath, 'utf8');
  assert.match(recordText, /阶段诊断记录/);
  assert.match(recordText, /context_id:/);
  assert.match(recordText, /changed_files:/);
  assert.match(recordText, /category: SCRIPT/);
  // 允许短 analysis_summary；禁止 PM 原文与完整运行日志
  assert.equal(recordText.includes('FULL_PM_BODY'), false);
  assert.equal(recordText.includes('FULL_RUN_LOG_MUST_NOT_RETURN'), false);
  assert.equal(recordText.includes('PM_API_KEY'), false);

  // 未要求 PM 评论：不写评论 artifact
  const draft = path.join(
    env.AUTOTEST_FLOW_HOME,
    'contexts',
    created.context_id,
    'artifacts',
    'pm_comment_draft.md'
  );
  assert.equal(fs.existsSync(draft), false);
});

test('同步 complete_task_stage 禁止 running；未运行保持 code_completed+not_run', () => {
  const { env } = makeEnv();
  const created = seedLiteReadyContext(env, { run_intent: 'skip' });
  assert.throws(
    () =>
      handleCompleteTaskStage(
        {
          context_id: created.context_id,
          expected_revision: created.revision,
          stage: 'verify',
          verification: { status: 'running' },
        },
        env
      ),
    (error) => error instanceof TaskContextError && error.code === 'INVALID_STATE'
  );

  const completed = handleCompleteTaskStage(
    {
      context_id: created.context_id,
      expected_revision: created.revision,
      stage: 'implement',
      implementation: { status: 'code_completed', changed_files: ['tests/login.spec.js'] },
    },
    env
  );
  assert.equal(completed.implementation_status, 'code_completed');
  assert.equal(completed.verification_status, 'not_run');
});

test('code_completed 不能直接 verified；revision 冲突仍生效', () => {
  const { env } = makeEnv();
  const created = seedLiteReadyContext(env);
  assert.throws(
    () =>
      handleCompleteTaskStage(
        {
          context_id: created.context_id,
          expected_revision: created.revision,
          stage: 'implement_and_verify',
          implementation: { status: 'code_completed' },
          verification: { status: 'verified' },
        },
        env
      ),
    (error) => error instanceof TaskContextError && error.code === 'INVALID_STATE'
  );
  assert.throws(
    () =>
      handleCompleteTaskStage(
        {
          context_id: created.context_id,
          expected_revision: created.revision + 9,
          stage: 'implement',
          implementation: { status: 'code_completed' },
        },
        env
      ),
    (error) => error instanceof TaskContextError && error.code === 'REVISION_CONFLICT'
  );
});

test('Full 原子工具仍可用（patch / write artifact / VERIFY_VIEW）', () => {
  const { env } = makeEnv();
  const created = seedLiteReadyContext(env);
  const patched = handlePatchTaskContext(
    {
      context_id: created.context_id,
      expected_revision: created.revision,
      patch: { implementation: { status: 'in_progress' } },
    },
    env
  );
  assert.equal(patched.revision, 2);
  const art = handleWriteTaskContextArtifact(
    {
      context_id: created.context_id,
      name: 'note.json',
      content: { hello: 'world' },
    },
    env
  );
  assert.ok(art.artifact_ref);
  const verify = handleGetTaskContextView(
    { context_id: created.context_id, view: VIEWS.VERIFY_VIEW },
    env
  );
  assert.equal(verify.view, 'VERIFY_VIEW');
  assert.ok(verify.implementation);
  assert.equal(verify.analysis, undefined);
});
