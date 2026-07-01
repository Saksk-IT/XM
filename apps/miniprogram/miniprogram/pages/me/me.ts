import type { Me } from "@xm/shared";
import type { XmApp } from "../../app";
import { clearSession, readAccessToken, readCurrentUser } from "../../core/session";

type MeData = {
  user: Me | null;
  apiProfileLabel: string;
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
    apiProfileLabel: "",
    apiBaseUrl: "",
    productName: "",
    localDebugHint: "",
    loggedIn: false
  },

  onShow() {
    this.refreshState();
  },

  refreshState() {
    const { globalData } = getApp<XmApp>();
    this.setData({
      user: readCurrentUser(),
      apiProfileLabel: globalData.apiProfileLabel,
      apiBaseUrl: globalData.apiBaseUrl,
      productName: globalData.productName,
      localDebugHint: globalData.localDebugHint,
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
