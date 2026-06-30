import type { Priority, ProjectSection, ViewMode, WorkItem, WorkItemStatus, WorkItemType } from "@xm/shared";

export const boardColumns: Array<{
  id: Exclude<ProjectSection, "OVERVIEW">;
  type: WorkItemType;
  status: WorkItemStatus;
  title: string;
}> = [
  { id: "PENDING_BUGS", type: "BUG", status: "PENDING", title: "Bug 待修改" },
  { id: "PENDING_FEATURES", type: "FEATURE", status: "PENDING", title: "功能待修改" },
  { id: "DONE_FEATURES", type: "FEATURE", status: "DONE", title: "功能已实现" },
  { id: "DONE_BUGS", type: "BUG", status: "DONE", title: "Bug 已实现" }
];

export const defaultViewMode: ViewMode = "BOARD";

export function matchesSection(item: WorkItem, section: ProjectSection): boolean {
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

export function matchesColumn(item: WorkItem, columnId: Exclude<ProjectSection, "OVERVIEW">): boolean {
  return matchesSection(item, columnId);
}

export function searchItems(items: WorkItem[], search: string, priority: Priority | "ALL"): WorkItem[] {
  const normalized = search.trim().toLowerCase();
  return items.filter((item) => {
    const matchesSearch =
      normalized.length === 0 ||
      [item.title, item.description, item.notes, ...item.tags.map((tag) => tag.name)]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    const matchesPriority = priority === "ALL" || item.priority === priority;
    return matchesSearch && matchesPriority;
  });
}

export function checklistProgress(item: WorkItem): number {
  if (item.checklist.length === 0) {
    return 0;
  }

  return Math.round((item.checklist.filter((check) => check.done).length / item.checklist.length) * 100);
}
