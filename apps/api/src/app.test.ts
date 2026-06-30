import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { env } from "./env.js";

const db = new PrismaClient();
const username = "admin";
const password = "admin123456";

async function resetDatabase() {
  await db.activityLog.deleteMany();
  await db.checklistItem.deleteMany();
  await db.workItemTag.deleteMany();
  await db.tag.deleteMany();
  await db.workItem.deleteMany();
  await db.project.deleteMany();
  await db.user.deleteMany();
  await db.user.create({
    data: {
      username,
      displayName: "Leo",
      passwordHash: await argon2.hash(password)
    }
  });
}

describe("XM API", () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let cookie = "";
  let originalAgentApiToken = "";

  beforeAll(async () => {
    originalAgentApiToken = env.agentApiToken;
    app = await createApp({
      db,
      staticRoot: "/tmp/xm-static-missing"
    });
  });

  beforeEach(async () => {
    await resetDatabase();
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        username,
        password
      }
    });
    cookie = login.headers["set-cookie"] as string;
  });

  afterAll(async () => {
    env.agentApiToken = originalAgentApiToken;
    await resetDatabase();
    await app.close();
    await db.$disconnect();
  });

  it("logs in and returns the current admin", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: {
        cookie
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      username,
      displayName: "Leo"
    });
  });

  it("creates, updates, archives, and lists projects", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: {
        cookie
      },
      payload: {
        name: "DevFlow",
        description: "个人开发者工具箱",
        repoUrl: "https://github.com/example/devflow",
        color: "#0891b2"
      }
    });

    expect(created.statusCode).toBe(201);
    const project = created.json();
    expect(project.name).toBe("DevFlow");

    const updated = await app.inject({
      method: "PATCH",
      url: `/api/projects/${project.id}`,
      headers: {
        cookie
      },
      payload: {
        description: "更新后的项目描述"
      }
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().description).toBe("更新后的项目描述");

    const archived = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/archive`,
      headers: {
        cookie
      }
    });
    expect(archived.statusCode).toBe(200);
    expect(archived.json().archived).toBe(true);

    const list = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: {
        cookie
      }
    });
    expect(list.json()).toHaveLength(0);

    const withArchived = await app.inject({
      method: "GET",
      url: "/api/projects?includeArchived=true",
      headers: {
        cookie
      }
    });
    expect(withArchived.json()).toHaveLength(1);

    const restored = await app.inject({
      method: "PATCH",
      url: `/api/projects/${project.id}`,
      headers: {
        cookie
      },
      payload: {
        archived: false
      }
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json().archived).toBe(false);

    const restoredList = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: {
        cookie
      }
    });
    expect(restoredList.json()).toHaveLength(1);
  });

  it("creates work items, searches them, changes state, and updates checklist", async () => {
    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: {
        cookie
      },
      payload: {
        name: "NoteCraft",
        description: "Markdown 笔记系统",
        color: "#2563eb"
      }
    });
    const project = projectResponse.json();

    const itemResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/items`,
      headers: {
        cookie
      },
      payload: {
        title: "支持自定义快捷键",
        description: "为编辑器提供快捷键配置",
        type: "FEATURE",
        priority: "HIGH",
        tagNames: ["设置", "快捷键"],
        checklist: ["梳理操作列表", "设计配置界面"]
      }
    });
    expect(itemResponse.statusCode).toBe(201);
    const item = itemResponse.json();
    expect(item.tags.map((tag: { name: string }) => tag.name)).toContain("快捷键");

    const searched = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/items?search=%E5%BF%AB%E6%8D%B7%E9%94%AE&type=FEATURE`,
      headers: {
        cookie
      }
    });
    expect(searched.statusCode).toBe(200);
    expect(searched.json()).toHaveLength(1);

    const moved = await app.inject({
      method: "PATCH",
      url: `/api/items/${item.id}`,
      headers: {
        cookie
      },
      payload: {
        type: "FEATURE",
        status: "DONE"
      }
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json().status).toBe("DONE");

    const checklistId = item.checklist[0].id;
    const checked = await app.inject({
      method: "PATCH",
      url: `/api/checklist/${checklistId}`,
      headers: {
        cookie
      },
      payload: {
        done: true
      }
    });
    expect(checked.statusCode).toBe(200);
    expect(checked.json().checklist[0].done).toBe(true);
  });

  it("rejects agent requests without a configured valid token", async () => {
    env.agentApiToken = "";
    const disabled = await app.inject({
      method: "GET",
      url: "/api/agent/projects/resolve?name=Missing"
    });
    expect(disabled.statusCode).toBe(503);

    env.agentApiToken = "test-agent-token";
    const missing = await app.inject({
      method: "GET",
      url: "/api/agent/projects/resolve?name=Missing"
    });
    expect(missing.statusCode).toBe(401);

    const wrong = await app.inject({
      method: "GET",
      url: "/api/agent/projects/resolve?name=Missing",
      headers: {
        authorization: "Bearer wrong-token"
      }
    });
    expect(wrong.statusCode).toBe(401);
  });

  it("resolves projects and manages work items through the agent API", async () => {
    env.agentApiToken = "test-agent-token";
    const auth = {
      authorization: "Bearer test-agent-token"
    };

    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: {
        cookie
      },
      payload: {
        name: "AgentTarget",
        description: "Agent 写入测试",
        repoUrl: "https://github.com/example/agent-target.git",
        repoPath: "/Users/sak/Documents/GitHub/AgentTarget",
        color: "#0891b2"
      }
    });
    const project = projectResponse.json();

    const resolvedByPath = await app.inject({
      method: "GET",
      url: "/api/agent/projects/resolve?repoPath=/Users/sak/Documents/GitHub/AgentTarget",
      headers: auth
    });
    expect(resolvedByPath.statusCode).toBe(200);
    expect(resolvedByPath.json().id).toBe(project.id);

    const resolvedByUrl = await app.inject({
      method: "GET",
      url: "/api/agent/projects/resolve?repoUrl=https://github.com/example/agent-target",
      headers: auth
    });
    expect(resolvedByUrl.statusCode).toBe(200);
    expect(resolvedByUrl.json().id).toBe(project.id);

    const resolvedByName = await app.inject({
      method: "GET",
      url: "/api/agent/projects/resolve?name=AgentTarget",
      headers: auth
    });
    expect(resolvedByName.statusCode).toBe(200);
    expect(resolvedByName.json().id).toBe(project.id);

    const created = await app.inject({
      method: "POST",
      url: `/api/agent/projects/${project.id}/items`,
      headers: auth,
      payload: {
        title: "修复 Agent 写入记录",
        description: "Agent 可以写入 XM 事项",
        type: "BUG",
        status: "DONE",
        priority: "HIGH",
        notes: "验证：pnpm test",
        tagNames: ["agent", "api"],
        checklist: ["新增 token 认证", "补充写入接口"]
      }
    });
    expect(created.statusCode).toBe(201);
    const item = created.json();
    expect(item.activities[0]).toMatchObject({
      action: "agent_created",
      message: "AI agent 创建了记录"
    });
    expect(item.tags.map((tag: { name: string }) => tag.name)).toEqual(["agent", "api"]);
    expect(item.checklist).toHaveLength(2);

    const listed = await app.inject({
      method: "GET",
      url: `/api/agent/projects/${project.id}/items?search=Agent&type=BUG&status=DONE`,
      headers: auth
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toHaveLength(1);

    const updated = await app.inject({
      method: "PATCH",
      url: `/api/agent/items/${item.id}`,
      headers: auth,
      payload: {
        title: "完善 Agent 写入记录",
        type: "FEATURE",
        status: "IN_PROGRESS",
        priority: "MEDIUM",
        tagNames: ["agent"],
        checklist: ["更新记录"]
      }
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      title: "完善 Agent 写入记录",
      type: "FEATURE",
      status: "IN_PROGRESS",
      priority: "MEDIUM"
    });
    expect(updated.json().tags.map((tag: { name: string }) => tag.name)).toEqual(["agent"]);
    expect(updated.json().checklist).toHaveLength(1);
    expect(updated.json().activities[0].action).toBe("agent_updated");

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/agent/items/${item.id}`,
      headers: auth
    });
    expect(deleted.statusCode).toBe(204);

    const afterDelete = await app.inject({
      method: "GET",
      url: `/api/agent/projects/${project.id}/items`,
      headers: auth
    });
    expect(afterDelete.json()).toHaveLength(0);
  });
});
