import type { Me } from "@xm/shared";
import type { XmApp } from "../../app";
import { appConfig } from "../../core/config";
import { clearSession, readAccessToken, readCurrentUser } from "../../core/session";

type MeData = {
  user: Me | null;
  apiBaseUrl: string;
  productName: string;
  localDebugHint: string;
  loggedIn: boolean;
};

Page<MeData, {
  refreshState(): void;
  goLogin(): void;
  logout(): void;
}>({
  data: {
    user: null,
    apiBaseUrl: "",
    productName: appConfig.productName,
    localDebugHint: appConfig.localDebugHint,
    loggedIn: false
  },

  onShow() {
    this.refreshState();
  },

  refreshState() {
    this.setData({
      user: readCurrentUser(),
      apiBaseUrl: getApp<XmApp>().globalData.apiBaseUrl,
      loggedIn: Boolean(readAccessToken())
    });
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/login" });
  },

  logout() {
    clearSession();
    this.refreshState();
    wx.showToast({ title: "已退出", icon: "success" });
  }
});
