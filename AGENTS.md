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
- **Agent Skills**（`.agents/skills/`）：PM 路由、需求分析、脚本实现、异常验证与分类。
- **Host Adapters**：Cursor（`.cursor/`）与 Codex（`npm run setup:codex`）接入层。

同一套 MCP Server 与 Skill 供多客户端复用，不要为不同 Host 复制业务逻辑。

核心 Skills：

- `process-pm`：PM 入口路由
- `analyze-pm-requirement` / `implement-pm-requirement`：需求分析与脚本实现
- `auto-test-script-development`：已有脚本失败与系统异常验证（勿与新需求实现混淆）
