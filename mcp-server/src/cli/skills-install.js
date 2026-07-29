import fs from 'node:fs';
import path from 'node:path';
import {
  getCursorSkillsDir,
  getCodexSkillsDir,
  getPackageAssetsDir,
} from './paths.js';

const OWN_SKILLS = ['analyze-pm-requirement', 'implement-pm-requirement'];

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
 * @param {string} skillsRoot
 * @param {string} skillName
 */
function installOneSkill(skillsRoot, skillName, assetsSkillsDir) {
  const source = path.join(assetsSkillsDir, skillName);
  if (!fs.existsSync(path.join(source, 'SKILL.md'))) {
    throw new Error(`Skill 资源缺失：${skillName}/SKILL.md`);
  }
  fs.mkdirSync(skillsRoot, { recursive: true });
  const target = path.join(skillsRoot, skillName);
  if (fs.existsSync(target)) {
    const backup = `${target}.bak.${Date.now()}`;
    fs.renameSync(target, backup);
  }
  copyDir(source, target);
  return target;
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
