import type { ProjectSection, ProjectStats, WorkItemStatus, WorkItemType } from "./index";

export type WorkItemSection = Exclude<ProjectSection, "OVERVIEW">;

export type ProjectWorkItemSection = {
  id: WorkItemSection;
  type: WorkItemType;
  status: WorkItemStatus;
  title: string;
};

export const projectSectionOrder = [
  "OVERVIEW",
  "PENDING_BUGS",
  "PENDING_FEATURES",
  "DONE_FEATURES",
  "DONE_BUGS"
] as const satisfies readonly ProjectSection[];

export const workItemSectionOrder = [
  "PENDING_BUGS",
  "PENDING_FEATURES",
  "DONE_FEATURES",
  "DONE_BUGS"
] as const satisfies readonly WorkItemSection[];

export const sectionLabels: Record<ProjectSection, string> = {
  OVERVIEW: "基础项目预览",
  PENDING_BUGS: "Bug 待修改",
  PENDING_FEATURES: "功能待修改",
  DONE_FEATURES: "功能已实现",
  DONE_BUGS: "Bug 已修复"
};

export const projectSectionLabels = projectSectionOrder.map((section) => sectionLabels[section]);

export const projectWorkItemSections: readonly ProjectWorkItemSection[] = [
  { id: "PENDING_BUGS", type: "BUG", status: "PENDING", title: sectionLabels.PENDING_BUGS },
  { id: "PENDING_FEATURES", type: "FEATURE", status: "PENDING", title: sectionLabels.PENDING_FEATURES },
  { id: "DONE_FEATURES", type: "FEATURE", status: "DONE", title: sectionLabels.DONE_FEATURES },
  { id: "DONE_BUGS", type: "BUG", status: "DONE", title: sectionLabels.DONE_BUGS }
];

export function matchesProjectSection(item: { type: WorkItemType; status: WorkItemStatus }, section: ProjectSection): boolean {
  switch (section) {
    case "OVERVIEW":
      return true;
    case "PENDING_BUGS":
      return item.type === "BUG" && item.status !== "DONE";
    case "PENDING_FEATURES":
      return item.type === "FEATURE" && item.status !== "DONE";
    case "DONE_FEATURES":
      return item.type === "FEATURE" && item.status === "DONE";
    case "DONE_BUGS":
      return item.type === "BUG" && item.status === "DONE";
  }
}

export function countProjectSectionItems(stats: ProjectStats, section: ProjectSection): number {
  switch (section) {
    case "OVERVIEW":
      return stats.total;
    case "PENDING_BUGS":
      return stats.pendingBugs;
    case "PENDING_FEATURES":
      return stats.pendingFeatures;
    case "DONE_FEATURES":
      return stats.doneFeatures;
    case "DONE_BUGS":
      return stats.doneBugs;
  }
}
