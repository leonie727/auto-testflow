import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { classifyPmTask, PM_TASK_TYPES } from '../src/utils/pm-classify.js';
import {
  buildExternalReferences,
  describeExternalReference,
  extractHttpUrls,
  cleanDescriptionPreserveLinks,
} from '../src/utils/external-url.js';
import { readPmIssue } from '../src/services/pm-service.js';
import { readPmReference } from '../src/services/reference-service.js';
import {
  addPmComment,
  buildCommentDraft,
  clearCommentDedupeCache,
  COMMENT_TEMPLATES,
} from '../src/services/comment-service.js';

function mockFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => {
    globalThis.fetch = original;
  };
}

test('新 PM 路由到脚本实现，不显示诊断流程', () => {
  const result = classifyPmTask({
    title: '新增选课名单导出',
    description: '需要编写新的自动化测试脚本覆盖导出流程',
  });
  assert.equal(result.taskType, PM_TASK_TYPES.NEW_REQUIREMENT);
  assert.equal(result.routeSkill, 'implement-pm-requirement');
  assert.match(result.routeLabel, /需求分析与脚本实现流程/);
  assert.equal(result.routeLabel.includes('诊断流程'), false);
  assert.match(result.publicStatement, /先读取 PM 及关联资料，判断任务类型后选择对应流程/);
});

test('已有脚本报错路由到异常验证 Skill', () => {
  const result = classifyPmTask(
    {
      title: 'PM470985 自动化执行失败',
      description: '用例失败，报错 Timeout waiting for selector',
    },
    { hasExistingScript: true }
  );
  assert.equal(result.taskType, PM_TASK_TYPES.AUTOMATION_FAILURE);
  assert.equal(result.routeSkill, 'auto-test-script-development');
  assert.match(result.routeLabel, /异常验证/);
  assert.equal(result.routeLabel.includes('诊断流程'), false);
});

test('需求变更走分析后实现', () => {
  const result = classifyPmTask(
    {
      title: '选课需求变更',
      description: '已有用例需按变更点调整断言',
    },
    { hasExistingScript: true }
  );
  assert.equal(result.taskType, PM_TASK_TYPES.REQUIREMENT_CHANGE);
  assert.equal(result.analyzeFirst, true);
});

test('提取普通、飞书、学习通链接且保留描述中的链接', () => {
  const raw = `
    说明见 https://www.chaoxing.com/share/demo1
    飞书：https://bytedance.feishu.cn/docx/Abc123
    外链：<a href="https://mooc1.chaoxing.com/course/99">课程页</a>
    未知：https://evil.example.com/x
  `;
  const urls = extractHttpUrls(raw);
  assert.ok(urls.some((u) => u.includes('chaoxing.com/share/demo1')));
  assert.ok(urls.some((u) => u.includes('feishu.cn/docx')));
  assert.ok(urls.some((u) => u.includes('mooc1.chaoxing.com')));
  assert.ok(urls.some((u) => u.includes('evil.example.com')));

  const refs = buildExternalReferences(raw);
  const byDomain = Object.fromEntries(refs.map((r) => [r.domain, r]));
  assert.equal(byDomain['www.chaoxing.com'].type, 'chaoxing');
  assert.equal(byDomain['bytedance.feishu.cn'].type, 'feishu');
  assert.equal(byDomain['mooc1.chaoxing.com'].accessStatus, 'allowed');
  assert.equal(byDomain['evil.example.com'].accessStatus, 'blocked');

  const cleaned = cleanDescriptionPreserveLinks(raw);
  assert.match(cleaned, /https:\/\/mooc1\.chaoxing\.com\/course\/99/);
  assert.match(cleaned, /课程页/);
});

test('未知域名不得直接访问', async () => {
  const result = await readPmReference('https://evil.example.com/secret');
  assert.equal(result.ok, false);
  assert.equal(result.accessStatus, 'blocked');
  assert.equal(result.content, null);
});

test('外部链接登录失败不影响标记，且不猜测正文', async () => {
  const restore = mockFetch(async (url) => {
    assert.match(String(url), /chaoxing\.com/);
    return new Response('<html><title>请登录</title><body>请登录后访问</body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
      url: 'https://passport.chaoxing.com/login',
    });
  });
  try {
    const result = await readPmReference('https://www.chaoxing.com/share/need-login');
    assert.equal(result.requiresAuth, true);
    assert.equal(result.content, null);
    assert.equal(result.ok, false);
  } finally {
    restore();
  }
});

test('read_pm_issue 返回 externalReferences，登录外链失败不阻止正文', async () => {
  process.env.PM_API_KEY = 'mock-key-for-test-not-real';
  const restore = mockFetch(async (url, init) => {
    const target = String(url);
    if (target.includes('/issues/900001.json')) {
      assert.equal(init.headers['X-Redmine-API-Key'], 'mock-key-for-test-not-real');
      const body = {
        issue: {
          id: 900001,
          subject: '新需求：支持批量导入',
          description:
            '请实现脚本。资料：https://www.chaoxing.com/share/ok 以及 https://bytedance.feishu.cn/docx/X',
          status: { name: '新建' },
          priority: { name: '普通' },
          author: { name: 'tester' },
        },
      };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
        url: target,
      });
    }
    throw new Error(`unexpected url ${target}`);
  });

  try {
    const issue = await readPmIssue('900001');
    assert.equal(issue.issueId, '900001');
    assert.match(issue.description || '', /https:\/\/www\.chaoxing\.com\/share\/ok/);
    assert.ok(Array.isArray(issue.externalReferences));
    assert.ok(issue.externalReferences.length >= 2);
    assert.equal(
      issue.externalReferences.some((r) => r.type === 'feishu'),
      true
    );

    const route = classifyPmTask(issue);
    assert.equal(route.taskType, PM_TASK_TYPES.NEW_REQUIREMENT);
    assert.equal(route.routeLabel.includes('诊断流程'), false);

    // 外链登录失败
    const refRestore = mockFetch(async () =>
      new Response('<html><title>请登录</title></html>', {
        status: 401,
        headers: { 'content-type': 'text/html' },
        url: 'https://www.chaoxing.com/login',
      })
    );
    try {
      const ref = await readPmReference(issue.externalReferences[0].url);
      assert.equal(ref.requiresAuth, true);
      // 正文仍可分析
      assert.ok(issue.description);
    } finally {
      refRestore();
    }
  } finally {
    restore();
    delete process.env.PM_API_KEY;
  }
});

test('未确认时绝不提交评论', async () => {
  process.env.PM_API_KEY = 'mock-key-for-test-not-real';
  clearCommentDedupeCache();
  let putCalled = false;
  const restore = mockFetch(async () => {
    putCalled = true;
    return new Response('', { status: 200 });
  });
  try {
    await assert.rejects(
      () => addPmComment('900002', 'hello', { confirmed: false }),
      /未确认回填/
    );
    assert.equal(putCalled, false);
  } finally {
    restore();
    delete process.env.PM_API_KEY;
  }
});

test('确认后只新增 notes，并阻止重复评论，且不泄露密钥', async () => {
  process.env.PM_API_KEY = 'super-secret-key-should-not-leak';
  clearCommentDedupeCache();

  /** @type {Array<object>} */
  const journals = [];
  let lastPutBody = null;

  const restore = mockFetch(async (url, init) => {
    const target = String(url);
    const method = String(init?.method || 'GET').toUpperCase();
    if (method === 'PUT' && /\/issues\/900003\.json$/.test(target)) {
      const body = JSON.parse(String(init.body || '{}'));
      lastPutBody = body;
      assert.deepEqual(Object.keys(body.issue || {}).sort(), ['notes']);
      assert.equal(body.issue.status, undefined);
      assert.equal(body.issue.assigned_to_id, undefined);
      assert.equal(body.issue.priority_id, undefined);
      assert.equal(body.issue.done_ratio, undefined);
      journals.push({
        id: journals.length + 1,
        notes: body.issue.notes,
        created_on: new Date().toISOString(),
      });
      return new Response(null, { status: 204 });
    }
    if (method === 'GET' && target.includes('/issues/900003.json') && target.includes('journals')) {
      return new Response(
        JSON.stringify({
          issue: {
            id: 900003,
            subject: 't',
            journals,
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
          url: target,
        }
      );
    }
    throw new Error(`unexpected ${method} ${target}`);
  });

  try {
    const comment = buildCommentDraft('script_done', {
      issueId: '900003',
      files: 'tests/a.js',
      summary: '已完成脚本',
    }).comment;

    const result = await addPmComment('900003', comment, { confirmed: true });
    assert.equal(result.ok, true);
    assert.equal(lastPutBody.issue.notes, comment);
    assert.equal(JSON.stringify(result).includes('super-secret-key-should-not-leak'), false);

    await assert.rejects(
      () => addPmComment('900003', comment, { confirmed: true }),
      /重复提交/
    );
  } finally {
    restore();
    delete process.env.PM_API_KEY;
    clearCommentDedupeCache();
  }
});

test('回填模板齐全', () => {
  const ids = Object.keys(COMMENT_TEMPLATES);
  for (const id of [
    'analysis_done',
    'script_done',
    'verify_pass',
    'verify_fail',
    'system_issue',
    'data_env_issue',
    'data_issue',
    'need_product',
  ]) {
    assert.ok(ids.includes(id), id);
    const draft = buildCommentDraft(id, { issueId: '1', summary: 'x' });
    assert.ok(draft.comment.includes('【'));
  }
});

test('describeExternalReference 对 localhost 判定 unsafe/blocked', () => {
  const local = describeExternalReference('http://127.0.0.1:8080/x');
  assert.equal(local.accessStatus === 'blocked' || local.accessStatus === 'unsafe', true);
});

test('模拟 PM HTTP 服务：外链公开页可读', async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/public') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<html><title>公开页</title><body><p>hello ref</p></body></html>');
      return;
    }
    res.writeHead(404);
    res.end('no');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const realFetch = globalThis.fetch;

  const restore = mockFetch(async () => {
    const response = await realFetch(`http://127.0.0.1:${port}/public`);
    const text = await response.text();
    return new Response(text, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      url: 'https://www.chaoxing.com/share/public-mock',
    });
  });

  try {
    const result = await readPmReference('https://www.chaoxing.com/share/public-mock');
    assert.equal(result.ok, true);
    assert.equal(result.title, '公开页');
    assert.match(result.content || '', /hello ref/);
    assert.equal(result.requiresAuth, false);
  } finally {
    restore();
    await new Promise((resolve) => server.close(resolve));
  }
});
