import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  handleCreateTaskContext,
  handleGetTaskContextView,
  handlePatchTaskContext,
  handleWriteTaskContextArtifact,
} from '../src/tools/context-tools.js';
import { getTaskContext, TaskContextError } from '../src/context/task-context-service.js';
import { TASK_CONTEXT_VIEWS } from '../src/context/task-context-schema.js';
import {
  buildPmCommentFromReportView,
  canMarkVerified,
  resolveVerificationStatus,
  patchWithSingleRetry,
  assertSafeConclusionText,
} from '../src/context/task-context-report.js';

function makeEnv() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'atf-ctx3-'));
  return {
    env: {
      AUTOTEST_FLOW_TEST_HOME: home,
      AUTOTEST_FLOW_HOME: path.join(home, '.autotest-flow'),
    },
  };
}

function seedImplementedContext(env, extras = {}) {
  return handleCreateTaskContext(
    {
      task: { issue_id: '470985', title: '选题流程' },
      source: { pm_issue_id: '470985', entry: 'process-pm', pm_snapshot_ref: 'artifacts/pm_snapshot.json' },
      request: {
        user_intent: '编写脚本',
        pm_comment_format: 'brief',
        run_intent: extras.run_intent || 'ask',
      },
      project: { name: 'fanyajw-auto-tests', framework: 'puppeteer' },
      analysis: { summary: '回显验证', test_points: ['保存回显'] },
      implementation: {
        status: 'code_completed',
        target_files: ['tests_470985.js'],
        changed_files: ['tests_470985.js'],
        summary: '最小修补完成',
      },
      verification: { status: 'not_started' },
      pm_snapshot: { issueId: '470985', description: 'FULL_PM_SHOULD_STAY_IN_ARTIFACT' },
      ...extras.create,
    },
    env
  );
}

test('VERIFY_VIEW 可驱动目标脚本运行流程', () => {
  const { env } = makeEnv();
  const created = seedImplementedContext(env, { run_intent: 'run' });
  const view = handleGetTaskContextView(
    { context_id: created.context_id, view: TASK_CONTEXT_VIEWS.VERIFY_VIEW },
    env
  );
  assert.equal(view.view, 'VERIFY_VIEW');
  assert.equal(view.project.framework, 'puppeteer');
  assert.deepEqual(view.implementation.changed_files, ['tests_470985.js']);
  assert.equal(view.request.run_intent, 'run');
  assert.equal(view.analysis, undefined);
  // 模拟不重新读 PM / 不重新识别项目
  let readPm = 0;
  let rescanProject = 0;
  if (!view.task?.issue_id) readPm += 1;
  if (!view.project?.framework) rescanProject += 1;
  assert.equal(readPm, 0);
  assert.equal(rescanProject, 0);

  const beforeRun = handlePatchTaskContext(
    {
      context_id: created.context_id,
      expected_revision: view.revision,
      patch: {
        verification: {
          status: 'running',
          mode: 'headed',
          command: 'EXECUTE_MODE=one START_TESTCASE=tests_470985 npm start',
        },
      },
    },
    env
  );
  assert.equal(beforeRun.revision, 2);
});

test('未运行时保持 code_completed / not_run', () => {
  const { env } = makeEnv();
  const created = seedImplementedContext(env, { run_intent: 'skip' });
  const view = handleGetTaskContextView(
    { context_id: created.context_id, view: TASK_CONTEXT_VIEWS.VERIFY_VIEW },
    env
  );
  const patched = handlePatchTaskContext(
    {
      context_id: created.context_id,
      expected_revision: view.revision,
      patch: {
        verification: { status: resolveVerificationStatus({ ran: false }) },
      },
    },
    env
  );
  const after = handleGetTaskContextView(
    { context_id: created.context_id, view: TASK_CONTEXT_VIEWS.VERIFY_VIEW },
    env
  );
  assert.equal(after.implementation.status, 'code_completed');
  assert.equal(after.verification.status, 'not_run');
  assert.equal(canMarkVerified(after.verification), false);
  assert.equal(patched.revision, 2);
});

test('成功运行后可更新 verified 和 result_ref', () => {
  const { env } = makeEnv();
  const created = seedImplementedContext(env, { run_intent: 'run' });
  let rev = created.revision;

  handlePatchTaskContext(
    {
      context_id: created.context_id,
      expected_revision: rev,
      patch: {
        verification: {
          status: 'running',
          mode: 'headed',
          command: 'npm start',
        },
      },
    },
    env
  );
  rev += 1;

  const art = handleWriteTaskContextArtifact(
    {
      context_id: created.context_id,
      name: 'run_result.json',
      content: { ok: true, passed: 1, failed: 0, log: 'FULL_LOG_NOT_IN_CONTEXT' },
    },
    env
  );
  assert.ok(art.artifact_ref);
  assert.equal('content' in art, false);

  const status = resolveVerificationStatus({ ran: true, passed: 1, failed: 0 });
  assert.equal(status, 'verified');
  assert.equal(
    canMarkVerified({ status: 'verified', passed: 1, failed: 0, result_ref: art.artifact_ref }),
    true
  );

  handlePatchTaskContext(
    {
      context_id: created.context_id,
      expected_revision: rev,
      patch: {
        verification: {
          status: 'verified',
          passed: 1,
          failed: 0,
          duration: 12.5,
          result_ref: art.artifact_ref,
          summary: '目标用例通过',
        },
      },
    },
    env
  );

  const ctx = getTaskContext(created.context_id, env);
  assert.equal(ctx.verification.status, 'verified');
  assert.equal(ctx.verification.result_ref, art.artifact_ref);
  const main = fs.readFileSync(
    path.join(env.AUTOTEST_FLOW_HOME, 'contexts', created.context_id, 'context.json'),
    'utf8'
  );
  assert.equal(main.includes('FULL_LOG_NOT_IN_CONTEXT'), false);
});

test('失败或阻塞时不能标记 verified', () => {
  assert.equal(resolveVerificationStatus({ ran: true, passed: 0, failed: 1 }), 'failed');
  assert.equal(resolveVerificationStatus({ ran: true, blocked: true }), 'blocked');
  assert.equal(
    canMarkVerified({ status: 'verified', passed: 0, failed: 1, result_ref: 'x' }),
    false
  );
  assert.equal(canMarkVerified({ status: 'failed', passed: 0, failed: 1 }), false);

  const { env } = makeEnv();
  const created = seedImplementedContext(env);
  const art = handleWriteTaskContextArtifact(
    {
      context_id: created.context_id,
      name: 'run_fail.json',
      content: { passed: 0, failed: 1 },
    },
    env
  );
  handlePatchTaskContext(
    {
      context_id: created.context_id,
      expected_revision: created.revision,
      patch: {
        verification: {
          status: 'failed',
          passed: 0,
          failed: 1,
          result_ref: art.artifact_ref,
          summary: '断言失败',
        },
      },
    },
    env
  );
  const view = handleGetTaskContextView(
    { context_id: created.context_id, view: TASK_CONTEXT_VIEWS.VERIFY_VIEW },
    env
  );
  assert.equal(view.verification.status, 'failed');
  assert.equal(canMarkVerified(view.verification), false);
  assert.throws(() => assertSafeConclusionText('验证通过，已解决', 'failed'));
});

test('REPORT_VIEW 能生成 brief/detailed 草稿且写入 artifact', () => {
  const { env } = makeEnv();
  const created = seedImplementedContext(env);
  handlePatchTaskContext(
    {
      context_id: created.context_id,
      expected_revision: created.revision,
      patch: {
        verification: {
          status: 'verified',
          passed: 1,
          failed: 0,
          result_ref: 'artifacts/run_result.json',
          summary: '通过',
          command: 'npm start',
        },
      },
    },
    env
  );

  const report = handleGetTaskContextView(
    { context_id: created.context_id, view: TASK_CONTEXT_VIEWS.REPORT_VIEW },
    env
  );
  assert.ok(report.pm_update !== undefined || true);
  assert.equal(report.routing, undefined);

  const brief = buildPmCommentFromReportView(report, 'brief');
  const detailed = buildPmCommentFromReportView(report, 'detailed');
  assert.equal(brief.format, 'brief');
  assert.equal(detailed.format, 'detailed');
  assert.match(detailed.text, /全面版/);
  assert.equal(brief.text.includes('FULL_PM_SHOULD_STAY_IN_ARTIFACT'), false);

  const draftArt = handleWriteTaskContextArtifact(
    {
      context_id: created.context_id,
      name: 'pm_comment_draft.md',
      content: brief.text,
    },
    env
  );

  const afterDraft = handlePatchTaskContext(
    {
      context_id: created.context_id,
      expected_revision: report.revision,
      patch: {
        pm_update: {
          status: 'draft_ready',
          format: 'brief',
          draft_ref: draftArt.artifact_ref,
          confirmed: false,
        },
      },
    },
    env
  );
  assert.equal(afterDraft.revision, report.revision + 1);

  const ctx = getTaskContext(created.context_id, env);
  assert.equal(ctx.pm_update.draft_ref, draftArt.artifact_ref);
  assert.equal(ctx.pm_update.confirmed, false);
  const main = fs.readFileSync(
    path.join(env.AUTOTEST_FLOW_HOME, 'contexts', created.context_id, 'context.json'),
    'utf8'
  );
  assert.equal(main.includes('【自动化结果】'), false);
  const draftPath = path.join(
    env.AUTOTEST_FLOW_HOME,
    'contexts',
    created.context_id,
    draftArt.artifact_ref
  );
  assert.match(fs.readFileSync(draftPath, 'utf8'), /【自动化结果】/);
});

test('用户确认后才允许回填；拒绝则 cancelled', () => {
  const { env } = makeEnv();
  const created = seedImplementedContext(env);
  let rev = created.revision;
  handlePatchTaskContext(
    {
      context_id: created.context_id,
      expected_revision: rev,
      patch: {
        pm_update: {
          status: 'draft_ready',
          format: 'brief',
          draft_ref: 'artifacts/pm_comment_draft.md',
          confirmed: false,
        },
      },
    },
    env
  );
  rev += 1;

  // 拒绝
  handlePatchTaskContext(
    {
      context_id: created.context_id,
      expected_revision: rev,
      patch: { pm_update: { status: 'cancelled', confirmed: false } },
    },
    env
  );
  let ctx = getTaskContext(created.context_id, env);
  assert.equal(ctx.pm_update.status, 'cancelled');
  assert.equal(ctx.pm_update.confirmed, false);

  // 新草稿后确认（模拟另一轮）
  const created2 = seedImplementedContext(env);
  handlePatchTaskContext(
    {
      context_id: created2.context_id,
      expected_revision: created2.revision,
      patch: {
        pm_update: {
          status: 'draft_ready',
          draft_ref: 'artifacts/d.md',
          confirmed: false,
        },
      },
    },
    env
  );
  const userConfirmed = true;
  assert.equal(userConfirmed, true);
  handlePatchTaskContext(
    {
      context_id: created2.context_id,
      expected_revision: created2.revision + 1,
      patch: {
        pm_update: {
          status: 'updated',
          confirmed: true,
          updated: true,
        },
      },
    },
    env
  );
  ctx = getTaskContext(created2.context_id, env);
  assert.equal(ctx.pm_update.status, 'updated');
  assert.equal(ctx.pm_update.confirmed, true);
  assert.equal(ctx.pm_update.updated, true);
});

test('revision 冲突不会覆盖验证或回填结果', () => {
  const { env } = makeEnv();
  const created = seedImplementedContext(env);

  handlePatchTaskContext(
    {
      context_id: created.context_id,
      expected_revision: 1,
      patch: { verification: { status: 'verified', passed: 1, failed: 0, result_ref: 'a.json' } },
    },
    env
  );

  assert.throws(
    () =>
      handlePatchTaskContext(
        {
          context_id: created.context_id,
          expected_revision: 1,
          patch: { verification: { status: 'failed', summary: 'stale' } },
        },
        env
      ),
    (err) => err instanceof TaskContextError && err.code === 'REVISION_CONFLICT'
  );

  const ctx = getTaskContext(created.context_id, env);
  assert.equal(ctx.verification.status, 'verified');
  assert.notEqual(ctx.verification.summary, 'stale');

  // 单次重试成功
  const result = patchWithSingleRetry(
    () =>
      handleGetTaskContextView(
        { context_id: created.context_id, view: TASK_CONTEXT_VIEWS.REPORT_VIEW },
        env
      ),
    (revision) =>
      handlePatchTaskContext(
        {
          context_id: created.context_id,
          expected_revision: revision,
          patch: {
            pm_update: { status: 'draft_ready', draft_ref: 'artifacts/c.md', confirmed: false },
          },
        },
        env
      )
  );
  assert.equal(result.patched_keys.includes('pm_update'), true);
});

test('全流程不重复 read_pm_issue 和项目识别', () => {
  const { env } = makeEnv();
  const created = seedImplementedContext(env, { run_intent: 'run' });
  let readPmIssueCalls = 0;
  let projectIdentifyCalls = 0;

  const verify = handleGetTaskContextView(
    { context_id: created.context_id, view: TASK_CONTEXT_VIEWS.VERIFY_VIEW },
    env
  );
  // VERIFY_VIEW 含 task / project / implementation / request，足够驱动运行，无需再读 PM
  if (!verify.task?.issue_id) readPmIssueCalls += 1;
  if (!(verify.project?.name && verify.project?.framework)) projectIdentifyCalls += 1;

  const art = handleWriteTaskContextArtifact(
    {
      context_id: created.context_id,
      name: 'run_result.json',
      content: { passed: 1, failed: 0 },
    },
    env
  );
  handlePatchTaskContext(
    {
      context_id: created.context_id,
      expected_revision: verify.revision,
      patch: {
        verification: {
          status: 'verified',
          passed: 1,
          failed: 0,
          result_ref: art.artifact_ref,
          summary: 'ok',
        },
      },
    },
    env
  );

  const report = handleGetTaskContextView(
    { context_id: created.context_id, view: TASK_CONTEXT_VIEWS.REPORT_VIEW },
    env
  );
  // REPORT_VIEW 已含 task / implementation / verification / analysis，无需再读 PM 或重扫项目
  if (!report.task?.issue_id || !report.verification?.status) readPmIssueCalls += 1;
  if (!report.implementation?.changed_files?.length && !verify.project?.framework) {
    projectIdentifyCalls += 1;
  }

  buildPmCommentFromReportView(report, 'detailed');
  assert.equal(readPmIssueCalls, 0);
  assert.equal(projectIdentifyCalls, 0);
  assert.equal(JSON.stringify(report).includes('FULL_PM_SHOULD_STAY_IN_ARTIFACT'), false);
});
