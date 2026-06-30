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

export const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1)
});
export type LoginInput = z.infer<typeof loginSchema>;

export const meSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string()
});
export type Me = z.infer<typeof meSchema>;

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

export const sectionLabels: Record<ProjectSection, string> = {
  OVERVIEW: "基础项目预览",
  PENDING_BUGS: "Bug 待修改",
  PENDING_FEATURES: "功能待修改",
  DONE_FEATURES: "功能已实现",
  DONE_BUGS: "Bug 已实现"
};

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
