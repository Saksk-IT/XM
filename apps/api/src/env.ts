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

export const env = {
  apiPort: Number(process.env.API_PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? "",
  sessionSecret: process.env.SESSION_SECRET ?? "xm-dev-session-secret",
  agentApiToken: process.env.AGENT_API_TOKEN ?? "",
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  cookieSecure: process.env.COOKIE_SECURE === "true"
};
