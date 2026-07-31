# 输出模板

按分类选用固定格式。路径、命令、接口内容须脱敏，不得包含 `PM_API_KEY`、Cookie、密码、完整敏感请求头。

---

## 【系统异常通报】

```text
【系统异常通报】
用例：
场景：
复现步骤：
1.
2.
3.
预期：
实际：
环境：
角色：
数据条件：
证据：
结论：系统问题，当前脚本暂不调整，待系统修复后复验。
```

---

## 【数据问题通报】

```text
【数据问题通报】
用例：
场景：
现象：
数据状态：
预期：
实际：
结论：数据问题，当前脚本暂不调整/待数据修复后复验。
```

---

## 【脚本修复说明】

```text
【脚本修复说明】
用例：
场景：
问题分类：SCRIPT_CONFIRMED
verification_status：code_completed | verified | failed | blocked
根因：
修改文件：
修改内容：
验证命令：
验证结果：
结论：
```

`verification_status` 约束：

- `code_completed`：代码已改，尚未真实运行通过；结论不得写「验证通过」「已解决」「完成度 100%」
- `verified`：目标脚本已真实运行并通过
- `failed`：已运行但未通过
- `blocked`：系统/数据/环境阻塞，未完成验证

---

## PM 评论格式（`pm_comment_format`）

默认 `brief`。仅当用户明确说「全面版 / 详细回填 / detailed」或传入 `format=detailed` 时用 `detailed`。  
全面版**只复用**当前流程已有分析与运行结果，禁止为扩写再次读取 PM、脚本或项目资料；控制篇幅，同一场景不重复描述。

### 简洁版（brief，默认）

```text
【自动化结果】
PM：
脚本：
verification_status：code_completed | verified | failed | blocked
摘要：
结论：
下一步：
```

### 全面版（detailed）

```text
【自动化结果-全面版】
PM：
脚本路径：
覆盖场景：（条目化，不重复）
实现说明：（基于已有修改摘要，不重读代码）
真实运行结果：（命令、通过/失败/阻塞、关键证据；未运行则写未运行）
限制或风险：
verification_status：code_completed | verified | failed | blocked
结论：（未 verified 时禁止「验证通过」「已解决」「完成度 100%」）
下一步：
```

---

## 【仅分析，暂不改代码】

```text
【仅分析，暂不改代码】
用例：
场景：
当前分类：SYSTEM | DATA | ENVIRONMENT | UNCONFIRMED | （未完成）
已确认事实：
审计推断：
证据缺口：
为何不改代码：用户要求暂不改代码 / 分类禁止修改 / 证据不足
下一步：
PM 评论草稿：（如有，默认不提交）
```

---

## 【环境问题记录】

```text
【环境问题记录】
用例：
场景：
环境差异证据：（脱敏，不含密钥/Cookie）
基线要求：
当前状态：
建议：
结论：环境问题，当前脚本暂不调整；恢复基线后复验。
```
