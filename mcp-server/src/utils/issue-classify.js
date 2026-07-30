/**
 * 异常验证问题分类（模拟证据 → 分类结论）。
 * 供 Skill 逻辑与单元测试复用。
 */

export const ISSUE_CATEGORIES = {
  SYSTEM: 'SYSTEM',
  SCRIPT: 'SCRIPT',
  DATA: 'DATA',
  ENVIRONMENT: 'ENVIRONMENT',
  UNCONFIRMED: 'UNCONFIRMED',
};

/**
 * @typedef {object} IssueEvidence
 * @property {'pass'|'fail'|'unknown'} [manualResult]
 * @property {boolean} [localPass] 本地自动化是否成功
 * @property {boolean} [onlineFail] 线上是否失败
 * @property {'ok'|'bad'|'unknown'} [dataStatus]
 * @property {'ok'|'bad'|'unknown'} [environmentStatus]
 * @property {boolean} [scriptEvidence] 是否有明确脚本实现问题证据
 * @property {boolean} [productExpectedConfirmed] 业务预期是否已确认
 * @property {boolean} [doNotModifyCode] 用户要求先不要改代码
 */

/**
 * @param {IssueEvidence} evidence
 */
export function classifyIssueEvidence(evidence = {}) {
  const manual = evidence.manualResult || 'unknown';
  const dataStatus = evidence.dataStatus || 'unknown';
  const environmentStatus = evidence.environmentStatus || 'unknown';
  const localPass = evidence.localPass === true;
  const onlineFail = evidence.onlineFail === true;
  const scriptEvidence = evidence.scriptEvidence === true;
  const expectedConfirmed = evidence.productExpectedConfirmed === true;
  const doNotModify = evidence.doNotModifyCode === true;

  /** @type {string[]} */
  const reasons = [];

  // 本地成功不能单独作为系统问题结论
  if (localPass && onlineFail && manual === 'unknown' && dataStatus === 'unknown') {
    return buildResult({
      category: ISSUE_CATEGORIES.UNCONFIRMED,
      reasons: ['本地成功不能单独作为系统问题结论，需补充手动验证与数据/环境证据'],
      doNotModify,
    });
  }

  if (dataStatus === 'bad') {
    return buildResult({
      category: ISSUE_CATEGORIES.DATA,
      reasons: ['数据状态异常；数据问题不得描述成系统问题'],
      doNotModify,
      reportType: 'data',
    });
  }

  if (environmentStatus === 'bad' && dataStatus !== 'bad') {
    return buildResult({
      category: ISSUE_CATEGORIES.ENVIRONMENT,
      reasons: ['环境差异导致失败'],
      doNotModify,
      reportType: 'environment',
    });
  }

  if (
    manual === 'fail' &&
    dataStatus === 'ok' &&
    environmentStatus === 'ok' &&
    expectedConfirmed
  ) {
    return buildResult({
      category: ISSUE_CATEGORIES.SYSTEM,
      reasons: ['手动复现失败且数据/环境正常，产品行为违背已确认预期'],
      doNotModify,
      reportType: 'system',
    });
  }

  if (
    manual === 'pass' &&
    dataStatus === 'ok' &&
    environmentStatus === 'ok' &&
    scriptEvidence
  ) {
    const scriptConfirmed = !doNotModify;
    return buildResult({
      category: ISSUE_CATEGORIES.SCRIPT,
      reasons: scriptConfirmed
        ? ['手动正常且存在脚本实现证据，进入 SCRIPT_CONFIRMED']
        : ['手动正常且存在脚本证据，但用户要求先不要改代码，保持只读'],
      doNotModify,
      scriptConfirmed,
      reportType: 'script',
    });
  }

  reasons.push('证据不足或冲突，无法稳定归类');
  return buildResult({
    category: ISSUE_CATEGORIES.UNCONFIRMED,
    reasons,
    doNotModify,
  });
}

/**
 * @param {{
 *   category: string,
 *   reasons: string[],
 *   doNotModify?: boolean,
 *   scriptConfirmed?: boolean,
 *   reportType?: 'system'|'data'|'script'|'environment'|null
 * }} input
 */
function buildResult(input) {
  const category = input.category;
  const doNotModify = input.doNotModify === true;
  const scriptConfirmed =
    category === ISSUE_CATEGORIES.SCRIPT && input.scriptConfirmed === true && !doNotModify;

  const codeChangeAllowed = scriptConfirmed;
  const reportType =
    input.reportType ||
    (category === ISSUE_CATEGORIES.SYSTEM
      ? 'system'
      : category === ISSUE_CATEGORIES.DATA
        ? 'data'
        : category === ISSUE_CATEGORIES.SCRIPT
          ? 'script'
          : category === ISSUE_CATEGORIES.ENVIRONMENT
            ? 'environment'
            : null);

  return {
    category,
    gate: codeChangeAllowed ? 'SCRIPT_CONFIRMED' : 'READ_ONLY',
    codeChangeAllowed,
    scriptConfirmed,
    reportType,
    systemReportRequired: reportType === 'system',
    dataReportRequired: reportType === 'data',
    scriptFixNoteRequired: reportType === 'script',
    reasons: input.reasons || [],
    // 数据问题明确标记，防止误称为系统问题
    mustNotCallSystemIssue: category === ISSUE_CATEGORIES.DATA,
  };
}

/**
 * 根据分类生成对应通报标题（不含敏感信息）。
 * @param {string} category
 */
export function reportTitleForCategory(category) {
  switch (category) {
    case ISSUE_CATEGORIES.SYSTEM:
      return '【系统异常通报】';
    case ISSUE_CATEGORIES.DATA:
      return '【数据问题通报】';
    case ISSUE_CATEGORIES.SCRIPT:
      return '【脚本修复说明】';
    case ISSUE_CATEGORIES.ENVIRONMENT:
      return '【环境问题记录】';
    default:
      return '【仅分析，暂不改代码】';
  }
}
