import type { Prisma } from "@prisma/client";
import type { ProjectDetail, ProjectStats, ProjectSummary, WorkItem } from "@xm/shared";

export const workItemInclude = {
  tags: {
    include: {
      tag: true
    }
  },
  checklist: {
    orderBy: {
      order: "asc"
    }
  },
  activities: {
    orderBy: {
      createdAt: "desc"
    },
    take: 20
  }
} satisfies Prisma.WorkItemInclude;

export const projectInclude = {
  workItems: {
    include: workItemInclude,
    orderBy: {
      order: "asc"
    }
  }
} satisfies Prisma.ProjectInclude;

type WorkItemWithRelations = Prisma.WorkItemGetPayload<{ include: typeof workItemInclude }>;
type ProjectWithItems = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;
type ProjectForStats = Omit<ProjectWithItems, "workItems"> & {
  workItems: Array<Pick<WorkItemWithRelations, "type" | "status">>;
};

const toIso = (date: Date) => date.toISOString();

export function computeStats(workItems: Array<Pick<WorkItemWithRelations, "type" | "status">>): ProjectStats {
  const total = workItems.length;
  const pendingBugs = workItems.filter((item) => item.type === "BUG" && item.status !== "DONE").length;
  const pendingFeatures = workItems.filter((item) => item.type === "FEATURE" && item.status !== "DONE").length;
  const doneFeatures = workItems.filter((item) => item.type === "FEATURE" && item.status === "DONE").length;
  const doneBugs = workItems.filter((item) => item.type === "BUG" && item.status === "DONE").length;

  return {
    total,
    pendingBugs,
    pendingFeatures,
    doneFeatures,
    doneBugs,
    completionRate: total === 0 ? 0 : Math.round(((doneFeatures + doneBugs) / total) * 100)
  };
}

export function serializeWorkItem(item: WorkItemWithRelations): WorkItem {
  return {
    id: item.id,
    projectId: item.projectId,
    title: item.title,
    description: item.description,
    type: item.type,
    status: item.status,
    priority: item.priority,
    notes: item.notes,
    dueDate: item.dueDate ? toIso(item.dueDate) : null,
    order: item.order,
    createdAt: toIso(item.createdAt),
    updatedAt: toIso(item.updatedAt),
    tags: item.tags
      .map(({ tag }) => ({
        id: tag.id,
        name: tag.name,
        color: tag.color
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    checklist: item.checklist.map((check) => ({
      id: check.id,
      title: check.title,
      done: check.done,
      order: check.order,
      createdAt: toIso(check.createdAt),
      updatedAt: toIso(check.updatedAt)
    })),
    activities: item.activities.map((activity) => ({
      id: activity.id,
      action: activity.action,
      message: activity.message,
      createdAt: toIso(activity.createdAt)
    }))
  };
}

export function serializeProjectSummary(project: ProjectForStats): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    repoUrl: project.repoUrl,
    repoPath: project.repoPath,
    deployUrl: project.deployUrl,
    docsUrl: project.docsUrl,
    color: project.color,
    archived: project.archived,
    createdAt: toIso(project.createdAt),
    updatedAt: toIso(project.updatedAt),
    stats: computeStats(project.workItems)
  };
}

export function serializeProjectDetail(project: ProjectWithItems): ProjectDetail {
  return {
    ...serializeProjectSummary(project),
    workItems: project.workItems.map(serializeWorkItem)
  };
}
