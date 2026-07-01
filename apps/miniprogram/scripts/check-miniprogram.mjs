import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { stdout } from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectConfig = JSON.parse(readFileSync(path.join(root, "project.config.json"), "utf8"));
const miniprogramRoot = path.join(root, projectConfig.miniprogramRoot);
const appConfig = JSON.parse(readFileSync(path.join(miniprogramRoot, "app.json"), "utf8"));

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
    const pageFile = path.join(miniprogramRoot, `${page}${ext}`);
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

const projectDetailTs = readFileSync(path.join(miniprogramRoot, "pages/project-detail/project-detail.ts"), "utf8");
const projectDetailWxml = readFileSync(path.join(miniprogramRoot, "pages/project-detail/project-detail.wxml"), "utf8");
const xmApiTs = readFileSync(path.join(miniprogramRoot, "services/xmApi.ts"), "utf8");

const draftChecks = [
  [xmApiTs.includes("/work-items/draft"), "xmApi missing work item draft endpoint"],
  [projectDetailTs.includes("generateWorkItemDraft"), "project detail missing draft API call"],
  [projectDetailTs.includes("parseTagNames"), "project detail missing shared tag parsing"],
  [projectDetailTs.includes("splitChecklist"), "project detail missing checklist parsing"],
  [projectDetailWxml.includes('bindtap="generateDraft"'), "project detail missing draft button"],
  [projectDetailWxml.includes('bindinput="onTagsInput"'), "project detail missing tag input"],
  [projectDetailWxml.includes('bindinput="onChecklistInput"'), "project detail missing checklist input"]
];

for (const [passed, message] of draftChecks) {
  if (!passed) {
    throw new Error(message);
  }
}

const configSource = readFileSync(path.join(miniprogramRoot, "core/config.ts"), "utf8");
const appSource = readFileSync(path.join(miniprogramRoot, "app.ts"), "utf8");

if (!configSource.includes("apiProfiles")) {
  throw new Error("core/config.ts must define apiProfiles for local and preview API switching");
}

function extractProfileBaseUrl(profileName) {
  const profilePattern = new RegExp(`${profileName}:\\s*{[\\s\\S]*?apiBaseUrl:\\s*"([^"]+)"`);
  const match = configSource.match(profilePattern);
  if (!match) {
    throw new Error(`core/config.ts missing ${profileName} apiBaseUrl`);
  }
  return match[1];
}

const localApiBaseUrl = extractProfileBaseUrl("local");
const previewApiBaseUrl = extractProfileBaseUrl("preview");

if (!/^https?:\/\/[^/]+/.test(localApiBaseUrl)) {
  throw new Error("local apiBaseUrl must be an absolute http(s) URL");
}

if (!previewApiBaseUrl.startsWith("https://")) {
  throw new Error("preview apiBaseUrl must use https:// for real-device preview");
}

if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(previewApiBaseUrl)) {
  throw new Error("preview apiBaseUrl must not point to localhost or 127.0.0.1");
}

if (/apiBaseUrl:\s*"https?:\/\//.test(appSource)) {
  throw new Error("app.ts must not hardcode an API base URL; use core/config.ts");
}

stdout.write("miniprogram structure ok\n");
