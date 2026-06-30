import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient, User } from "@prisma/client";
import { env } from "./env.js";

const sessionCookieName = "xm_session";

function sign(value: string): string {
  return createHmac("sha256", env.sessionSecret).update(value).digest("base64url");
}

export function createSessionToken(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

function verifySessionToken(token: string | undefined): string | null {
  if (!token) {
    return null;
  }

  const [userId, signature] = token.split(".");
  if (!userId || !signature) {
    return null;
  }

  const expected = sign(userId);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) {
    return null;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer) ? userId : null;
}

export function setSessionCookie(reply: FastifyReply, userId: string): void {
  reply.setCookie(sessionCookieName, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: env.cookieSecure,
    maxAge: 60 * 60 * 24 * 30
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(sessionCookieName, {
    path: "/"
  });
}

export async function getCurrentUser(request: FastifyRequest, db: PrismaClient): Promise<User | null> {
  const userId = verifySessionToken(request.cookies[sessionCookieName]);
  if (!userId) {
    return null;
  }

  return db.user.findUnique({
    where: {
      id: userId
    }
  });
}

export async function requireUser(
  request: FastifyRequest,
  reply: FastifyReply,
  db: PrismaClient
): Promise<User | null> {
  const user = await getCurrentUser(request, db);
  if (!user) {
    await reply.code(401).send({ message: "未登录或登录已失效" });
    return null;
  }

  return user;
}

export function requireAgentToken(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!env.agentApiToken) {
    void reply.code(503).send({ message: "Agent API 未启用" });
    return false;
  }

  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (token !== env.agentApiToken) {
    void reply.code(401).send({ message: "Agent token 无效" });
    return false;
  }

  return true;
}
