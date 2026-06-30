import type { Me, MiniprogramAuthSuccess } from "@xm/shared";

const storageKeys = {
  token: "xm.miniprogram.token",
  user: "xm.miniprogram.user",
  tokenExpiresAt: "xm.miniprogram.tokenExpiresAt"
};

export function readAccessToken(): string {
  return wx.getStorageSync<string>(storageKeys.token) || "";
}

export function readCurrentUser(): Me | null {
  return wx.getStorageSync<Me | null>(storageKeys.user) || null;
}

export function saveSession(auth: MiniprogramAuthSuccess): void {
  wx.setStorageSync(storageKeys.token, auth.token);
  wx.setStorageSync(storageKeys.user, auth.user);
  wx.setStorageSync(storageKeys.tokenExpiresAt, auth.expiresAt);
}

export function clearSession(): void {
  wx.removeStorageSync(storageKeys.token);
  wx.removeStorageSync(storageKeys.user);
  wx.removeStorageSync(storageKeys.tokenExpiresAt);
}

export function ensureSignedIn(): boolean {
  if (readAccessToken()) {
    return true;
  }

  wx.redirectTo({ url: "/pages/login/login" });
  return false;
}
