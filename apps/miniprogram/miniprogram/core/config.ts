export type ApiProfile = "local" | "preview";
export type ApiProfileMode = "auto" | ApiProfile;

type ApiProfileConfig = {
  label: string;
  apiBaseUrl: string;
  localDebugHint: string;
};

export const apiProfileStorageKey = "xm:api-profile";

export const apiProfiles: Record<ApiProfile, ApiProfileConfig> = {
  local: {
    label: "本地开发",
    apiBaseUrl: "http://127.0.0.1:4000",
    localDebugHint: "本地调试需开启“不校验合法域名”。"
  },
  preview: {
    label: "真机预览",
    apiBaseUrl: "https://xm-api.example.com",
    localDebugHint: "真机预览需使用 HTTPS API，并在微信公众平台配置 request 合法域名。"
  }
};

export const appConfig = {
  appName: "XM",
  productName: "XM Project OS",
  apiProfileMode: "auto" as ApiProfileMode,
  apiProfiles,
  localDebugHint: apiProfiles.local.localDebugHint
};

export type RuntimeAppConfig = {
  apiProfile: ApiProfile;
  apiProfileLabel: string;
  apiBaseUrl: string;
  localDebugHint: string;
};

function isApiProfile(value: unknown): value is ApiProfile {
  return value === "local" || value === "preview";
}

function readApiProfileOverride(): ApiProfile | null {
  const profile = wx.getStorageSync<string>(apiProfileStorageKey);
  return isApiProfile(profile) ? profile : null;
}

function readDevicePlatform(): string {
  try {
    return wx.getSystemInfoSync?.().platform ?? "";
  } catch {
    return "";
  }
}

export function resolveApiProfile(): ApiProfile {
  const storedProfile = readApiProfileOverride();
  if (storedProfile) {
    return storedProfile;
  }

  if (appConfig.apiProfileMode !== "auto") {
    return appConfig.apiProfileMode;
  }

  return readDevicePlatform() === "devtools" ? "local" : "preview";
}

function normalizeApiBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.trim().replace(/\/+$/, "");
}

function assertApiBaseUrl(apiProfile: ApiProfile, apiBaseUrl: string): void {
  if (!/^https?:\/\/[^/]+/.test(apiBaseUrl)) {
    throw new Error(`Invalid ${apiProfile} apiBaseUrl: absolute http(s) URL is required.`);
  }

  if (apiProfile === "preview" && !apiBaseUrl.startsWith("https://")) {
    throw new Error("Invalid preview apiBaseUrl: real-device preview requires https://.");
  }
}

export function resolveAppConfig(): RuntimeAppConfig {
  const apiProfile = resolveApiProfile();
  const profileConfig = appConfig.apiProfiles[apiProfile];
  const apiBaseUrl = normalizeApiBaseUrl(profileConfig.apiBaseUrl);
  assertApiBaseUrl(apiProfile, apiBaseUrl);

  return {
    apiProfile,
    apiProfileLabel: profileConfig.label,
    apiBaseUrl,
    localDebugHint: profileConfig.localDebugHint
  };
}
