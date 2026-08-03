import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createTaskContext,
  getTaskContext,
  getTaskContextView,
  patchTaskContext,
  closeTaskContext,
  writeContextArtifact,
  TaskContextError,
  getContextDir,
} from '../src/context/task-context-service.js';
import {
  SCHEMA_VERSION,
  TASK_CONTEXT_VIEWS,
  VIEW_FIELD_MAP,
} from '../src/context/task-context-schema.js';

function makeEnv() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'atf-ctx-'));
  return {
    home,
    env: {
      AUTOTEST_FLOW_TEST_HOME: home,
      AUTOTEST_FLOW_HOME: path.join(home, '.autotest-flow'),
    },
  };
}

test('创建与读取 Task Context', () => {
  const { env } = makeEnv();
  const created = createTaskContext(
    {
      task: { issue_id: '470985', title: '选题流程配置', type: 'NEW_REQUIREMENT' },
      source: { pm_issue_id: '470985', entry: 'process-pm' },
      request: { pm_comment_format: 'brief', run_intent: 'ask' },
      artifacts: {
        pm_snapshot: { issueId: '470985', description: 'full body stays in artifact only' },
      },
    },
    env
  );

  assert.equal(created.schema_version, SCHEMA_VERSION);
  assert.equal(created.revision, 1);
  assert.equal(created.status, 'open');
  assert.equal(created.task.issue_id, '470985');
  assert.ok(created.source.pm_snapshot_ref);
  assert.equal(created.source.pm_snapshot_ref.includes('artifacts/'), true);

  const loaded = getTaskContext(created.context_id, env);
  assert.equal(loaded.context_id, created.context_id);
  assert.equal(loaded.revision, 1);

  const mainPath = path.join(getContextDir(created.context_id, env), 'context.json');
  const mainText = fs.readFileSync(mainPath, 'utf8');
  assert.equal(mainText.includes('full body stays in artifact only'), false);

  const artifactAbs = path.join(getContextDir(created.context_id, env), created.source.pm_snapshot_ref);
  assert.equal(fs.existsSync(artifactAbs), true);
  assert.match(fs.readFileSync(artifactAbs, 'utf8'), /full body stays in artifact only/);
});

test('View 字段裁剪', () => {
  const { env } = makeEnv();
  const ctx = createTaskContext(
    {
      task: { issue_id: '1' },
      routing: { route_skill: 'implement-pm-requirement', task_type: '新需求' },
      analysis: { summary: 'short', test_points: ['a'] },
      implementation: { target_files: ['a.js'] },
      verification: { verification_status: 'code_completed', result_summary: 'not run' },
      pm_update: { draft_format: 'brief', submitted: false },
    },
    env
  );

  const route = getTaskContextView(ctx.context_id, TASK_CONTEXT_VIEWS.ROUTE_VIEW, env);
  assert.equal(route.view, 'ROUTE_VIEW');
  assert.ok(route.routing);
  assert.equal(route.analysis, undefined);
  assert.equal(route.implementation, undefined);
  assert.equal(route.verification, undefined);
  assert.equal(route.pm_update, undefined);
  for (const field of VIEW_FIELD_MAP.ROUTE_VIEW) {
    assert.ok(field in route, `ROUTE_VIEW 应含 ${field}`);
  }

  const implement = getTaskContextView(ctx.context_id, TASK_CONTEXT_VIEWS.IMPLEMENT_VIEW, env);
  assert.ok(implement.analysis);
  assert.ok(implement.implementation);
  assert.equal(implement.verification, undefined);
  assert.equal(implement.pm_update, undefined);

  const verify = getTaskContextView(ctx.context_id, TASK_CONTEXT_VIEWS.VERIFY_VIEW, env);
  assert.ok(verify.verification);
  assert.ok(verify.implementation);
  assert.equal(verify.analysis, undefined);
  assert.equal(verify.pm_update, undefined);

  const report = getTaskContextView(ctx.context_id, TASK_CONTEXT_VIEWS.REPORT_VIEW, env);
  assert.ok(report.pm_update);
  assert.ok(report.verification);
  assert.ok(report.analysis);
  assert.equal(report.routing, undefined);

  assert.throws(
    () => getTaskContextView(ctx.context_id, 'UNKNOWN_VIEW', env),
    (err) => err instanceof TaskContextError && err.code === 'INVALID_VIEW'
  );
});

test('局部更新 patch', () => {
  const { env } = makeEnv();
  const ctx = createTaskContext(
    {
      project: { name: 'fanyajw-auto-tests', framework: 'puppeteer' },
      implementation: { target_files: ['tests_1.js'] },
    },
    env
  );

  const patched = patchTaskContext(
    ctx.context_id,
    {
      expected_revision: 1,
      patch: {
        implementation: {
          changed_files: ['tests_1.js'],
          plan_summary: 'minimal fix',
        },
        verification: {
          verification_status: 'code_completed',
        },
      },
    },
    env
  );

  assert.equal(patched.revision, 2);
  assert.ok(patched.updated_at >= ctx.updated_at || patched.updated_at !== ctx.created_at);
  assert.deepEqual(patched.implementation.target_files, ['tests_1.js']);
  assert.deepEqual(patched.implementation.changed_files, ['tests_1.js']);
  assert.equal(patched.implementation.plan_summary, 'minimal fix');
  assert.equal(patched.project.framework, 'puppeteer');
  assert.equal(patched.verification.verification_status, 'code_completed');

  const ref = writeContextArtifact(ctx.context_id, 'run_log.txt', 'line1\nline2\n', env);
  const withLog = patchTaskContext(
    ctx.context_id,
    {
      expected_revision: 2,
      patch: {
        verification: {
          verification_status: 'verified',
          log_ref: ref,
          result_summary: 'passed',
        },
      },
    },
    env
  );
  assert.equal(withLog.revision, 3);
  assert.equal(withLog.verification.log_ref, ref);
  assert.equal(withLog.verification.result_summary, 'passed');
});

test('revision 冲突', () => {
  const { env } = makeEnv();
  const ctx = createTaskContext({ task: { issue_id: 'x' } }, env);

  assert.throws(
    () =>
      patchTaskContext(
        ctx.context_id,
        {
          expected_revision: 99,
          patch: { task: { title: 'nope' } },
        },
        env
      ),
    (err) => err instanceof TaskContextError && err.code === 'REVISION_CONFLICT'
  );

  const still = getTaskContext(ctx.context_id, env);
  assert.equal(still.revision, 1);
  assert.equal(still.task.title, undefined);
});

test('非法状态校验', () => {
  const { env } = makeEnv();
  const ctx = createTaskContext({ task: { issue_id: 'y' } }, env);

  assert.throws(
    () =>
      patchTaskContext(
        ctx.context_id,
        {
          context_id: ctx.context_id,
          schema_version: SCHEMA_VERSION,
          revision: 1,
          patch: { task: { title: 'x' } },
        },
        env
      ),
    (err) =>
      err instanceof TaskContextError &&
      (err.code === 'FULL_REPLACE_FORBIDDEN' || err.code === 'INVALID_PATCH')
  );

  assert.throws(
    () =>
      patchTaskContext(ctx.context_id, {
        patch: { task: { title: 'missing revision' } },
      }),
    (err) => err instanceof TaskContextError && err.code === 'INVALID_PATCH'
  );

  const closed = closeTaskContext(
    ctx.context_id,
    { expected_revision: 1, reason: 'done' },
    env
  );
  assert.equal(closed.status, 'closed');
  assert.equal(closed.revision, 2);
  assert.equal(closed.controls.closed_reason, 'done');

  assert.throws(
    () =>
      patchTaskContext(
        ctx.context_id,
        {
          expected_revision: 2,
          patch: { task: { title: 'after close' } },
        },
        env
      ),
    (err) => err instanceof TaskContextError && err.code === 'INVALID_STATE'
  );

  assert.throws(
    () => closeTaskContext(ctx.context_id, { expected_revision: 2 }, env),
    (err) => err instanceof TaskContextError && err.code === 'INVALID_STATE'
  );

  assert.throws(
    () => getTaskContext('missing-id-zzz', env),
    (err) => err instanceof TaskContextError && err.code === 'NOT_FOUND'
  );
});
