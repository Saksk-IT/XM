import { ApiError } from "../../core/request";
import { saveSession } from "../../core/session";
import { xmApi } from "../../services/xmApi";

type LoginData = {
  loading: boolean;
  binding: boolean;
  bindToken: string;
  error: string;
  username: string;
  password: string;
};

Page<LoginData, {
  startLogin(): void;
  submitBind(): void;
  onUsernameInput(event: { detail: { value: string } }): void;
  onPasswordInput(event: { detail: { value: string } }): void;
}>({
  data: {
    loading: false,
    binding: false,
    bindToken: "",
    error: "",
    username: "admin",
    password: ""
  },

  onLoad() {
    this.startLogin();
  },

  startLogin() {
    this.setData({ loading: true, error: "" });
    wx.login({
      success: async ({ code }) => {
        try {
          const result = await xmApi.miniprogramLogin(code);
          if (result.status === "AUTHENTICATED") {
            saveSession(result);
            wx.switchTab({ url: "/pages/projects/projects" });
            return;
          }

          this.setData({
            binding: true,
            bindToken: result.bindToken,
            loading: false
          });
        } catch (caught) {
          this.setData({
            error: caught instanceof Error ? caught.message : "微信登录失败",
            loading: false
          });
        }
      },
      fail: (error) => {
        this.setData({
          error: error.errMsg || "无法调用微信登录",
          loading: false
        });
      }
    });
  },

  async submitBind() {
    if (!this.data.username.trim() || !this.data.password) {
      this.setData({ error: "请输入管理员账号和密码" });
      return;
    }

    this.setData({ loading: true, error: "" });
    try {
      const result = await xmApi.miniprogramBind({
        bindToken: this.data.bindToken,
        username: this.data.username,
        password: this.data.password
      });
      if (result.status !== "AUTHENTICATED") {
        throw new ApiError("绑定状态异常，请重新登录", 400);
      }

      saveSession(result);
      wx.switchTab({ url: "/pages/projects/projects" });
    } catch (caught) {
      this.setData({
        error: caught instanceof Error ? caught.message : "绑定失败",
        loading: false
      });
    }
  },

  onUsernameInput(event) {
    this.setData({ username: event.detail.value });
  },

  onPasswordInput(event) {
    this.setData({ password: event.detail.value });
  }
});
