# 在 Codex 中安装 AutoTestFlow

同一套 MCP Server 与 Skills 可被 Cursor 与 Codex 共用。推荐在仓库根目录一键安装。

## 前置条件

- Node.js >= 20
- **不强制**安装 Codex CLI

## 一键安装（推荐）

在仓库根目录执行：

```bash
npm run setup
```

若本机有 `codex` / `codex.cmd`，将优先执行 `codex mcp add`。  
若未检测到 CLI：不会报错退出，改为安全合并：

- `$CODEX_HOME/config.toml`，或
- `~/.codex/config.toml`

只新增/更新 `autotest-flow`，保留其他配置，修改前自动备份。

## 仅配置 Codex（可选）

```bash
npm run setup:codex
```

## 检查

```bash
npm run doctor
```

## 使用 Skill

- `$analyze-pm-requirement`
- `$implement-pm-requirement`

## 说明

- 密钥保存在 `~/.autotest-flow/.env`，不会写入 Codex MCP / `config.toml`
- 无 Codex CLI 时仍可完成安装；重启 Codex 客户端后生效
- Windows 下不会输出原始乱码 stderr，只给出中文提示
