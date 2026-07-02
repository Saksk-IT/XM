import { z } from "zod";

export const workItemTypeSchema = z.enum(["BUG", "FEATURE"]);
export type WorkItemType = z.infer<typeof workItemTypeSchema>;

export const workItemStatusSchema = z.enum(["PENDING", "IN_PROGRESS", "DONE"]);
export type WorkItemStatus = z.infer<typeof workItemStatusSchema>;

export const prioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export type Priority = z.infer<typeof prioritySchema>;

export const projectSectionSchema = z.enum([
  "OVERVIEW",
  "PENDING_BUGS",
  "PENDING_FEATURES",
  "DONE_FEATURES",
  "DONE_BUGS"
]);
export type ProjectSection = z.infer<typeof projectSectionSchema>;

export const viewModeSchema = z.enum(["BOARD", "LIST"]);
export type ViewMode = z.infer<typeof viewModeSchema>;

export const isoDateSchema = z.string().datetime();
export const optionalUrlSchema = z.string().url().or(z.literal("")).nullable().optional();
export const optionalTextSchema = z.string().trim().max(500).or(z.literal("")).nullable().optional();
export const optionalBranchSchema = z.string().trim().max(120).or(z.literal("")).nullable().optional();

export const tagSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string()
});
export type Tag = z.infer<typeof tagSchema>;

export const checklistItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
  order: z.number(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const activityLogSchema = z.object({
  id: z.string(),
  action: z.string(),
  message: z.string(),
  createdAt: isoDateSchema
});
export type ActivityLog = z.infer<typeof activityLogSchema>;

export const projectStatsSchema = z.object({
  total: z.number(),
  pendingBugs: z.number(),
  pendingFeatures: z.number(),
  doneFeatures: z.number(),
  doneBugs: z.number(),
  completionRate: z.number()
});
export type ProjectStats = z.infer<typeof projectStatsSchema>;

export const projectSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  repoUrl: z.string().nullable(),
  repoPath: z.string().nullable(),
  defaultBranch: z.string().nullable(),
  deployUrl: z.string().nullable(),
  docsUrl: z.string().nullable(),
  color: z.string(),
  archived: z.boolean(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  stats: projectStatsSchema
});
export type ProjectSummary = z.infer<typeof projectSummarySchema>;

export const workItemSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  description: z.string(),
  type: workItemTypeSchema,
  status: workItemStatusSchema,
  priority: prioritySchema,
  notes: z.string(),
  dueDate: isoDateSchema.nullable(),
  order: z.number(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  tags: z.array(tagSchema),
  checklist: z.array(checklistItemSchema),
  activities: z.array(activityLogSchema)
});
export type WorkItem = z.infer<typeof workItemSchema>;

export const projectDetailSchema = projectSummarySchema.extend({
  workItems: z.array(workItemSchema)
});
export type ProjectDetail = z.infer<typeof projectDetailSchema>;

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(""),
  repoUrl: optionalUrlSchema,
  repoPath: optionalTextSchema,
  defaultBranch: optionalBranchSchema,
  deployUrl: optionalUrlSchema,
  docsUrl: optionalUrlSchema,
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#0891b2")
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema.partial().extend({
  archived: z.boolean().optional()
});
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const createWorkItemSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).default(""),
  type: workItemTypeSchema,
  status: workItemStatusSchema.default("PENDING"),
  priority: prioritySchema.default("MEDIUM"),
  notes: z.string().trim().max(4000).default(""),
  dueDate: isoDateSchema.nullable().optional(),
  tagNames: z.array(z.string().trim().min(1).max(32)).default([]),
  checklist: z.array(z.string().trim().min(1).max(160)).default([])
});
export type CreateWorkItemInput = z.infer<typeof createWorkItemSchema>;

export const agentProjectInitSchema = createProjectSchema.extend({
  initialItems: z.array(createWorkItemSchema).max(30).default([])
});
export type AgentProjectInitInput = z.infer<typeof agentProjectInitSchema>;

export const updateWorkItemSchema = createWorkItemSchema.partial().extend({
  order: z.number().int().min(0).optional()
});
export type UpdateWorkItemInput = z.infer<typeof updateWorkItemSchema>;

export const workItemQuerySchema = z.object({
  search: z.string().optional(),
  type: workItemTypeSchema.optional(),
  status: workItemStatusSchema.optional(),
  priority: prioritySchema.optional(),
  tag: z.string().optional()
});
export type WorkItemQuery = z.infer<typeof workItemQuerySchema>;

export const githubCommitListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  branch: z.string().trim().min(1).max(120).optional(),
  since: isoDateSchema.optional()
});
export type GitHubCommitListQuery = z.infer<typeof githubCommitListQuerySchema>;

export const githubCommitSchema = z.object({
  sha: z.string(),
  shortSha: z.string(),
  title: z.string(),
  message: z.string(),
  authorName: z.string(),
  authorEmail: z.string().nullable(),
  authoredAt: isoDateSchema,
  url: z.string().url(),
  verification: z.object({
    verified: z.boolean(),
    reason: z.string().nullable()
  })
});
export type GitHubCommit = z.infer<typeof githubCommitSchema>;

export const sensitiveSettingSchema = z.object({
  configured: z.boolean(),
  maskedValue: z.string().nullable()
});
export type SensitiveSetting = z.infer<typeof sensitiveSettingSchema>;

export const runtimeSettingsSchema = z.object({
  github: z.object({
    token: sensitiveSettingSchema,
    configured: z.boolean(),
    publicAccess: z.boolean()
  }),
  openai: z.object({
    apiKey: sensitiveSettingSchema,
    configured: z.boolean(),
    baseUrl: z.string(),
    model: z.string().nullable(),
    baseUrlConfigured: z.boolean()
  }),
  wechatMiniProgram: z.object({
    configured: z.boolean(),
    appId: z.string(),
    name: z.string(),
    originalId: z.string(),
    appSecret: sensitiveSettingSchema
  })
});
export type RuntimeSettings = z.infer<typeof runtimeSettingsSchema>;

const sensitiveSettingInputSchema = z.union([z.string().trim().min(1).max(1000), z.null()]).optional();

export const updateRuntimeSettingsSchema = z.object({
  github: z
    .object({
      token: sensitiveSettingInputSchema
    })
    .optional(),
  openai: z
    .object({
      apiKey: sensitiveSettingInputSchema,
      baseUrl: z.string().trim().url().or(z.literal("")).optional(),
      model: z.string().trim().min(1).max(120).or(z.literal("")).optional()
    })
    .optional(),
  wechatMiniProgram: z
    .object({
      appId: z.string().trim().max(120).optional(),
      appSecret: sensitiveSettingInputSchema,
      name: z.string().trim().max(80).optional(),
      originalId: z.string().trim().max(120).optional()
    })
    .optional()
});
export type UpdateRuntimeSettingsInput = z.infer<typeof updateRuntimeSettingsSchema>;

export const openaiModelListSchema = z.object({
  models: z.array(z.string())
});
export type OpenAIModelList = z.infer<typeof openaiModelListSchema>;

export const generateWorkItemDraftSchema = z.object({
  input: z.string().trim().min(10).max(6000)
});
export type GenerateWorkItemDraftInput = z.infer<typeof generateWorkItemDraftSchema>;

export const generatedWorkItemDraftSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).default(""),
  type: workItemTypeSchema,
  status: workItemStatusSchema.default("PENDING"),
  priority: prioritySchema.default("MEDIUM"),
  notes: z.string().trim().max(4000).default(""),
  tagNames: z.array(z.string().trim().min(1).max(32)).max(8).default([]),
  checklist: z.array(z.string().trim().min(1).max(160)).max(12).default([])
});
export type GeneratedWorkItemDraft = z.infer<typeof generatedWorkItemDraftSchema>;

export const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1)
});
export type LoginInput = z.infer<typeof loginSchema>;

export const miniprogramLoginSchema = z.object({
  code: z.string().trim().min(1)
});
export type MiniprogramLoginInput = z.infer<typeof miniprogramLoginSchema>;

export const miniprogramBindSchema = z.object({
  bindToken: z.string().trim().min(1),
  username: z.string().trim().min(1),
  password: z.string().min(1)
});
export type MiniprogramBindInput = z.infer<typeof miniprogramBindSchema>;

export const meSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string()
});
export type Me = z.infer<typeof meSchema>;

export const miniprogramAuthSuccessSchema = z.object({
  status: z.literal("AUTHENTICATED"),
  token: z.string(),
  expiresAt: isoDateSchema,
  user: meSchema
});
export type MiniprogramAuthSuccess = z.infer<typeof miniprogramAuthSuccessSchema>;

export const miniprogramBindingRequiredSchema = z.object({
  status: z.literal("BINDING_REQUIRED"),
  bindToken: z.string(),
  expiresAt: isoDateSchema
});
export type MiniprogramBindingRequired = z.infer<typeof miniprogramBindingRequiredSchema>;

export const miniprogramAuthResponseSchema = z.discriminatedUnion("status", [
  miniprogramAuthSuccessSchema,
  miniprogramBindingRequiredSchema
]);
export type MiniprogramAuthResponse = z.infer<typeof miniprogramAuthResponseSchema>;

export const createChecklistSchema = z.object({
  title: z.string().trim().min(1).max(160)
});
export type CreateChecklistInput = z.infer<typeof createChecklistSchema>;

export const updateChecklistSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  done: z.boolean().optional(),
  order: z.number().int().min(0).optional()
});
export type UpdateChecklistInput = z.infer<typeof updateChecklistSchema>;

export {
  countProjectSectionItems,
  matchesProjectSection,
  projectSectionLabels,
  projectSectionOrder,
  projectWorkItemSections,
  sectionLabels,
  workItemSectionOrder,
  type ProjectWorkItemSection,
  type WorkItemSection
} from "./projectSections";

export const priorityLabels: Record<Priority, string> = {
  LOW: "低",
  MEDIUM: "中",
  HIGH: "高"
};

export const statusLabels: Record<WorkItemStatus, string> = {
  PENDING: "待处理",
  IN_PROGRESS: "进行中",
  DONE: "已完成"
};

export const typeLabels: Record<WorkItemType, string> = {
  BUG: "Bug",
  FEATURE: "功能"
};
