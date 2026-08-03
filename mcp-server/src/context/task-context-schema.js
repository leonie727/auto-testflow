import { z } from 'zod';

/** @typedef {'ROUTE_VIEW'|'IMPLEMENT_VIEW'|'VERIFY_VIEW'|'REPORT_VIEW'} TaskContextViewName */

export const SCHEMA_VERSION = '1.0.0';

export const CONTEXT_STATUS = {
  OPEN: 'open',
  CLOSED: 'closed',
};

export const VERIFICATION_STATUS = {
  NOT_STARTED: 'not_started',
  CODE_COMPLETED: 'code_completed',
  VERIFIED: 'verified',
  FAILED: 'failed',
  BLOCKED: 'blocked',
};

export const PM_COMMENT_FORMAT = {
  BRIEF: 'brief',
  DETAILED: 'detailed',
};

export const RUN_INTENT = {
  RUN: 'run',
  SKIP: 'skip',
  ASK: 'ask',
  UNKNOWN: 'unknown',
};

export const TASK_CONTEXT_VIEWS = {
  ROUTE_VIEW: 'ROUTE_VIEW',
  IMPLEMENT_VIEW: 'IMPLEMENT_VIEW',
  VERIFY_VIEW: 'VERIFY_VIEW',
  REPORT_VIEW: 'REPORT_VIEW',
};

const optionalString = z.string().optional();
const optionalStringArray = z.array(z.string()).optional();

const coverageItemSchema = z.object({
  item: z.string(),
  coverage: z.string(),
  gap: z.string().optional(),
});

const externalRefSchema = z.object({
  url: z.string(),
  access_status: z.string().optional(),
  title: optionalString,
  /** 外链正文等原始内容文件，相对 context 目录 */
  content_ref: optionalString,
});

const unreadRefSchema = z.object({
  url: z.string(),
  reason: z.string(),
});

export const taskSectionSchema = z
  .object({
    type: optionalString,
    status: optionalString,
    title: optionalString,
    issue_id: optionalString,
  })
  .strict();

export const sourceSectionSchema = z
  .object({
    pm_issue_id: optionalString,
    pm_url: optionalString,
    /** PM 原始快照文件引用，主文件不存完整正文 */
    pm_snapshot_ref: optionalString,
    entry: optionalString,
  })
  .strict();

export const requestSectionSchema = z
  .object({
    user_intent: optionalString,
    pm_comment_format: z.enum(['brief', 'detailed']).optional(),
    run_intent: z.enum(['run', 'skip', 'ask', 'unknown']).optional(),
    hints: optionalStringArray,
  })
  .strict();

export const projectSectionSchema = z
  .object({
    name: optionalString,
    root: optionalString,
    framework: z.enum(['playwright', 'puppeteer', 'unknown']).optional(),
    identify_basis: optionalString,
    package_scripts_ref: optionalString,
  })
  .strict();

export const routingSectionSchema = z
  .object({
    task_type: optionalString,
    route_skill: optionalString,
    route_label: optionalString,
    reasons: optionalStringArray,
    analyze_first: z.boolean().optional(),
  })
  .strict();

export const analysisSectionSchema = z
  .object({
    summary: optionalString,
    coverage: z.array(coverageItemSchema).optional(),
    test_points: optionalStringArray,
    modification_plan: z
      .object({
        files: optionalStringArray,
        direction: optionalString,
        leave_unchanged: optionalStringArray,
      })
      .strict()
      .optional(),
    open_questions: optionalStringArray,
    analysis_ref: optionalString,
  })
  .strict();

export const referencesSectionSchema = z
  .object({
    external: z.array(externalRefSchema).optional(),
    unread: z.array(unreadRefSchema).optional(),
  })
  .strict();

export const implementationSectionSchema = z
  .object({
    /** planned | in_progress | code_completed | blocked */
    status: optionalString,
    /** 实现结果短摘要（非完整脚本） */
    summary: optionalString,
    plan_summary: optionalString,
    target_files: optionalStringArray,
    changed_files: optionalStringArray,
    reuse: optionalStringArray,
    risks: optionalStringArray,
    code_diff_ref: optionalString,
  })
  .strict();

export const verificationSectionSchema = z
  .object({
    /** not_started | not_run | running | verified | failed | blocked */
    status: z
      .enum(['not_started', 'not_run', 'running', 'verified', 'failed', 'blocked'])
      .optional(),
    /** @deprecated 兼容旧字段；新流程优先用 status */
    verification_status: z
      .enum(['not_started', 'code_completed', 'verified', 'failed', 'blocked'])
      .optional(),
    mode: optionalString,
    command: optionalString,
    passed: z.number().optional(),
    failed: z.number().optional(),
    duration: z.union([z.string(), z.number()]).optional(),
    result_ref: optionalString,
    summary: optionalString,
    result_summary: optionalString,
    log_ref: optionalString,
    evidence_refs: optionalStringArray,
  })
  .strict();

export const pmUpdateSectionSchema = z
  .object({
    /** draft_ready | updated | cancelled */
    status: optionalString,
    format: z.enum(['brief', 'detailed']).optional(),
    draft_format: z.enum(['brief', 'detailed']).optional(),
    draft_ref: optionalString,
    confirmed: z.boolean().optional(),
    updated: z.boolean().optional(),
    submitted: z.boolean().optional(),
    comment_id: optionalString,
  })
  .strict();

export const controlsSectionSchema = z
  .object({
    allow_code_change: z.boolean().optional(),
    allow_pm_comment: z.boolean().optional(),
    closed_reason: optionalString,
  })
  .strict();

export const taskContextSchema = z
  .object({
    schema_version: z.literal(SCHEMA_VERSION),
    context_id: z.string().min(1),
    revision: z.number().int().positive(),
    created_at: z.string().min(1),
    updated_at: z.string().min(1),
    status: z.enum(['open', 'closed']),
    task: taskSectionSchema.default({}),
    source: sourceSectionSchema.default({}),
    request: requestSectionSchema.default({}),
    project: projectSectionSchema.default({}),
    routing: routingSectionSchema.default({}),
    analysis: analysisSectionSchema.default({}),
    references: referencesSectionSchema.default({}),
    implementation: implementationSectionSchema.default({}),
    verification: verificationSectionSchema.default({}),
    pm_update: pmUpdateSectionSchema.default({}),
    controls: controlsSectionSchema.default({}),
  })
  .strict();

/** patch 允许更新的顶层业务字段 */
export const PATCHABLE_SECTIONS = [
  'task',
  'source',
  'request',
  'project',
  'routing',
  'analysis',
  'references',
  'implementation',
  'verification',
  'pm_update',
  'controls',
];

export const taskContextPatchSchema = z
  .object({
    expected_revision: z.number().int().positive(),
    patch: z
      .object({
        task: taskSectionSchema.partial().optional(),
        source: sourceSectionSchema.partial().optional(),
        request: requestSectionSchema.partial().optional(),
        project: projectSectionSchema.partial().optional(),
        routing: routingSectionSchema.partial().optional(),
        analysis: analysisSectionSchema.partial().optional(),
        references: referencesSectionSchema.partial().optional(),
        implementation: implementationSectionSchema.partial().optional(),
        verification: verificationSectionSchema.partial().optional(),
        pm_update: pmUpdateSectionSchema.partial().optional(),
        controls: controlsSectionSchema.partial().optional(),
      })
      .strict()
      .refine((obj) => Object.keys(obj).length > 0, {
        message: 'patch 至少包含一个可更新字段',
      }),
  })
  .strict();

/**
 * 各 View 暴露的顶层字段（投影裁剪）。
 * @type {Record<TaskContextViewName, string[]>}
 */
export const VIEW_FIELD_MAP = {
  ROUTE_VIEW: [
    'schema_version',
    'context_id',
    'revision',
    'status',
    'updated_at',
    'task',
    'source',
    'request',
    'project',
    'routing',
    'references',
    'controls',
  ],
  IMPLEMENT_VIEW: [
    'schema_version',
    'context_id',
    'revision',
    'status',
    'updated_at',
    'task',
    'source',
    'request',
    'project',
    'routing',
    'analysis',
    'references',
    'implementation',
    'controls',
  ],
  VERIFY_VIEW: [
    'schema_version',
    'context_id',
    'revision',
    'status',
    'updated_at',
    'task',
    'project',
    'implementation',
    'verification',
    'request',
    'controls',
  ],
  REPORT_VIEW: [
    'schema_version',
    'context_id',
    'revision',
    'status',
    'updated_at',
    'task',
    'source',
    'request',
    'analysis',
    'implementation',
    'verification',
    'pm_update',
    'controls',
  ],
};

/**
 * @param {unknown} value
 * @returns {import('zod').SafeParseReturnType<any, any>}
 */
export function parseTaskContext(value) {
  return taskContextSchema.safeParse(value);
}

/**
 * @param {unknown} value
 */
export function parseTaskContextPatch(value) {
  return taskContextPatchSchema.safeParse(value);
}

/**
 * @param {string} view
 * @returns {view is TaskContextViewName}
 */
export function isTaskContextView(view) {
  return Object.prototype.hasOwnProperty.call(VIEW_FIELD_MAP, view);
}
