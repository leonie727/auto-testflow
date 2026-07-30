# 在 Cursor 中安装 AutoTestFlow

同一套 MCP Server 与 Skills 可被 Cursor 与 Codex 共用。推荐在仓库根目录一键安装。

## 前置条件

- Node.js >= 20

## 一键安装（推荐）

在仓库根目录执行：

```bash
npm run setup
```

终端会交互完成：

1. 安装 `mcp-server` 依赖  
2. 隐藏输入并验证个人 `PM_API_KEY`  
3. 写入 `~/.autotest-flow/.env`（不写进项目仓库）  
4. 安全合并 `~/.cursor/mcp.json`（只更新 `autotest-flow`）  
5. 配置 Codex（有 CLI 用 CLI；无 CLI 则合并 `config.toml`）  
6. 安装 AutoTestFlow Skills  
7. 执行 `doctor` 检查  

不需要手动 `cd mcp-server`，也不需要手改 `.env` / MCP 配置。

## 检查

```bash
npm run doctor
```

结论为：`安装正常` / `安装不完整` / `安装失败`。

## Reload Window

在 Cursor 中执行 **Developer: Reload Window**，重新加载 MCP。

## 调用验证

- `auto_test_flow_status`
- `read_pm_issue`（例如 issue=`470985`）

## Skill 调用

> 使用 analyze-pm-requirement，分析 PM 470985 的测试影响范围

分析阶段只会给出测试点与修改方案，不会直接改测试项目代码。

## 说明

- 密钥位置：`~/.autotest-flow/.env`（开发仍兼容 `mcp-server/.env`）
- 加载顺序：`process.env` → `~/.autotest-flow/.env` → `mcp-server/.env`
- MCP 配置中**不**写入 `PM_API_KEY`
