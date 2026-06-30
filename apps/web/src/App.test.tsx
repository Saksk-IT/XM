import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const project = {
  id: "project-1",
  name: "DevFlow",
  description: "个人开发者工具箱",
  repoUrl: "https://github.com/example/devflow",
  deployUrl: "https://devflow.local",
  docsUrl: "https://docs.devflow.local",
  color: "#0891b2",
  archived: false,
  createdAt: "2026-06-30T00:00:00.000Z",
  updatedAt: "2026-06-30T00:00:00.000Z",
  stats: {
    total: 2,
    pendingBugs: 1,
    pendingFeatures: 1,
    doneFeatures: 0,
    doneBugs: 0,
    completionRate: 0
  },
  workItems: [
    {
      id: "item-bug",
      projectId: "project-1",
      title: "文件上传进度在断网后卡住",
      description: "断网后重连时上传状态没有恢复。",
      type: "BUG",
      status: "PENDING",
      priority: "HIGH",
      notes: "",
      dueDate: "2026-07-08T00:00:00.000Z",
      order: 0,
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T00:00:00.000Z",
      tags: [{ id: "tag-1", name: "上传模块", color: "#0891b2" }],
      checklist: [],
      activities: []
    },
    {
      id: "item-feature",
      projectId: "project-1",
      title: "支持自定义快捷键",
      description: "允许用户配置常用操作快捷键。",
      type: "FEATURE",
      status: "PENDING",
      priority: "MEDIUM",
      notes: "",
      dueDate: null,
      order: 1,
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T00:00:00.000Z",
      tags: [{ id: "tag-2", name: "设置", color: "#0891b2" }],
      checklist: [],
      activities: []
    }
  ]
};

const archivedProject = {
  ...project,
  id: "project-archived",
  name: "Old Tools",
  description: "已暂停维护的工具集合",
  archived: true,
  stats: {
    total: 0,
    pendingBugs: 0,
    pendingFeatures: 0,
    doneFeatures: 0,
    doneBugs: 0,
    completionRate: 0
  },
  workItems: []
};

function mockFetch() {
  let archived = true;
  const projectSummary = () => ({ ...project, workItems: undefined });
  const archivedSummary = () => ({ ...archivedProject, archived, workItems: undefined });

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === "/api/auth/me") {
      return jsonResponse({ id: "user-1", username: "admin", displayName: "Leo" });
    }
    if (url === "/api/projects/project-archived" && method === "PATCH") {
      archived = false;
      return jsonResponse({ ...archivedProject, archived: false });
    }
    if (url === "/api/projects?includeArchived=true") {
      return jsonResponse(archived ? [projectSummary(), archivedSummary()] : [projectSummary(), archivedSummary()]);
    }
    if (url === "/api/projects") {
      return jsonResponse(archived ? [projectSummary()] : [projectSummary(), archivedSummary()]);
    }
    if (url === "/api/projects/project-1") {
      return jsonResponse(project);
    }
    if (url === "/api/projects/project-archived") {
      return jsonResponse({ ...archivedProject, archived });
    }
    if (url === "/api/auth/logout") {
      return jsonResponse({ ok: true });
    }
    return jsonResponse({ message: "not found" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.pushState({}, "", "/projects/project-1");
    mockFetch();
  });

  it("renders project navigation and the five project sections", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: "DevFlow" })).toBeInTheDocument();
    const sectionNav = screen.getByRole("navigation", { name: "项目分区" });
    expect(sectionNav).toBeInTheDocument();
    expect(within(sectionNav).getByRole("button", { name: /基础项目预览/ })).toBeInTheDocument();
    expect(within(sectionNav).getByRole("button", { name: /Bug 待修改/ })).toBeInTheDocument();
    expect(within(sectionNav).getByRole("button", { name: /功能待修改/ })).toBeInTheDocument();
    expect(within(sectionNav).getByRole("button", { name: /功能已实现/ })).toBeInTheDocument();
    expect(within(sectionNav).getByRole("button", { name: /Bug 已实现/ })).toBeInTheDocument();
  });

  it("switches between board and list views", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findAllByText("支持自定义快捷键")).not.toHaveLength(0);
    await user.click(screen.getByRole("button", { name: /列表/ }));

    await waitFor(() => {
      expect(screen.getByRole("table")).toBeInTheDocument();
    });
    expect(screen.getAllByText("文件上传进度在断网后卡住")).not.toHaveLength(0);
  });

  it("toggles the sidebar, detail panel, and layout settings", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "DevFlow" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "收起侧边栏" }));
    expect(screen.getByRole("button", { name: "展开侧边栏" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "收起事项详情" }));
    expect(screen.getByRole("button", { name: "展开事项详情" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "设置" }));
    const dialog = screen.getByRole("dialog", { name: "设置" });
    expect(within(dialog).getByRole("checkbox", { name: "收起左侧项目栏" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "收起右侧事项详情" })).toBeChecked();
  });

  it("restores archived projects from settings", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "DevFlow" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "归档项目" }));
    const dialog = screen.getByRole("dialog", { name: "设置" });
    expect(within(dialog).getByText("Old Tools")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "恢复项目 Old Tools" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/project-archived",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ archived: false })
        })
      );
    });
    expect(await within(dialog).findByText("暂无归档项目")).toBeInTheDocument();
  });
});
