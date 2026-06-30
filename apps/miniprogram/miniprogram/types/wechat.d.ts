declare function App<T extends Record<string, unknown>>(options: T & ThisType<T>): void;

declare function Page<TData extends Record<string, unknown>, TCustom extends Record<string, unknown>>(
  options: TCustom &
    ThisType<TCustom & { data: TData; setData(data: Partial<TData>): void }> & {
      data?: TData;
      onLoad?(query?: Record<string, string | undefined>): void;
      onShow?(): void;
      onPullDownRefresh?(): void;
    }
): void;

declare function getApp<T extends Record<string, unknown>>(): T;

declare const wx: {
  getStorageSync<T = unknown>(key: string): T;
  setStorageSync(key: string, value: unknown): void;
  removeStorageSync(key: string): void;
  login(options: {
    success(result: { code: string }): void;
    fail(error: { errMsg: string }): void;
  }): void;
  request<T = unknown>(options: {
    url: string;
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    data?: unknown;
    header?: Record<string, string>;
    success(result: { statusCode: number; data: T }): void;
    fail(error: { errMsg: string }): void;
  }): void;
  showToast(options: { title: string; icon?: "success" | "error" | "none"; duration?: number }): void;
  showLoading(options: { title: string; mask?: boolean }): void;
  hideLoading(): void;
  navigateTo(options: { url: string }): void;
  redirectTo(options: { url: string }): void;
  reLaunch(options: { url: string }): void;
  switchTab(options: { url: string }): void;
  stopPullDownRefresh(): void;
};
