import fs from 'node:fs';
import path from 'node:path';
import {
  getCursorSkillsDir,
  getCodexSkillsDir,
  getPackageAssetsDir,
} from './paths.js';

/** 当前安装与 doctor 必需的 Skill */
const OWN_SKILLS = [
  'process-pm',
  'implement-pm-requirement',
  'auto-test-script-development',
];

/** 旧安装遗留 Skill：仅卸载/清理，不再安装或更新 */
const LEGACY_SKILLS = ['analyze-pm-requirement'];

const CLEANUP_SKILLS = [...OWN_SKILLS, ...LEGACY_SKILLS];

/**
 * 与 process-pm 冲突的外部 Skill：从客户端 skills 根移出，避免同匹配普通 PM 任务。
 * 不删除内容，移到 skills 目录旁的隔离区。
 * @param {string} skillsRoot
 * @returns {{ quarantined: boolean, from?: string, to?: string }}
 */
export function quarantineConflictingPmFlow(skillsRoot) {
  const from = path.join(skillsRoot, 'pm-flow');
  const processPm = path.join(skillsRoot, 'process-pm', 'SKILL.md');
  if (!fs.existsSync(path.join(from, 'SKILL.md')) || !fs.existsSync(processPm)) {
    return { quarantined: false };
  }
  const quarantineRoot = path.join(path.dirname(skillsRoot), 'skills-quarantined-autotest-flow');
  const to = path.join(quarantineRoot, 'pm-flow');
  fs.mkdirSync(quarantineRoot, { recursive: true });
  if (fs.existsSync(to)) {
    fs.rmSync(to, { recursive: true, force: true });
  }
  fs.renameSync(from, to);
  return { quarantined: true, from, to };
}

/**
 * @param {string} skillsRoot
 * @returns {boolean}
 */
export function hasPmFlowOverlap(skillsRoot) {
  return (
    fs.existsSync(path.join(skillsRoot, 'pm-flow', 'SKILL.md')) &&
    fs.existsSync(path.join(skillsRoot, 'process-pm', 'SKILL.md'))
  );
}

/**
 * @param {string} src
 * @param {string} dest
 */
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

/**
 * 原地替换自有 Skill，不留下 .bak 重复目录。
 * @param {string} skillsRoot
 * @param {string} skillName
 * @param {string} assetsSkillsDir
 */
function installOneSkill(skillsRoot, skillName, assetsSkillsDir) {
  const source = path.join(assetsSkillsDir, skillName);
  if (!fs.existsSync(path.join(source, 'SKILL.md'))) {
    throw new Error(`Skill 资源缺失：${skillName}/SKILL.md`);
  }
  fs.mkdirSync(skillsRoot, { recursive: true });
  const target = path.join(skillsRoot, skillName);
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
  copyDir(source, target);
  return target;
}

/**
 * 清理历史安装留下的 AutoTestFlow Skill 备份目录与遗留 Skill。
 * @param {string} skillsRoot
 */
function cleanupOwnSkillBackups(skillsRoot) {
  if (!fs.existsSync(skillsRoot)) {
    return;
  }
  for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const isOwnBackup = CLEANUP_SKILLS.some(
      (name) => entry.name === name || entry.name.startsWith(`${name}.bak.`)
    );
    if (isOwnBackup && entry.name.includes('.bak.')) {
      fs.rmSync(path.join(skillsRoot, entry.name), { recursive: true, force: true });
    }
  }
}

/**
 * 移除遗留 Skill 目录（不再安装，但旧环境可能仍存在）。
 * @param {string} skillsRoot
 */
function removeLegacySkills(skillsRoot) {
  if (!fs.existsSync(skillsRoot)) {
    return;
  }
  for (const name of LEGACY_SKILLS) {
    const target = path.join(skillsRoot, name);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  }
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function installSkills(env = process.env) {
  const assetsSkillsDir = path.join(getPackageAssetsDir(), 'skills');
  if (!fs.existsSync(assetsSkillsDir)) {
    throw new Error('缺少 package-assets/skills，请先执行 npm run prepare:package');
  }

  const installed = [];
  const cursorDir = getCursorSkillsDir(env);
  const codexDir = getCodexSkillsDir(env);

  cleanupOwnSkillBackups(cursorDir);
  cleanupOwnSkillBackups(codexDir);
  removeLegacySkills(cursorDir);
  removeLegacySkills(codexDir);

  for (const name of OWN_SKILLS) {
    installed.push({
      client: 'cursor',
      skill: name,
      path: installOneSkill(cursorDir, name, assetsSkillsDir),
    });
    installed.push({
      client: 'codex',
      skill: name,
      path: installOneSkill(codexDir, name, assetsSkillsDir),
    });
  }

  // process-pm 安装后，隔离同目录下会抢占普通 PM 任务的旧 pm-flow
  for (const [client, root] of [
    ['cursor', cursorDir],
    ['codex', codexDir],
  ]) {
    const result = quarantineConflictingPmFlow(root);
    if (result.quarantined) {
      installed.push({
        client,
        skill: 'pm-flow(quarantined)',
        path: result.to,
      });
    }
  }

  return installed;
}

/**
 * 只删除 AutoTestFlow 自己的 Skill（含遗留清理）。
 * @param {NodeJS.ProcessEnv} [env]
 */
export function uninstallSkills(env = process.env) {
  const removed = [];
  for (const root of [getCursorSkillsDir(env), getCodexSkillsDir(env)]) {
    cleanupOwnSkillBackups(root);
    for (const name of CLEANUP_SKILLS) {
      const target = path.join(root, name);
      if (fs.existsSync(target)) {
        fs.rmSync(target, { recursive: true, force: true });
        removed.push(target);
      }
    }
  }
  return removed;
}

/**
 * @param {'cursor'|'codex'} client
 * @param {NodeJS.ProcessEnv} [env]
 */
export function skillsInstalled(client, env = process.env) {
  const root = client === 'cursor' ? getCursorSkillsDir(env) : getCodexSkillsDir(env);
  return OWN_SKILLS.every((name) => fs.existsSync(path.join(root, name, 'SKILL.md')));
}

export { OWN_SKILLS, LEGACY_SKILLS };
