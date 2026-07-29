# Puppeteer 通用编写参考

面向 AutoTestFlow 实现自动化脚本时的通用 Puppeteer 规则。  
**不包含**特定业务仓库（如 fanyajw-auto-tests）的专属目录、命令或账号约定；项目细则见 `references/projects/`。

## 适用判定

- `package.json` 依赖含 `puppeteer` 或 `puppeteer-core`
- 且不以 `@playwright/test` 作为主测试声明框架

## 基本约定

- 使用 JavaScript；不要把现有 Puppeteer 工程改成 TypeScript 或 Playwright
- 操作对象以 `page`、`Frame`、`ElementHandle` 为主，而不是 Playwright `Locator`
- 优先复用目标项目已有封装；没有封装时再写原生 Puppeteer API

## 推荐等待

优先：

- `page.waitForSelector` / 项目封装的 selector 等待
- `page.waitForNavigation`
- `page.waitForResponse` / `waitForRequest`
- 网络空闲类封装（若项目提供）
- 基于真实业务状态的断言（文本、属性、列表条数）

避免：

- 固定 `sleep` / `setTimeout` 作为主等待策略
- Playwright 的 `page.waitForTimeout`（不属于 Puppeteer 推荐用法，且与 AutoTestFlow 规范冲突）

## 禁止混用 Playwright API

在 Puppeteer 项目中不要生成：

- `test.describe` / `test()`
- `page.locator()`
- `@playwright/test` 的 `expect`
- `storageState` 工程化假设（除非目标项目已自建等价能力）

## 元素与交互

- 查询：`$` / `$$` 或项目 `query` 封装
- 点击、输入：优先项目封装；必要时 `click` / `type` / `uploadFile`
- iframe：先拿到 frame（`contentFrame` / `frames`），再在 frame 内查询
- 文件下载：结合 CDP / 下载目录配置 / 项目下载中心封装，不假设 Playwright download API

## 断言与失败处理

- 常用 Node `assert` 或项目软断言
- 失败时保留可定位信息（步骤名、关键文案、文件路径）
- 先区分系统 / 数据 / 环境 / 脚本问题，再决定是否改断言

## 与 Playwright 的边界

| Puppeteer | 不要写成 |
|-----------|----------|
| ElementHandle + 项目 query | `page.getByRole` / `locator` 链路 |
| 自定义 runner / class 用例 | `test.describe` 套件 |
| `assert.equal` | Playwright `expect(locator).toHaveText` |

无法确认框架时停止并向用户确认，不要猜测。
