import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validatePmApiKey,
  classifyPmHttpResult,
  buildPmIssueApiUrl,
  buildPmHeaders,
  DEFAULT_VALIDATE_ISSUE_ID,
} from '../src/services/pm-service.js';
import { resolveToolBin, runNpm, escapeCmdArgument } from '../src/cli/process.js';

function mockFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => {
    globalThis.fetch = original;
  };
}

test('resolveToolBin Windows 使用 .cmd', () => {
  if (process.platform === 'win32') {
    assert.equal(resolveToolBin('npm'), 'npm.cmd');
    assert.equal(resolveToolBin('npx'), 'npx.cmd');
    assert.equal(resolveToolBin('codex'), 'codex.cmd');
  } else {
    assert.equal(resolveToolBin('npm'), 'npm');
    assert.equal(resolveToolBin('codex'), 'codex');
  }
});

test('runNpm shell:false 且无 DEP0190', () => {
  const result = runNpm(['--version']);
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  assert.match((result.stdout || result.stderr).trim(), /^\d+\./);
  assert.equal(`${result.stdout}\n${result.stderr}`.includes('DEP0190'), false);
});

test('escapeCmdArgument 保留空格路径安全', () => {
  assert.equal(escapeCmdArgument('a b'), '"a b"');
  assert.equal(escapeCmdArgument('plain'), 'plain');
});

test('buildPmHeaders 与 read_pm_issue 一致并支持覆盖密钥', () => {
  const headers = buildPmHeaders('application/json', 'temp-key-for-header-test');
  assert.equal(headers.Accept, 'application/json');
  assert.equal(headers['X-Redmine-API-Key'], 'temp-key-for-header-test');
  assert.ok(headers['User-Agent']);
  assert.equal(headers.Cookie, undefined);
});

test('classifyPmHttpResult：401/403', () => {
  const r = classifyPmHttpResult({
    httpStatus: 401,
    finalUrl: 'http://pm.chaoxing.com/issues/1.json',
    contentType: 'application/json',
  });
  assert.equal(r.code, 'unauthorized');
  assert.match(r.message, /密钥无效或当前账号无权限/);
  assert.match(r.message, /HTTP 401/);
});

test('classifyPmHttpResult：登录页', () => {
  const r = classifyPmHttpResult({
    httpStatus: 200,
    finalUrl: 'http://passport.chaoxing.com/login',
    contentType: 'text/html',
    bodyText: '<html><title>请登录</title></html>',
  });
  assert.equal(r.code, 'auth_ineffective');
  assert.match(r.message, /认证请求未生效/);
});

test('classifyPmHttpResult：302', () => {
  const r = classifyPmHttpResult({
    httpStatus: 302,
    finalUrl: 'http://pm.chaoxing.com/login',
    contentType: 'text/html',
  });
  assert.equal(r.code, 'auth_ineffective');
  assert.match(r.message, /302或最终进入登录页/);
});

test('classifyPmHttpResult：404', () => {
  const r = classifyPmHttpResult({
    httpStatus: 404,
    finalUrl: 'http://pm.chaoxing.com/issues/1.json',
    contentType: 'application/json',
    issueId: '1',
  });
  assert.equal(r.code, 'not_found');
  assert.match(r.message, /不存在或无访问权限/);
});

test('classifyPmHttpResult：200 HTML', () => {
  const r = classifyPmHttpResult({
    httpStatus: 200,
    finalUrl: 'http://pm.chaoxing.com/issues/1.json',
    contentType: 'text/html; charset=utf-8',
    bodyText: '<!doctype html><html>ok</html>',
  });
  assert.equal(r.code, 'html_instead_of_json');
  assert.match(r.message, /200但返回HTML/);
});

test('validatePmApiKey 成功路径使用 issues JSON', async () => {
  const restore = mockFetch(async (url, init) => {
    assert.match(String(url), /\/issues\/\d+\.json/);
    assert.equal(init.headers['X-Redmine-API-Key'], 'good-key');
    assert.equal(init.headers.Accept, 'application/json');
    return new Response(JSON.stringify({ issue: { id: Number(DEFAULT_VALIDATE_ISSUE_ID), subject: 't' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
      url: String(url),
    });
  });
  try {
    const result = await validatePmApiKey('  good-key  ');
    assert.equal(result.ok, true);
    assert.equal(result.issueId, DEFAULT_VALIDATE_ISSUE_ID);
    assert.equal(result.message.includes('good-key'), false);
  } finally {
    restore();
  }
});

test('validatePmApiKey 401 分类正确且不泄露密钥', async () => {
  const secret = 'secret-should-not-leak-abc';
  const restore = mockFetch(async () =>
    new Response('no', {
      status: 401,
      headers: { 'content-type': 'text/plain' },
      url: buildPmIssueApiUrl(DEFAULT_VALIDATE_ISSUE_ID),
    })
  );
  try {
    const result = await validatePmApiKey(secret);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'unauthorized');
    assert.match(result.message, /密钥无效或当前账号无权限/);
    assert.equal(result.message.includes(secret), false);
  } finally {
    restore();
  }
});

test('validatePmApiKey 网络异常', async () => {
  const restore = mockFetch(async () => {
    throw new TypeError('fetch failed');
  });
  try {
    const result = await validatePmApiKey('any-key');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'network');
    assert.match(result.message, /PM服务连接失败/);
  } finally {
    restore();
  }
});

test('validatePmApiKey 空密钥', async () => {
  const result = await validatePmApiKey('   ');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'empty');
});

test('buildPmIssueApiUrl 与 read_pm_issue 地址一致', () => {
  const url = buildPmIssueApiUrl('470985');
  assert.equal(
    url,
    'http://pm.chaoxing.com/issues/470985.json?include=attachments,relations,children'
  );
});
