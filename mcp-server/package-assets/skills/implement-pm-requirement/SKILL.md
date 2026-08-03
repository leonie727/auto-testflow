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

与 `process-pm` 的边界：

- 从 PM 入口进入时，由 `process-pm` 创建/复用 Task Context，并移交 `context_id`
- 本 Skill **只读** `get_task_context_view(view=IMPLEMENT_VIEW)`，不读完整 Context / artifact / 完整 PM
- 用户已提供确认方案时，可直接进入实现；未有足够方案时，返回 `process-pm` 分析阶段
- **直接调用本 Skill、无 `context_id` 时**：走「独立入口」，获取必要信息后 **创建** Task Context，后续统一用 Context（禁止长期双轨）

遵循项目根目录 `AGENTS.md`。区分 **AutoTestFlow 仓库** 与 **业务自动化测试项目**，默认只改测试项目；除非用户明确要求，否则不修改 AutoTestFlow 自身代码。

---

## 阶段〇：Task Context（IMPLEMENT_VIEW）

1. 若有 `context_id`：调用 `get_task_context_view`，`view` **必须**为 `IMPLEMENT_VIEW`。记下 `revision`。
2. 复用 View 中已有：`task` / `source`（含 `pm_snapshot_ref`，**不要**主动展开全文除非缺口）/ `project` / `routing` / `analysis` / `implementation.target_files` / `references`。
3. 字段门禁：

| 状态 | 行为 |
| --- | --- |
| 已有且可用 | 直接复用；**禁止** `read_pm_issue`、重复外链、广域扫描 |
| missing / stale / conflict | 仅补该缺口；结果用 `patch_task_context`（`expected_revision`）写回 |
| patch 返回 revision 冲突 | 重新 `get_task_context_view(IMPLEMENT_VIEW)`，再 patch **一次**；禁止无校验覆盖 |

4. 不复述 Context 中已有需求摘要与覆盖分析。单次任务不得另建第二个 Context（独立入口首次创建除外）。

---

## 阶段一：读取和分析

### 有 context_id（推荐）

1. 完成阶段〇；信息足够则跳到实现路径判断与阶段二。
2. 仅对 missing / stale / conflict 字段补读或局部搜索，并 patch 回 Context。

### 独立入口（无 context_id）

严格按以下顺序执行，完成后 **立即** `create_task_context`（`pm_snapshot` 存完整 PM 原始结果；主文件只写结构化结论），后续只使用该 `context_id`：

1. 识别 PM 编号或 URL → `read_pm_issue`（仅此入口允许；失败则停止）。
2. 必要外链：`read_pm_reference`（失败记原因）。
3. 按需识别项目/框架/目标文件（最小范围，避免无目标广域扫）。
4. `create_task_context`：`source.entry`=`implement-pm-requirement`；写入 `task` / `project` / `routing`（若可知）/ `implementation.target_files` / `analysis` 摘要等。
5. 判断实现路径：改已有 / 文件内新增 / 新建文件 / 只补验证 / 暂不适合自动化。

找不到目标测试项目时先说明，不在错误目录创建测试文件。

---

## 阶段二：实施前确认

修改代码前必须输出实施方案：

- **不复述** Context / 上游已有的 PM 摘要、路由理由、覆盖分析。
- **只补充**具体修改位置、实现步骤、可复用方法、风险、验证方式、回置与待确认项。

```markdown
# 实施方案

- context_id：
- context_revision：
- PM编号：
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
- Context已复用：（列出字段，勿粘贴全文）
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

9. 代码修改完成后，立即 `patch_task_context`（`expected_revision` 为阶段〇/上次成功修订号）：
   - `implementation.status`：如 `code_completed`
   - `implementation.changed_files`
   - `implementation.summary`：短摘要，非完整脚本
   - 冲突则重新读 `IMPLEMENT_VIEW` 后再 patch 一次

---

## 阶段四：验证（VERIFY_VIEW）

有 `context_id` 时（本阶段必走 Context）：

1. `get_task_context_view(view=VERIFY_VIEW)`，复用：项目/框架、目标脚本、`implementation` 状态、`request.run_intent`。  
   **禁止**再次 `read_pm_issue`、重新识别项目或广域扫描。
2. 运行意图（同任务已确认/拒绝后不再问）：
   - 明确要求运行 / headed / debug → 直接只跑**本次目标脚本**
   - 明确不运行 / 只改代码 → 保持 `implementation.status=code_completed`，`patch`：`verification.status=not_run`，结束运行步骤
   - 未表达意图 → **只问一次**是否以 headed 运行目标脚本
3. 运行前 `patch_task_context`（`expected_revision`）：  
   `verification.status=running`，`verification.mode`，`verification.command`
4. 运行后：完整结果经 `write_task_context_artifact` 写入（如 `run_result.json`），再 patch：  
   `verification.status=verified|failed|blocked`，`passed`，`failed`，`duration`，`result_ref`，`summary`  
   **仅目标脚本真实运行通过**才允许 `status=verified`。`code_completed ≠ verified`。
5. patch 冲突：重新读 `VERIFY_VIEW`，最多再 patch **一次**；禁止整体覆盖。
6. `not_run` / `failed` / `blocked`：禁止输出「验证通过」；未 `verified` 禁止把 PM 说成已解决或完成度 100%。
7. 只跑目标脚本；Playwright 优先 headed；Puppeteer 用项目现有入口。

无 `context_id` 的遗留路径：先按阶段一独立入口创建 Context，再进入本阶段。

---

## 阶段五：PM 评论（REPORT_VIEW）

需要回填时：

1. `get_task_context_view(view=REPORT_VIEW)`。**禁止**重读 PM、脚本、项目或运行日志正文；`detailed` 只改格式，不触发再分析。
2. 用 REPORT_VIEW 结构化字段生成 **一次** brief（默认）或 detailed 评论。
3. `write_task_context_artifact` 写入评论全文（如 `pm_comment_draft.md`），响应只留 `artifact_ref`。
4. `patch_task_context`：  
   `pm_update.status=draft_ready`，`format`，`draft_ref`，`confirmed=false`
5. 展示预览并**只问一次**是否回填。
6. 用户确认「确认回填 / 提交评论」后才调用 `add_pm_comment`（`confirmed=true`）；成功后再 patch：  
   `pm_update.status=updated`，`confirmed=true`，`updated=true`
7. 用户拒绝：`pm_update.status=cancelled`，不再问，不调用回填工具。
8. patch 冲突：重读 `REPORT_VIEW` 后最多再试一次。

正常输出保持轻量：修改摘要、目标脚本路径、运行询问/结果、PM 评论预览、`context_id`。

---

## 最终输出格式

```markdown
# 实现结果

- context_id：
- context_revision：
- PM编号：
- 修改文件：
- 新增文件：
- 主要实现：
- implementation.status：
- verification.status：not_run | running | verified | failed | blocked
- pm_update.status：
- pm_comment_format：brief | detailed

# 验证结果

- 语法检查：
- 目标测试：（未运行 / 通过 / 失败 / 阻塞）
- result_ref：
- 未完成项：

# 注意事项

- 数据回置情况：
- 是否执行 Git 操作：否

# 建议回填 PM 评论（预览）

展示预览；draft_ref 指向 artifact。默认不调用 `add_pm_comment`。
仅「确认回填 / 提交评论」后才写入。
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
10. 用户未确认回填时绝不调用 `add_pm_comment`。
11. 防止同一评论短时间重复提交。
