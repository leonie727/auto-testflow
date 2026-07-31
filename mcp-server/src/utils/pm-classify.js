/**
 * PM 任务类型分类（供 Skill / 测试复用）。
 * 禁止默认把所有 PM 称为“诊断流程”。
 * 新 PM 必须使用「需求分析与脚本实现流程」。
 */

export const PM_TASK_TYPES = {
  NEW_REQUIREMENT: '新需求/新测试用例',
  REQUIREMENT_CHANGE: '已有需求变更',
  AUTOMATION_FAILURE: '已有脚本失败',
  SYSTEM_REPRO: '系统异常验证',
  ANALYSIS_ONLY: '仅分析或信息不足',
};

export const PM_ROUTES = {
  [PM_TASK_TYPES.NEW_REQUIREMENT]: {
    skill: 'implement-pm-requirement',
    label: '需求分析与脚本实现流程',
  },
  [PM_TASK_TYPES.REQUIREMENT_CHANGE]: {
    skill: 'implement-pm-requirement',
    label: 'process-pm 分析确认后进入脚本实现流程',
    analyzeFirst: true,
  },
  [PM_TASK_TYPES.AUTOMATION_FAILURE]: {
    skill: 'auto-test-script-development',
    label: '异常验证与分类流程',
  },
  [PM_TASK_TYPES.SYSTEM_REPRO]: {
    skill: 'auto-test-script-development',
    label: '系统异常验证流程',
  },
  [PM_TASK_TYPES.ANALYSIS_ONLY]: {
    skill: 'process-pm',
    label: 'process-pm 需求分析流程',
  },
};

/**
 * @param {{ title?: string|null, description?: string|null, status?: string|null }} pm
 * @param {{ hasExistingScript?: boolean, userHint?: string }} [options]
 */
export function classifyPmTask(pm, options = {}) {
  const title = String(pm?.title || '');
  const description = String(pm?.description || '');
  const text = `${title}\n${description}\n${options.userHint || ''}`.toLowerCase();

  const failureHints =
    /自动化.*(失败|异常|报错)|用例失败|执行失败|报错|error|timeout|flaky|不稳定|脚本失败|跑挂|挂了|线上失败/;
  const systemHints =
    /系统问题|系统异常|缺陷|bug|复现|线上问题|功能异常|页面打不开|接口报错|500|空指针|异常验证/;
  const changeHints =
    /需求变更|变更需求|修改需求|调整需求|已有用例|更新脚本|改动点|变更点/;
  const newHints =
    /新需求|新增|新功能|编写脚本|新增用例|补齐覆盖|从零|新测试|新脚本/;
  const analysisHints =
    /只分析|仅分析|评估|影响范围|测试点|先不要改|信息不足|待确认/;

  /** @type {string} */
  let taskType = PM_TASK_TYPES.ANALYSIS_ONLY;
  /** @type {string[]} */
  const reasons = [];

  if (failureHints.test(text) || (options.hasExistingScript && /失败|报错|error/.test(text))) {
    taskType = PM_TASK_TYPES.AUTOMATION_FAILURE;
    reasons.push('内容包含已有脚本失败/报错信号');
  } else if (systemHints.test(text) && !newHints.test(text)) {
    taskType = PM_TASK_TYPES.SYSTEM_REPRO;
    reasons.push('内容偏系统异常验证/缺陷排查');
  } else if (changeHints.test(text) || (options.hasExistingScript && /变更|修改|调整/.test(text))) {
    taskType = PM_TASK_TYPES.REQUIREMENT_CHANGE;
    reasons.push('内容指向已有需求或已有脚本变更');
  } else if (newHints.test(text) || options.hasExistingScript === false) {
    taskType = PM_TASK_TYPES.NEW_REQUIREMENT;
    reasons.push('内容指向新需求或新测试用例');
  } else if (analysisHints.test(text)) {
    taskType = PM_TASK_TYPES.ANALYSIS_ONLY;
    reasons.push('用户仅需分析或信息不足');
  } else if (!title.trim() && !description.trim()) {
    taskType = PM_TASK_TYPES.ANALYSIS_ONLY;
    reasons.push('PM 信息不足');
  } else {
    taskType = PM_TASK_TYPES.NEW_REQUIREMENT;
    reasons.push('默认按新需求进入需求分析与脚本实现流程，不使用异常验证流程');
  }

  const route = PM_ROUTES[taskType];
  return {
    taskType,
    routeSkill: route.skill,
    routeLabel: route.label,
    analyzeFirst: Boolean(route.analyzeFirst),
    reasons,
    publicStatement: '先读取 PM 及关联资料，判断任务类型后选择对应流程。',
  };
}
