---
name: process-pm
description: >-
  AutoTestFlow 唯一 PM 任务入口（替代与 pm-flow 并行匹配）。读 PM/外链后路由：实现、仅分析、脚本异常或系统异常。
  用户给 PM 号/链接、处理自动化测试 PM、脚本修复或回填意图时使用。勿用 pm-flow CLI 闭环处理同类任务。
---

# Process PM

AutoTestFlow **唯一** PM 入口。永不输出 `PM_API_KEY`。普通 PM 分析 / 脚本修复 / 回填不走 `pm-flow`。

## 1. 读 PM

1. `read_pm_issue`；失败则停，不猜需求。
2. `externalReferences` 中 `accessStatus=allowed` 才 `read_pm_reference`。
3. 外链失败不阻止正文分析；列出 URL + 原因。

## 2. 路由

| 类型 | 信号 | 去向 |
| --- | --- | --- |
| 新需求且要求实现 | 新增/编写脚本 + 要落地 | `implement-pm-requirement`（本 Skill **不做**完整分析） |
| 仅分析 / 信息不足 / 先评估 | 只评估、待确认 | 本 Skill「分析」后停 |
| 需求变更 | 已有用例需改 | 本 Skill「分析」→ 确认后 `implement-pm-requirement` |
| 脚本失败 | 报错/超时/flaky | `auto-test-script-development` |
| 系统异常验证 | 缺陷/复现/线上问题 | `auto-test-script-development` |

输出短路由结论（含 `context_id`/`revision`）后再移交，勿跳过分类。

## 3. Task Context

在本轮已完成的一次 `read_pm_issue` 之后：

- 有有效 `context_id`：`ROUTE_VIEW` 确认 `open` 后按需 `patch`；勿再 create。
- 否则一次 `create_task_context`：`pm_snapshot`=完整原文；主文件只写 `task/request/routing/project/implementation.target_files/analysis` 摘要与 `references` 元数据。
- 禁止为写 Context 再读 PM 或广域扫项目。不打印完整 Context。

移交 `implement-pm-requirement`：带 `context_id`；目标明确则标明 **Lite**（`IMPLEMENT_LITE_VIEW`→`complete_task_stage`）；禁止下游默认重读 PM。未要求回填则勿要求 REPORT。  
移交继续实施时：**不要** `finalize_record`（中间不留档）。

## 4. 分析（仅条件触发）

仅：用户只要分析/评估；需求变更先评估；信息不足。  
新需求直接实现、脚本失败/系统异常 → **不跑本段**。

步骤：摘要 → 定位同号脚本/项目 → 认框架（必要才读 `references/projects|frameworks`）→ coverage → 测试点/修改/验证建议 → 停。不改业务代码、不跑套件。

输出短结构：路由结论 / 摘要 / 项目与框架 / coverage 表 / 测试点 / 修改建议 / 待确认；评论草稿仅在用户要回填时生成。

## 5. 回填

默认不写 PM。仅用户明确「确认回填/提交评论」后 `add_pm_comment(confirmed=true)`。  
未 `verified` 禁止写「验证通过/已解决/完成度100%」。不改状态/指派/优先级/完成度。

## 6. records 收尾

本轮形成可交付结论并结束、暂停或等待后续处理时留存一次 record；继续实施时中间不重复保存。Agent 只提交本轮已有的短摘要，不读取旧 record、不生成完整 Markdown，也不为留档增加读取、分析、验证或 MCP 调用。

执行：分析结束时复用当前流程已有的最终 Context 写操作内联留档（`create_task_context` 或 `patch_task_context` 设 `finalize_record=true`，可选短 `record`）；无 Context 时由本轮最终收尾调用一次 `save_test_issue_record`。
