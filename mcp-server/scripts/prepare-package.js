import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageRoot, '..');

const sources = [
  {
    from: path.join(repoRoot, '.agents', 'skills'),
    to: path.join(packageRoot, 'package-assets', 'skills'),
    kind: 'skills',
  },
  {
    from: path.join(repoRoot, 'references'),
    to: path.join(packageRoot, 'package-assets', 'references'),
    kind: 'references',
  },
];

function rmDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else if (entry.name !== '.env') {
      fs.copyFileSync(from, to);
    }
  }
}

/** Skills 源目录只同步含 SKILL.md 的子目录，跳过 README 等导航文件 */
function copySkillsDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const from = path.join(src, entry.name);
    if (!fs.existsSync(path.join(from, 'SKILL.md'))) {
      continue;
    }
    copyDir(from, path.join(dest, entry.name));
  }
}

function collectFiles(dir, list = []) {
  if (!fs.existsSync(dir)) {
    return list;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, list);
    } else {
      list.push(full);
    }
  }
  return list;
}

function main() {
  for (const item of sources) {
    if (!fs.existsSync(item.from)) {
      throw new Error(`缺少源目录：${item.from}`);
    }
    rmDir(item.to);
    if (item.kind === 'skills') {
      copySkillsDir(item.from, item.to);
    } else {
      copyDir(item.from, item.to);
    }
    console.error(`已复制 ${item.kind} -> ${path.relative(packageRoot, item.to)}`);
  }

  const skillsRoot = path.join(packageRoot, 'package-assets', 'skills');
  const skillDirs = fs.readdirSync(skillsRoot, { withFileTypes: true }).filter((d) => d.isDirectory());
  for (const dir of skillDirs) {
    const skillMd = path.join(skillsRoot, dir.name, 'SKILL.md');
    if (!fs.existsSync(skillMd)) {
      throw new Error(`Skill 缺少 SKILL.md：${dir.name}`);
    }
  }

  const files = collectFiles(path.join(packageRoot, 'package-assets'));
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    if (/[A-Za-z]:\\Users\\|[A-Za-z]:\\Work\\|\/Users\/[^/\s]+|\/home\/[^/\s]+/.test(content)) {
      throw new Error(`package-assets 含可疑绝对路径：${path.relative(packageRoot, file)}`);
    }
    if (/PM_API_KEY\s*=\s*[A-Za-z0-9]{16,}/.test(content)) {
      throw new Error(`package-assets 疑似包含真实 PM_API_KEY：${path.relative(packageRoot, file)}`);
    }
  }

  // 确保不复制 .env
  const envInAssets = files.some((f) => path.basename(f) === '.env');
  if (envInAssets) {
    throw new Error('package-assets 不得包含 .env');
  }

  console.error('prepare:package 完成');
}

main();
