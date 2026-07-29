# AutoTestFlow

面向自动化测试工程师的 AI 工作流工具。同一套能力可同时在 **Cursor** 与 **Codex** 中使用。

## 组成

AutoTestFlow 由三部分组成：

1. **MCP Server**（`mcp-server/`）：读取 PM，并提供外部工具能力（如 `read_pm_issue`）。
2. **Agent Skills**（`.agents/skills/`）：定义需求分析和测试实现工作流。
3. **Host Adapters**：分别接入 Cursor（`.cursor/mcp.json`）与 Codex（`npm run setup:codex`）。

同一套 MCP Server 和 Skill **不需要开发两份**；平台差异只在适配层。

## 目录结构

```
AutoTestFlow
├── .agents/skills/          # 公共 Skills（Cursor / Codex 共用）
├── .cursor/mcp.json         # Cursor 适配
├── AGENTS.md                # 公共项目规范
├── docs/
│   ├── install-cursor.md
│   └── install-codex.md
├── mcp-server/              # JavaScript MCP Server
└── README.md
```

## 能力概览

- 读取超星 PM 需求并结构化（MCP：`read_pm_issue`）
- 分析需求影响范围与测试点（Skill：`analyze-pm-requirement`）
- 确认后实现 JavaScript 自动化脚本（Skill：`implement-pm-requirement`）
- 后续可扩展：执行 Playwright/Puppeteer、失败分析、报告生成

## 公共 Skills

位于 `.agents/skills/`，Cursor 与 Codex 共用。

### analyze-pm-requirement

只做需求分析与测试点/修改方案，不直接改测试代码。分析结果需标明项目名称、框架、识别依据与推荐运行方式。

### implement-pm-requirement

读取 PM → 分析测试项目 → 输出实施方案 → **用户确认后** → 编写 JavaScript 脚本 → 语法检查或目标测试 → 输出结果。

修改前须识别 Playwright / Puppeteer；若目标为 `fanyajw-auto-tests`，须遵循：

- `references/projects/fanyajw-auto-tests.md`
- `references/frameworks/puppeteer.md`

**Cursor 示例：**

```text
使用 implement-pm-requirement 分析并实现 PM 470985。
先输出实施方案，等我确认后再修改代码。
```

**Codex 示例：**

```text
$implement-pm-requirement
根据 PM 470985 实现自动化测试，先给出方案。
```

未明确确认（如「确认实施」「按方案修改」「开始编写」「执行这个方案」）前，不会修改业务测试代码。

## 快速开始

### Cursor

见 [docs/install-cursor.md](docs/install-cursor.md)

### Codex

见 [docs/install-codex.md](docs/install-codex.md)

### 组员一键安装（推荐）

```bash
npx --yes --registry=http://npm.ans.chaoxing.com/ \
  @chaoxing/autotest-flow@beta install
```

安装时交互输入个人 `PM_API_KEY`，自动配置 Cursor / Codex MCP 与 Skills。

### 开发者本地

```bash
cd mcp-server
npm install
npm run setup
# 编辑 .env，填写个人 PM_API_KEY
```

## 安全

- `PM_API_KEY` 仅保存在本地 `mcp-server/.env`
- 不写入 `.cursor/mcp.json`、Codex MCP 配置、文档示例真值或源码
- 不得输出到日志、聊天、报告

## 规范

所有 Agent（Cursor / Codex）遵循根目录 [AGENTS.md](AGENTS.md)。
