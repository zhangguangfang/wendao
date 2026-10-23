import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const key = "huanhuan.private.v1";
async function stored(page: Page) { return page.evaluate((name) => JSON.parse(localStorage.getItem(name) ?? "null"), key); }
async function openBox(page: Page) {
  await page.getByRole("button", { name: "我的安稳工具箱", exact: true }).click();
  return page.getByRole("dialog", { name: "我的安稳工具箱", exact: true });
}
async function openPause(page: Page) {
  await page.getByRole("button", { name: /很想联系对方/ }).click();
  return page.getByRole("dialog", { name: "给决定留一点空间" });
}

test("场景引导选择对应练习，普通入口不会继承上一次场景", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /脑中反复回放/ }).click();
  await page.getByRole("button", { name: /做一次感官练习/ }).click();
  const relief = page.getByRole("dialog");
  await expect(relief.getByRole("button", { name: /反复想起/ })).toHaveAttribute("aria-pressed", "true");
  await relief.getByRole("button", { name: "陪我缓一缓", exact: true }).click();
  await expect(relief.getByRole("button", { name: "感受此刻", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await page.getByRole("navigation").getByRole("button", { name: "陪我缓一缓", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: /反复想起/ })).toHaveAttribute("aria-pressed", "false");
});

test("自责场景打开独立写作提示，保留旧信且不自动保存模板", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /总在责怪自己/ }).click();
  await page.getByRole("button", { name: /跟着提示写几句话/ }).click();
  const editor = page.getByRole("dialog", { name: "不寄出的信", exact: true });
  await expect(editor.getByLabel("信的正文", { exact: true })).toHaveValue(/我能够确认的事实/);
  await expect(editor.getByLabel("想从哪里写起")).toHaveValue("self");
  expect((await stored(page))?.letters ?? []).toHaveLength(0);
  await editor.getByLabel("信的正文", { exact: true }).fill("我愿意给自己一点理解。");
  await editor.getByRole("button", { name: "收好这封信", exact: true }).click();
  await expect(editor.getByRole("button", { name: "已经收好", exact: true })).toBeDisabled();
  expect((await stored(page)).letters[0].body).toBe("我愿意给自己一点理解。");
});

test("缓冲区可跳过停顿，保存只生成一封信并能直接打开编辑", async ({ page }) => {
  await page.goto("/");
  const pause = await openPause(page);
  await pause.getByLabel("想说的话", { exact: true }).fill("此刻很想说的话，先留给自己。");
  await pause.getByRole("button", { name: "先缓一缓", exact: true }).click();
  await expect(pause.getByText("60", { exact: false }).first()).toBeVisible();
  await pause.getByRole("button", { name: "看看下一步", exact: true }).click();
  await pause.getByRole("button", { name: "收进不寄出的信", exact: true }).click();
  await expect(pause.getByRole("button", { name: "保存文字修改", exact: true })).toBeDisabled();
  await pause.getByRole("button", { name: "打开这封信", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "不寄出的信", exact: true });
  await expect(editor.getByLabel("信的正文", { exact: true })).toHaveValue("此刻很想说的话，先留给自己。");
  expect((await stored(page)).letters).toHaveLength(1);
  expect((await stored(page)).reliefSessions).toBe(0);
});

test("缓冲区未保存离开有确认，取消后文字保留，明确放弃才离开", async ({ page }) => {
  await page.goto("/");
  const pause = await openPause(page);
  await pause.getByLabel("想说的话", { exact: true }).fill("还想留在这里的文字。");
  await page.keyboard.press("Escape");
  const confirm = pause.getByRole("group", { name: "离开前保留文字" });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByRole("button", { name: "继续留在这里", exact: true })).toBeFocused();
  await confirm.getByRole("button", { name: "继续留在这里", exact: true }).click();
  await expect(pause.getByLabel("想说的话", { exact: true })).toHaveValue("还想留在这里的文字。");
  await page.keyboard.press("Escape");
  await confirm.getByRole("button", { name: "放下未保存的文字并离开", exact: true }).click();
  await expect(pause).toHaveCount(0);
  expect((await stored(page))?.letters ?? []).toHaveLength(0);
});

test("缓冲区计时暂停与后台时间不计入，无强制等待", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  const pause = await openPause(page);
  await pause.getByRole("button", { name: "暂时不写，继续", exact: true }).click();
  await pause.getByRole("button", { name: "开始这一分钟", exact: true }).click();
  await page.clock.runFor(10_000);
  await expect(pause.getByRole("timer")).toHaveText("还剩 50 秒");
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.clock.runFor(90_000);
  await expect(pause.getByRole("timer")).toHaveText("还剩 50 秒");
  await expect(pause.getByRole("status")).toContainText("离开页面时已暂停");
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); document.dispatchEvent(new Event("visibilitychange")); });
  await pause.getByRole("button", { name: "继续这一分钟", exact: true }).click();
  await page.clock.runFor(50_000);
  await expect(pause.getByRole("timer")).toHaveText("还剩 0 秒");
  await expect(pause.getByRole("status")).toContainText("这一分钟结束了");
  await pause.getByRole("button", { name: "看看下一步", exact: true }).click();
  await expect(pause.getByRole("heading", { name: "接下来，由你决定" })).toBeVisible();
});

test("缓冲区保存失败保留文字和步骤，重试不重复创建", async ({ page }) => {
  await page.goto("/");
  const pause = await openPause(page);
  await pause.getByLabel("想说的话", { exact: true }).fill("存储失败也请留住我。");
  await page.evaluate(() => { (window as any).oldSetItem = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new DOMException("quota", "QuotaExceededError"); }; });
  await pause.getByRole("button", { name: "收进不寄出的信", exact: true }).click();
  await expect(pause.getByRole("alert")).toContainText("这次没有保存");
  await expect(pause.getByLabel("想说的话", { exact: true })).toHaveValue("存储失败也请留住我。");
  expect((await stored(page))?.letters ?? []).toHaveLength(0);
  await page.evaluate(() => { Storage.prototype.setItem = (window as any).oldSetItem; });
  await pause.getByRole("button", { name: "收进不寄出的信", exact: true }).click();
  await expect(pause.getByRole("button", { name: "保存文字修改", exact: true })).toBeDisabled();
  expect((await stored(page)).letters).toHaveLength(1);
});

test("工具箱支持创建、搜索、筛选、编辑、备份和确认移除", async ({ page }) => {
  await page.goto("/");
  const box = await openBox(page);
  await box.getByRole("button", { name: "留一句安稳的话", exact: true }).click();
  await box.getByLabel("给这句话起个名字", { exact: true }).fill("窗边的光");
  await box.getByLabel("想留给自己的话（可不填）", { exact: true }).fill("今天可以慢慢来。\n记得喝一点水。");
  await box.getByRole("button", { name: "保存收藏", exact: true }).click();
  await expect(box.locator(".comfort-item")).toContainText("窗边的光");
  await box.getByRole("button", { name: "添加支持我的人", exact: true }).click();
  await box.getByLabel("怎么称呼 TA", { exact: true }).fill("姐姐");
  await box.getByLabel("联系线索或想说的话（可不填）", { exact: true }).fill("晚上可以问问她是否方便散步。");
  await box.getByRole("button", { name: "保存收藏", exact: true }).click();
  await expect(box.locator(".comfort-item")).toHaveCount(2);
  await box.getByLabel("搜索安稳收藏").fill("喝一点水");
  await expect(box.locator(".comfort-item")).toHaveCount(1);
  await box.getByRole("button", { name: "编辑窗边的光", exact: true }).click();
  await box.getByLabel("想留给自己的话（可不填）", { exact: true }).fill("喝一点水，今天也可以慢慢来。");
  await box.getByRole("button", { name: "保存收藏", exact: true }).click();
  await expect(box.locator(".comfort-item")).toContainText("今天也可以慢慢来");
  await box.getByLabel("搜索安稳收藏").fill("");
  await box.getByRole("button", { name: "支持我的人", exact: true }).click();
  await expect(box.locator(".comfort-item")).toHaveCount(1);
  await expect(box.locator(".comfort-item")).toContainText("姐姐");
  await box.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "隐私与数据", exact: true }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载数据备份", exact: true }).click();
  const download = await downloading;
  const backup = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(backup.data.version).toBe(3);
  expect(backup.data.comfortItems).toHaveLength(2);
  await page.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).click();
  await openBox(page);
  await box.getByRole("button", { name: "移除姐姐", exact: true }).click();
  await box.getByRole("button", { name: "保留收藏", exact: true }).click();
  await expect(box.locator(".comfort-item")).toHaveCount(2);
  await box.getByRole("button", { name: "移除姐姐", exact: true }).click();
  await box.getByRole("button", { name: "确认移除", exact: true }).click();
  await expect(box.locator(".comfort-item")).toHaveCount(1);
  await page.reload();
  await openBox(page);
  await expect(box.locator(".comfort-item")).toContainText("窗边的光");
});

test("工具箱练习收藏去重并能直接开始对应练习", async ({ page }) => {
  await page.goto("/");
  const box = await openBox(page);
  await box.getByRole("button", { name: "收藏 · 感受此刻", exact: true }).click();
  await expect(box.getByRole("button", { name: "已收藏 · 感受此刻", exact: true })).toBeDisabled();
  await box.getByRole("button", { name: "开始这个练习", exact: true }).click();
  const relief = page.getByRole("dialog");
  await expect(relief.getByRole("button", { name: "感受此刻", exact: true })).toHaveAttribute("aria-pressed", "true");
  await relief.getByRole("button", { name: "跳过练习", exact: true }).click();
  await expect(relief.getByRole("checkbox")).toBeChecked();
  await expect(relief.getByRole("checkbox")).toBeDisabled();
  await relief.getByRole("button", { name: "先休息一下", exact: true }).click();
  await expect(relief).toHaveCount(0);
  expect((await stored(page)).comfortItems).toHaveLength(1);
});

test("工具箱多窗口编辑冲突保留两份文字，删除不会被旧草稿复活", async ({ page, context }) => {
  await page.goto("/");
  const box = await openBox(page);
  await box.getByRole("button", { name: "留一句安稳的话", exact: true }).click();
  await box.getByLabel("给这句话起个名字", { exact: true }).fill("留给自己");
  await box.getByLabel("想留给自己的话（可不填）", { exact: true }).fill("原本的内容");
  await box.getByRole("button", { name: "保存收藏", exact: true }).click();
  await expect(box.locator(".comfort-item")).toHaveCount(1);
  await box.getByRole("button", { name: "编辑留给自己", exact: true }).click();
  await box.getByLabel("想留给自己的话（可不填）", { exact: true }).fill("这个窗口的草稿");
  const other = await context.newPage();
  await other.goto("/");
  const otherBox = await openBox(other);
  await otherBox.getByRole("button", { name: "移除留给自己", exact: true }).click();
  await otherBox.getByRole("button", { name: "确认移除", exact: true }).click();
  await expect(otherBox.locator(".comfort-item")).toHaveCount(0);
  await expect(box.getByRole("alert")).toContainText("更改或删除");
  await expect(box.getByRole("button", { name: "保存收藏", exact: true })).toBeDisabled();
  await box.getByRole("button", { name: "把我的内容另存一份", exact: true }).click();
  await expect(box.locator(".comfort-item")).toContainText("这个窗口的草稿");
  expect((await stored(page)).comfortItems).toHaveLength(1);
  await other.close();
});

test("新功能在 320px 可操作且确认时键盘不会进入被禁用的编辑区", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const box = await openBox(page);
  await box.getByRole("button", { name: "留一句安稳的话", exact: true }).click();
  await box.getByLabel("给这句话起个名字", { exact: true }).fill("稍后再保存");
  await box.getByRole("button", { name: "返回工具箱", exact: true }).click();
  const confirm = box.getByRole("group", { name: "保留未保存的收藏" });
  await expect(confirm).toBeVisible();
  await expect(box.getByLabel("给这句话起个名字", { exact: true })).toBeDisabled();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    expect(await box.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    expect(await page.evaluate(() => document.activeElement?.matches(":disabled"))).toBe(false);
  }
  expect(await box.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await confirm.getByRole("button", { name: "继续编辑", exact: true }).click();
  await expect(box.getByLabel("给这句话起个名字", { exact: true })).toHaveValue("稍后再保存");
});
