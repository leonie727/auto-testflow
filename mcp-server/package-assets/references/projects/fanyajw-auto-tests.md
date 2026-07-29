# fanyajw-auto-tests 项目适配档案

只读审计结果。路径均为相对 `fanyajw-auto-tests/` 仓库根或其内层包目录 `fanyajw-auto-tests/`（以 `package.json` 所在目录为准）。  
**不含本机绝对路径、账号口令、Cookie、API Key。**

审计代表性用例（只读）：

| 类型 | 相对路径 |
|------|----------|
| 普通页面操作 | `fanyajw-auto-tests/src/run_scripts/thesis/tests_456334.js` |
| 多角色 | `fanyajw-auto-tests/src/run_scripts/thesis/tests_457145/tests_457145.js` |
| 下载 / 任务中心 | `fanyajw-auto-tests/src/run_scripts/basis/tests_457862/tests_457862.js`、`.../thesis/tests_456621/tests_456621.js` |
| 数据创建与回置 | `fanyajw-auto-tests/src/run_scripts/thesis/tests_470985.js`、`tests_456621`（含 `reset`） |
| check_point 结构 | `fanyajw-auto-tests/src/run_scripts/thesis/tests_470985.js`、`tests_457862` |

---

# 项目基本信息

- 项目名称：`fanyajw-auto-tests`（成教自动化测试）
- 技术栈：Node.js + **Puppeteer** + `puppeteer-cluster`；辅助：`axios`、`assert`、`commons-js-zelda` 等
- Node.js 模块类型：`"type": "module"`（ES Module）
- Puppeteer 版本来源：`package.json` → `"puppeteer": "^24.4.0"`（非 puppeteer-core）
- 另有：`"puppeteer-cluster": "^0.24.0"`
- 测试启动方式：`npm start` → `node src/main.js`
- 是否存在自定义测试运行器：**是** — `src/main.js` 的 `Executor` + `src/commons/puppeteer.js` / `PuppeteerManager`
- 无 `AGENTS.md`（未确认仓库级 Agent 规范文件）
- README：`README.md`（成教模块分工与流程说明；含外部飞书链接，档案不转载口令）

`run_scripts` 业务模块目录（已确认存在）：

`basis`、`degree`、`exam`、`finance`、`graduate`、`student`、`thesis`

---

# 用例结构

## 测试类命名规则

- 默认导出 class，通常命名为 `Tests_<PM编号>`
- 必须实现 `get name()`，且以 `tests_` 开头，调度器才收录（见 `src/main.js` `loadTests`）
- 常继承：
  - `src/commons/TestCase.js`
  - 或 `src/run_scripts/degree/DegreeTestCase.js`（学位/毕业/论文）
  - 或其他模块基类（如 `basis/BasisTestCase.js`）

## 文件命名规则

- 扁平：`src/run_scripts/<module>/tests_<PM>.js`
- 或目录：`src/run_scripts/<module>/tests_<PM>/tests_<PM>.js`
- 附件/下载产物常放在同目录 `downloads/` 或同级资源文件（未统一强制）

## run 方法职责

- 入口编排：登录 → 若干 `check_point_*` → 可选 `reset` / 清理
- 接收 `page`（由 Cluster / PuppeteerManager 注入）
- 不负责浏览器生命周期

## check_point 方法职责

- 承载单个验证步骤（`check_point_1`、`check_point_2`… 或语义名）
- 可选 `get stepMap()` 将步骤名映射为中文说明（供监控/报告）
- 步骤内调用公共工具完成页面操作与 `assert`

## 角色切换方式

- **非 CLI 角色参数**；通过方法切换会话：
  - `DegreeTestCase.login_config(page)`：管理端登录
  - `DegreeTestCase.teacher_login(page, { uid, username })`：mock 教师
  - `DegreeTestCase.student_login({ uid, username }, login_admin_page)`：mock 学生
  - 底层：`src/commons/login.js` 的 `login` / `mock_teacher` / `mock_student` / `mock_login`
- 账号与口令硬编码在基类/登录调用处；**实现与文档不得回显真实密钥**

## setup / teardown 方式

- 无 Playwright 式 `beforeEach`/`afterEach`
- Setup：用例 `run` 开头调用登录方法；Cluster 由 `PuppeteerManager.initialize()` 统一创建
- Teardown：用例内显式 `reset`/删除临时数据；`PuppeteerManager.close()` / `waitForClose()` 关闭 Cluster
- `TestCase.recycle()`：失败重试前重置 `failed`/`start`/`end`

## 数据准备与回置方式

- 准备：用例内构造对象（常配合 `id()` 随机串）、上传本地附件、新建流程/院系等
- 回置：同文件 `reset`、删除流程、恢复搜索条件等（如 `tests_456621` 的 `reset`，`tests_470985` 的 `check_point_4` 删除流程）
- 无统一 fixture 框架

## 日志输出格式

- 启动：`Found N testCase(s): ...`、`EXECUTE_MODE is ...`、`START_TESTCASE is ...`
- 单测：`TestCase: <name>(queue:...) is starting .`
- 步骤：`StepMonitorHook`（`src/commons/hooks_factory.js`），`headless=true` 时 buffered，否则 realtime
- 结束：`console.table` 汇总；`output_result` 文本通报；CI 产物 HTML/JUnit

---

# 核心调用链

```
npm start
→ fanyajw-auto-tests/src/main.js  (Executor.run)
→ loadTests：扫描 src/run_scripts[/<BUSINESS_MODULE>]/**/*.js，实例化 default，过滤 name 以 tests_ 开头
→ handleEnvVariables：EXECUTE_MODE / START_TESTCASE / BUSINESS_MODULE
→ classifyTestCases：isQueue 串行 vs 并行
→ executeTests
   → runTestCase(test)                 # src/commons/puppeteer.js
      → PuppeteerManager.execute       # src/commons/puppeteer_manager.js
         → cluster.task → runScript(page, test)
            → hooks.beforeTest
            → test.run(page)           # 用例类
               → check_point_* / reset
               → commons/utils.js、selector_utils.js、login.js、download_center.js ...
            → hooks.afterTest / onTestFailed / 截图
→ generateResult：report_collector → HTML/JUnit + 控制台/通知
→ waitForClose → manager.close()
```

单文件本地调试旁路：

```
node src/run_scripts/<module>/tests_<PM>.js
→ src/commons/TestCase.js 底部：若 argv 指向 run_scripts/tests，则 import 后 runTestCase(test)
```

---

# 常用公共方法

| 能力 | 方法名 | 相对路径 |
|------|--------|----------|
| 页面跳转 | `goto` | `src/commons/utils.js` |
| 元素查询 | `query`、`query_until` | `src/commons/utils.js` |
| 点击 | `click`、`hover` | `src/commons/utils.js` |
| 输入 | `type`、`value` | `src/commons/utils.js` |
| iframe | 无统一封装；用例内 `ElementHandle.contentFrame()`（例：`student/tests_498788`） | 用例自管 |
| 等待导航 | `waitForNavigation` | `src/commons/utils.js` |
| 网络等待 | `waitForNetworkIdle`、`waitForResponse` | `src/commons/utils.js` |
| 选择器出现/隐藏 | `waitForSelector`、`waitForHidden` | `src/commons/utils.js` |
| 下载（URL/打开） | `download`、`download_open_file`、`config_download_settings` | `src/commons/utils.js` |
| 下载中心 / 任务 | `download_the_latest_file`、`wait_for_task_process`、`wait_for_download_file` 等 | `src/commons/download_center.js` |
| 文件上传 | `upload_file`、`upload_file_v2`；或 `fileInput.uploadFile(...)` | `src/commons/upload_file.js` / 用例 |
| 接口请求 | `update_info_confirm_status` 等（axios）；覆盖面有限 | `src/commons/apis.js` |
| 登录 / 角色 | `login`、`mock_login`、`mock_teacher`、`mock_student`、`login_config` | `src/commons/login.js`；基类包装在 `DegreeTestCase.js` |
| 属性读取 | `attr`、`property`、`textContent`、`innerText`、`computedStyle` | `src/commons/utils.js` |
| 弹窗处理 | `config_dialog_accept`、`config_dialog_cancel`、`get_dialog_message`、`cancel_dialog_accept` | `src/commons/utils.js` |
| Element UI 选择 | `el_select`、`select_single`、`select_single_v2`、`go_search` 等 | `src/commons/selector_utils.js` |
| 软断言 | `SoftAssert` | `src/commons/soft_assert.js` |
| 截图 | `screenshot`；失败时 ReportHook / captureScreenshot | `src/commons/utils.js`、`reporting/` |

说明：项目中可见 `sleep`（`commons-js-zelda`）。AutoTestFlow 规范禁止新增固定等待；改脚本时优先 `waitForNetworkIdle` / `waitForSelector` / `waitForResponse` 等。

---

# 编写约束

- 使用 JavaScript（ES Module），不改为 TypeScript
- 保持现有类结构：`export default class` + `get name` + `run` + `check_point_*`
- 优先在原方法内做小范围稳定修补
- 不新增无必要的公共方法
- 不新增固定等待（`waitForTimeout` / 无业务意义的 `sleep` / `setTimeout`）
- 不把 Playwright API（`test()`、`page.locator()`、`@playwright/test` expect）写进本项目
- 不将 Puppeteer 脚本改写成 Playwright
- 保留已有日志与步骤格式（`stepMap`、`check_point` 命名）
- 单个方法尽量不超过现有同类用例合理长度
- 系统、数据、环境、脚本问题先分类
- 系统问题才生成通报类结论
- 数据或脚本问题不冒充系统问题
- 不得把密钥写入新代码或报告

---

# 目标测试执行方式

依据 `package.json` 与 `src/main.js` / `TestCase.js` 实证：

| 场景 | 方式 | 说明 |
|------|------|------|
| 安装依赖后启动全量/筛选 | `npm start` | 等价 `node src/main.js` |
| `npm test` | **不可用** | 脚本为 `echo "Error: no test specified" && exit 1` |
| 按业务模块扫描 | 环境变量 `BUSINESS_MODULE` | 如 `thesis` → 扫描 `src/run_scripts/thesis` |
| 执行模式 | `EXECUTE_MODE` | 默认 `all`；`one` 表示只跑选定用例 |
| 按测试编号/名称 | `START_TESTCASE` | 如 `tests_470985`；可逗号/分号/空格分隔多个；大小写不敏感 |
| 有头/无头 | `headless=true` | 默认有头（`puppeteer_manager` / `puppeteer.js`） |
| 并发 | `maxConcurrency` | 默认 1 |
| 环境域名改写 | `BASE_URL` | 注册 `UrlRewriteHook` |
| 执行单个用例（推荐） | `EXECUTE_MODE=one` + `START_TESTCASE=tests_<PM>` + 可选 `BUSINESS_MODULE=<module>` + `npm start` | 来自 `main.js` |
| 本地单文件调试 | `node src/run_scripts/<module>/tests_<id>.js` | 来自 `TestCase.js` 底部自执行逻辑 |
| 按角色执行 | **无独立 CLI** | 在用例内调用 `login_config` / `teacher_login` / `student_login` |
| 失败日志 | 控制台 `Test <name>:` 错误栈；`StepMonitorHook` 步骤日志；`console.table` / `output_result` | |
| 截图 | 失败时 ReportHook → `ciReportCollector.captureFailureScreenshot`；工具 `screenshot(page)` | |
| 报告产物 | `report_collector.writeReports` → `index.html`、`junit.xml` 等（具体目录由 artifacts 实现决定） | 路径细节：**未在本档案强制写死**，以运行时输出为准 |
| 下载产物 | 用例常设 `config_download_settings(page, .../downloads)` | 见 `tests_456621` 等 |

**不得编造** Playwright 的 `npx playwright test` 等命令用于本项目。

---

# 与 Playwright 项目的差异

对照同级典型 Playwright 工程（如 `e2e-auto-tests`）与本项目：

| 维度 | fanyajw（Puppeteer） | Playwright 工程（典型） |
|------|----------------------|-------------------------|
| 测试声明 | `export default class` + `get name()` | `test` / `test.describe` |
| 断言 | Node `assert`、可选 `SoftAssert` | `@playwright/test` 的 `expect` |
| 页面对象 | 无统一 PO；逻辑在用例与 `commons` | 可选 fixtures / helpers；少经典 PO |
| 等待 | `waitForNetworkIdle`、`waitForSelector`、`waitForNavigation`、`waitForResponse`；历史代码含 `sleep` | `expect` 自动等待、`waitForURL`、`waitForLoadState` 等 |
| 运行方式 | 自定义 `main.js` + 环境变量 | `playwright.config.js` + `npx playwright test` |
| 报告 | 自研 HTML/JUnit + 控制台/IM | Playwright HTML/trace/reporter |
| 多角色 | mock 登录方法切换 page 会话 | 常多 `storageState` / project |
| 数据回置 | 用例内显式 reset/删除 | fixture teardown 或用例内清理 |
| 错误处理 | `test.failed`、全量模式失败重试、`ReportHook` 截图 | retry 配置、trace、screenshot on failure |
| 元素 API | `query`/`ElementHandle`/`page.$` | `locator` |

---

# 未确认事项

- CI 产物目录的固定相对路径（仅确认生成 `index.html` / `junit.xml`）
- 全仓库是否统一禁止 `sleep`（代码中仍存在使用）
- 非 `DegreeTestCase` 模块的账号来源是否全部硬编码（未逐文件核对）
- `ToolsTestCase` / `ignore-cases.json` 的完整调度语义（未展开）
