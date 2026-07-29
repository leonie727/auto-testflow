---
name: implement-pm-requirement
description: 根据指定 PM 需求，在当前 Playwright 或 Puppeteer 项目中分析并实现 JavaScript 自动化测试脚本。必须先输出实施方案并获得用户确认，再修改代码。
---

# Implement PM Requirement

根据指定 PM 需求，在目标 Playwright / Puppeteer 项目中分析并实现 JavaScript 自动化测试脚本。

触发场景包括但不限于：

- 根据 PM 编号编写自动化脚本
- 实现这个 PM 的自动化测试
- 按照需求分析结果修改测试代码
- 为该需求新增 Playwright 用例
- 根据 PM 修改已有 Puppeteer 脚本
- 执行已经确认的 PM 测试方案

遵循项目根目录 `AGENTS.md`。区分 **AutoTestFlow 仓库** 与 **业务自动化测试项目**，默认只改测试项目；除非用户明确要求，否则不修改 AutoTestFlow 自身代码。

---

## 阶段一：读取和分析

严格按以下顺序执行：

1. 识别用户提供的 PM 编号或完整 URL。

2. 调用 `autotest-flow` MCP 的 `read_pm_issue`。

3. PM 读取失败时：
   - 输出失败原因
   - 停止任务
   - 不猜测需求内容
   - 不修改代码

4. 读取当前目标测试项目中的规范，优先检查：
   - `AGENTS.md`
   - `README.md`
   - `package.json`
   - `playwright.config.js`
   - puppeteer 配置
   - `.cursor/rules`
   - 项目已有测试规范

5. 根据 PM 内容搜索：
   - 相同 PM 编号
   - 相同模块
   - 相似业务流程
   - 相关 spec 或测试类
   - 公共工具方法
   - 页面地址
   - 账号配置
   - 定位器
   - 接口封装
   - 测试数据
   - 清理和回置方法

6. 识别目标测试项目框架（修改代码前必须完成）：
   1. 先读取目标项目 `package.json` 与目录结构。
   2. 检测到 `@playwright/test` 时使用 Playwright 规则。
   3. 检测到 `puppeteer` 或 `puppeteer-core` 时使用 Puppeteer 规则，并阅读 `references/frameworks/puppeteer.md`。
   4. 检测到 `fanyajw-auto-tests` 项目标识（包名或仓库结构）时，必须读取：
      `references/projects/fanyajw-auto-tests.md`
   5. 不允许在 Puppeteer 项目中生成：`test.describe`、`test()`、`page.locator()`、Playwright `expect`。
   6. 不允许在 Playwright 项目中生成 Puppeteer ElementHandle 为主的写法（除非目标文件已是该风格且用户明确要求）。
   7. 无法确认框架时，停止并向用户说明，不得猜测。
   8. 两种框架依赖同时存在时，根据目标测试文件与项目运行入口判断；仍不明确则停止确认。

7. 判断实现路径：
   - 修改已有测试
   - 在已有文件新增 test
   - 新建测试文件
   - 只补充验证项
   - 需求暂不适合自动化

找不到目标测试项目时先说明，不在错误目录创建测试文件。

---

## 阶段二：实施前确认

修改代码前必须输出：

```markdown
# 实施方案

- PM编号：
- 需求标题：
- 测试框架：
- 推荐实现方式：
- 预计修改文件：
- 预计新增文件：
- 可复用方法：
- 测试数据准备：
- 验证项：
- 回置方案：
- 风险点：
- 待确认事项：
```

输出方案后立即停止。

除非用户明确回复以下同类意图，否则不得修改代码：

- 确认实施
- 按方案修改
- 开始编写
- 执行这个方案

不得将用户最初的「帮我编写脚本」自动视为二次确认。

---

## 阶段三：代码实现

用户确认后：

1. 重新检查目标文件当前内容，避免基于过期上下文修改。

2. JavaScript 项目不得改成 TypeScript。

3. 优先复用项目已有：
   - goto
   - locator
   - 登录方法
   - 数据创建方法
   - 接口方法
   - 弹窗处理方法
   - 清理方法
   - 断言风格

4. 遵循最小稳定修改原则：
   - 优先在原方法内修补
   - 不进行无关重构
   - 不随意新增公共方法
   - 不批量格式化
   - 不更改无关测试
   - 不改动业务含义

5. 禁止：
   - `waitForTimeout`
   - `setTimeout` 固定等待
   - `sleep`
   - 无意义重试
   - 大范围 try/catch 掩盖错误
   - 删除有效断言
   - 降低断言标准来让测试通过
   - 将 `PM_API_KEY` 写入代码
   - 输出 `PM_API_KEY`
   - 自动执行 Git commit 或 push

6. 等待策略优先使用：
   - `expect().toBeVisible()`
   - `expect().toHaveText()`
   - `waitForResponse()`
   - `waitForURL()`
   - `waitForLoadState()`
   - locator 状态
   - 页面真实业务状态

7. 测试数据必须考虑：
   - 唯一命名
   - 避免并发污染
   - 创建失败提示
   - 测试结束后的回置
   - 回置失败时保留可定位信息

8. Playwright 和 Puppeteer 必须遵循当前项目原有写法，不擅自迁移框架。

---

## 阶段四：验证

代码修改完成后：

1. 先执行 JavaScript 语法检查。

2. 优先执行目标测试，不运行整个测试项目。

3. 使用项目已有 npm script 或测试命令。

4. 未经用户允许不得：
   - `npm install`
   - 更新依赖
   - `npm audit fix`
   - `npm audit fix --force`

5. 测试失败时先分类：
   - 系统问题
   - 测试数据问题
   - 环境问题
   - 脚本问题

6. 没有证据时不得直接认定为系统问题。

7. 如果是脚本问题：
   - 定位直接原因
   - 进行一次最小稳定修补
   - 再执行目标验证

8. 如果是系统、数据或环境问题：
   - 不为了让用例通过而修改业务断言
   - 输出手动复现步骤和证据
   - 停止继续盲目修补

---

## 最终输出格式

```markdown
# 实现结果

- PM编号：
- 修改文件：
- 新增文件：
- 主要实现：
- 复用内容：

# 验证结果

- 语法检查：
- 目标测试：
- 问题分类：
- 测试报告：
- 截图或 Trace：
- 未完成项：

# 注意事项

- 数据回置情况：
- 需要人工确认的内容：
- 是否执行 Git 操作：否
```

---

## 安全边界

1. 不读取或展示 `.env` 内容。
2. 不输出 `PM_API_KEY`。
3. 不在代码、日志或报告中写入密钥。
4. 不自动提交和推送 Git。
5. 不执行危险文件删除命令。
6. 不修改 AutoTestFlow 自身代码，除非用户明确要求。
7. 当前打开的业务测试项目与 AutoTestFlow 项目必须区分。
8. 找不到目标项目时先说明，不在错误目录创建测试文件。
9. 用户未确认实施方案时绝不修改业务代码。
