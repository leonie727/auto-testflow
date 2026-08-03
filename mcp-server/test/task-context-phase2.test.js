import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  handleCreateTaskContext,
  handleGetTaskContextView,
  handlePatchTaskContext,
} from '../src/tools/context-tools.js';
import { getTaskContext, TaskContextError } from '../src/context/task-context-service.js';
import { TASK_CONTEXT_VIEWS } from '../src/context/task-context-schema.js';

function makeEnv() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'atf-ctx2-'));
  return {
    env: {
      AUTOTEST_FLOW_TEST_HOME: home,
      AUTOTEST_FLOW_HOME: path.join(home, '.autotest-flow'),
    },
  };
}

/** 模拟 process-pm：一次 PM 结果写入 Context，不二次读取 */
function simulateProcessPmCreate(env, pmRaw) {
  return handleCreateTaskContext(
    {
      task: {
        issue_id: pmRaw.issueId,
        title: pmRaw.title,
        type: 'NEW_REQUIREMENT',
        status: pmRaw.status,
      },
      source: {
        pm_issue_id: pmRaw.issueId,
        pm_url: pmRaw.url,
        entry: 'process-pm',
      },
      request: {
        user_intent: '编写自动化脚本',
        pm_comment_format: 'brief',
        run_intent: 'ask',
      },
      routing: {
        task_type: '新需求/新测试用例',
        route_skill: 'implement-pm-requirement',
        route_label: '需求分析与脚本实现流程',
        reasons: ['用户要求实现'],
      },
      project: {
        name: 'fanyajw-auto-tests',
        framework: 'puppeteer',
        identify_basis: 'package.json',
      },
      implementation: {
        target_files: ['src/run_scripts/thesis/tests_470985.js'],
      },
      analysis: {
        summary: '选题流程配置回显验证',
        test_points: ['保存回显'],
      },
      pm_snapshot: pmRaw,
    },
    env
  );
}

test('process-pm 创建 Context 并返回 context_id', () => {
  const { env } = makeEnv();
  const pmRaw = {
    issueId: '470985',
    url: 'http://pm.chaoxing.com/issues/470985',
    title: '选题流程配置',
    status: '已关闭',
    description: 'FULL_PM_BODY_SHOULD_NOT_APPEAR_IN_VIEW',
  };

  const created = simulateProcessPmCreate(env, pmRaw);
  assert.ok(created.context_id);
  assert.equal(created.revision, 1);
  assert.ok(created.source.pm_snapshot_ref);

  const route = handleGetTaskContextView(
    { context_id: created.context_id, view: TASK_CONTEXT_VIEWS.ROUTE_VIEW },
    env
  );
  assert.equal(route.routing.route_skill, 'implement-pm-requirement');
  assert.equal(JSON.stringify(route).includes('FULL_PM_BODY_SHOULD_NOT_APPEAR_IN_VIEW'), false);
});

test('implement 读取 IMPLEMENT_VIEW 且复用已有 PM/项目信息', () => {
  const { env } = makeEnv();
  const created = simulateProcessPmCreate(env, {
    issueId: '470985',
    title: '选题流程',
    description: 'SECRET_BODY',
  });

  let readPmCalls = 0;
  const maybeReadPm = (view) => {
    const hasPm = Boolean(view.task?.issue_id && view.source?.pm_snapshot_ref);
    const hasProject = Boolean(view.project?.framework && view.implementation?.target_files?.length);
    if (!hasPm) {
      readPmCalls += 1;
    }
    return { hasPm, hasProject, readPmCalls };
  };

  const view = handleGetTaskContextView(
    { context_id: created.context_id, view: TASK_CONTEXT_VIEWS.IMPLEMENT_VIEW },
    env
  );
  assert.equal(view.view, 'IMPLEMENT_VIEW');
  assert.ok(view.analysis);
  assert.ok(view.implementation);
  assert.equal(view.verification, undefined);
  assert.equal(view.pm_update, undefined);

  const gate = maybeReadPm(view);
  assert.equal(gate.hasPm, true);
  assert.equal(gate.hasProject, true);
  assert.equal(gate.readPmCalls, 0);
  assert.equal(JSON.stringify(view).includes('SECRET_BODY'), false);
});

test('implementation 可通过 patch 更新', () => {
  const { env } = makeEnv();
  const created = simulateProcessPmCreate(env, { issueId: '1', title: 't' });

  const patched = handlePatchTaskContext(
    {
      context_id: created.context_id,
      expected_revision: created.revision,
      patch: {
        implementation: {
          status: 'code_completed',
          changed_files: ['src/run_scripts/thesis/tests_470985.js'],
          summary: '恢复题库双选并修正字数上限',
        },
      },
    },
    env
  );

  assert.equal(patched.revision, 2);
  assert.deepEqual(patched.patched_keys, ['implementation']);

  const view = handleGetTaskContextView(
    { context_id: created.context_id, view: TASK_CONTEXT_VIEWS.IMPLEMENT_VIEW },
    env
  );
  assert.equal(view.implementation.status, 'code_completed');
  assert.equal(view.implementation.summary, '恢复题库双选并修正字数上限');
  assert.deepEqual(view.implementation.changed_files, [
    'src/run_scripts/thesis/tests_470985.js',
  ]);
  // 局部 merge 保留原 target_files
  assert.deepEqual(view.implementation.target_files, [
    'src/run_scripts/thesis/tests_470985.js',
  ]);
});

test('revision 冲突不会覆盖已有内容', () => {
  const { env } = makeEnv();
  const created = simulateProcessPmCreate(env, { issueId: '2', title: 't' });

  handlePatchTaskContext(
    {
      context_id: created.context_id,
      expected_revision: 1,
      patch: { implementation: { summary: 'first-writer' } },
    },
    env
  );

  assert.throws(
    () =>
      handlePatchTaskContext(
        {
          context_id: created.context_id,
          expected_revision: 1,
          patch: { implementation: { summary: 'stale-writer' } },
        },
        env
      ),
    (err) => err instanceof TaskContextError && err.code === 'REVISION_CONFLICT'
  );

  const ctx = getTaskContext(created.context_id, env);
  assert.equal(ctx.revision, 2);
  assert.equal(ctx.implementation.summary, 'first-writer');
});

test('直接进入 implement 时可创建 Context 并继续', () => {
  const { env } = makeEnv();
  // 独立入口：自行 read 后的结果（测试中用固定对象模拟，不调真实 PM）
  const pmRaw = {
    issueId: '471000',
    title: '直接实现入口',
    description: 'DIRECT_ENTRY_BODY',
  };

  const created = handleCreateTaskContext(
    {
      task: { issue_id: pmRaw.issueId, title: pmRaw.title, type: 'NEW_REQUIREMENT' },
      source: { pm_issue_id: pmRaw.issueId, entry: 'implement-pm-requirement' },
      request: { user_intent: '直接编写脚本' },
      project: { name: 'demo', framework: 'playwright' },
      implementation: { target_files: ['tests/demo.spec.js'], status: 'planned' },
      pm_snapshot: pmRaw,
    },
    env
  );

  assert.ok(created.context_id);
  const view = handleGetTaskContextView(
    { context_id: created.context_id, view: TASK_CONTEXT_VIEWS.IMPLEMENT_VIEW },
    env
  );
  assert.equal(view.source.entry, 'implement-pm-requirement');
  assert.equal(view.project.framework, 'playwright');

  const after = handlePatchTaskContext(
    {
      context_id: created.context_id,
      expected_revision: created.revision,
      patch: {
        implementation: {
          status: 'code_completed',
          changed_files: ['tests/demo.spec.js'],
          summary: 'added case',
        },
      },
    },
    env
  );
  assert.equal(after.revision, 2);

  const again = handleGetTaskContextView(
    { context_id: created.context_id, view: TASK_CONTEXT_VIEWS.IMPLEMENT_VIEW },
    env
  );
  assert.equal(again.implementation.status, 'code_completed');
});

test('已有有效 context_id 时复用：patch 路由而不重复 create', () => {
  const { env } = makeEnv();
  const first = simulateProcessPmCreate(env, { issueId: '9', title: 'reuse' });

  const reused = handlePatchTaskContext(
    {
      context_id: first.context_id,
      expected_revision: first.revision,
      patch: {
        routing: {
          reasons: ['用户要求实现', '复用已有 context'],
        },
      },
    },
    env
  );
  assert.equal(reused.context_id, first.context_id);
  assert.equal(reused.revision, 2);

  const dirs = fs.readdirSync(path.join(env.AUTOTEST_FLOW_HOME, 'contexts'));
  assert.equal(dirs.length, 1);
});
