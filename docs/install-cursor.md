# 在 Cursor 中安装 AutoTestFlow

同一套 MCP Server 与 `.agents/skills` 可被 Cursor 与 Codex 共用。本文仅描述 Cursor 适配步骤。

## 前置条件

- Node.js >= 18
- 已打开本仓库作为 Cursor Workspace

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

不要把真实密钥写入 `.cursor/mcp.json`、文档或代码。

### 4. 使用项目内 Cursor MCP 配置

确认存在 `.cursor/mcp.json`，内容使用 `node` 与 `${workspaceFolder}` 启动：

```json
{
  "mcpServers": {
    "autotest-flow": {
      "command": "node",
      "args": [
        "${workspaceFolder}/mcp-server/src/index.js"
      ]
    }
  }
}
```

### 5. Reload Window

在 Cursor 中执行 **Developer: Reload Window**，重新加载 MCP。

### 6. 调用状态工具

在 Agent 对话中调用：

- `auto_test_flow_status`

确认服务运行正常。

### 7. 调用需求读取工具

调用：

- `read_pm_issue`（例如 issue=`470985`）

确认可返回结构化需求字段。

## Skill 调用

公共 Skill 位于：

`.agents/skills/analyze-pm-requirement/SKILL.md`

可直接描述需求，例如：

> 使用 analyze-pm-requirement，分析 PM 470985 的测试影响范围

分析阶段只会给出测试点与修改方案，不会直接改测试项目代码。
