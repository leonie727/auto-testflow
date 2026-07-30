import fs from 'node:fs';
import path from 'node:path';
import {
  getCursorSkillsDir,
  getCodexSkillsDir,
  getPackageAssetsDir,
} from './paths.js';

const OWN_SKILLS = [
  'analyze-pm-requirement',
  'implement-pm-requirement',
  'process-pm',
  'auto-test-script-development',
];

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
 * 清理历史安装留下的 AutoTestFlow Skill 备份目录。
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
    const isOwnBackup = OWN_SKILLS.some(
      (name) => entry.name === name || entry.name.startsWith(`${name}.bak.`)
    );
    if (isOwnBackup && entry.name.includes('.bak.')) {
      fs.rmSync(path.join(skillsRoot, entry.name), { recursive: true, force: true });
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
  return installed;
}

/**
 * 只删除 AutoTestFlow 自己的 Skill。
 * @param {NodeJS.ProcessEnv} [env]
 */
export function uninstallSkills(env = process.env) {
  const removed = [];
  for (const root of [getCursorSkillsDir(env), getCodexSkillsDir(env)]) {
    cleanupOwnSkillBackups(root);
    for (const name of OWN_SKILLS) {
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

export { OWN_SKILLS };
