import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { env } from "./env.js";
import { clearGitHubCommitCache } from "./integrations/github.js";

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
  await db.appSetting.deleteMany();
  await db.wechatAccount.deleteMany();
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
  let originalGitHubToken = "";
  let originalOpenAIKey = "";
  let originalOpenAIModel = "";
  let originalOpenAIBaseUrl = "";
  let originalOpenAIBaseUrlConfigured = false;
  let originalWechatMiniProgramAppId = "";
  let originalWechatMiniProgramAppSecret = "";

  beforeAll(async () => {
    originalAgentApiToken = env.agentApiToken;
    originalGitHubToken = env.githubToken;
    originalOpenAIKey = env.openaiApiKey;
    originalOpenAIModel = env.openaiModel;
    originalOpenAIBaseUrl = env.openaiBaseUrl;
    originalOpenAIBaseUrlConfigured = env.openaiBaseUrlConfigured;
    originalWechatMiniProgramAppId = env.wechatMiniProgramAppId;
    originalWechatMiniProgramAppSecret = env.wechatMiniProgramAppSecret;
    app = await createApp({
      db,
      staticRoot: "/tmp/xm-static-missing"
    });
  });

  beforeEach(async () => {
    vi.unstubAllGlobals();
    clearGitHubCommitCache();
    env.agentApiToken = originalAgentApiToken;
    env.githubToken = "";
    env.openaiApiKey = "";
    env.openaiModel = "";
    env.openaiBaseUrl = "https://api.openai.test/v1";
    env.openaiBaseUrlConfigured = false;
    env.wechatMiniProgramAppId = "";
    env.wechatMiniProgramAppSecret = "";
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
    env.githubToken = originalGitHubToken;
    env.openaiApiKey = originalOpenAIKey;
    env.openaiModel = originalOpenAIModel;
    env.openaiBaseUrl = originalOpenAIBaseUrl;
    env.openaiBaseUrlConfigured = originalOpenAIBaseUrlConfigured;
    env.wechatMiniProgramAppId = originalWechatMiniProgramAppId;
    env.wechatMiniProgramAppSecret = originalWechatMiniProgramAppSecret;
    vi.unstubAllGlobals();
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

  it("serves the built web app for project history routes", async () => {
    const staticRoot = await mkdtemp(path.join(tmpdir(), "xm-static-"));
    await writeFile(path.join(staticRoot, "index.html"), "<!doctype html><div id=\"root\"></div>");
    const staticApp = await createApp({
      db,
      staticRoot
    });

    try {
      const response = await staticApp.inject({
        method: "GET",
        url: "/projects/seed-notecraft"
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/html");
      expect(response.body).toContain("root");
    } finally {
      await staticApp.close();
      await rm(staticRoot, { recursive: true, force: true });
    }
  });

  it("supports miniprogram login binding and bearer-authenticated project access", async () => {
    const missingConfig = await app.inject({
      method: "POST",
      url: "/api/miniprogram/auth/login",
      payload: {
        code: "wx-login-code"
      }
    });
    expect(missingConfig.statusCode).toBe(503);

    env.wechatMiniProgramAppId = "wx-test-app";
    env.wechatMiniProgramAppSecret = "wechat-secret";
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          openid: "openid-admin",
          unionid: "union-admin",
          session_key: "session-key"
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: {
        cookie
      },
      payload: {
        name: "MiniApp",
        description: "微信小程序管理端",
        color: "#0891b2"
      }
    });
    const project = projectResponse.json();

    const login = await app.inject({
      method: "POST",
      url: "/api/miniprogram/auth/login",
      payload: {
        code: "wx-login-code"
      }
    });
    expect(login.statusCode).toBe(202);
    expect(login.json()).toMatchObject({
      status: "BINDING_REQUIRED"
    });
    expect(login.body).not.toContain("session-key");
    const bindToken = login.json().bindToken as string;

    const wrongPassword = await app.inject({
      method: "POST",
      url: "/api/miniprogram/auth/bind",
      payload: {
        bindToken,
        username,
        password: "wrong-password"
      }
    });
    expect(wrongPassword.statusCode).toBe(401);

    const bound = await app.inject({
      method: "POST",
      url: "/api/miniprogram/auth/bind",
      payload: {
        bindToken,
        username,
        password
      }
    });
    expect(bound.statusCode).toBe(200);
    expect(bound.json()).toMatchObject({
      status: "AUTHENTICATED",
      user: {
        username
      }
    });
    expect(bound.body).not.toContain("wechat-secret");
    expect(await db.wechatAccount.count()).toBe(1);

    const token = bound.json().token as string;
    const bearerProjects = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: {
        authorization: `Bearer ${token}`
      }
    });
    expect(bearerProjects.statusCode).toBe(200);
    expect(bearerProjects.json()).toEqual([expect.objectContaining({ id: project.id })]);

    const secondLogin = await app.inject({
      method: "POST",
      url: "/api/miniprogram/auth/login",
      payload: {
        code: "wx-login-code"
      }
    });
    expect(secondLogin.statusCode).toBe(200);
    expect(secondLogin.json()).toMatchObject({
      status: "AUTHENTICATED",
      user: {
        username
      }
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

  it("returns runtime integration status without exposing secrets", async () => {
    env.githubToken = "ghp_test_secret";
    env.openaiApiKey = "sk-test-secret";
    env.openaiModel = "gpt-test";

    const response = await app.inject({
      method: "GET",
      url: "/api/settings/runtime",
      headers: {
        cookie
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      github: {
        token: {
          configured: true,
          maskedValue: "ghp_••••cret"
        },
        configured: true,
        publicAccess: true
      },
      openai: {
        apiKey: {
          configured: true,
          maskedValue: "sk-t••••cret"
        },
        configured: true,
        baseUrl: "https://api.openai.test/v1",
        model: "gpt-test",
        baseUrlConfigured: false
      },
      wechatMiniProgram: {
        configured: false,
        appId: "",
        name: "",
        originalId: "",
        appSecret: {
          configured: false,
          maskedValue: null
        }
      }
    });
    expect(response.body).not.toContain("ghp_test_secret");
    expect(response.body).not.toContain("sk-test-secret");
  });

  it("saves integration settings, masks secrets, and uses them for model listing", async () => {
    const modelsFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [{ id: "gpt-5.5" }, { id: "gpt-5.5-mini" }, { id: "gpt-5.5" }]
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", modelsFetch);

    const saved = await app.inject({
      method: "PATCH",
      url: "/api/settings/runtime",
      headers: {
        cookie
      },
      payload: {
        github: {
          token: "github-token-from-settings"
        },
        openai: {
          apiKey: "openai-key-from-settings",
          baseUrl: "https://api.openai.settings/v1",
          model: "gpt-5.5"
        },
        wechatMiniProgram: {
          appId: "wx-settings-app",
          appSecret: "wechat-secret-from-settings",
          name: "XM 小程序",
          originalId: "gh_xm"
        }
      }
    });

    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      github: {
        token: {
          configured: true,
          maskedValue: "gith••••ings"
        }
      },
      openai: {
        apiKey: {
          configured: true,
          maskedValue: "open••••ings"
        },
        baseUrl: "https://api.openai.settings/v1",
        model: "gpt-5.5"
      },
      wechatMiniProgram: {
        configured: true,
        appId: "wx-settings-app",
        name: "XM 小程序",
        originalId: "gh_xm",
        appSecret: {
          configured: true,
          maskedValue: "wech••••ings"
        }
      }
    });
    expect(saved.body).not.toContain("github-token-from-settings");
    expect(saved.body).not.toContain("openai-key-from-settings");
    expect(saved.body).not.toContain("wechat-secret-from-settings");

    const rawSecrets = await db.appSetting.findMany({
      where: {
        key: {
          in: ["github.token", "openai.apiKey", "wechatMiniProgram.appSecret"]
        }
      }
    });
    expect(rawSecrets).toHaveLength(3);
    expect(rawSecrets.every((setting) => setting.value.startsWith("enc:v1:"))).toBe(true);

    const models = await app.inject({
      method: "GET",
      url: "/api/settings/openai/models",
      headers: {
        cookie
      }
    });
    expect(models.statusCode).toBe(200);
    expect(models.json()).toEqual({
      models: ["gpt-5.5", "gpt-5.5-mini"]
    });
    expect(modelsFetch).toHaveBeenCalledWith(
      "https://api.openai.settings/v1/models",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer openai-key-from-settings"
        }
      })
    );
  });

  it("normalizes OpenAI-compatible root URLs before listing models", async () => {
    const modelsFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [{ id: "gpt-5.5" }]
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", modelsFetch);

    const saved = await app.inject({
      method: "PATCH",
      url: "/api/settings/runtime",
      headers: {
        cookie
      },
      payload: {
        openai: {
          apiKey: "openai-key-from-settings",
          baseUrl: "https://openai-compatible.test/",
          model: "gpt-5.5"
        }
      }
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().openai.baseUrl).toBe("https://openai-compatible.test/v1");

    const models = await app.inject({
      method: "GET",
      url: "/api/settings/openai/models",
      headers: {
        cookie
      }
    });
    expect(models.statusCode).toBe(200);
    expect(models.json()).toEqual({
      models: ["gpt-5.5"]
    });
    expect(modelsFetch).toHaveBeenCalledWith(
      "https://openai-compatible.test/v1/models",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer openai-key-from-settings"
        }
      })
    );
  });

  it("returns a user-readable error when the OpenAI model endpoint returns non-json", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<!doctype html><html></html>", { status: 200 })));

    const saved = await app.inject({
      method: "PATCH",
      url: "/api/settings/runtime",
      headers: {
        cookie
      },
      payload: {
        openai: {
          apiKey: "openai-key-from-settings",
          baseUrl: "https://openai-compatible.test/",
          model: "gpt-5.5"
        }
      }
    });
    expect(saved.statusCode).toBe(200);

    const models = await app.inject({
      method: "GET",
      url: "/api/settings/openai/models",
      headers: {
        cookie
      }
    });
    expect(models.statusCode).toBe(502);
    expect(models.json()).toEqual({
      message: "OpenAI 模型列表返回非 JSON，请检查 base URL 是否指向兼容 OpenAI 的 /v1 地址"
    });
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

  it("lists GitHub commits with server-side auth headers and short cache", async () => {
    env.githubToken = "github-token";
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            sha: "abcdef1234567890",
            html_url: "https://github.com/example/devflow/commit/abcdef1",
            commit: {
              message: "Fix upload retry\n\nKeep progress state after reconnect.",
              author: {
                name: "Mona",
                email: "mona@example.com",
                date: "2026-07-01T08:00:00.000Z"
              },
              verification: {
                verified: true,
                reason: "valid"
              }
            },
            author: {
              login: "monalisa"
            }
          }
        ]),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: {
        cookie
      },
      payload: {
        name: "DevFlow",
        repoUrl: "https://github.com/example/devflow.git",
        color: "#0891b2"
      }
    });
    const project = projectResponse.json();

    const first = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/github/commits?limit=1&branch=main`,
      headers: {
        cookie
      }
    });
    const second = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/github/commits?limit=1&branch=main`,
      headers: {
        cookie
      }
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.json()).toEqual([
      expect.objectContaining({
        shortSha: "abcdef1",
        title: "Fix upload retry",
        authorName: "monalisa",
        verification: {
          verified: true,
          reason: "valid"
        }
      })
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.github.com/repos/example/devflow/commits?per_page=1&sha=main");
    const headers = init.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer github-token");
    expect(headers.get("Accept")).toBe("application/vnd.github+json");
  });

  it("uses the configured project default branch when listing GitHub commits", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: {
        cookie
      },
      payload: {
        name: "DevFlow",
        repoUrl: "https://github.com/example/devflow.git",
        defaultBranch: "main",
        color: "#0891b2"
      }
    });
    const project = projectResponse.json();

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/github/commits?limit=5`,
      headers: {
        cookie
      }
    });

    expect(response.statusCode).toBe(200);
    const [url] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.github.com/repos/example/devflow/commits?per_page=5&sha=main");
  });

  it("maps GitHub repository and rate-limit errors to user-readable API responses", async () => {
    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: {
        cookie
      },
      payload: {
        name: "DevFlow",
        repoUrl: "https://github.com/example/devflow",
        color: "#0891b2"
      }
    });
    const project = projectResponse.json();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }))
    );
    const missing = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/github/commits`,
      headers: {
        cookie
      }
    });
    expect(missing.statusCode).toBe(404);

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
            status: 403,
            headers: {
              "x-ratelimit-remaining": "0"
            }
          })
      )
    );
    const limited = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/github/commits`,
      headers: {
        cookie
      }
    });
    expect(limited.statusCode).toBe(429);
  });

  it("generates editable work item drafts through OpenAI Responses", async () => {
    env.openaiApiKey = "openai-token";
    env.openaiModel = "gpt-test";
    const draft = {
      title: "修复上传断网重试",
      description: "断网恢复后上传进度需要继续同步。",
      type: "BUG",
      status: "PENDING",
      priority: "HIGH",
      notes: "用户反馈上传状态卡住。",
      tagNames: ["上传", "网络"],
      checklist: ["复现断网重连", "补充进度恢复测试"]
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ output_text: JSON.stringify(draft) }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: {
        cookie
      },
      payload: {
        name: "DevFlow",
        color: "#0891b2"
      }
    });
    const project = projectResponse.json();

    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/work-items/draft`,
      headers: {
        cookie
      },
      payload: {
        input: "上传过程中断网，恢复网络后进度一直卡在 60%，需要修复并补测试。"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(draft);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.test/v1/responses");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer openai-token");
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "gpt-test",
      max_output_tokens: 1200
    });
  });

  it("falls back to chat completions when an OpenAI-compatible provider does not proxy Responses", async () => {
    env.openaiApiKey = "openai-token";
    env.openaiBaseUrl = "https://api.openai-compatible.test/v1";
    env.openaiBaseUrlConfigured = true;
    env.openaiModel = "gpt-test";
    const draft = {
      title: "完善集成能力",
      description: "补齐 GitHub 提交读取、草稿生成和设置页配置。",
      type: "FEATURE",
      status: "PENDING",
      priority: "HIGH",
      notes: "用户希望按业内最佳实践完善项目能力。",
      tagNames: ["GitHub", "OpenAI", "设置页"],
      checklist: ["读取 GitHub 提交", "生成事项草稿", "重建设置页面"]
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("<!doctype html><html>Bad gateway</html>", { status: 502 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify(draft)
                }
              }
            ]
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: {
        cookie
      },
      payload: {
        name: "DevFlow",
        color: "#0891b2"
      }
    });
    const project = projectResponse.json();

    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/work-items/draft`,
      headers: {
        cookie
      },
      payload: {
        input: "列一个详细的目标计划，参考业内最佳，完善 GitHub、OpenAI 和设置页。"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(draft);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.openai-compatible.test/v1/responses",
      expect.any(Object)
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.openai-compatible.test/v1/chat/completions",
      expect.any(Object)
    );
  });

  it("rejects draft generation when OpenAI is missing or returns invalid JSON", async () => {
    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: {
        cookie
      },
      payload: {
        name: "DevFlow",
        color: "#0891b2"
      }
    });
    const project = projectResponse.json();

    const missingConfig = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/work-items/draft`,
      headers: {
        cookie
      },
      payload: {
        input: "新增设置页面，需要从弹窗迁移到独立路由。"
      }
    });
    expect(missingConfig.statusCode).toBe(503);

    env.openaiApiKey = "openai-token";
    env.openaiModel = "gpt-test";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ output_text: "not-json" }), { status: 200 })));
    const invalidJson = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/work-items/draft`,
      headers: {
        cookie
      },
      payload: {
        input: "新增设置页面，需要从弹窗迁移到独立路由。"
      }
    });
    expect(invalidJson.statusCode).toBe(502);
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

  it("initializes projects and deduplicates agent-supplied README or commit records", async () => {
    env.agentApiToken = "test-agent-token";
    const auth = {
      authorization: "Bearer test-agent-token"
    };
    const payload = {
      name: "FreshRepo",
      description: "README 描述了本地开发、API 和前端结构。",
      repoUrl: "https://github.com/example/fresh-repo.git",
      repoPath: "/Users/sak/Documents/FreshRepo",
      docsUrl: "https://github.com/example/fresh-repo#readme",
      color: "#0891b2",
      initialItems: [
        {
          title: "根据 README 建立项目说明",
          description: "README 已说明项目结构和本地运行方式。",
          type: "FEATURE",
          status: "DONE",
          priority: "MEDIUM",
          notes: "来源：README.md",
          tagNames: ["readme", "docs"],
          checklist: ["记录项目结构", "记录本地运行命令"]
        },
        {
          title: "修复登录重定向提交记录",
          description: "提交记录显示登录后重定向问题已修复。",
          type: "BUG",
          status: "DONE",
          priority: "HIGH",
          notes: "来源：git log fix login redirect",
          tagNames: ["git", "auth"],
          checklist: ["读取提交记录", "写入已完成 bug"]
        }
      ]
    };

    const initialized = await app.inject({
      method: "POST",
      url: "/api/agent/projects/init",
      headers: auth,
      payload
    });

    expect(initialized.statusCode).toBe(201);
    expect(initialized.json()).toMatchObject({
      created: true,
      skippedItemTitles: [],
      project: {
        name: "FreshRepo",
        description: "README 描述了本地开发、API 和前端结构。",
        repoPath: "/Users/sak/Documents/FreshRepo"
      }
    });
    expect(initialized.json().createdItems).toHaveLength(2);
    expect(initialized.json().project.workItems).toHaveLength(2);
    expect(initialized.json().createdItems[0].activities[0]).toMatchObject({
      action: "agent_initialized",
      message: "AI agent 初始化项目记录"
    });

    const repeated = await app.inject({
      method: "POST",
      url: "/api/agent/projects/init",
      headers: auth,
      payload: {
        ...payload,
        description: "重复初始化不应覆盖既有说明。",
        initialItems: [
          payload.initialItems[0],
          {
            title: "补充部署配置记录",
            description: "README 和提交记录提示后续需要统一部署配置。",
            type: "FEATURE",
            status: "PENDING",
            priority: "MEDIUM",
            notes: "来源：README.md 与 git log",
            tagNames: ["deploy", "config"],
            checklist: ["梳理部署变量", "补充配置文档"]
          }
        ]
      }
    });

    expect(repeated.statusCode).toBe(200);
    expect(repeated.json()).toMatchObject({
      created: false,
      skippedItemTitles: ["根据 README 建立项目说明"],
      project: {
        name: "FreshRepo",
        description: "README 描述了本地开发、API 和前端结构。"
      }
    });
    expect(repeated.json().createdItems).toHaveLength(1);
    expect(repeated.json().project.workItems).toHaveLength(3);
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
