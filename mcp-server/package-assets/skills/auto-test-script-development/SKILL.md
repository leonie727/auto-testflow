---
name: auto-test-script-development
description: >-
  Playwright/Puppeteer 自动化异常验证、问题分类、记录通报与脚本最小修补。
  用于已有脚本失败、系统异常验证、线上失败本地成功等场景；
  仅在 SCRIPT_CONFIRMED 后修改代码。新需求实现请走 implement-pm-requirement。
---

# Auto Test Script Development

用于 Playwright 与 Puppeteer 自动化测试的**异常验证、分类、记录、通报与最小修补**。

本 Skill **不是**新需求实现入口。新 PM / 新测试用例必须走 `implement-pm-requirement`（需求分析与脚本实现流程）。

遵循项目根目录 `AGENTS.md`。永不输出 `PM_API_KEY`、Cookie、密码或完整敏感请求头。

### References 按模式读取（禁止默认全量加载）

Skill 被激活时**不得**预先读取全部 `references/`。默认最多读 **一份**；仅当任务明确跨越两个模式时才允许读第二份。已获得模板或分类结果则直接复用，不得重读。普通脚本修补若不涉及输入整理、异常分类或 PM 回填，可不读任何 reference。

| 模式 | 允许读取的 reference | 说明 |
| --- | --- | --- |
| `TRIAGE` / 输入整理 | [input-templates.md](./references/input-templates.md) | 仅整理失败输入时 |
| `CLASSIFY` / 异常分类 | [issue-classification.md](./references/issue-classification.md) | 判定 SYSTEM/SCRIPT/DATA/ENVIRONMENT/UNCONFIRMED 时 |
| `REPORT` / PM 回填 / 评论生成（含 brief 与 detailed） | [output-templates.md](./references/output-templates.md) | 只读这一份，不另读其他 reference |
| `TRACE` / `MANUAL_VERIFY` / `PATCH` / `REVIEW` / `RECORD` / `EXPLAIN` | 无（除非同时进入上表模式） | 依赖本 SKILL 正文与已有上下文 |

---

## 判断工作模式

根据用户当前目标选择一个主模式；任务跨阶段时，按实际进度切换并明确当前模式。切换模式后再按上表读取对应 reference，不要一次读齐。

| 模式 | 使用条件 | 主要输出 |
| --- | --- | --- |
| `TRIAGE` | 收到新的失败、日志或异常描述 | 输入缺口、框架线索、下一步 |
| `TRACE` | 需要追踪测试入口到失败语句 | 真实调用链、成功阶段、失败阶段 |
| `MANUAL_VERIFY` | 需要设计或接收手动验证 | 最小人工步骤、观察项、验证结果 |
| `CLASSIFY` | 证据足以判断问题性质 | `SYSTEM`、`SCRIPT`、`DATA`、`ENVIRONMENT` 或 `UNCONFIRMED` |
| `PATCH` | 已进入 `SCRIPT_CONFIRMED` | 最小修补计划、修改、目标验证 |
| `REVIEW` | 需要审查修改或修复结论 | diff 范围、断言、等待、副作用和验证状态 |
| `REPORT` | 已确认 `SYSTEM` 或 `DATA` | 系统异常通报 / 数据问题通报 |
| `RECORD` | 需要沉淀脱敏诊断记录 | 调用 `save_test_issue_record` |
| `EXPLAIN` | 用户只需要解释事实、流程或结论 | 有来源的说明和待确认项 |

不要仅因用户提到“修复”就直接选择 `PATCH`。先检查分类门禁。

---

## 强制门禁

1. 未完成问题分类前，不得修改业务代码。
2. 用户说“先不要改代码”时，保持只读，不进入 `PATCH`。
3. 只有 `SCRIPT_CONFIRMED` 才允许修改。
4. `SYSTEM`、`DATA`、`ENVIRONMENT`、`UNCONFIRMED` 均禁止修改业务脚本。
5. **系统问题**：记录并生成【系统异常通报】。
6. **数据问题**：记录并生成【数据问题通报】；数据问题不得描述成系统问题。
7. **脚本问题**：最小修补并生成【脚本修复说明】。
8. **环境问题**：记录环境证据，不生成系统/数据通报。
9. **本地成功不能单独作为系统问题结论**（线上失败、本地成功仍需手动与数据/环境证据）。
10. 未运行目标测试，不得声称修复完成。
11. 目标测试运行失败时，不得声称修复完成。
12. 不得虚构路径、命令、API、工具方法、执行方式或项目规范。
13. 不得把 Playwright 与 Puppeteer 的 API、命令或生命周期混用。
14. 未经用户明确回复「确认回填」不得调用 `add_pm_comment`。
15. 不自动修改 PM 状态、负责人、优先级和完成度。

---

## 核心工作流

### 1. 输入信息

接收并整理：

- 测试编号或用例名、测试文件、项目根目录
- 报错日志与错误类型、失败步骤及前后步骤
- 截图、DOM 或 Trace
- 页面地址、使用角色、前置数据与清理状态
- 预期结果、手动验证结果
- Network、接口响应或 Console 证据
- 用户是否允许修改代码和运行目标测试

把输入分成：已确认事实 / 用户工作规范 / 审计推断 / 待确认事项。

缺失信息不阻止只读分析，但必须列为待补证据。不得补造路径、页面入口、角色、方法、命令或业务预期。

### 2. 状态机

```text
START
→ INTAKE
→ PROJECT_DETECTED
→ CONTEXT_COLLECTED
→ CALL_CHAIN_READY
→ WAITING_MANUAL_VERIFICATION
→ CLASSIFIED

SYSTEM → SYSTEM_REPORT_READY → RECORD → PM_DRAFT → COMPLETED
DATA → DATA_REPORT_READY → RECORD → PM_DRAFT → COMPLETED
ENVIRONMENT → ENVIRONMENT_RESULT_READY → RECORD → COMPLETED
SCRIPT → PATCH_PLANNED → PATCH_APPLIED → VERIFIED → RECORD → COMPLETED
UNCONFIRMED → MORE_EVIDENCE_REQUIRED
```

状态约束：

- `PROJECT_DETECTED` 必须有文件路径、依赖、配置或入口结构证据。
- `CALL_CHAIN_READY` 必须区分已完成阶段和失败阶段。
- 没有实际手动结果时，停在 `WAITING_MANUAL_VERIFICATION`。
- `SCRIPT → PATCH_PLANNED` 前必须进入 `SCRIPT_CONFIRMED`。
- `PATCH_APPLIED` 不等于 `VERIFIED`。
- 只有目标测试实际运行并通过，才能进入 `VERIFIED`。
- 新证据推翻原分类时，回到 `CONTEXT_COLLECTED` 或 `CALL_CHAIN_READY`。

### 3. 调用链分析

识别项目顺序：失败文件路径 → `package.json` → 配置文件 → 源码 API → 测试入口。无法确认时返回 `UNKNOWN`，不猜测框架。

从实际测试入口向下追踪：

```text
测试入口 → 业务阶段 → 失败业务方法 → 模块 helper → 公共工具 → 框架 API / 断言
```

记录真实文件路径与方法名、已成功阶段、首个可确认失败阶段、后续未执行阶段。调用链不完整时标记“待确认”。

### 4. 手动验证

系统异常默认先做最小手动验证。设计步骤时：

1. 从失败阶段前一个可确认状态开始。
2. 使用真实页面地址、角色和前置数据。
3. 只保留复现失败点所需操作。
4. 使用产品文案，不照抄 selector。
5. 观察页面、Network、Console、请求、响应、新页面、下载和数据回显。
6. 对写数据操作说明清理方式。
7. 无法确认页面入口或数据时写“待确认”。

### 5. 问题分类处理分支

| 分类 | 代码 | 记录 | 通报/说明 |
| --- | --- | --- | --- |
| `SYSTEM` | 禁止修改 | `save_test_issue_record` | 【系统异常通报】 |
| `DATA` | 禁止修改 | `save_test_issue_record` | 【数据问题通报】 |
| `SCRIPT` | 仅 `SCRIPT_CONFIRMED` 后最小修补 | `save_test_issue_record` | 【脚本修复说明】 |
| `ENVIRONMENT` | 禁止修改 | `save_test_issue_record` | 记录环境证据 |
| `UNCONFIRMED` | 禁止修改 | 可选记录缺口 | 仅分析，暂不改代码 |

正反证据以当前已读的 classification 规则为准；若尚未读取且处于 `CLASSIFY`，再读 [issue-classification.md](./references/issue-classification.md)，勿连带加载其他 reference。

### 6. SCRIPT 修补流程

仅在 `SCRIPT_CONFIRMED` 后执行：

1. 说明测试入口、真实调用链、已成功阶段和失败阶段。
2. 说明根因、计划修改位置和不修改其他位置的原因。
3. 修改范围优先：当前失败语句 → 当前业务方法 → 文件内 helper → 模块 helper → 全局工具。
4. 优先复用项目已有工具；使用框架专属 API，不跨框架套用。
5. 保持业务目标和核心断言。
6. 不用固定等待、扩大 timeout、吞异常或 `skip` 掩盖失败。
7. 不做无关重构、全文件格式化或新增依赖。
8. 修改后检查 diff、临时日志、副作用、数据清理和资源清理。
9. 代码完成后 `verification_status=code_completed`。目标运行意图（同一任务内已确认或拒绝后**不得再问**）：
   - 用户已明确要求运行 / headed / debug → **直接**只跑本次目标脚本，不再询问。
   - 用户已明确要求不运行 / 只改代码 → 保持 `code_completed`，**直接结束**运行步骤，不再询问。
   - 用户未表达运行意图 → **只询问一次**：「脚本已完成，是否以 headed 模式运行目标脚本进行验证？」
10. 运行时**只跑本次目标脚本**（不跑全量）：Playwright 优先 headed；Puppeteer 用项目现有入口，不自造命令。
11. 未运行或非 `verified`：不得声称验证通过。
12. 运行通过 → `verified`；运行失败 → `failed`；系统/数据/环境阻塞 → `blocked`。再输出【脚本修复说明】。

### 7. 诊断记录

分类完成后（尤其是 `SYSTEM` / `DATA` / `SCRIPT` / `ENVIRONMENT`），调用 MCP `save_test_issue_record`，将**脱敏后**的 Markdown 保存到：

`~/.autotest-flow/records/YYYY-MM-DD/`

记录中不得包含：`PM_API_KEY`、Cookie、密码、完整敏感请求头、Token。

### 8. PM 回填

系统/数据问题完成验证后，或 SCRIPT 修补产生可回填结果时：

1. **复用**当前流程已有分析与运行结果，按 `pm_comment_format`（默认 `brief`）生成**一次**评论预览。若需模板且未读过，仅在 `REPORT` 模式下读取 [output-templates.md](./references/output-templates.md)（brief/detailed 均只读这一份）。可用 `build_pm_comment_draft` 作简洁骨架，detailed 在骨架上扩写，**禁止**为全面版再次读 PM/脚本/项目。
2. 展示预览后**只询问一次**是否回填。
3. **默认不提交**。仅当用户明确回复「确认回填」或「提交评论」后，才调用 `add_pm_comment`（`confirmed=true`）。
4. 不自动修改 PM 状态、负责人、优先级、完成度。
5. 相同评论短时间重复提交由工具阻止；被拒时说明原因，不强行再写。
6. 「处理这个PM」「分析一下」「帮我看下」**不能**视为回填确认。
7. 未运行或非 `verified` 时，评论结论禁止「验证通过」「已解决」「完成度 100%」。

Token 控制：一次分析、一次修改、一次目标运行、一次评论生成；正常只输出修改摘要、目标脚本路径、运行询问、运行结果、PM 评论预览。

---

## 最终输出格式

```text
当前模式：
当前状态：
框架：
项目根目录：
测试编号：
测试文件：
问题分类：
分类门禁：
verification_status：code_completed | verified | failed | blocked | （未改代码则无）
pm_comment_format：brief | detailed
已确认事实：
审计推断：
证据：
已完成阶段：
失败调用阶段：
是否修改代码：
修改位置：
修改内容：
验证方式：
验证结果：
系统通报 / 数据通报 / 脚本修复说明：
诊断记录路径：
PM 评论草稿：
待补充事项：
下一步：
```

结果表述：

| 实际状态 | verification_status | 允许表述 |
| --- | --- | --- |
| 只完成分析 | （无） | 已分析，尚未修改 |
| 已修改但未运行 | `code_completed` | 已修改，待验证 |
| 已运行但失败 | `failed` | 已运行，目标仍失败 |
| 已运行并通过 | `verified` | 目标测试已运行并通过，修复完成 |
| 环境/系统/数据阻塞 | `blocked` | 已修改或已分析，因环境限制无法验证 |

只有 `verified` 才能写「修复完成 / 验证通过」。没有修改时，修改位置和修改内容明确写“无”。

---

## 与其他 Skill 的边界

| 场景 | 应使用 |
| --- | --- |
| 新 PM / 新测试用例 / 新需求实现 | `process-pm` 路由后进入 `implement-pm-requirement` |
| 已有需求变更 | `process-pm` 分析并确认后进入 `implement-pm-requirement` |
| 已有脚本失败 / 系统异常验证 / 线上失败本地成功 | **本 Skill** |
| 未指明流程的 PM 入口 | `process-pm` |

禁止在其他 Skill 中复制本文件全文；需要时引用本 Skill 名称即可。
