import type { XmApp } from "../app";
import { clearSession, readAccessToken } from "./session";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
  }
}

export type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  data?: unknown;
};

export function createQueryString(query: Record<string, string | boolean | number | undefined>): string {
  const parts = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

export function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const token = readAccessToken();
    const header: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (token) {
      header.Authorization = `Bearer ${token}`;
    }

    wx.request<T & { message?: string }>({
      url: `${getApp<XmApp>().globalData.apiBaseUrl.replace(/\/$/, "")}${path}`,
      method: options.method ?? "GET",
      data: options.data,
      header,
      success(result) {
        if (result.statusCode >= 200 && result.statusCode < 300) {
          resolve(result.data as T);
          return;
        }

        if (result.statusCode === 401) {
          clearSession();
        }
        reject(new ApiError(result.data?.message ?? "请求失败", result.statusCode));
      },
      fail(error) {
        reject(new ApiError(error.errMsg || "网络请求失败", 0));
      }
    });
  });
}
