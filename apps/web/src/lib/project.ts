import type { Priority, ProjectSection, ViewMode, WorkItem } from "@xm/shared";
import { matchesProjectSection, projectWorkItemSections } from "@xm/shared";

export const boardColumns = projectWorkItemSections;

export const defaultViewMode: ViewMode = "BOARD";

export function matchesSection(item: WorkItem, section: ProjectSection): boolean {
  return matchesProjectSection(item, section);
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
