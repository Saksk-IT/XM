import { appConfig } from "./core/config";

export type XmApp = {
  globalData: {
    apiBaseUrl: string;
    productName: string;
  };
};

App<XmApp>({
  globalData: {
    apiBaseUrl: appConfig.apiBaseUrl,
    productName: appConfig.productName
  }
});
