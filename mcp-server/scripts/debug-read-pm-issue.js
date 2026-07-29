import { loadEnvFile, getPmApiKey, sanitizeErrorMessage } from '../src/config/env.js';
import { readPmIssue } from '../src/services/pm-service.js';

loadEnvFile();

const issueArg = process.argv[2] || '470985';

async function main() {
  if (!getPmApiKey()) {
    console.error('调试失败：未配置 PM_API_KEY（请检查 mcp-server/.env）');
    process.exit(1);
  }

  const result = await readPmIssue(issueArg);
  const summary = {
    issueId: result.issueId,
    url: result.url,
    title: result.title,
    status: result.status,
    priority: result.priority,
    assignee: result.assignee,
    author: result.author,
    module: result.module,
    acceptanceCriteria: result.acceptanceCriteria,
    descriptionLength: result.description ? result.description.length : 0,
    attachmentsCount: result.attachments.length,
    relatedIssuesCount: result.relatedIssues.length,
    attachmentNames: result.attachments.map((item) => item.filename),
    relatedIssues: result.relatedIssues,
  };

  console.error(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error('调试失败：', sanitizeErrorMessage(error));
  process.exit(1);
});
