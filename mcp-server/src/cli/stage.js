import { sanitizeErrorMessage } from '../config/env.js';

/**
 * @typedef {{ name: string, hint?: string }} StageInfo
 */

/**
 * 带阶段名的错误，便于 setup/doctor 提示修复建议。
 */
export class StageError extends Error {
  /**
   * @param {string} stage
   * @param {string} message
   * @param {string} [hint]
   */
  constructor(stage, message, hint) {
    super(message);
    this.name = 'StageError';
    this.stage = stage;
    this.hint = hint || '';
  }
}

/**
 * @param {string} stage
 * @param {() => (any|Promise<any>)} fn
 * @param {string} [hint]
 */
export async function runStage(stage, fn, hint) {
  console.error(`阶段：${stage}...`);
  try {
    return await fn();
  } catch (error) {
    if (error instanceof StageError) {
      throw error;
    }
    const message = sanitizeErrorMessage(error);
    throw new StageError(stage, message, hint);
  }
}

/**
 * @param {unknown} error
 */
export function formatStageFailure(error) {
  if (error instanceof StageError) {
    const lines = [`失败阶段：${error.stage}`, `原因：${error.message}`];
    if (error.hint) {
      lines.push(`修复建议：${error.hint}`);
    }
    return lines.join('\n');
  }
  return `原因：${sanitizeErrorMessage(error)}`;
}
