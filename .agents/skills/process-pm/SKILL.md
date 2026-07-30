---
name: process-pm
description: >-
  先读取 PM 及关联资料，判断任务类型后选择对应流程（新需求实现、需求变更、
  异常验证与分类、系统异常验证或仅分析）。用户提供 PM 号/链接、说“处理这个PM”、
  或未指明具体流程时使用。禁止默认把所有 PM 称为诊断流程。
---

# Process PM

对外统一表述：

> 先读取 PM 及关联资料，判断任务类型后选择对应流程。

遵循项目根目录 `AGENTS.md`。永不输出 `PM_API_KEY`。

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
| 新需求/新测试用例 | 新增、新功能、编写脚本、无旧脚本 | `implement-pm-requirement`（**需求分析与脚本实现流程**） |
| 已有需求变更 | 变更、调整、已有用例需改 | 先 `analyze-pm-requirement`，确认后 `implement-pm-requirement` |
| 已有脚本失败 | 用例失败、报错、超时、flaky、脚本挂了 | `auto-test-script-development`（异常验证与分类） |
| 系统异常验证 | 缺陷、bug、线上问题、复现步骤、系统异常验证 | `auto-test-script-development`（系统异常验证） |
| 仅分析或信息不足 | 只评估、信息不足、待确认 | `analyze-pm-requirement` |

**禁止**：默认把所有 PM 称为“诊断流程”。  
**新 PM / 新测试用例必须使用「需求分析与脚本实现流程」**，不得进入异常验证流程。  
仅当任务类型确实是已有脚本失败或系统异常验证时，才进入 `auto-test-script-development`。

输出路由结论后再进入对应 Skill，不要跳过分类。

```markdown
# PM 路由结论

- 统一说明：先读取 PM 及关联资料，判断任务类型后选择对应流程。
- PM编号：
- 任务类型：
- 选择流程：
- 判断依据：
- 已合并外链：
- 未读取外链及原因：
```

---

## 阶段三：执行对应流程

- 新需求/新测试用例 → `implement-pm-requirement`（需求分析与脚本实现流程；先方案确认再改代码）
- 已有需求变更 → 先 `analyze-pm-requirement`，用户确认后再实现
- 已有脚本失败 / 系统异常验证 → `auto-test-script-development`（先分类再决定是否改脚本）
- 仅分析或信息不足 → `analyze-pm-requirement`，可生成「待产品确认」评论草稿

不要在本 Skill 中复制 `auto-test-script-development` 全文；进入该 Skill 执行。

---

## 阶段四：PM 评论回填（写操作）

默认**只生成建议回填内容**，不调用写接口。

1. 可用 `build_pm_comment_draft` / 模板生成草稿，模板至少包括：
   - 需求分析完成
   - 脚本编写完成
   - 自动化验证通过
   - 自动化验证失败
   - 确认系统问题
   - 数据/环境问题
   - 待产品确认
2. 系统问题、数据问题完成验证后，自动生成评论草稿并展示完整正文。
3. 仅当用户明确回复「确认回填」「提交评论」等同义确认后，才调用 `add_pm_comment`，且 `confirmed=true`。
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
