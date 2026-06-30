import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { RuntimeSettings, UpdateRuntimeSettingsInput } from "@xm/shared";
import { env } from "./env.js";

type SettingKey =
  | "github.token"
  | "openai.apiKey"
  | "openai.baseUrl"
  | "openai.model"
  | "wechatMiniProgram.appId"
  | "wechatMiniProgram.appSecret"
  | "wechatMiniProgram.name"
  | "wechatMiniProgram.originalId";

export type IntegrationConfig = {
  githubToken: string;
  openaiApiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;
  wechatMiniProgramAppId: string;
  wechatMiniProgramAppSecret: string;
  wechatMiniProgramName: string;
  wechatMiniProgramOriginalId: string;
};

export class SettingsIntegrationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
  }
}

const encryptedPrefix = "enc:v1:";
const defaultOpenAIBaseUrl = "https://api.openai.com/v1";

export async function getIntegrationConfig(db: PrismaClient): Promise<IntegrationConfig> {
  const [
    githubToken,
    openaiApiKey,
    openaiBaseUrl,
    openaiModel,
    wechatMiniProgramAppId,
    wechatMiniProgramAppSecret,
    wechatMiniProgramName,
    wechatMiniProgramOriginalId
  ] = await Promise.all([
    readSensitiveSetting(db, "github.token", env.githubToken),
    readSensitiveSetting(db, "openai.apiKey", env.openaiApiKey),
    readPlainSetting(db, "openai.baseUrl", env.openaiBaseUrl),
    readPlainSetting(db, "openai.model", env.openaiModel),
    readPlainSetting(db, "wechatMiniProgram.appId", env.wechatMiniProgramAppId),
    readSensitiveSetting(db, "wechatMiniProgram.appSecret", env.wechatMiniProgramAppSecret),
    readPlainSetting(db, "wechatMiniProgram.name", ""),
    readPlainSetting(db, "wechatMiniProgram.originalId", "")
  ]);

  return {
    githubToken,
    openaiApiKey,
    openaiBaseUrl: normalizeOpenAIBaseUrl(openaiBaseUrl),
    openaiModel,
    wechatMiniProgramAppId,
    wechatMiniProgramAppSecret,
    wechatMiniProgramName,
    wechatMiniProgramOriginalId
  };
}

export async function getRuntimeSettings(db: PrismaClient): Promise<RuntimeSettings> {
  const config = await getIntegrationConfig(db);
  const openaiBaseUrlConfigured = (await hasSetting(db, "openai.baseUrl")) || env.openaiBaseUrlConfigured;
  return {
    github: {
      token: {
        configured: Boolean(config.githubToken),
        maskedValue: maskSecret(config.githubToken)
      },
      configured: Boolean(config.githubToken),
      publicAccess: true
    },
    openai: {
      apiKey: {
        configured: Boolean(config.openaiApiKey),
        maskedValue: maskSecret(config.openaiApiKey)
      },
      configured: Boolean(config.openaiApiKey && config.openaiModel),
      baseUrl: config.openaiBaseUrl,
      model: config.openaiModel || null,
      baseUrlConfigured: openaiBaseUrlConfigured
    },
    wechatMiniProgram: {
      configured: Boolean(config.wechatMiniProgramAppId && config.wechatMiniProgramAppSecret),
      appId: config.wechatMiniProgramAppId,
      name: config.wechatMiniProgramName,
      originalId: config.wechatMiniProgramOriginalId,
      appSecret: {
        configured: Boolean(config.wechatMiniProgramAppSecret),
        maskedValue: maskSecret(config.wechatMiniProgramAppSecret)
      }
    }
  };
}

async function hasSetting(db: PrismaClient, key: SettingKey): Promise<boolean> {
  const setting = await db.appSetting.findUnique({
    where: {
      key
    },
    select: {
      key: true
    }
  });
  return Boolean(setting);
}

export async function updateRuntimeSettings(
  db: PrismaClient,
  input: UpdateRuntimeSettingsInput
): Promise<RuntimeSettings> {
  if (input.github?.token !== undefined) {
    await writeSensitiveSetting(db, "github.token", input.github.token);
  }

  if (input.openai?.apiKey !== undefined) {
    await writeSensitiveSetting(db, "openai.apiKey", input.openai.apiKey);
  }
  if (input.openai?.baseUrl !== undefined) {
    await writePlainSetting(db, "openai.baseUrl", input.openai.baseUrl);
  }
  if (input.openai?.model !== undefined) {
    await writePlainSetting(db, "openai.model", input.openai.model);
  }

  if (input.wechatMiniProgram?.appId !== undefined) {
    await writePlainSetting(db, "wechatMiniProgram.appId", input.wechatMiniProgram.appId);
  }
  if (input.wechatMiniProgram?.appSecret !== undefined) {
    await writeSensitiveSetting(db, "wechatMiniProgram.appSecret", input.wechatMiniProgram.appSecret);
  }
  if (input.wechatMiniProgram?.name !== undefined) {
    await writePlainSetting(db, "wechatMiniProgram.name", input.wechatMiniProgram.name);
  }
  if (input.wechatMiniProgram?.originalId !== undefined) {
    await writePlainSetting(db, "wechatMiniProgram.originalId", input.wechatMiniProgram.originalId);
  }

  return getRuntimeSettings(db);
}

export async function listOpenAIModels(db: PrismaClient): Promise<string[]> {
  const config = await getIntegrationConfig(db);
  if (!config.openaiApiKey) {
    throw new SettingsIntegrationError("OpenAI API Key 未配置", 503);
  }

  let response: Response;
  try {
    response = await fetch(`${config.openaiBaseUrl.replace(/\/$/, "")}/models`, {
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`
      }
    });
  } catch {
    throw new SettingsIntegrationError("无法连接 OpenAI 模型列表接口", 502);
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new SettingsIntegrationError("OpenAI API Key 无效，请检查配置", 503);
    }
    if (response.status === 429) {
      throw new SettingsIntegrationError("OpenAI 模型列表调用达到限额，请稍后重试", 429);
    }
    throw new SettingsIntegrationError("读取 OpenAI 模型列表失败", 502);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new SettingsIntegrationError("OpenAI 模型列表返回非 JSON，请检查 base URL 是否指向兼容 OpenAI 的 /v1 地址", 502);
  }

  return parseModelIds(body);
}

function normalizeOpenAIBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return defaultOpenAIBaseUrl;
  }

  try {
    const url = new URL(trimmed);
    url.hash = "";
    url.search = "";
    const normalizedPath = url.pathname.replace(/\/+$/, "");
    url.pathname = normalizedPath ? normalizedPath : "/v1";
    return url.toString().replace(/\/$/, "");
  } catch {
    return trimmed.replace(/\/+$/, "") || defaultOpenAIBaseUrl;
  }
}

function parseModelIds(body: unknown): string[] {
  if (!body || typeof body !== "object" || !Array.isArray((body as { data?: unknown }).data)) {
    throw new SettingsIntegrationError("OpenAI 模型列表格式不正确，请检查 base URL 是否指向兼容 OpenAI 的 /v1 地址", 502);
  }

  return [
    ...new Set(
      (body as { data: Array<{ id?: unknown }> }).data
        .map((model) => model.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    )
  ].sort();
}

async function readPlainSetting(db: PrismaClient, key: SettingKey, fallback: string): Promise<string> {
  const setting = await db.appSetting.findUnique({
    where: {
      key
    }
  });
  return setting?.value ?? fallback;
}

async function readSensitiveSetting(db: PrismaClient, key: SettingKey, fallback: string): Promise<string> {
  const setting = await db.appSetting.findUnique({
    where: {
      key
    }
  });
  return setting ? decrypt(setting.value) : fallback;
}

async function writePlainSetting(db: PrismaClient, key: SettingKey, value: string): Promise<void> {
  const normalized = value.trim();
  if (!normalized) {
    await db.appSetting.deleteMany({
      where: {
        key
      }
    });
    return;
  }

  await db.appSetting.upsert({
    where: {
      key
    },
    create: {
      key,
      value: normalized
    },
    update: {
      value: normalized
    }
  });
}

async function writeSensitiveSetting(db: PrismaClient, key: SettingKey, value: string | null): Promise<void> {
  if (value === null) {
    await db.appSetting.deleteMany({
      where: {
        key
      }
    });
    return;
  }

  await db.appSetting.upsert({
    where: {
      key
    },
    create: {
      key,
      value: encrypt(value.trim())
    },
    update: {
      value: encrypt(value.trim())
    }
  });
}

function encryptionKey(): Buffer {
  return createHash("sha256").update(env.sessionSecret).digest();
}

function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${encryptedPrefix}${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}

function decrypt(value: string): string {
  if (!value.startsWith(encryptedPrefix)) {
    return value;
  }

  const payload = value.slice(encryptedPrefix.length);
  const [ivValue, tagValue, encryptedValue] = payload.split(":");
  if (!ivValue || !tagValue || !encryptedValue) {
    return "";
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

function maskSecret(value: string): string | null {
  if (!value) {
    return null;
  }
  if (value.length <= 8) {
    return "••••";
  }
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
