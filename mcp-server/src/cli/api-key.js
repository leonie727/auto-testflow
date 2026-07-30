import { promptSecret, promptConfirm, readEnvFile } from './prompt.js';
import { validatePmApiKey } from './pm-validate.js';

/**
 * 交互获取并验证 PM_API_KEY；仅验证成功后由调用方写入配置。
 * @param {{
 *   envPath: string,
 *   stdinApiKey?: string,
 *   keepExistingKey?: boolean,
 *   issueId?: string,
 * }} options
 * @returns {Promise<string>}
 */
export async function resolveValidatedApiKey(options) {
  const { envPath, stdinApiKey, issueId } = options;

  if (stdinApiKey !== undefined) {
    const key = String(stdinApiKey || '').trim();
    const validation = await validatePmApiKey(key, { issueId });
    if (!validation.ok) {
      throw new Error(`API Key 验证失败：${validation.message}。未写入配置。`);
    }
    return key;
  }

  const existing = readEnvFile(envPath);
  if (existing.PM_API_KEY) {
    const keep =
      options.keepExistingKey === true
        ? true
        : options.keepExistingKey === false
          ? false
          : await promptConfirm('检测到已有 PM_API_KEY，是否保留？', true);
    if (keep) {
      const validation = await validatePmApiKey(existing.PM_API_KEY, { issueId });
      if (validation.ok) {
        console.error('已保留现有 PM_API_KEY（验证通过，不显示值）');
        return existing.PM_API_KEY.trim();
      }
      console.error(`现有密钥验证失败：${validation.message}`);
      console.error('请重新输入，或选择退出。');
    }
  }

  for (let attempt = 1; attempt <= 5; attempt++) {
    const apiKey = await promptSecret('请输入个人 PM_API_KEY（输入内容隐藏）:');
    const trimmed = String(apiKey || '').trim();
    if (!trimmed) {
      console.error('API Key 为空。');
    } else {
      const validation = await validatePmApiKey(trimmed, { issueId });
      if (validation.ok) {
        return trimmed;
      }
      console.error(`验证失败：${validation.message}`);
    }

    if (attempt === 5) {
      throw new Error('API Key 验证失败次数过多，未写入任何密钥配置。');
    }

    const retry = await promptConfirm('是否重新输入？选择否将退出安装', true);
    if (!retry) {
      throw new Error('已取消 API Key 输入，未写入任何密钥配置。');
    }
  }

  throw new Error('API Key 未配置');
}
