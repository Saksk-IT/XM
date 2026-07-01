import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import type { Prisma, PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import Fastify from "fastify";
import { ZodError, z } from "zod";
import {
  agentProjectInitSchema,
  createChecklistSchema,
  createProjectSchema,
  createWorkItemSchema,
  generateWorkItemDraftSchema,
  githubCommitListQuerySchema,
  loginSchema,
  miniprogramBindSchema,
  miniprogramLoginSchema,
  updateChecklistSchema,
  updateProjectSchema,
  updateRuntimeSettingsSchema,
  updateWorkItemSchema,
  workItemQuerySchema
} from "@xm/shared";
import type { AgentProjectInitInput, CreateWorkItemInput } from "@xm/shared";
import { env } from "./env.js";
import {
  projectInclude,
  serializeProjectDetail,
  serializeProjectSummary,
  serializeWorkItem,
  workItemInclude
} from "./serializers.js";
import { GitHubIntegrationError, listGitHubCommits } from "./integrations/github.js";
import { generateWorkItemDraft, OpenAIIntegrationError } from "./integrations/openaiResponses.js";
import { exchangeCodeForWechatIdentity, WechatMiniprogramError } from "./integrations/wechatMiniprogram.js";
import { getRuntimeSettings, listOpenAIModels, SettingsIntegrationError, updateRuntimeSettings } from "./settings.js";
import {
  clearSessionCookie,
  createMiniprogramAccessToken,
  createMiniprogramBindToken,
  getCurrentUser,
  requireAgentToken,
  requireUser,
  setSessionCookie,
  verifyMiniprogramBindToken
} from "./security.js";
import { syncTags } from "./tags.js";

type CreateAppOptions = {
  db: PrismaClient;
  staticRoot?: string;
};

const routeIdSchema = z.object({
  id: z.string().min(1)
});

const itemIdSchema = z.object({
  id: z.string().min(1)
});

const checklistIdSchema = z.object({
  id: z.string().min(1)
});

const agentResolveQuerySchema = z.object({
  repoPath: z.string().trim().optional(),
  repoUrl: z.string().trim().optional(),
  name: z.string().trim().optional()
});

function nullableUrl(value: string | null | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value.trim() === "") {
    return null;
  }

  return value.trim();
}

function nullableText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value.trim() === "") {
    return null;
  }

  return value.trim();
}

function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return new Date(value);
}

function projectData(input: {
  name?: string;
  description?: string;
  repoUrl?: string | null;
  repoPath?: string | null;
  deployUrl?: string | null;
  docsUrl?: string | null;
  color?: string;
  archived?: boolean;
}): Prisma.ProjectUncheckedUpdateInput {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.repoUrl !== undefined ? { repoUrl: nullableUrl(input.repoUrl) } : {}),
    ...(input.repoPath !== undefined ? { repoPath: nullableText(input.repoPath) } : {}),
    ...(input.deployUrl !== undefined ? { deployUrl: nullableUrl(input.deployUrl) } : {}),
    ...(input.docsUrl !== undefined ? { docsUrl: nullableUrl(input.docsUrl) } : {}),
    ...(input.color !== undefined ? { color: input.color } : {}),
    ...(input.archived !== undefined ? { archived: input.archived } : {})
  };
}

function workItemData(input: {
  title?: string;
  description?: string;
  type?: "BUG" | "FEATURE";
  status?: "PENDING" | "IN_PROGRESS" | "DONE";
  priority?: "LOW" | "MEDIUM" | "HIGH";
  notes?: string;
  dueDate?: string | null;
  order?: number;
}): Prisma.WorkItemUncheckedUpdateInput {
  return {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.type !== undefined ? { type: input.type } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.dueDate !== undefined ? { dueDate: toDate(input.dueDate) } : {}),
    ...(input.order !== undefined ? { order: input.order } : {})
  };
}

function staticRootDefault(): string {
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFile), "../../web/dist");
}

function normalizeRepoPath(value: string | null | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }

  return path.normalize(value.trim()).replace(/[\\/]$/, "");
}

function normalizeRepoUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/$/, "").replace(/\.git$/, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.trim().replace(/\/$/, "").replace(/\.git$/, "");
  }
}

type AgentProjectLookup = {
  repoPath?: string | null;
  repoUrl?: string | null;
  name?: string | null;
};

type AgentProjectCandidate = {
  name: string;
  repoPath: string | null;
  repoUrl: string | null;
};

function nonEmptyText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function findMatchingProject<T extends AgentProjectCandidate>(
  projects: T[],
  lookup: AgentProjectLookup
): T | undefined {
  const repoPath = normalizeRepoPath(lookup.repoPath);
  const repoUrl = normalizeRepoUrl(lookup.repoUrl);
  const name = lookup.name?.trim();

  const byPath = repoPath
    ? projects.find((project) => normalizeRepoPath(project.repoPath) === repoPath)
    : undefined;
  const byUrl = repoUrl ? projects.find((project) => normalizeRepoUrl(project.repoUrl) === repoUrl) : undefined;
  const byName = name ? projects.find((project) => project.name === name) : undefined;
  return byPath ?? byUrl ?? byName;
}

function projectInitPatch(
  existing: {
    description: string;
    repoUrl: string | null;
    repoPath: string | null;
    deployUrl: string | null;
    docsUrl: string | null;
  },
  input: AgentProjectInitInput
): Prisma.ProjectUncheckedUpdateInput {
  return projectData({
    description: existing.description.trim() ? undefined : nonEmptyText(input.description),
    repoUrl: existing.repoUrl ? undefined : nonEmptyText(input.repoUrl),
    repoPath: existing.repoPath ? undefined : nonEmptyText(input.repoPath),
    deployUrl: existing.deployUrl ? undefined : nonEmptyText(input.deployUrl),
    docsUrl: existing.docsUrl ? undefined : nonEmptyText(input.docsUrl)
  });
}

async function createWorkItemWithRelations(
  db: Prisma.TransactionClient,
  input: {
    projectId: string;
    item: CreateWorkItemInput;
    order: number;
    activityAction: string;
    activityMessage: string;
  }
) {
  const item = await db.workItem.create({
    data: {
      projectId: input.projectId,
      title: input.item.title,
      description: input.item.description,
      type: input.item.type,
      status: input.item.status,
      priority: input.item.priority,
      notes: input.item.notes,
      dueDate: toDate(input.item.dueDate),
      order: input.order
    }
  });

  await syncTags(db, item.id, input.item.tagNames);
  if (input.item.checklist.length > 0) {
    await db.checklistItem.createMany({
      data: input.item.checklist.map((title, index) => ({
        workItemId: item.id,
        title,
        order: index
      }))
    });
  }

  await db.activityLog.create({
    data: {
      workItemId: item.id,
      action: input.activityAction,
      message: input.activityMessage
    }
  });

  return db.workItem.findUniqueOrThrow({
    where: { id: item.id },
    include: workItemInclude
  });
}

function miniprogramAuthSuccess(user: { id: string; username: string; displayName: string }) {
  const session = createMiniprogramAccessToken(user.id);
  return {
    status: "AUTHENTICATED" as const,
    token: session.token,
    expiresAt: session.expiresAt.toISOString(),
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName
    }
  };
}

export async function createApp({ db, staticRoot = staticRootDefault() }: CreateAppOptions) {
  const app = Fastify({
    logger: false
  });

  await app.register(cookie);
  await app.register(cors, {
    origin: env.webOrigin,
    credentials: true
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        message: "请求参数无效",
        issues: error.issues
      });
    }

    app.log.error(error);
    return reply.code(500).send({
      message: "服务器内部错误"
    });
  });

  app.get("/api/health", async () => ({ ok: true }));

  app.post("/api/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const user = await db.user.findUnique({
      where: {
        username: body.username
      }
    });

    if (!user || !(await argon2.verify(user.passwordHash, body.password))) {
      return reply.code(401).send({
        message: "用户名或密码错误"
      });
    }

    setSessionCookie(reply, user.id);
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName
    };
  });

  app.post("/api/auth/logout", async (_request, reply) => {
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get("/api/auth/me", async (request, reply) => {
    const user = await getCurrentUser(request, db);
    if (!user) {
      return reply.code(401).send({ message: "未登录" });
    }

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName
    };
  });

  app.post("/api/miniprogram/auth/login", async (request, reply) => {
    const body = miniprogramLoginSchema.parse(request.body);

    try {
      const identity = await exchangeCodeForWechatIdentity(db, body.code);
      const account = await db.wechatAccount.findUnique({
        where: {
          openId: identity.openId
        },
        include: {
          user: true
        }
      });

      if (account) {
        return miniprogramAuthSuccess(account.user);
      }

      const bind = createMiniprogramBindToken(identity);
      return reply.code(202).send({
        status: "BINDING_REQUIRED",
        bindToken: bind.bindToken,
        expiresAt: bind.expiresAt.toISOString()
      });
    } catch (caught) {
      if (caught instanceof WechatMiniprogramError) {
        return reply.code(caught.statusCode).send({ message: caught.message });
      }
      throw caught;
    }
  });

  app.post("/api/miniprogram/auth/bind", async (request, reply) => {
    const body = miniprogramBindSchema.parse(request.body);
    const identity = verifyMiniprogramBindToken(body.bindToken);
    if (!identity) {
      return reply.code(401).send({ message: "微信绑定凭证已失效，请重新登录" });
    }

    const user = await db.user.findUnique({
      where: {
        username: body.username
      }
    });
    if (!user || !(await argon2.verify(user.passwordHash, body.password))) {
      return reply.code(401).send({ message: "管理员账号或密码错误" });
    }

    await db.wechatAccount.upsert({
      where: {
        openId: identity.openId
      },
      create: {
        userId: user.id,
        openId: identity.openId,
        unionId: identity.unionId
      },
      update: {
        userId: user.id,
        unionId: identity.unionId
      }
    });

    return miniprogramAuthSuccess(user);
  });

  app.get("/api/settings/runtime", async (request, reply) => {
    if (!(await requireUser(request, reply, db))) {
      return;
    }

    return getRuntimeSettings(db);
  });

  app.patch("/api/settings/runtime", async (request, reply) => {
    if (!(await requireUser(request, reply, db))) {
      return;
    }

    const body = updateRuntimeSettingsSchema.parse(request.body);
    return updateRuntimeSettings(db, body);
  });

  app.get("/api/settings/openai/models", async (request, reply) => {
    if (!(await requireUser(request, reply, db))) {
      return;
    }

    try {
      return {
        models: await listOpenAIModels(db)
      };
    } catch (caught) {
      if (caught instanceof SettingsIntegrationError) {
        return reply.code(caught.statusCode).send({ message: caught.message });
      }
      throw caught;
    }
  });

  app.get("/api/projects", async (request, reply) => {
    if (!(await requireUser(request, reply, db))) {
      return;
    }

    const query = z.object({ includeArchived: z.coerce.boolean().optional() }).parse(request.query);
    const projects = await db.project.findMany({
      where: query.includeArchived ? {} : { archived: false },
      include: {
        workItems: {
          select: {
            type: true,
            status: true
          }
        }
      },
      orderBy: {
        updatedAt: "desc"
      }
    });

    return projects.map(serializeProjectSummary);
  });

  app.post("/api/projects", async (request, reply) => {
    if (!(await requireUser(request, reply, db))) {
      return;
    }

    const body = createProjectSchema.parse(request.body);
    const project = await db.project.create({
      data: {
        name: body.name,
        description: body.description,
        repoUrl: nullableUrl(body.repoUrl),
        repoPath: nullableText(body.repoPath),
        deployUrl: nullableUrl(body.deployUrl),
        docsUrl: nullableUrl(body.docsUrl),
        color: body.color
      },
      include: projectInclude
    });

    return reply.code(201).send(serializeProjectDetail(project));
  });

  app.get("/api/projects/:id", async (request, reply) => {
    if (!(await requireUser(request, reply, db))) {
      return;
    }

    const { id } = routeIdSchema.parse(request.params);
    const project = await db.project.findUnique({
      where: { id },
      include: projectInclude
    });

    if (!project) {
      return reply.code(404).send({ message: "项目不存在" });
    }

    return serializeProjectDetail(project);
  });

  app.patch("/api/projects/:id", async (request, reply) => {
    if (!(await requireUser(request, reply, db))) {
      return;
    }

    const { id } = routeIdSchema.parse(request.params);
    const body = updateProjectSchema.parse(request.body);
    const project = await db.project.update({
      where: { id },
      data: projectData(body),
      include: projectInclude
    });

    return serializeProjectDetail(project);
  });

  app.post("/api/projects/:id/archive", async (request, reply) => {
    if (!(await requireUser(request, reply, db))) {
      return;
    }

    const { id } = routeIdSchema.parse(request.params);
    const project = await db.project.update({
      where: { id },
      data: { archived: true },
      include: projectInclude
    });

    return serializeProjectDetail(project);
  });

  app.get("/api/projects/:id/github/commits", async (request, reply) => {
    if (!(await requireUser(request, reply, db))) {
      return;
    }

    const { id } = routeIdSchema.parse(request.params);
    const query = githubCommitListQuerySchema.parse(request.query);
    const project = await db.project.findUnique({
      where: { id },
      select: {
        repoUrl: true
      }
    });

    if (!project) {
      return reply.code(404).send({ message: "项目不存在" });
    }

    try {
      return await listGitHubCommits(db, project.repoUrl, query);
    } catch (caught) {
      if (caught instanceof GitHubIntegrationError) {
        return reply.code(caught.statusCode).send({ message: caught.message });
      }
      throw caught;
    }
  });

  app.post("/api/projects/:id/work-items/draft", async (request, reply) => {
    if (!(await requireUser(request, reply, db))) {
      return;
    }

    const { id } = routeIdSchema.parse(request.params);
    const project = await db.project.findUnique({
      where: { id },
      select: {
        id: true
      }
    });
    if (!project) {
      return reply.code(404).send({ message: "项目不存在" });
    }

    const body = generateWorkItemDraftSchema.parse(request.body);
    try {
      return await generateWorkItemDraft(db, body.input);
    } catch (caught) {
      if (caught instanceof OpenAIIntegrationError) {
        return reply.code(caught.statusCode).send({ message: caught.message });
      }
      throw caught;
    }
  });

  app.get("/api/projects/:id/items", async (request, reply) => {
    if (!(await requireUser(request, reply, db))) {
      return;
    }

    const { id } = routeIdSchema.parse(request.params);
    const query = workItemQuerySchema.parse(request.query);
    const where: Prisma.WorkItemWhereInput = {
      projectId: id,
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.tag
        ? {
            tags: {
              some: {
                tag: {
                  name: query.tag
                }
              }
            }
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: "insensitive" } },
              { description: { contains: query.search, mode: "insensitive" } },
              { notes: { contains: query.search, mode: "insensitive" } }
            ]
          }
        : {})
    };

    const items = await db.workItem.findMany({
      where,
      include: workItemInclude,
      orderBy: [{ order: "asc" }, { updatedAt: "desc" }]
    });

    return items.map(serializeWorkItem);
  });

  app.post("/api/projects/:id/items", async (request, reply) => {
    if (!(await requireUser(request, reply, db))) {
      return;
    }

    const { id } = routeIdSchema.parse(request.params);
    const body = createWorkItemSchema.parse(request.body);
    const nextOrder = await db.workItem.count({
      where: {
        projectId: id
      }
    });

    const created = await db.$transaction(async (tx) => {
      return createWorkItemWithRelations(tx, {
        projectId: id,
        item: body,
        order: nextOrder,
        activityAction: "created",
        activityMessage: "创建了任务"
      });
    });

    return reply.code(201).send(serializeWorkItem(created));
  });

  app.get("/api/items/:id", async (request, reply) => {
    if (!(await requireUser(request, reply, db))) {
      return;
    }

    const { id } = itemIdSchema.parse(request.params);
    const item = await db.workItem.findUnique({
      where: { id },
      include: workItemInclude
    });

    if (!item) {
      return reply.code(404).send({ message: "任务不存在" });
    }

    return serializeWorkItem(item);
  });

  app.patch("/api/items/:id", async (request, reply) => {
    if (!(await requireUser(request, reply, db))) {
      return;
    }

    const { id } = itemIdSchema.parse(request.params);
    const body = updateWorkItemSchema.parse(request.body);
    const updated = await db.$transaction(async (tx) => {
      const existing = await tx.workItem.findUniqueOrThrow({
        where: { id }
      });

      await tx.workItem.update({
        where: { id },
        data: workItemData(body)
      });
      await syncTags(tx, id, body.tagNames);

      const changedStatus = body.status && body.status !== existing.status;
      const changedType = body.type && body.type !== existing.type;
      if (changedStatus || changedType) {
        await tx.activityLog.create({
          data: {
            workItemId: id,
            action: "status_changed",
            message: `更新为 ${body.type ?? existing.type} / ${body.status ?? existing.status}`
          }
        });
      } else {
        await tx.activityLog.create({
          data: {
            workItemId: id,
            action: "updated",
            message: "更新了任务信息"
          }
        });
      }

      return tx.workItem.findUniqueOrThrow({
        where: { id },
        include: workItemInclude
      });
    });

    return serializeWorkItem(updated);
  });

  app.delete("/api/items/:id", async (request, reply) => {
    if (!(await requireUser(request, reply, db))) {
      return;
    }

    const { id } = itemIdSchema.parse(request.params);
    await db.workItem.delete({
      where: { id }
    });

    return reply.code(204).send();
  });

  app.post("/api/items/:id/checklist", async (request, reply) => {
    if (!(await requireUser(request, reply, db))) {
      return;
    }

    const { id } = itemIdSchema.parse(request.params);
    const body = createChecklistSchema.parse(request.body);
    const order = await db.checklistItem.count({
      where: {
        workItemId: id
      }
    });

    await db.checklistItem.create({
      data: {
        workItemId: id,
        title: body.title,
        order
      }
    });
    await db.activityLog.create({
      data: {
        workItemId: id,
        action: "checklist_created",
        message: `添加清单：${body.title}`
      }
    });

    const item = await db.workItem.findUniqueOrThrow({
      where: { id },
      include: workItemInclude
    });
    return reply.code(201).send(serializeWorkItem(item));
  });

  app.patch("/api/checklist/:id", async (request, reply) => {
    if (!(await requireUser(request, reply, db))) {
      return;
    }

    const { id } = checklistIdSchema.parse(request.params);
    const body = updateChecklistSchema.parse(request.body);
    const check = await db.checklistItem.update({
      where: { id },
      data: body
    });

    await db.activityLog.create({
      data: {
        workItemId: check.workItemId,
        action: "checklist_updated",
        message: check.done ? `完成清单：${check.title}` : `更新清单：${check.title}`
      }
    });

    const item = await db.workItem.findUniqueOrThrow({
      where: { id: check.workItemId },
      include: workItemInclude
    });
    return serializeWorkItem(item);
  });

  app.delete("/api/checklist/:id", async (request, reply) => {
    if (!(await requireUser(request, reply, db))) {
      return;
    }

    const { id } = checklistIdSchema.parse(request.params);
    const check = await db.checklistItem.delete({
      where: { id }
    });
    await db.activityLog.create({
      data: {
        workItemId: check.workItemId,
        action: "checklist_deleted",
        message: `删除清单：${check.title}`
      }
    });

    const item = await db.workItem.findUniqueOrThrow({
      where: { id: check.workItemId },
      include: workItemInclude
    });
    return serializeWorkItem(item);
  });

  app.get("/api/agent/projects/resolve", async (request, reply) => {
    if (!requireAgentToken(request, reply)) {
      return;
    }

    const query = agentResolveQuerySchema.parse(request.query);
    const projects = await db.project.findMany({
      include: {
        workItems: {
          select: {
            type: true,
            status: true
          }
        }
      }
    });

    const project = findMatchingProject(projects, query);

    if (!project) {
      return reply.code(404).send({ message: "未找到匹配项目" });
    }

    return serializeProjectSummary(project);
  });

  app.post("/api/agent/projects/init", async (request, reply) => {
    if (!requireAgentToken(request, reply)) {
      return;
    }

    const body = agentProjectInitSchema.parse(request.body);
    const projects = await db.project.findMany({
      include: projectInclude
    });
    const existing = findMatchingProject(projects, body);

    const result = await db.$transaction(async (tx) => {
      let projectId = existing?.id;
      let projectCreated = false;

      if (existing) {
        const patch = projectInitPatch(existing, body);
        if (Object.keys(patch).length > 0) {
          await tx.project.update({
            where: { id: existing.id },
            data: patch
          });
        }
      } else {
        const project = await tx.project.create({
          data: {
            name: body.name,
            description: body.description,
            repoUrl: nullableUrl(body.repoUrl),
            repoPath: nullableText(body.repoPath),
            deployUrl: nullableUrl(body.deployUrl),
            docsUrl: nullableUrl(body.docsUrl),
            color: body.color
          }
        });
        projectId = project.id;
        projectCreated = true;
      }

      if (!projectId) {
        throw new Error("无法初始化项目");
      }

      const existingItems = await tx.workItem.findMany({
        where: {
          projectId
        },
        select: {
          title: true
        }
      });
      const knownTitles = new Set(existingItems.map((item) => item.title));
      const createdItems: Array<Awaited<ReturnType<typeof createWorkItemWithRelations>>> = [];
      const skippedItemTitles: string[] = [];
      let nextOrder = existingItems.length;

      for (const item of body.initialItems) {
        if (knownTitles.has(item.title)) {
          skippedItemTitles.push(item.title);
          continue;
        }

        const createdItem = await createWorkItemWithRelations(tx, {
          projectId,
          item,
          order: nextOrder,
          activityAction: "agent_initialized",
          activityMessage: "AI agent 初始化项目记录"
        });
        createdItems.push(createdItem);
        knownTitles.add(item.title);
        nextOrder += 1;
      }

      const project = await tx.project.findUniqueOrThrow({
        where: { id: projectId },
        include: projectInclude
      });

      return {
        project,
        projectCreated,
        createdItems,
        skippedItemTitles
      };
    });

    return reply.code(result.projectCreated ? 201 : 200).send({
      project: serializeProjectDetail(result.project),
      created: result.projectCreated,
      createdItems: result.createdItems.map(serializeWorkItem),
      skippedItemTitles: result.skippedItemTitles
    });
  });

  app.get("/api/agent/projects/:id/items", async (request, reply) => {
    if (!requireAgentToken(request, reply)) {
      return;
    }

    const { id } = routeIdSchema.parse(request.params);
    const exists = await db.project.findUnique({
      where: { id },
      select: { id: true }
    });
    if (!exists) {
      return reply.code(404).send({ message: "项目不存在" });
    }

    const query = workItemQuerySchema.parse(request.query);
    const where: Prisma.WorkItemWhereInput = {
      projectId: id,
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.tag
        ? {
            tags: {
              some: {
                tag: {
                  name: query.tag
                }
              }
            }
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: "insensitive" } },
              { description: { contains: query.search, mode: "insensitive" } },
              { notes: { contains: query.search, mode: "insensitive" } }
            ]
          }
        : {})
    };

    const items = await db.workItem.findMany({
      where,
      include: workItemInclude,
      orderBy: [{ order: "asc" }, { updatedAt: "desc" }]
    });

    return items.map(serializeWorkItem);
  });

  app.post("/api/agent/projects/:id/items", async (request, reply) => {
    if (!requireAgentToken(request, reply)) {
      return;
    }

    const { id } = routeIdSchema.parse(request.params);
    const body = createWorkItemSchema.parse(request.body);
    const exists = await db.project.findUnique({
      where: { id },
      select: { id: true }
    });
    if (!exists) {
      return reply.code(404).send({ message: "项目不存在" });
    }

    const nextOrder = await db.workItem.count({
      where: {
        projectId: id
      }
    });

    const created = await db.$transaction(async (tx) => {
      return createWorkItemWithRelations(tx, {
        projectId: id,
        item: body,
        order: nextOrder,
        activityAction: "agent_created",
        activityMessage: "AI agent 创建了记录"
      });
    });

    return reply.code(201).send(serializeWorkItem(created));
  });

  app.patch("/api/agent/items/:id", async (request, reply) => {
    if (!requireAgentToken(request, reply)) {
      return;
    }

    const { id } = itemIdSchema.parse(request.params);
    const body = updateWorkItemSchema.parse(request.body);
    const updated = await db.$transaction(async (tx) => {
      await tx.workItem.findUniqueOrThrow({
        where: { id }
      });

      await tx.workItem.update({
        where: { id },
        data: workItemData(body)
      });
      await syncTags(tx, id, body.tagNames);

      if (body.checklist !== undefined) {
        await tx.checklistItem.deleteMany({
          where: {
            workItemId: id
          }
        });
        if (body.checklist.length > 0) {
          await tx.checklistItem.createMany({
            data: body.checklist.map((title, index) => ({
              workItemId: id,
              title,
              order: index
            }))
          });
        }
      }

      await tx.activityLog.create({
        data: {
          workItemId: id,
          action: "agent_updated",
          message: "AI agent 更新了记录"
        }
      });

      return tx.workItem.findUniqueOrThrow({
        where: { id },
        include: workItemInclude
      });
    });

    return serializeWorkItem(updated);
  });

  app.delete("/api/agent/items/:id", async (request, reply) => {
    if (!requireAgentToken(request, reply)) {
      return;
    }

    const { id } = itemIdSchema.parse(request.params);
    const exists = await db.workItem.findUnique({
      where: { id },
      select: { id: true }
    });
    if (!exists) {
      return reply.code(404).send({ message: "任务不存在" });
    }

    await db.$transaction(async (tx) => {
      await tx.activityLog.create({
        data: {
          workItemId: id,
          action: "agent_deleted",
          message: "AI agent 删除了记录"
        }
      });
      await tx.workItem.delete({
        where: { id }
      });
    });

    return reply.code(204).send();
  });

  if (existsSync(staticRoot)) {
    await app.register(fastifyStatic, {
      root: staticRoot,
      prefix: "/",
      decorateReply: false
    });
  }

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/api/")) {
      return reply.code(404).send({ message: "接口不存在" });
    }

    if (existsSync(staticRoot)) {
      return reply.sendFile("index.html");
    }

    return reply.code(404).send({ message: "前端静态文件尚未构建" });
  });

  return app;
}
