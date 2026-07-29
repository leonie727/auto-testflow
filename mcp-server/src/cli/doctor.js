import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { loadEnvFile, getPmApiKey } from '../config/env.js';
import { detectClients } from './process.js';
import { hasCursorMcp } from './cursor-mcp.js';
import { hasCodexMcp } from './codex-mcp.js';
import { skillsInstalled } from './skills-install.js';
import { runtimeExists } from './runtime.js';
import { validatePmApiKey } from './pm-validate.js';
import {
  getAutotestFlowHome,
  getStableCliPath,
  getPackageRoot,
} from './paths.js';

/**
 * @param {{ env?: NodeJS.ProcessEnv }} [options]
 */
export async function runDoctor(options = {}) {
  const env = options.env || process.env;
  loadEnvFile();

  /** @type {Array<{name:string,result:string,detail:string}>} */
  const rows = [];
  const add = (name, ok, detail) => {
    rows.push({
      name,
      result: ok === true ? '通过' : ok === false ? '失败' : '警告',
      detail,
    });
  };

  const major = Number(process.versions.node.split('.')[0]);
  add('Node.js 版本', major >= 20, process.version);

  const home = getAutotestFlowHome(env);
  add('用户配置目录', fs.existsSync(home), home);
  add('运行时 CLI', runtimeExists(env), getStableCliPath(env));

  loadEnvFile();
  const hasKey = Boolean(getPmApiKey());
  add('PM_API_KEY', hasKey, hasKey ? '已配置' : '未配置');

  if (hasKey) {
    const validation = await validatePmApiKey(getPmApiKey());
    add('PM 访问', validation.ok, validation.message);
  } else {
    add('PM 访问', false, '未配置密钥，跳过实访');
  }

  const clients = detectClients(env);
  const cursorMcp = hasCursorMcp(env);
  add('Cursor MCP 配置', cursorMcp, cursorMcp ? '存在 autotest-flow' : '未找到');

  if (clients.codex) {
    const codexMcp = hasCodexMcp(env);
    add('Codex MCP 配置', codexMcp, codexMcp ? '存在 autotest-flow' : '未找到');
  } else {
    add('Codex MCP 配置', null, '未安装 Codex CLI');
  }

  const cursorSkills = skillsInstalled('cursor', env);
  const codexSkills = skillsInstalled('codex', env);
  add('Cursor Skills', cursorSkills, cursorSkills ? '已安装' : '缺失');
  add('Codex Skills', codexSkills, codexSkills ? '已安装' : '缺失');

  try {
    const mcpResult = await probeMcpTools(env);
    add('MCP auto_test_flow_status', mcpResult.statusOk, mcpResult.statusDetail);
    add('MCP read_pm_issue', mcpResult.readOk, mcpResult.readDetail);
  } catch (error) {
    add(
      'MCP auto_test_flow_status',
      false,
      error instanceof Error ? error.message : String(error)
    );
    add('MCP read_pm_issue', false, '未执行');
  }

  printTable(rows);

  const failed = rows.filter((r) => r.result === '失败').length;
  const warned = rows.filter((r) => r.result === '警告').length;
  let conclusion = '安装正常';
  if (failed >= 3) {
    conclusion = '安装失败';
  } else if (failed > 0 || warned > 0) {
    conclusion = '安装不完整';
  }

  const dump = JSON.stringify(rows);
  const key = getPmApiKey();
  if (key && dump.includes(key)) {
    throw new Error('doctor 输出异常：检测到密钥泄露风险，已中止');
  }

  console.error('');
  console.error(`结论：${conclusion}`);
  return { rows, conclusion };
}

/**
 * @param {NodeJS.ProcessEnv} env
 */
async function probeMcpTools(env) {
  const cliPath = runtimeExists(env)
    ? getStableCliPath(env)
    : path.join(getPackageRoot(), 'bin', 'autotest-flow.js');

  const transport = new StdioClientTransport({
    command: 'node',
    args: [cliPath, 'mcp'],
    env: { ...env },
  });
  const client = new Client({ name: 'autotest-flow-doctor', version: '0.1.0' });
  await client.connect(transport);

  let statusOk = false;
  let statusDetail = '';
  try {
    const status = await client.callTool({
      name: 'auto_test_flow_status',
      arguments: {},
    });
    const text = status.content?.[0]?.text || '';
    statusOk = text.includes('AutoTestFlow') && text.includes('running');
    statusDetail = statusOk ? '调用成功' : '返回异常';
  } catch (error) {
    statusDetail = error instanceof Error ? error.message : String(error);
  }

  let readOk = false;
  let readDetail = '';
  try {
    const key = getPmApiKey();
    if (!key) {
      readDetail = '未配置密钥';
      readOk = false;
    } else {
      const result = await client.callTool({
        name: 'read_pm_issue',
        arguments: { issue: '470985' },
      });
      if (result.isError) {
        readDetail = result.content?.[0]?.text || '工具返回错误';
        readOk = false;
      } else {
        const text = result.content?.[0]?.text || '';
        readOk = text.includes('issueId');
        readDetail = readOk ? '调用成功' : '返回缺少 issueId';
        if (text.includes(key)) {
          throw new Error('read_pm_issue 返回疑似包含密钥');
        }
      }
    }
  } catch (error) {
    readDetail = error instanceof Error ? error.message : String(error);
  }

  await client.close();
  return { statusOk, statusDetail, readOk, readDetail };
}

/**
 * @param {Array<{name:string,result:string,detail:string}>} rows
 */
function printTable(rows) {
  console.error('');
  console.error('| 检查项 | 结果 | 说明 |');
  console.error('| --- | --- | --- |');
  for (const row of rows) {
    console.error(`| ${row.name} | ${row.result} | ${row.detail} |`);
  }
}
