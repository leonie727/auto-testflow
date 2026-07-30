/**
 * 安装验证入口：复用 pm-service 中与 read_pm_issue 一致的请求逻辑。
 * 不允许在 setup 中另写一套 PM 请求。
 */
export {
  validatePmApiKey,
  buildPmIssueApiUrl,
  resolveValidateIssueId,
  DEFAULT_VALIDATE_ISSUE_ID,
} from '../services/pm-service.js';
