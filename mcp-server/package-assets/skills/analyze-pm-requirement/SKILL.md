---
name: analyze-pm-requirement
description: >-
  Analyzes Chaoxing PM requirements against existing Playwright/Puppeteer
  automation projects, then produces test points and a minimal modification
  plan. Use when the user provides a PM issue id or URL, asks for requirement
  impact analysis, test scope assessment, or an automation change plan before
  coding.
---

# Analyze PM Requirement

## Goal

Read a PM issue through AutoTestFlow MCP, compare it with the related automation
project, and deliver **test points + a modification plan**. Do not change test
project code during the analysis phase.

## Workflow

1. Call MCP tool `read_pm_issue` with the user-provided issue id or URL.
2. Summarize the requirement: title, status, key steps, roles, and acceptance
   signals present in the returned fields. Do not invent missing fields.
3. Locate the related automation project and existing cases (Playwright and/or
   Puppeteer). Prefer files already named after the PM id when present.
4. Identify the project and framework from `package.json` and entrypoints. If the
   target is `fanyajw-auto-tests`, read `references/projects/fanyajw-auto-tests.md`.
   For Puppeteer in general, also use `references/frameworks/puppeteer.md`.
5. Diff requirement items against existing coverage. Mark each item as covered,
   partial, missing, or out of scope.
6. Output using the template below (including project identification fields).
7. Stop after the plan unless the user explicitly asks to implement.

## Rules

- Follow project `AGENTS.md`.
- Never print, log, or echo `PM_API_KEY` or other secrets.
- Prefer reusing existing helpers and patterns in the test project.
- Prefer the smallest stable change set.
- Do not use `waitForTimeout` or fixed sleeps in any proposed implementation.
- If analysis depends on system/data/environment/script issues, say so before
  proposing code edits.
- Do not run git commit or push unless the user confirms.

## Output Template

### Requirement summary
- Issue / title / status
- In-scope behaviors
- Out-of-scope behaviors

### Project identification
- 当前项目名称：
- 识别到的框架：（Playwright / Puppeteer / 未确认）
- 识别依据：（如 package.json 依赖、入口文件、用例声明方式）
- 项目专属规范文件：（如 `references/projects/fanyajw-auto-tests.md`、目标仓 README/AGENTS.md；无则写未找到）
- 推荐测试运行方式：（必须来自目标项目真实 package.json / 入口，不得编造）

### Coverage matrix
| Requirement item | Existing coverage | Gap |

### Test points
Numbered checklist.

### Modification plan
- Files to change
- Concrete edits
- Files/areas to leave unchanged

### Verification
Syntax checks and/or targeted tests to run after implementation.
