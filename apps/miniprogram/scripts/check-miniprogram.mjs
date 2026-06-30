import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { stdout } from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectConfig = JSON.parse(readFileSync(path.join(root, "project.config.json"), "utf8"));
const appConfig = JSON.parse(readFileSync(path.join(root, projectConfig.miniprogramRoot, "app.json"), "utf8"));

const requiredPages = [
  "pages/login/login",
  "pages/projects/projects",
  "pages/project-detail/project-detail",
  "pages/item-detail/item-detail",
  "pages/me/me"
];

for (const page of requiredPages) {
  if (!appConfig.pages.includes(page)) {
    throw new Error(`app.json missing page: ${page}`);
  }

  for (const ext of [".ts", ".wxml", ".wxss", ".json"]) {
    const pageFile = path.join(root, projectConfig.miniprogramRoot, `${page}${ext}`);
    if (!existsSync(pageFile)) {
      throw new Error(`missing page file: ${page}${ext}`);
    }
  }
}

for (const tab of appConfig.tabBar.list) {
  if (!appConfig.pages.includes(tab.pagePath)) {
    throw new Error(`tabBar page is not registered: ${tab.pagePath}`);
  }
}

stdout.write("miniprogram structure ok\n");
