---
name: auto-test-script-development
description: >-
  Playwright/Puppeteer 已有脚本失败与系统异常：分类后再决定是否改代码。
  仅 SCRIPT_CONFIRMED 可改。新需求走 implement-pm-requirement。
---

# Auto Test Script Development

非新需求入口。永不输出密钥/Cookie/敏感头。

## References（按需，默认 0～1 份）

| 模式 | 可读 |
| --- | --- |
| TRIAGE | `references/input-templates.md` |
| CLASSIFY | `references/issue-classification.md` |
| REPORT（仅用户要回填/通报模板时） | `references/output-templates.md` |
| 其他 | 不读 |

禁止预读全部 references。普通 SCRIPT 修补可不读任何 reference。

## 模式与门禁

TRIAGE → TRACE → MANUAL_VERIFY → CLASSIFY →（SCRIPT 才）PATCH → REVIEW；RECORD/REPORT 按需。  
勿因用户说“修复”直接 PATCH。

硬门禁：未分类不改代码；仅 `SCRIPT_CONFIRMED` 可改；`SYSTEM/DATA/ENVIRONMENT/UNCONFIRMED` 禁改脚本；未真实跑通目标用例不得称修复完成；PW/Puppeteer 不混用；未「确认回填」不写 PM。

## 流程要点

1. 整理输入为：已确认 / 规范 / 推断 / 待确认；缺证据只标注，不编造。
2. 用路径+`package.json`+配置认框架；未知则 `UNKNOWN`。
3. 调用链：入口→业务阶段→失败方法→helper→框架 API；区分已成功/失败阶段。
4. 疑系统异常：最小手动验证后再分类。
5. 分支：`SYSTEM/DATA` 记录+通报不改代码；`SCRIPT` 最小修补；`ENVIRONMENT` 记证据；`UNCONFIRMED` 补证据。

## SCRIPT 修补（Confirmed 后）

范围：失败语句→业务方法→文件内 helper。复用现有工具；禁固定等待/放宽断言/无关重构。

### 代码读取（渐进）

默认在目标文件内搜索符号并渐进读取：目标块 → 直接依赖 → 必要扩展。  
局部信息不足时允许读取完整目标文件，但禁止默认全文读取和全仓扫描。  
同一文件全文只读一次。

同文件多目标优先合并最小连续范围；只追直接依赖；全文后仍只改目标/`allowed_files`；勿把完整脚本写入 Context/artifact/最终输出。

有 `context_id` 且范围明确时用 Lite：

```text
IMPLEMENT_LITE_VIEW（一次）→ 渐进读代码并修改 → 按 run_intent 跑目标脚本 → complete_task_stage
```

禁：VERIFY/REPORT（除非用户要回填）、多次 patch、同步写 `running`、重读 PM、默认 references。  
`run` 直接跑；`skip` 不跑；未表态只问一次。`code_completed ≠ verified`。

## records 收尾

本轮形成可交付结论并结束、暂停或等待后续处理时留存一次 record；继续实施时中间不重复保存。Agent 只提交本轮已有的短摘要，不读取旧 record、不生成完整 Markdown，也不为留档增加读取、分析、验证或 MCP 调用。

执行：有 Context 时复用该任务已有的最终 Context 写操作（Lite 实施为 `complete_task_stage`；仅分析/分类结束为带 `finalize_record=true` 的 `create_task_context`/`patch_task_context`）；无 Context 的直接分析或修改由本轮最终收尾调用一次 `save_test_issue_record`。

## 回填

默认不写；仅用户确认后 `add_pm_comment`；未 verified 禁写「验证通过/已解决/100%」。

## 短输出

模式、分类、改动文件与一句摘要、运行结果/`not_run`、通报类型（如有）、待补证据。勿贴完整日志/Context。
