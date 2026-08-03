---
name: implement-pm-requirement
description: >-
  在 Playwright/Puppeteer 项目实现已确认的 PM 自动化脚本。默认 Lite：
  IMPLEMENT_LITE_VIEW → 局部改代码 → complete_task_stage。无 context_id 时先创建 Context。
---

# Implement PM Requirement

默认只改业务测试项目。`process-pm` 移交 `context_id` 后进入本 Skill。

## 模式

| | 条件 | Context 调用 |
| --- | --- | --- |
| **lite（默认）** | 目标/文件/范围已明确；无需重读 PM、重扫项目、重判框架；未要求 PM 回填闭环 | 仅 `IMPLEMENT_LITE_VIEW` + `complete_task_stage`（共 2 次） |
| **full** | 缺项目/文件/框架；首次读 PM；跨项目；用户明确要完整验证记录或 PM 回填 | 可用 `IMPLEMENT_VIEW` / 原子 patch；回填才用 `REPORT_VIEW` |

用例数、改文件数**不是**模式门槛。

## Lite（默认）

```text
get_task_context_view(IMPLEMENT_LITE_VIEW)  // 只读一次
→ 目标文件内渐进读代码并修改
→ 按 run_intent 决定是否只跑目标脚本（同步勿写 running）
→ complete_task_stage(implement | implement_and_verify)
→ 简短输出：改了什么 / 运行结果或 not_run
```

禁止：`VERIFY_VIEW`、`REPORT_VIEW`、多次 patch、单独 write artifact、重读 PM、全仓扫描、默认读 references、默认生成 PM 评论、再读 Context、输出完整日志/Context/完整脚本正文。

### 代码读取（渐进）

默认在目标文件内搜索符号并渐进读取：目标块 → 直接依赖 → 必要扩展。  
局部信息不足时允许读取完整目标文件，但禁止默认全文读取和全仓扫描。  
同一文件全文只读一次。

补充：同文件多目标优先合并最小连续范围；只追直接依赖（imports/fixtures、当前 describe hooks、被调局部方法、测试数据、回置/清理）；全文后仍只改 `allowed_files`/`target_files`。复用项目既有 helper。禁 `waitForTimeout`/固定 sleep、放宽断言、Git 提交、输出密钥。

`run_intent`：`run`→只跑目标脚本；`skip`→不跑；`ask/unknown`→只问一次。  
提交：`implement_and_verify`（含 `run_result`）或 `implement`（→`not_run`）。revision 冲突则重读 Lite View 再提交一次。服务端保证 `code_completed ≠ verified`。

方案未确认时先输出简短实施方案（勿复述 Context 摘要），等「确认实施」类回复再改代码；用户已确认方案且 Lite 字段齐则可直接改。

## Full（仅升级时）

缺 `project_root`/`framework`/`target_files` 才读 `IMPLEMENT_VIEW` 并局部补洞 + `patch_task_context`。异步长跑才可写 `running`。  
**仅用户明确要求**生成/预览/回填 PM 评论时用 `REPORT_VIEW`；须确认后才 `add_pm_comment`。

无 `context_id`：`read_pm_issue`（可加必要外链）→ `create_task_context`（移交继续实施时勿 `finalize_record`）→ 范围明确后回到 Lite。

## records 收尾

本轮形成可交付结论并结束、暂停或等待后续处理时留存一次 record；继续实施时中间不重复保存。Agent 只提交本轮已有的短摘要，不读取旧 record、不生成完整 Markdown，也不为留档增加读取、分析、验证或 MCP 调用。

执行：Context 实施任务由 `complete_task_stage` 自动留档（勿再调 `save_test_issue_record`，保持 2 次 Context MCP）；无 Context 时由本轮最终收尾调用一次 `save_test_issue_record`。

## 输出（短）

- 修改文件 + 一句摘要
- `implementation_status` / `verification_status`（及 `result_ref`）
- 仅涉及回填时写 PM 状态
