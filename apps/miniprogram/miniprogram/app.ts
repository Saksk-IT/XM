import { appConfig, resolveAppConfig, type ApiProfile } from "./core/config";

export type XmApp = {
  globalData: {
    apiProfile: ApiProfile;
    apiProfileLabel: string;
    apiBaseUrl: string;
    productName: string;
    localDebugHint: string;
  };
};

const runtimeConfig = resolveAppConfig();

App<XmApp>({
  globalData: {
    ...runtimeConfig,
    productName: appConfig.productName
  }
});
