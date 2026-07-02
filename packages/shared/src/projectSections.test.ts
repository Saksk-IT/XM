import { describe, expect, it } from "vitest";
import { matchesProjectSection, projectSectionLabels, projectSectionOrder, projectWorkItemSections } from "./index";

describe("project sections", () => {
  it("keeps the shared project section order and labels", () => {
    expect(projectSectionOrder).toEqual([
      "OVERVIEW",
      "PENDING_BUGS",
      "PENDING_FEATURES",
      "DONE_FEATURES",
      "DONE_BUGS"
    ]);
    expect(projectSectionLabels).toEqual(["基础项目预览", "Bug 待修改", "功能待修改", "功能已实现", "Bug 已修复"]);
    expect(projectWorkItemSections.map((section) => section.title)).toEqual([
      "Bug 待修改",
      "功能待修改",
      "功能已实现",
      "Bug 已修复"
    ]);
  });

  it("groups work items into pending and done sections by type and status", () => {
    expect(matchesProjectSection({ type: "BUG", status: "PENDING" }, "PENDING_BUGS")).toBe(true);
    expect(matchesProjectSection({ type: "BUG", status: "IN_PROGRESS" }, "PENDING_BUGS")).toBe(true);
    expect(matchesProjectSection({ type: "BUG", status: "DONE" }, "PENDING_BUGS")).toBe(false);
    expect(matchesProjectSection({ type: "FEATURE", status: "IN_PROGRESS" }, "PENDING_FEATURES")).toBe(true);
    expect(matchesProjectSection({ type: "FEATURE", status: "DONE" }, "DONE_FEATURES")).toBe(true);
    expect(matchesProjectSection({ type: "BUG", status: "DONE" }, "DONE_BUGS")).toBe(true);
    expect(matchesProjectSection({ type: "FEATURE", status: "PENDING" }, "OVERVIEW")).toBe(true);
  });
});
