import type { PrismaClient } from "@prisma/client";
import { getIntegrationConfig } from "../settings.js";

type Code2SessionResponse = {
  openid?: string;
  unionid?: string;
  session_key?: string;
  errcode?: number;
  errmsg?: string;
};

export type WechatIdentity = {
  openId: string;
  unionId: string | null;
};

export class WechatMiniprogramError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
  }
}

export async function exchangeCodeForWechatIdentity(db: PrismaClient, code: string): Promise<WechatIdentity> {
  const config = await getIntegrationConfig(db);
  if (!config.wechatMiniProgramAppId || !config.wechatMiniProgramAppSecret) {
    throw new WechatMiniprogramError("微信小程序登录未配置，请设置 WECHAT_MINIPROGRAM_APP_ID 和 WECHAT_MINIPROGRAM_APP_SECRET", 503);
  }

  const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
  url.searchParams.set("appid", config.wechatMiniProgramAppId);
  url.searchParams.set("secret", config.wechatMiniProgramAppSecret);
  url.searchParams.set("js_code", code);
  url.searchParams.set("grant_type", "authorization_code");

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new WechatMiniprogramError("无法连接微信登录服务，请稍后重试", 502);
  }

  if (!response.ok) {
    throw new WechatMiniprogramError("微信登录服务暂时不可用，请稍后重试", 502);
  }

  const body = (await response.json()) as Code2SessionResponse;
  if (body.errcode) {
    throw new WechatMiniprogramError(mapWechatError(body), body.errcode === 40029 ? 401 : 502);
  }

  if (!body.openid) {
    throw new WechatMiniprogramError("微信登录未返回用户标识，请重试", 502);
  }

  return {
    openId: body.openid,
    unionId: body.unionid ?? null
  };
}

function mapWechatError(body: Code2SessionResponse): string {
  if (body.errcode === 40029) {
    return "微信登录凭证无效，请重新登录";
  }
  if (body.errcode === 45011) {
    return "微信登录请求过于频繁，请稍后重试";
  }
  return body.errmsg ? `微信登录失败：${body.errmsg}` : "微信登录失败，请稍后重试";
}
