# AutoTest-flow

面向自动化测试工程师的 Cursor AI 工作流工具。

## 项目目标

通过 Cursor AI + MCP Server，串联自动化测试全流程：

- 读取 PM 需求
- 分析需求影响范围
- 关联自动化测试代码
- 调用 Playwright 执行测试
- 分析测试失败原因
- 生成测试报告

## 项目结构

```
AutoTest-flow
├── mcp-server/     # MCP Server（JavaScript）
├── skills/         # Cursor Skills（预留）
├── commands/       # Cursor Commands（预留）
├── rules/          # Cursor Rules（预留）
└── README.md
```

## 技术栈

- Node.js + JavaScript
- MCP Server（`@modelcontextprotocol/sdk`）
- 后续集成 Playwright

## 当前阶段

仅完成项目基础结构，业务逻辑尚未实现。

## 快速开始

```bash
cd mcp-server
npm install
npm start
```

## Cursor MCP 配置示例

在 Cursor 的 MCP 配置中添加：

```json
{
  "mcpServers": {
    "autotest-flow": {
      "command": "node",
      "args": ["src/index.js"],
      "cwd": "绝对路径/AutoTest-flow/mcp-server"
    }
  }
}
```
