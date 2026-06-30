import type { Prisma, PrismaClient } from "@prisma/client";

const fallbackColor = "#0891b2";
const palette = [fallbackColor, "#0f766e", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#2563eb"];

function colorForName(name: string): string {
  const hash = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return palette[hash % palette.length] ?? fallbackColor;
}

function normalizeTagNames(names: string[] | undefined): string[] {
  return [...new Set((names ?? []).map((name) => name.trim()).filter(Boolean))];
}

export async function syncTags(
  db: PrismaClient | Prisma.TransactionClient,
  workItemId: string,
  tagNames: string[] | undefined
): Promise<void> {
  if (!tagNames) {
    return;
  }

  const normalizedNames = normalizeTagNames(tagNames);
  await db.workItemTag.deleteMany({
    where: {
      workItemId
    }
  });

  for (const name of normalizedNames) {
    const tag = await db.tag.upsert({
      where: {
        name
      },
      update: {},
      create: {
        name,
        color: colorForName(name)
      }
    });

    await db.workItemTag.create({
      data: {
        workItemId,
        tagId: tag.id
      }
    });
  }
}
