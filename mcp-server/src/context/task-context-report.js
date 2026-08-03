/**
 * REPORT / VERIFY 辅助：仅基于 View 结构化字段生成评论，不读 artifact 正文。
 */

/**
 * 根据真实运行结果解析 verification.status（未运行不得为 verified）。
 * @param {{ ran?: boolean, passed?: number, failed?: number, blocked?: boolean }} input
 */
export function resolveVerificationStatus(input = {}) {
  if (input.blocked) {
    return 'blocked';
  }
  if (!input.ran) {
    return 'not_run';
  }
  if (typeof input.failed === 'number' && input.failed > 0) {
    return 'failed';
  }
  if (typeof input.passed === 'number' && input.passed > 0) {
    return 'verified';
  }
  return 'failed';
}

/**
 * 是否允许将 verification.status 设为 verified。
 * @param {{ status?: string, passed?: number, failed?: number, result_ref?: string, ran?: boolean }} verification
 */
export function canMarkVerified(verification) {
  if (!verification) {
    return false;
  }
  if (verification.status && verification.status !== 'verified') {
    return false;
  }
  if (typeof verification.failed === 'number' && verification.failed > 0) {
    return false;
  }
  if (verification.ran === false) {
    return false;
  }
  if (typeof verification.passed === 'number' && verification.passed < 1) {
    return false;
  }
  return Boolean(
    verification.result_ref ||
      (typeof verification.passed === 'number' && verification.passed > 0)
  );
}

/**
 * 未 verified 时禁止的结论用语。
 * @param {string} text
 * @param {string} [verificationStatus]
 */
export function assertSafeConclusionText(text, verificationStatus) {
  const status = verificationStatus || 'not_run';
  if (status === 'verified') {
    return;
  }
  const banned = /验证通过|已解决|完成度\s*100%|完成度100%/;
  if (banned.test(String(text || ''))) {
    throw new Error(
      `verification.status=${status} 时禁止输出「验证通过 / 已解决 / 完成度 100%」`
    );
  }
}

/**
 * @param {object} reportView get_task_context_view(REPORT_VIEW) 结果
 * @param {'brief'|'detailed'} [format]
 */
export function buildPmCommentFromReportView(reportView, format = 'brief') {
  const view = reportView || {};
  const task = view.task || {};
  const impl = view.implementation || {};
  const ver = view.verification || {};
  const req = view.request || {};
  const resolvedFormat =
    format || req.pm_comment_format || view.pm_update?.format || 'brief';
  const vStatus = ver.status || ver.verification_status || 'not_run';

  const conclusion =
    vStatus === 'verified'
      ? '目标脚本已真实运行并通过。'
      : vStatus === 'failed'
        ? '目标脚本已运行但未通过，脚本问题待继续处理。'
        : vStatus === 'blocked'
          ? '运行受系统/数据/环境阻塞，尚未验证通过。'
          : vStatus === 'not_run'
            ? '代码已完成，尚未运行目标脚本验证。'
            : '验证尚未完成。';

  assertSafeConclusionText(conclusion, vStatus);

  if (resolvedFormat === 'detailed') {
    const lines = [
      '【自动化结果-全面版】',
      `PM：${task.issue_id || ''}`,
      `脚本路径：${(impl.changed_files || impl.target_files || []).join(', ')}`,
      `覆盖场景：${(view.analysis?.test_points || []).join('；') || '（见 Context analysis）'}`,
      `实现说明：${impl.summary || impl.plan_summary || ''}`,
      `真实运行结果：status=${vStatus}` +
        (ver.command ? `；command=${ver.command}` : '') +
        (typeof ver.passed === 'number' ? `；passed=${ver.passed}` : '') +
        (typeof ver.failed === 'number' ? `；failed=${ver.failed}` : '') +
        (ver.duration != null ? `；duration=${ver.duration}` : '') +
        (ver.summary ? `；${ver.summary}` : ''),
      `限制或风险：${(impl.risks || []).join('；') || '无'}`,
      `verification_status：${vStatus}`,
      `结论：${conclusion}`,
      '下一步：待确认是否回填本评论。',
    ];
    return { format: 'detailed', text: lines.join('\n'), verification_status: vStatus };
  }

  const lines = [
    '【自动化结果】',
    `PM：${task.issue_id || ''}`,
    `脚本：${(impl.changed_files || impl.target_files || []).join(', ')}`,
    `verification_status：${vStatus}`,
    `摘要：${impl.summary || ver.summary || ''}`,
    `结论：${conclusion}`,
    '下一步：待确认是否回填本评论。',
  ];
  return { format: 'brief', text: lines.join('\n'), verification_status: vStatus };
}

/**
 * patch 冲突时最多重试一次的约定辅助。
 * @param {() => object} readView
 * @param {(revision: number) => object} doPatch
 */
export function patchWithSingleRetry(readView, doPatch) {
  const first = readView();
  try {
    return doPatch(first.revision);
  } catch (error) {
    if (error?.code !== 'REVISION_CONFLICT') {
      throw error;
    }
    const second = readView();
    return doPatch(second.revision);
  }
}
