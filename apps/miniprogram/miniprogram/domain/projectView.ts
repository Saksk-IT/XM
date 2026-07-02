import type { ChecklistItem, Priority, ProjectSection, ProjectSummary, WorkItem, WorkItemStatus, WorkItemType } from "@xm/shared";
import {
  countProjectSectionItems,
  matchesProjectSection,
  projectSectionOrder,
  sectionLabels
} from "@xm/shared/projectSections";

export { sectionLabels };

export const typeOptions: WorkItemType[] = ["FEATURE", "BUG"];
export const statusOptions: WorkItemStatus[] = ["PENDING", "IN_PROGRESS", "DONE"];
export const priorityOptions: Priority[] = ["HIGH", "MEDIUM", "LOW"];

export const typeLabels = {
  BUG: "Bug",
  FEATURE: "功能"
} as const satisfies Record<WorkItemType, string>;

export const statusLabels = {
  PENDING: "待处理",
  IN_PROGRESS: "进行中",
  DONE: "已完成"
} as const satisfies Record<WorkItemStatus, string>;

export const priorityLabels = {
  HIGH: "高",
  MEDIUM: "中",
  LOW: "低"
} as const satisfies Record<Priority, string>;

export type ProjectCard = ProjectSummary & {
  completionText: string;
  doneCount: number;
  openCount: number;
  progressStyle: string;
  healthLabel: string;
};

export type ProjectOverview = {
  totalProjects: number;
  openItems: number;
  doneItems: number;
  averageCompletion: number;
};

export type SectionOption = {
  value: ProjectSection;
  label: string;
  count: number;
  active: boolean;
};

export type ItemCard = WorkItem & {
  statusLabel: string;
  typeLabel: string;
  priorityLabel: string;
  priorityClass: string;
  statusClass: string;
  checklistText: string;
  checklistProgress: number;
  updatedText: string;
};

export const defaultProjectSection: ProjectSection = "OVERVIEW";

export function resolveProjectSection(value: string | undefined): ProjectSection {
  return projectSectionOrder.includes(value as ProjectSection) ? (value as ProjectSection) : defaultProjectSection;
}

export function createProjectSectionFilters(project: ProjectSummary | null, activeSection: ProjectSection): SectionOption[] {
  return projectSectionOrder.map((section) => ({
    value: section,
    label: sectionLabels[section],
    count: project ? countProjectSectionItems(project.stats, section) : 0,
    active: section === activeSection
  }));
}

export function toProjectCard(project: ProjectSummary): ProjectCard {
  const doneCount = project.stats.doneFeatures + project.stats.doneBugs;
  const openCount = project.stats.pendingBugs + project.stats.pendingFeatures;
  return {
    ...project,
    completionText: `${project.stats.completionRate}%`,
    doneCount,
    openCount,
    progressStyle: `width: ${project.stats.completionRate}%`,
    healthLabel: openCount === 0 ? "状态稳定" : `${openCount} 项推进中`
  };
}

export function createProjectOverview(projects: ProjectSummary[]): ProjectOverview {
  const totals = projects.reduce(
    (current, project) => ({
      openItems: current.openItems + project.stats.pendingBugs + project.stats.pendingFeatures,
      doneItems: current.doneItems + project.stats.doneFeatures + project.stats.doneBugs,
      completion: current.completion + project.stats.completionRate
    }),
    { openItems: 0, doneItems: 0, completion: 0 }
  );

  return {
    totalProjects: projects.length,
    openItems: totals.openItems,
    doneItems: totals.doneItems,
    averageCompletion: projects.length === 0 ? 0 : Math.round(totals.completion / projects.length)
  };
}

export function toItemCard(item: WorkItem): ItemCard {
  const done = item.checklist.filter((check) => check.done).length;
  const checklistProgress = item.checklist.length === 0 ? 0 : Math.round((done / item.checklist.length) * 100);
  return {
    ...item,
    statusLabel: statusLabels[item.status],
    typeLabel: typeLabels[item.type],
    priorityLabel: priorityLabels[item.priority],
    priorityClass: `priority-${item.priority.toLowerCase()}`,
    statusClass: `status-${item.status.toLowerCase()}`,
    checklistText: `${done}/${item.checklist.length}`,
    checklistProgress,
    updatedText: formatDate(item.updatedAt)
  };
}

export function filterItemCards(rows: ItemCard[], section: ProjectSection): ItemCard[] {
  return rows.filter((item) => matchesProjectSection(item, section));
}

export function parseTagNames(value: string): string[] {
  return [...new Set(value.split(/[,\s，]+/).map((name) => name.trim()).filter(Boolean))];
}

export function checklistDoneText(checklist: ChecklistItem[]): string {
  const done = checklist.filter((check) => check.done).length;
  return `${done}/${checklist.length}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "未设置";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "未设置";
  }

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
