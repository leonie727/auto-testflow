# AutoTestFlow

面向自动化测试工程师的 AI 工作流工具。同一套能力可同时在 **Cursor** 与 **Codex** 中使用。

## 组成

AutoTestFlow 由三部分组成：

1. **MCP Server**（`mcp-server/`）：读取 PM，并提供外部工具能力（如 `read_pm_issue`）。
2. **Agent Skills**（`.agents/skills/`）：定义需求分析和测试实现工作流。
3. **Host Adapters**：分别接入 Cursor 与 Codex。

同一套 MCP Server 和 Skill **不需要开发两份**；平台差异只体现在适配层。

## 目录结构

```
AutoTestFlow
├── .agents/skills/          # 公共 Skills（Cursor / Codex 共用）
├── .cursor/mcp.json         # 工作区 Cursor 适配（可选）
├── scripts/setup.js         # 根目录一键安装
├── scripts/doctor.js        # 根目录健康检查
├── AGENTS.md                # 公共项目规范
├── docs/
│   ├── install-cursor.md
│   └── install-codex.md
├── mcp-server/              # JavaScript MCP Server
└── README.md
```

## 快速开始（同事推荐）

在仓库根目录执行一次：

```bash
npm run setup
```

终端交互完成：依赖安装 → API Key 输入验证 → Cursor 配置 → Codex 配置 → Skills 安装 → doctor 检查。

检查：

```bash
npm run doctor
```

### API Key 保存位置

- 优先：`~/.autotest-flow/.env`
- 开发兼容：`mcp-server/.env`
- 加载顺序：`process.env` → `~/.autotest-flow/.env` → `mcp-server/.env`

密钥不会写入 MCP 配置，也不会打印到终端。

### Codex 无 CLI 时

不会失败退出；自动安全合并 `$CODEX_HOME/config.toml` 或 `~/.codex/config.toml`。

## 组员 npm 包安装（可选）

```bash
npx --yes --registry=http://npm.ans.chaoxing.com/ \
  @chaoxing/autotest-flow@beta install
```

## 公共 Skills

### process-pm

先读取 PM 及关联资料，判断任务类型后选择对应流程。禁止默认把所有 PM 称为诊断流程。

- 新需求 / 新测试用例 → `implement-pm-requirement`（需求分析与脚本实现流程）
- 已有脚本失败 / 系统异常验证 → `auto-test-script-development`

### analyze-pm-requirement

只做需求分析与测试点/修改方案，不直接改测试代码。

### implement-pm-requirement

读取 PM → 分析 → 输出方案 → **用户确认后** → 编写 JavaScript 脚本。默认只生成 PM 评论草稿，明确确认回填后才写入。

### auto-test-script-development

已有脚本失败与系统异常验证：分类 → 记录 → 通报；仅 `SCRIPT_CONFIRMED` 后最小修补。支持 `save_test_issue_record` 脱敏落盘。

## 安全

- `PM_API_KEY` 仅保存在本地用户配置或开发 `.env`
- 不写入 `.cursor/mcp.json`、Codex 配置、文档示例真值或源码
- 不得输出到日志、聊天、报告

## 规范

所有 Agent（Cursor / Codex）遵循根目录 [AGENTS.md](AGENTS.md)。
