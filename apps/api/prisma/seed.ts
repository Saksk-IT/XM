import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

const adminUsername = process.env.ADMIN_USERNAME ?? "admin";
const adminPassword = process.env.ADMIN_PASSWORD ?? "admin123456";
const adminDisplayName = process.env.ADMIN_DISPLAY_NAME ?? "Leo";

async function main() {
  await prisma.user.upsert({
    where: {
      username: adminUsername
    },
    update: {
      displayName: adminDisplayName,
      passwordHash: await argon2.hash(adminPassword)
    },
    create: {
      username: adminUsername,
      displayName: adminDisplayName,
      passwordHash: await argon2.hash(adminPassword)
    }
  });

  await prisma.project.deleteMany({
    where: {
      name: {
        startsWith: "XM E2E "
      }
    }
  });

  const devFlow = await prisma.project.upsert({
    where: {
      id: "seed-devflow"
    },
    update: {},
    create: {
      id: "seed-devflow",
      name: "DevFlow",
      description: "个人开发者工具箱，提升日常开发效率。",
      repoUrl: "https://github.com/example/devflow",
      deployUrl: "https://devflow.local",
      docsUrl: "https://docs.devflow.local",
      color: "#0891b2"
    }
  });

  const noteCraft = await prisma.project.upsert({
    where: {
      id: "seed-notecraft"
    },
    update: {},
    create: {
      id: "seed-notecraft",
      name: "NoteCraft",
      description: "Markdown 笔记与资料归档系统。",
      repoUrl: "https://github.com/example/notecraft",
      color: "#2563eb"
    }
  });

  await prisma.workItem.deleteMany({
    where: {
      projectId: {
        in: [devFlow.id, noteCraft.id]
      }
    }
  });

  const seedItems = [
    {
      projectId: devFlow.id,
      title: "文件上传进度在断网后卡住",
      description: "断网后重连时上传状态没有恢复。",
      type: "BUG" as const,
      status: "PENDING" as const,
      priority: "HIGH" as const,
      notes: "需要补充超时和重试提示。",
      dueDate: new Date("2026-07-08T00:00:00.000Z"),
      tags: ["上传模块"],
      checklist: ["复现断网场景", "补充上传状态机", "增加失败提示"]
    },
    {
      projectId: devFlow.id,
      title: "支持自定义快捷键",
      description: "允许用户配置常用操作快捷键。",
      type: "FEATURE" as const,
      status: "IN_PROGRESS" as const,
      priority: "HIGH" as const,
      notes: "快捷键冲突需要明确提示。",
      dueDate: new Date("2026-07-12T00:00:00.000Z"),
      tags: ["设置", "快捷键"],
      checklist: ["梳理可配置操作列表", "设计快捷键配置界面", "实现持久化"]
    },
    {
      projectId: devFlow.id,
      title: "多项目工作区支持",
      description: "允许用户快速切换项目上下文。",
      type: "FEATURE" as const,
      status: "DONE" as const,
      priority: "HIGH" as const,
      notes: "第一版已经可用。",
      dueDate: new Date("2026-07-03T00:00:00.000Z"),
      tags: ["工作区"],
      checklist: ["项目切换", "最近访问", "状态保持"]
    },
    {
      projectId: devFlow.id,
      title: "启动时白屏问题",
      description: "冷启动偶发空白页面。",
      type: "BUG" as const,
      status: "DONE" as const,
      priority: "MEDIUM" as const,
      notes: "已修复初始化顺序。",
      dueDate: new Date("2026-07-01T00:00:00.000Z"),
      tags: ["启动"],
      checklist: ["定位初始化异常", "修复加载顺序"]
    },
    {
      projectId: noteCraft.id,
      title: "导出为 PDF 功能优化",
      description: "导出的 PDF 需要保持标题层级。",
      type: "FEATURE" as const,
      status: "PENDING" as const,
      priority: "MEDIUM" as const,
      notes: "",
      dueDate: new Date("2026-07-15T00:00:00.000Z"),
      tags: ["导出"],
      checklist: ["整理页面样式", "补充导出测试"]
    }
  ];

  for (const [index, item] of seedItems.entries()) {
    const created = await prisma.workItem.create({
      data: {
        projectId: item.projectId,
        title: item.title,
        description: item.description,
        type: item.type,
        status: item.status,
        priority: item.priority,
        notes: item.notes,
        dueDate: item.dueDate,
        order: index,
        checklist: {
          create: item.checklist.map((title, order) => ({
            title,
            order,
            done: item.status === "DONE"
          }))
        },
        activities: {
          create: {
            action: "seeded",
            message: "初始化示例任务"
          }
        }
      }
    });

    for (const tagName of item.tags) {
      const tag = await prisma.tag.upsert({
        where: {
          name: tagName
        },
        update: {},
        create: {
          name: tagName,
          color: "#0891b2"
        }
      });

      await prisma.workItemTag.create({
        data: {
          workItemId: created.id,
          tagId: tag.id
        }
      });
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
