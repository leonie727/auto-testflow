# AutoTestFlow Skills 导航

## 日常入口

### process-pm

适用：

- 提供 PM 编号或链接
- 分析需求和测试范围
- 设计用例
- 判断新需求、需求变更、脚本异常或系统异常
- 生成评论草稿并在确认后回填

### auto-test-script-development

适用：

- 已有 Playwright/Puppeteer 用例失败
- 系统、数据、环境、脚本问题分类
- `SCRIPT_CONFIRMED` 后最小修复
- 目标测试验证和诊断记录

## 内部实施流程

### implement-pm-requirement

适用：

- `process-pm` 已确认的新需求或需求变更
- 已有明确测试方案，需要编写自动化脚本

## 路由图

有 PM：

```text
process-pm
├─ 仅分析：process-pm 内完成并停止
├─ 新需求/需求变更：implement-pm-requirement
└─ 已有脚本失败/系统异常：auto-test-script-development
```

无 PM，直接提供已有脚本或报错：

```text
auto-test-script-development
```

## 文件说明

- 每个 Skill 的入口文件固定名为 `SKILL.md`
- `references` 是 Skill 的内部规则和模板，不是独立 Skill
- 日常无需直接打开 `references`

## 稳定能力保护

以下能力不得破坏：

- `SCRIPT_CONFIRMED` 分类门禁
- `SYSTEM` / `DATA` / `SCRIPT` / `ENVIRONMENT` / `UNCONFIRMED` 分类
- 最小修补
- 目标测试实际通过后才声明完成
- 诊断记录（`save_test_issue_record`）
- PM 回填确认门禁
- Git 操作边界（未经确认不提交/推送）
