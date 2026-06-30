import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));

config({
  path: path.resolve(here, "../../../.env"),
  quiet: true
});
config({
  path: path.resolve(here, "../.env"),
  override: true,
  quiet: true
});

const openaiBaseUrl = process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";

export const env = {
  apiPort: Number(process.env.API_PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? "",
  sessionSecret: process.env.SESSION_SECRET ?? "xm-dev-session-secret",
  agentApiToken: process.env.AGENT_API_TOKEN ?? "",
  githubToken: process.env.GITHUB_TOKEN ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiBaseUrl,
  openaiBaseUrlConfigured: Boolean(process.env.OPENAI_BASE_URL?.trim()),
  openaiModel: process.env.OPENAI_MODEL ?? "",
  openaiTimeoutMs: Number(process.env.OPENAI_TIMEOUT_MS ?? 20000),
  wechatMiniProgramAppId: process.env.WECHAT_MINIPROGRAM_APP_ID ?? "",
  wechatMiniProgramAppSecret: process.env.WECHAT_MINIPROGRAM_APP_SECRET ?? "",
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  cookieSecure: process.env.COOKIE_SECURE === "true"
};
