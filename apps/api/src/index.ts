import { createApp } from "./app.js";
import { prisma } from "./db.js";
import { env } from "./env.js";

const app = await createApp({
  db: prisma
});

const close = async () => {
  await app.close();
  await prisma.$disconnect();
};

process.on("SIGINT", () => {
  void close().then(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void close().then(() => process.exit(0));
});

await app.listen({
  port: env.apiPort,
  host: "0.0.0.0"
});

console.log(`XM API listening on http://localhost:${env.apiPort}`);
