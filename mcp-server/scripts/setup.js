import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env');
const examplePath = path.resolve(__dirname, '../.env.example');

function main() {
  if (!fs.existsSync(examplePath)) {
    console.error('未找到 .env.example，无法完成初始化。');
    process.exit(1);
  }

  if (!fs.existsSync(envPath)) {
    fs.copyFileSync(examplePath, envPath);
    console.error('已创建 mcp-server/.env（来自 .env.example）。');
    console.error('请编辑 mcp-server/.env，填写个人 PM_API_KEY。');
  } else {
    console.error('mcp-server/.env 已存在，跳过创建。');
  }

  console.error('Setup 完成。接下来可配置 Cursor（.cursor/mcp.json）或执行 npm run setup:codex。');
}

main();
