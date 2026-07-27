# AutoTest-flow MCP Server

基于 JavaScript 实现的 MCP Server，为 Cursor AI 提供自动化测试工作流能力。

## 技术要求

- Node.js >= 18
- 纯 JavaScript（不使用 TypeScript）
- 依赖：`@modelcontextprotocol/sdk`

## 安装与启动

```bash
npm install
npm start
```

## 目录说明

```
mcp-server
├── package.json
├── src/
│   └── index.js    # MCP Server 入口（stdio）
└── README.md
```

## 当前状态

仅完成服务骨架：创建 MCP Server 并连接 stdio transport。

尚未注册任何工具，业务逻辑待后续阶段实现。

## 后续规划

| 能力 | 说明 |
|------|------|
| 读取 PM 需求 | 接入需求文档来源 |
| 分析影响范围 | 评估需求对测试的影响 |
| 关联自动化代码 | 映射需求与测试用例 |
| 执行 Playwright | 触发自动化测试 |
| 失败原因分析 | 解析失败日志与堆栈 |
| 生成测试报告 | 输出结构化报告 |
