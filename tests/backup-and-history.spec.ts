import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const key = "huanhuan.private.v1";
const stamp = "2026-10-22T12:00:00.000Z";
const seed = () => ({
  version: 2,
  moods: [{ id: "mood-a", value: 2, day: "2026-10-22", createdAt: stamp, note: "原来的心情", tags: ["想念"] }],
  letters: [{ id: "letter-a", title: "给自己", body: "私人文字不应丢失。", createdAt: stamp }],
  actions: { "2026-10-22": ["water"] },
  reliefSessions: 3,
  reliefHistory: [{ id: "session-a", createdAt: stamp, feeling: "cry", technique: "breathing", durationSeconds: 25, before: 4, after: 3, action: "water" }],
  customActions: [], plannedActions: ["water"],
});

async function settings(page: Page) {
  await page.getByRole("button", { name: "隐私与数据", exact: true }).click();
  return page.getByRole("dialog", { name: "隐私与数据", exact: true });
}
async function stored(page: Page) {
  return page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey) ?? "null"), key);
}
async function loadSeed(page: Page) {
  await page.goto("/");
  await page.evaluate(({ storageKey, data }) => localStorage.setItem(storageKey, JSON.stringify(data)), { storageKey: key, data: seed() });
  await page.reload();
}

test("下载备份可预览、取消、恢复和重复导入，冲突保留已有内容", async ({ page }) => {
  await loadSeed(page);
  const dialog = await settings(page);
  const downloading = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "下载数据备份", exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^缓缓-备份-.*\.json$/);
  const backup = await readFile((await download.path())!, "utf8");
  expect(JSON.parse(backup)).toMatchObject({ app: "huanhuan", backupVersion: 1, data: seed() });

  const changed = seed();
  changed.letters[0].body = "本地较新的内容";
  changed.moods[0].note = "本地较新的心情";
  const incoming = seed();
  incoming.letters.push({ id: "letter-b", title: "另一封", body: "来自备份", createdAt: stamp });
  await page.evaluate(({ storageKey, data }) => localStorage.setItem(storageKey, JSON.stringify(data)), { storageKey: key, data: changed });
  await page.reload();
  await settings(page);
  const file = { name: "我的备份.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(incoming)) };
  await dialog.getByLabel("选择备份文件", { exact: true }).setInputFiles(file);
  const preview = dialog.getByRole("group", { name: "备份内容预览" });
  await expect(preview).toContainText("2 封信");
  await preview.getByRole("button", { name: "取消导入", exact: true }).click();
  expect((await stored(page)).letters).toHaveLength(1);
  await dialog.getByLabel("选择备份文件", { exact: true }).setInputFiles(file);
  await preview.getByRole("button", { name: "确认合并导入", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("备份已合并");
  const result = await stored(page);
  expect(result.letters).toHaveLength(2);
  expect(result.letters.find((item: { id: string }) => item.id === "letter-a").body).toBe("本地较新的内容");
  expect(result.moods[0].note).toBe("本地较新的心情");
  await dialog.getByLabel("选择备份文件", { exact: true }).setInputFiles(file);
  await preview.getByRole("button", { name: "确认合并导入", exact: true }).click();
  await expect(preview).toHaveCount(0);
  expect(await stored(page)).toEqual(result);
});

test("无效备份和写入失败不会覆盖数据，失败后保留预览可重试", async ({ page }) => {
  await loadSeed(page);
  const dialog = await settings(page);
  await dialog.getByLabel("选择备份文件", { exact: true }).setInputFiles({ name: "错误.json", mimeType: "application/json", buffer: Buffer.from('{"version":99}') });
  await expect(dialog.getByRole("alert")).toContainText("不支持");
  const before = await stored(page);
  await dialog.getByLabel("选择备份文件", { exact: true }).setInputFiles({ name: "备份.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(seed())) });
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException("quota", "QuotaExceededError"); }; });
  await dialog.getByRole("button", { name: "确认合并导入", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("没能导入");
  await expect(dialog.getByRole("group", { name: "备份内容预览" })).toBeVisible();
  expect(await stored(page)).toEqual(before);
});

test("损坏记录可导出原文，不能通过导入静默替换", async ({ page }) => {
  await page.goto("/");
  const raw = '{"version":2,"letters":[私密未恢复内容';
  await page.evaluate(({ storageKey, text }) => localStorage.setItem(storageKey, text), { storageKey: key, text: raw });
  await page.reload();
  const dialog = await settings(page);
  await expect(dialog.getByLabel("选择备份文件", { exact: true })).toBeDisabled();
  const downloading = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "导出原始记录", exact: true }).click();
  const download = await downloading;
  expect(await readFile((await download.path())!, "utf8")).toBe(raw);
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBe(raw);
});

test("练习回顾显示真实记录，删除失败保留，成功只删除目标记录和次数", async ({ page }) => {
  await loadSeed(page);
  await page.getByRole("button", { name: /我的练习回顾/ }).click();
  const history = page.getByRole("dialog", { name: "我的练习回顾", exact: true });
  await expect(history.locator(".practice-entry")).toContainText("25 秒");
  await expect(history.locator(".practice-entry")).toContainText("练习前 4 → 练习后 3");
  await expect(history).toContainText("旧版本还留下了 2 次");
  await history.getByRole("button", { name: /^删除.*的练习记录$/ }).click();
  await page.evaluate(() => {
    const state = window as unknown as { previousSetItem: typeof Storage.prototype.setItem };
    state.previousSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException("quota", "QuotaExceededError"); };
  });
  await history.getByRole("button", { name: "确认删除这次练习", exact: true }).click();
  await expect(history.getByRole("alert")).toContainText("没能删除");
  expect((await stored(page)).reliefHistory).toHaveLength(1);
  await page.evaluate(() => { Storage.prototype.setItem = (window as unknown as { previousSetItem: typeof Storage.prototype.setItem }).previousSetItem; });
  await history.getByRole("button", { name: "确认删除这次练习", exact: true }).click();
  await expect(history.locator(".practice-entry")).toHaveCount(0);
  const result = await stored(page);
  expect(result.reliefSessions).toBe(2);
  expect(result.plannedActions).toEqual(["water"]);
  expect(result.actions).toEqual(seed().actions);
});
