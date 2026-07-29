# AutoTestFlow npm 包

面向 Cursor / Codex 的 MCP + Skills CLI。

## 组员安装

```bash
npx --yes --registry=http://npm.ans.chaoxing.com/ \
  @chaoxing/autotest-flow@beta install
```

安装时交互输入个人 `PM_API_KEY`（不回显完整密钥，不支持命令行传参）。

## 常用命令

```bash
autotest-flow doctor
autotest-flow update
autotest-flow uninstall
autotest-flow help
```

## 开发模式

```bash
npm install
npm run prepare:package
npm test
node bin/autotest-flow.js mcp
```

密钥加载顺序：`process.env` → `AUTOTEST_FLOW_HOME/.env` → `~/.autotest-flow/.env` → 本目录 `.env`。
