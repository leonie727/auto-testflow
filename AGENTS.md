# AGENTS.md

AutoTestFlow 项目规范。Cursor 与 Codex 共用本文，不在平台专属规则中重复维护同等内容。

## 技术约束

1. 使用 JavaScript，不使用 TypeScript。
2. 自动化测试框架为 Playwright 和 Puppeteer。
3. 优先复用项目已有方法与现有用例模式。
4. 禁止使用 `waitForTimeout` 或固定睡眠（如 `sleep(ms)` 作为等待策略）。
5. 优先进行最小范围、可稳定回归的修改。

## 工作方式

6. 修改前先分析系统、数据、环境或脚本原因，再提出改动。
7. `PM_API_KEY` 不得输出到日志、聊天、报告或代码。
8. 未经用户确认，不执行 Git 提交和推送。
9. 分析阶段不得直接修改测试项目；先给出测试点与修改方案，确认后再实现。
10. 实现阶段完成后执行语法检查或目标测试。

## 项目组成

- **MCP Server**（`mcp-server/`）：读取 PM、诊断记录保存、提供外部工具能力。
- **Agent Skills**（`.agents/skills/`）：PM 路由与需求分析、脚本实现、异常验证与分类。
- **Host Adapters**：Cursor（`.cursor/`）与 Codex（`npm run setup:codex`）接入层。

同一套 MCP Server 与 Skill 供多客户端复用，不要为不同 Host 复制业务逻辑。

核心 Skills：

- `process-pm`：PM 入口路由与必要需求分析（仅分析可在本 Skill 内完成）
- `implement-pm-requirement`：已确认方案后的脚本实现
- `auto-test-script-development`：已有脚本失败与系统异常验证（勿与新需求实现混淆）

## Skill 加载与 Token

1. `.agents/skills` 是**源码**；`mcp-server/package-assets/skills` 是**打包副本**，运行时不要当第二套 Skill 源。
2. 业务测试项目只使用 Cursor/Codex **全局安装**的 AutoTestFlow Skills（`autotest-flow install` / `update`）。
3. 开发本仓库时编辑 `.agents/skills`，改完后 `prepare:package` 并重新 install；避免项目内 Skill 与全局 Skill 同时被 Agent 当作两套生效。
4. AutoTestFlow 的 PM 入口只有 `process-pm`。`install`/`doctor` 会把 Cursor/Codex skills 目录下与之并存的外部 `pm-flow` 隔离到旁路目录；自动化测试 PM 分析、脚本修复与回填不要走 `pm-flow` CLI 闭环。
