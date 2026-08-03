---
name: process-pm
description: >-
  先读取 PM 及关联资料，判断任务类型后选择对应流程（新需求实现、需求变更、
  异常验证与分类、系统异常验证或仅分析）。用户提供 PM 号/链接、说“处理这个PM”、
  或未指明具体流程时使用。禁止默认把所有 PM 称为诊断流程。需求分析（摘要、
  项目/框架识别、Coverage、测试点、修改与验证建议）统一在本 Skill 的分析阶段完成。
---

# Process PM

对外统一表述：

> 先读取 PM 及关联资料，判断任务类型后选择对应流程。

遵循项目根目录 `AGENTS.md`。永不输出 `PM_API_KEY`。

本 Skill 是**唯一推荐 PM 入口**。完整需求分析能力（摘要、项目识别、Coverage、测试点、修改与验证建议）仅在本 Skill 的「需求分析阶段」执行。

---

## 阶段一：读取 PM 与关联资料

1. 识别用户提供的 PM 编号或 URL。
2. 调用 MCP `read_pm_issue`。
3. 读取失败则输出原因并停止，不猜测需求。
4. 查看返回的 `externalReferences`：
   - 对 `accessStatus=allowed` 的链接逐个调用 `read_pm_reference`
   - 支持普通允许域名网页、飞书分享、学习通/超星分享
5. 合并分析材料：
   - PM 标题与描述（正文始终可用）
   - 成功读取的外链 `title` + `content`
6. 外链失败（登录、权限、未知域名、超时、网络）**不得阻止** PM 正文分析，但必须列出：
   - URL
   - 未读取原因（如 `requiresAuth` / `blocked` / `timeout`）

---

## 阶段二：任务类型判断

根据 PM 标题、描述、外链摘要、仓库内是否已有同号脚本，判断以下之一：

| 任务类型 | 典型信号 | 路由 |
| --- | --- | --- |
| 新需求/新测试用例（明确要求实现） | 新增、新功能、编写脚本、无旧脚本，且用户要求实现 | `implement-pm-requirement`（**需求分析与脚本实现流程**） |
| 新需求但先分析、不进入实现 | 新功能/新用例，但用户明确要求先分析、只评估、不改代码 | 本 Skill「需求分析阶段」（仅分析路径） |
| 已有需求变更 | 变更、调整、已有用例需改 | 本 Skill「需求分析阶段」→ 用户确认后再 `implement-pm-requirement` |
| 已有脚本失败 | 用例失败、报错、超时、flaky、脚本挂了 | `auto-test-script-development`（异常验证与分类） |
| 系统异常验证 | 缺陷、bug、线上问题、复现步骤、系统异常验证 | `auto-test-script-development`（系统异常验证） |
| 仅分析或信息不足 | 只评估、影响范围、测试范围、信息不足、待确认 | 本 Skill「需求分析阶段」（仅分析路径） |

**禁止**：默认把所有 PM 称为“诊断流程”。  
**新 PM / 新测试用例且用户明确要求实现时**，必须使用「需求分析与脚本实现流程」路由到 `implement-pm-requirement`，**不得**在本 Skill 默认执行完整需求分析，也不得进入异常验证流程。  
仅当任务类型确实是已有脚本失败或系统异常验证时，才进入 `auto-test-script-development`。

输出路由结论后再进入对应流程，不要跳过分类。

```markdown
# PM 路由结论

- 统一说明：先读取 PM 及关联资料，判断任务类型后选择对应流程。
- PM编号：
- 任务类型：
- 选择流程：
- 判断依据：
- 已合并外链：
- 未读取外链及原因：
- context_id：
- context_revision：
```

---

## 阶段二点二：创建或复用 Task Context

在**本轮已完成的一次** `read_pm_issue`（及必要外链）之后执行；**禁止**为写 Context 再次读取 PM 或广域扫描项目。

1. 若用户/会话已提供有效 `context_id`：调用 `get_task_context_view`（`ROUTE_VIEW`）确认存在且 `status=open`，再按需 `patch_task_context`（带 `expected_revision`）写入本轮路由与结论；**不要**再 `create_task_context`。
2. 若无有效 `context_id`：调用一次 `create_task_context`：
   - `pm_snapshot`：放入**完整** `read_pm_issue` 原始结果（及已读外链正文摘要结构）；主 Context 不存完整正文
   - 主文件只写结构化结论：`task`（编号/标题/类型）、`request`（用户意图、`pm_comment_format`）、`routing`（任务类型/技能/依据）、`project`（名称/框架，若已识别）、`implementation.target_files`（若已定位）、`analysis`（若做过阶段二点五的摘要/覆盖/测试点，勿贴全文）、`references`（外链 url/状态/`content_ref` 或 unread 原因）
   - `source.entry`=`process-pm`
3. 单次任务只维护**一个** Context；创建/复用后必须在路由结论中输出 `context_id` 与 `context_revision`。
4. 移交下游时以 `context_id` 为准；默认不打印完整 Context 或 artifact。

---

## 阶段二点五：需求分析阶段（条件执行）

**仅在以下场景执行本阶段**，不得对所有新需求默认执行完整分析：

1. 用户明确要求仅分析、影响评估或测试范围评估
2. 已有需求变更，需要先评估影响
3. 信息不足，需要列出待确认事项
4. 用户明确要求新需求先分析、不进入实现

**不执行本阶段的情况：**

- 新需求且用户明确要求实现 → 阶段二输出路由结论后直接进入 `implement-pm-requirement`，不在本 Skill 重复其实施方案与代码实现流程
- 已有脚本失败 / 系统异常验证 → 直接进入 `auto-test-script-development`，不复制其分类、`SCRIPT_CONFIRMED`、修补、验证与记录规则

### 分析步骤

1. 需求摘要：标题、状态、关键步骤、角色、验收信号；只使用已读取字段，不编造缺失内容。
2. 定位相关自动化项目与已有用例（Playwright 和/或 Puppeteer）；优先同 PM 编号命名的文件。
3. 从 `package.json` 与入口识别框架与项目：
   - 目标为 `fanyajw-auto-tests` 时，读取 `references/projects/fanyajw-auto-tests.md`
   - Puppeteer 项目另读 `references/frameworks/puppeteer.md`
4. 将需求项与已有覆盖对照，标记 covered / partial / missing / out of scope。
5. 产出测试点、修改建议、验证建议与待确认事项。
6. 可准备 PM 评论草稿（如「需求分析完成」「待产品确认」），**默认不提交**；回填门禁见阶段四。
7. **分析完成后停止**（仅分析路径）。需求变更路径：输出分析后等待用户确认，再路由 `implement-pm-requirement`。
8. 本阶段**不修改**业务测试代码，**不运行**目标测试套件（除非用户另有明确指令且属于后续实现 Skill）。

### 仅分析路径输出格式

```markdown
# PM路由结论

- 统一说明：先读取 PM 及关联资料，判断任务类型后选择对应流程。
- PM编号：
- 任务类型：
- 选择流程：本 Skill 需求分析阶段（仅分析）
- 判断依据：
- 已合并外链：
- 未读取外链及原因：

# 需求摘要

- Issue / 标题 / 状态：
- 范围内行为：
- 范围外行为：

# 项目识别

- 当前项目名称：
- 框架：（Playwright / Puppeteer / 未确认）
- 识别依据：（如 package.json 依赖、入口文件、用例声明方式）
- 项目规范：（如 `references/projects/fanyajw-auto-tests.md`、目标仓 README/AGENTS.md；无则写未找到）
- 推荐运行方式：（必须来自目标项目真实 package.json / 入口，不得编造）

# 已有覆盖分析

| 需求项 | 已有覆盖 | 缺口 |
| --- | --- | --- |

# 测试点

（编号清单）

# 修改建议

- 预计修改文件：
- 具体修改方向：
- 不应修改的范围：

# 验证建议

（语法检查和/或实现后应跑的目标测试）

# 待确认事项

# 建议PM评论

（完整草稿正文。仅生成草稿；用户明确回复「确认回填」或「提交评论」后，才可按阶段四调用 `add_pm_comment`。）
```

分析方案中的实现建议须遵守：优先复用已有 helper 与用例模式；最小稳定改动；禁止建议使用 `waitForTimeout` 或固定睡眠等待。若结论依赖系统/数据/环境/脚本问题，须在提出改代码建议前说明。

---

## 阶段三：执行对应流程

- 新需求/新测试用例（明确要求实现） → `implement-pm-requirement`（先方案确认再改代码；**不在本 Skill 重复其实施方案与实现流程**）
- 已有需求变更 → 完成本 Skill「需求分析阶段」后，用户确认再 `implement-pm-requirement`
- 仅分析 / 信息不足 / 新需求先分析 → 完成本 Skill「需求分析阶段」后停止
- 已有脚本失败 / 系统异常验证 → `auto-test-script-development`（先分类再决定是否改脚本）

路由到 `implement-pm-requirement` 时：

1. 必须移交 `context_id`（及当前 `revision`）。
2. 下游应只读 `IMPLEMENT_VIEW`，复用 Context 中已有 PM 结论、项目/框架、目标文件、分析/覆盖结果。
3. 明确告知：**禁止**再次 `read_pm_issue` / 重复读已处理外链 / 广域重扫；仅当字段为 missing / stale / conflict 时补读，并 `patch_task_context` 写回。
4. 会话内仍可附带路由要点，但以 Context 为准，避免双轨长期并行。

若阶段二点五在创建 Context 之后才完成分析：用 `patch_task_context` 把 `analysis` / `project` / `implementation.target_files` 写回（带 `expected_revision`），冲突则重新 `get_task_context_view` 后再 patch 一次。

不要在本 Skill 中复制 `auto-test-script-development` 全文；进入该 Skill 执行。  
不要在本 Skill 中复制 `implement-pm-requirement` 的实施方案模板与代码实现步骤。

---

## 阶段四：PM 评论回填（写操作）

默认**只生成建议回填内容**，不调用写接口。  
`pm_comment_format` 默认 `brief`；仅当用户明确「全面版 / 详细回填 / detailed」或 `format=detailed` 时用全面版。

实现/验证类回填（已有 `context_id`）：走下游 `REPORT_VIEW` 流程——读 View → 评论写入 artifact → `pm_update` patch → 确认后 `add_pm_comment`；**禁止**为回填再读 PM/脚本/运行日志正文。详见 `implement-pm-requirement` 阶段五。

仅分析等无实现结果时：

1. 可用 `build_pm_comment_draft` 生成**一次**草稿（需求分析完成 / 待产品确认等）。
2. 未真实运行通过（`verification.status` 非 `verified`）禁止「验证通过」「已解决」「完成度 100%」。
3. 展示预览并**询问一次**；仅「确认回填 / 提交评论」后 `add_pm_comment`（`confirmed=true`）。
4. 用户最初说「处理这个PM」「分析一下」「帮我看下」**不能**视为回填确认。
5. 不自动修改 PM 状态、负责人、优先级和完成度。
6. 同一评论短时间重复提交应由工具阻止；若被拒，说明原因，不要强行再写。

---

## 安全边界

1. 不输出密钥、Cookie、Token、敏感请求头。
2. 不访问未知域名或不安全地址。
3. 外链 `requiresAuth=true` 时不猜测正文。
4. 未经确认绝不调用 `add_pm_comment`。
5. 不自动 Git 提交/推送，不执行 `npm audit fix`。
6. 需求分析阶段不修改业务测试代码。
