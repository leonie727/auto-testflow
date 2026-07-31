# AutoTestFlow

面向自动化测试工程师的 AI 工作流工具。同一套能力可同时在 **Cursor** 与 **Codex** 中使用。

## 日常使用入口

- 有 PM 编号/链接，或未指明流程：使用 **process-pm**
- 已有脚本失败、系统/数据/环境异常验证：使用 **auto-test-script-development**
- 已确认方案、需要编写脚本：使用 **implement-pm-requirement**（通常由 process-pm 路由进入）

仓库根目录一键安装与检查：

```bash
npm run setup
npm run doctor
```

## 三层架构

- **MCP Server**（`mcp-server/`）：PM 读取、外链、评论回填、记录等外部能力
- **Agent Skills**（`.agents/skills/`）：PM 流程、需求实现、异常诊断
- **Host Adapters**：Cursor 与 Codex 接入与安装

同一套 MCP Server 与 Skill 不需要为不同 Host 复制业务逻辑。

## 目录结构

```text
AutoTestFlow/
├─ .agents/skills/          # 三个公共工作流
├─ .cursor/                 # Cursor项目适配
├─ docs/                    # 安装与设计文档
├─ mcp-server/              # MCP与CLI
├─ AGENTS.md                # 全局开发边界
└─ README.md                # 使用入口
```

## Cursor 安装入口

详见 [docs/install-cursor.md](docs/install-cursor.md)。

## Codex 安装入口

详见 [docs/install-codex.md](docs/install-codex.md)。

组员也可选用 npm 包安装：

```bash
npx --yes --registry=http://npm.ans.chaoxing.com/ \
  @chaoxing/autotest-flow@beta install
```

## PM_API_KEY 安全说明

- 优先保存在：`~/.autotest-flow/.env`
- 开发兼容：`mcp-server/.env`
- 加载顺序：`process.env` → `~/.autotest-flow/.env` → `mcp-server/.env`
- **不得**写入 MCP 配置、文档示例真值、源码、日志、聊天或报告

## 文档导航

- [AGENTS.md](AGENTS.md)：全局开发与 Agent 边界
- [.agents/skills/README.md](.agents/skills/README.md)：Skills 导航与路由
- [docs/README.md](docs/README.md)：安装文档索引
- [docs/install-cursor.md](docs/install-cursor.md)：Cursor 安装
- [docs/install-codex.md](docs/install-codex.md)：Codex 安装
