# 在 Codex 中安装 AutoTestFlow

同一套 MCP Server 与 `.agents/skills` 可被 Cursor 与 Codex 共用。本文仅描述 Codex 适配步骤。

## 前置条件

- Node.js >= 18
- 已安装 Codex CLI（终端可执行 `codex --version`）

## 步骤

### 1. 安装依赖

```bash
cd mcp-server
npm install
```

### 2. 初始化本地配置

```bash
npm run setup
```

若 `mcp-server/.env` 不存在，会从 `.env.example` 复制生成。

### 3. 填写个人 PM_API_KEY

编辑 `mcp-server/.env`：

```env
PM_API_KEY=你的个人密钥
PM_BASE_URL=http://pm.chaoxing.com
```

不要把真实密钥写入 Codex MCP 配置、文档或代码。

### 4. 注册 Codex MCP

```bash
npm run setup:codex
```

脚本会：

- 根据脚本位置计算 `mcp-server/src/index.js` 绝对路径
- 检查 `codex --version` 与 `codex mcp list`
- 若已存在 `autotest-flow`：不重复注册，不改现有配置
- 若不存在：执行等价于  
  `codex mcp add autotest-flow -- node <MCP入口绝对路径>`
- **不会**向 Codex 写入 `PM_API_KEY`

### 5. 确认列表

```bash
codex mcp list
```

应能看到 `autotest-flow`。

### 6. 重启 Codex

重启 Codex（或新开会话），使 MCP 生效。

### 7. 使用 Skill

公共 Skill：

`.agents/skills/analyze-pm-requirement/SKILL.md`

可使用：

- `$analyze-pm-requirement`
- 或自然语言：分析 PM 某某需求的测试范围

### 8. 验证 MCP 工具

调用 `read_pm_issue`（例如 issue=`470985`），确认返回结构化字段且不含密钥。

## 说明

- Cursor 与 Codex 共用同一 MCP Server 与同一套 Skills
- Host 差异只体现在适配配置（`.cursor/mcp.json` vs `setup:codex`）
