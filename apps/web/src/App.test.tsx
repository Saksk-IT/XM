import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const project = {
  id: "project-1",
  name: "DevFlow",
  description: "个人开发者工具箱",
  repoUrl: "https://github.com/example/devflow",
  repoPath: "/Users/sak/Documents/XM",
  defaultBranch: "main",
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
  let projectDefaultBranch = project.defaultBranch;
  const projectSummary = () => ({ ...project, defaultBranch: projectDefaultBranch, workItems: undefined });
  const archivedSummary = () => ({ ...archivedProject, archived, workItems: undefined });

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === "/api/auth/me") {
      return jsonResponse({ id: "user-1", username: "admin", displayName: "Leo" });
    }
    if (url === "/api/settings/runtime" && method === "PATCH") {
      const body = JSON.parse(String(init?.body));
      return jsonResponse({
        github: {
          token: { configured: Boolean(body.github?.token), maskedValue: body.github?.token ? "ghp_••••test" : null },
          configured: Boolean(body.github?.token),
          publicAccess: true
        },
        openai: {
          apiKey: { configured: Boolean(body.openai?.apiKey), maskedValue: body.openai?.apiKey ? "sk-t••••test" : "sk-t••••test" },
          configured: Boolean(body.openai?.model),
          baseUrl: body.openai?.baseUrl ?? "https://api.openai.test/v1",
          model: body.openai?.model ?? "gpt-test",
          baseUrlConfigured: true
        },
        wechatMiniProgram: {
          configured: Boolean(body.wechatMiniProgram?.appId && body.wechatMiniProgram?.appSecret),
          appId: body.wechatMiniProgram?.appId ?? "",
          name: body.wechatMiniProgram?.name ?? "",
          originalId: body.wechatMiniProgram?.originalId ?? "",
          appSecret: { configured: Boolean(body.wechatMiniProgram?.appSecret), maskedValue: body.wechatMiniProgram?.appSecret ? "wech••••test" : null }
        }
      });
    }
    if (url === "/api/settings/runtime") {
      return jsonResponse({
        github: {
          token: { configured: true, maskedValue: "ghp_••••test" },
          configured: true,
          publicAccess: true
        },
        openai: {
          apiKey: { configured: true, maskedValue: "sk-t••••test" },
          configured: true,
          baseUrl: "https://api.openai.test/v1",
          model: "gpt-test",
          baseUrlConfigured: true
        },
        wechatMiniProgram: {
          configured: false,
          appId: "",
          name: "",
          originalId: "",
          appSecret: { configured: false, maskedValue: null }
        }
      });
    }
    if (url === "/api/settings/openai/models") {
      return jsonResponse({ models: ["gpt-5.5", "gpt-5.5-mini"] });
    }
    if (url === "/api/projects/project-1/github/commits?limit=5&branch=main") {
      return jsonResponse([
        {
          sha: "abcdef1234567890",
          shortSha: "abcdef1",
          title: "Fix upload retry",
          message: "Fix upload retry",
          authorName: "monalisa",
          authorEmail: "mona@example.com",
          authoredAt: "2026-07-01T08:00:00.000Z",
          url: "https://github.com/example/devflow/commit/abcdef1",
          verification: { verified: true, reason: "valid" }
        }
      ]);
    }
    if (url === "/api/projects/project-1/work-items/draft" && method === "POST") {
      return jsonResponse({
        title: "修复上传断网重试",
        description: "断网恢复后上传进度需要继续同步。",
        type: "BUG",
        status: "PENDING",
        priority: "HIGH",
        notes: "用户反馈上传状态卡住。",
        tagNames: ["上传", "网络"],
        checklist: ["复现断网重连", "补充进度恢复测试"]
      });
    }
    if (url === "/api/projects/project-1/items" && method === "POST") {
      const body = JSON.parse(String(init?.body));
      return jsonResponse(
        {
          id: "item-created",
          projectId: "project-1",
          order: 2,
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
          tags: body.tagNames.map((name: string) => ({ id: `tag-${name}`, name, color: "#0891b2" })),
          checklist: body.checklist.map((title: string, order: number) => ({
            id: `check-${order}`,
            title,
            done: false,
            order,
            createdAt: "2026-07-01T00:00:00.000Z",
            updatedAt: "2026-07-01T00:00:00.000Z"
          })),
          activities: [],
          ...body
        },
        201
      );
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
    if (url === "/api/projects/project-1" && method === "PATCH") {
      const body = JSON.parse(String(init?.body));
      projectDefaultBranch = body.defaultBranch ?? projectDefaultBranch;
      return jsonResponse({ ...project, ...body, defaultBranch: projectDefaultBranch });
    }
    if (url === "/api/projects/project-1") {
      return jsonResponse({ ...project, defaultBranch: projectDefaultBranch });
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

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

  it("loads GitHub commits from the project default branch", async () => {
    const fetchMock = mockFetch();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "DevFlow" })).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-1/github/commits?limit=5&branch=main", expect.anything());
    });
    expect(screen.getByText("分支 main")).toBeInTheDocument();
    expect(await screen.findByText("Fix upload retry")).toBeInTheDocument();
  });

  it("saves the project default branch from the edit dialog", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "DevFlow" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "编辑项目" }));
    const dialog = screen.getByRole("dialog", { name: "编辑项目" });

    expect(within(dialog).getByLabelText("默认分支")).toHaveValue("main");
    await user.clear(within(dialog).getByLabelText("默认分支"));
    await user.type(within(dialog).getByLabelText("默认分支"), "codex/xm-project-manager");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/project-1",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining("\"defaultBranch\":\"codex/xm-project-manager\"")
        })
      );
    });
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
    expect(await screen.findByRole("heading", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "收起左侧项目栏" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "收起右侧事项详情" })).toBeChecked();
  });

  it("restores archived projects from the settings page", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "DevFlow" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "归档项目" }));
    expect(await screen.findByRole("heading", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByText("Old Tools")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "恢复项目 Old Tools" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/project-archived",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ archived: false })
        })
      );
    });
    expect(await screen.findByText("暂无归档项目")).toBeInTheDocument();
  });

  it("saves integration settings and supports selecting an OpenAI model", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "DevFlow" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "设置" }));
    expect(await screen.findByRole("heading", { name: "设置" })).toBeInTheDocument();
    const integrationTab = screen.getAllByRole("button", { name: "集成" })[0];
    if (!integrationTab) {
      throw new Error("未找到集成设置入口");
    }
    await user.click(integrationTab);

    await user.clear(screen.getByLabelText("OpenAI base URL"));
    await user.type(screen.getByLabelText("OpenAI base URL"), "https://api.openai.test/v1");
    await user.type(screen.getByLabelText("OpenAI API key"), "sk-test");
    await user.click(screen.getByRole("button", { name: "读取模型" }));
    await waitFor(() => {
      expect(screen.getByDisplayValue("gpt-test")).toBeInTheDocument();
    });
    await user.clear(screen.getByLabelText("OpenAI 模型"));
    await user.type(screen.getByLabelText("OpenAI 模型"), "gpt-5.5");
    await user.type(screen.getByLabelText("GitHub token"), "ghp-test");
    await user.type(screen.getByLabelText("小程序名称"), "XM 小程序");
    await user.type(screen.getByLabelText("小程序 AppID"), "wx-test");
    await user.type(screen.getByLabelText("小程序 AppSecret"), "wechat-secret");
    await user.click(screen.getByRole("button", { name: "保存配置" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/settings/runtime",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining("gpt-5.5")
        })
      );
    });
  });

  it("fills the new item form from a generated draft before saving", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "DevFlow" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^新建$/ }));
    const dialog = screen.getByRole("dialog", { name: "新建事项" });

    await user.type(within(dialog).getByLabelText("原始描述"), "上传过程中断网，恢复网络后进度一直卡在 60%，需要修复并补测试。");
    await user.click(within(dialog).getByRole("button", { name: "整理草稿" }));

    await waitFor(() => {
      expect(within(dialog).getByLabelText("标题")).toHaveValue("修复上传断网重试");
    });
    expect(within(dialog).getByLabelText("类型")).toHaveValue("BUG");
    expect(within(dialog).getByLabelText("优先级")).toHaveValue("HIGH");
    expect(within(dialog).getByLabelText("标签")).toHaveValue("上传，网络");

    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/project-1/items",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("修复上传断网重试")
        })
      );
    });
  });

  it("defaults the new item due date to today before saving", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    const today = formatDateInputValue(new Date());
    render(<App />);

    expect(await screen.findByRole("heading", { name: "DevFlow" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^新建$/ }));
    const dialog = screen.getByRole("dialog", { name: "新建事项" });

    expect(within(dialog).getByLabelText("截止日期")).toHaveValue(today);

    await user.type(within(dialog).getByLabelText("标题"), "自动填充当天日期");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/project-1/items",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining(`"dueDate":"${new Date(`${today}T00:00:00.000Z`).toISOString()}"`)
        })
      );
    });
  });
});
