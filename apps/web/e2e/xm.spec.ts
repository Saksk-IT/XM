import { expect, test } from "@playwright/test";

test("manages projects and work items", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("admin");
  await page.getByLabel("密码").fill("admin123456");
  await page.getByRole("button", { name: "登录" }).click();

  await expect(page.getByText("DevFlow")).toBeVisible();
  await page.getByRole("button", { name: "收起侧边栏" }).click();
  await expect(page.getByRole("button", { name: "展开侧边栏" })).toBeVisible();
  await page.getByRole("button", { name: "展开侧边栏" }).click();

  await page.getByRole("button", { name: "收起事项详情" }).click();
  await expect(page.getByRole("button", { name: "展开事项详情" })).toBeVisible();
  await page.getByRole("button", { name: "展开事项详情" }).click();

  await page.getByLabel("新建项目").click();
  let dialog = page.getByRole("dialog");
  const projectName = `XM E2E ${Date.now()}`;
  await dialog.getByLabel("项目名称").fill(projectName);
  await dialog.getByLabel("项目描述").fill("E2E 创建的项目");
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

  await page.getByRole("button", { name: "新建", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("标题").fill("登录页错误提示优化");
  await dialog.getByLabel("描述", { exact: true }).fill("密码错误时展示清晰提示");
  await dialog.getByLabel("类型").selectOption("BUG");
  await dialog.getByLabel("优先级").selectOption("HIGH");
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("heading", { name: "登录页错误提示优化" }).first()).toBeVisible();

  await page.getByRole("button", { name: "新建", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("标题").fill("项目进度统计");
  await dialog.getByLabel("描述", { exact: true }).fill("按四类事项统计进度");
  await dialog.getByLabel("类型").selectOption("FEATURE");
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("heading", { name: "项目进度统计" }).first()).toBeVisible();

  await page.locator("article").filter({ hasText: "项目进度统计" }).click();
  await page.getByLabel("状态").selectOption("DONE");
  await page.getByRole("button", { name: "保存" }).click();
  await page.getByRole("navigation", { name: "项目分区" }).getByRole("button", { name: /功能已实现/ }).click();
  await expect(page.getByRole("heading", { name: "项目进度统计" }).first()).toBeVisible();

  await page.getByPlaceholder("搜索任务、标题、标签或备注...").fill("登录页");
  await page.getByRole("navigation", { name: "项目分区" }).getByRole("button", { name: /Bug 待修改/ }).click();
  await expect(page.getByRole("heading", { name: "登录页错误提示优化" }).first()).toBeVisible();

  await page.getByRole("button", { name: "归档", exact: true }).click();
  await expect(page.getByRole("heading", { name: projectName })).toHaveCount(0);

  await page.getByRole("button", { name: "设置" }).click();
  await expect(page).toHaveURL(/\/settings/);
  await page.getByRole("button", { name: "归档" }).first().click();
  await expect(page.getByText(projectName)).toBeVisible();
  await page.getByRole("button", { name: `恢复项目 ${projectName}` }).click();
  await expect(page.getByText("暂无归档项目")).toBeVisible();

  await page.getByRole("button", { name: "返回项目" }).click();
  await page.getByTitle(projectName).click();
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
});
