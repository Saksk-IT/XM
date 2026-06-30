import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient, User } from "@prisma/client";
import { env } from "./env.js";

const sessionCookieName = "xm_session";
const miniprogramAccessTtlMs = 1000 * 60 * 60 * 24 * 7;
const miniprogramBindTtlMs = 1000 * 60 * 10;

type StructuredTokenPayload =
  | {
      kind: "miniprogram_access";
      userId: string;
      expiresAt: number;
    }
  | {
      kind: "miniprogram_bind";
      openId: string;
      unionId: string | null;
      expiresAt: number;
    };

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

function createStructuredToken(payload: StructuredTokenPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

function verifyStructuredToken(token: string | undefined, kind: StructuredTokenPayload["kind"]): StructuredTokenPayload | null {
  if (!token) {
    return null;
  }

  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    return null;
  }

  const expected = sign(encoded);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  let payload: StructuredTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as StructuredTokenPayload;
  } catch {
    return null;
  }

  if (payload.kind !== kind || payload.expiresAt < Date.now()) {
    return null;
  }

  return payload;
}

function getBearerToken(request: FastifyRequest): string {
  const header = request.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
}

function getBearerUserId(request: FastifyRequest): string | null {
  const payload = verifyStructuredToken(getBearerToken(request), "miniprogram_access");
  return payload?.kind === "miniprogram_access" ? payload.userId : null;
}

export function createMiniprogramAccessToken(userId: string): { token: string; expiresAt: Date } {
  const expiresAt = Date.now() + miniprogramAccessTtlMs;
  return {
    token: createStructuredToken({
      kind: "miniprogram_access",
      userId,
      expiresAt
    }),
    expiresAt: new Date(expiresAt)
  };
}

export function createMiniprogramBindToken(input: {
  openId: string;
  unionId: string | null;
}): { bindToken: string; expiresAt: Date } {
  const expiresAt = Date.now() + miniprogramBindTtlMs;
  return {
    bindToken: createStructuredToken({
      kind: "miniprogram_bind",
      openId: input.openId,
      unionId: input.unionId,
      expiresAt
    }),
    expiresAt: new Date(expiresAt)
  };
}

export function verifyMiniprogramBindToken(token: string): { openId: string; unionId: string | null } | null {
  const payload = verifyStructuredToken(token, "miniprogram_bind");
  if (payload?.kind !== "miniprogram_bind") {
    return null;
  }

  return {
    openId: payload.openId,
    unionId: payload.unionId
  };
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
  const userId = verifySessionToken(request.cookies[sessionCookieName]) ?? getBearerUserId(request);
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
