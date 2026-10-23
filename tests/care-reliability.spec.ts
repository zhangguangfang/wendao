import { expect, test, type Page } from "@playwright/test";
import { emptyData } from "../src/storage";

const key = "huanhuan.private.v1";
async function data(page: Page) { return page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey) ?? "null"), key); }
async function box(page: Page) {
  await page.getByRole("button", { name: "我的安稳工具箱", exact: true }).click();
  return page.getByRole("dialog", { name: "我的安稳工具箱", exact: true });
}
async function hold(page: Page) {
  await page.evaluate(() => new Promise<void>((acquired) => {
    void navigator.locks.request("huanhuan-private-write", () => new Promise<void>((release) => {
      (window as any).releaseCareLock = release; acquired();
    }));
  }));
}
async function release(page: Page) { await page.evaluate(() => (window as any).releaseCareLock()); }

test("缓冲文字等待保存时不能重复提交或关闭，完成后只保留一封信", async ({ page, context }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /很想联系对方/ }).click();
  const pause = page.getByRole("dialog", { name: "给决定留一点空间" });
  await pause.getByLabel("想说的话", { exact: true }).fill("排队时也要保留的文字。");
  const owner = await context.newPage();
  await owner.goto("/");
  await hold(owner);
  await pause.getByRole("button", { name: "收进不寄出的信", exact: true }).click();
  await expect(pause).toHaveAttribute("aria-busy", "true");
  await expect(pause.getByLabel("想说的话", { exact: true })).toBeDisabled();
  await expect(pause.getByRole("button", { name: "关闭", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(pause).toBeVisible();
  await pause.getByRole("button", { name: "正在保存…", exact: true }).evaluate((button: HTMLButtonElement) => button.click());
  await release(owner);
  await expect(pause.getByRole("button", { name: "保存文字修改", exact: true })).toBeDisabled();
  expect((await data(page)).letters).toHaveLength(1);
  await owner.close();
});

test("缓冲区已保存的信在另一窗口改变时不能覆盖，新文字可另存", async ({ page, context }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /很想联系对方/ }).click();
  const pause = page.getByRole("dialog", { name: "给决定留一点空间" });
  await pause.getByLabel("想说的话", { exact: true }).fill("最初的话");
  await pause.getByRole("button", { name: "收进不寄出的信", exact: true }).click();
  await expect(pause.getByRole("button", { name: "保存文字修改", exact: true })).toBeDisabled();
  const original = (await data(page)).letters[0];
  await pause.getByLabel("想说的话", { exact: true }).fill("缓冲区里的新草稿");
  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("navigation").getByRole("button", { name: /^不寄出的信/ }).click();
  const editor = other.getByRole("dialog", { name: "不寄出的信", exact: true });
  await editor.getByRole("button", { name: /^先放在这里的话/ }).click();
  await editor.getByLabel("信的正文", { exact: true }).fill("另一窗口已保存的内容");
  await editor.getByRole("button", { name: "收好这封信", exact: true }).click();
  await expect(editor.getByRole("button", { name: "已经收好", exact: true })).toBeDisabled();
  await pause.getByRole("button", { name: "保存文字修改", exact: true }).click();
  await expect(pause.getByRole("alert")).toContainText("这次没有保存");
  await expect(pause.getByLabel("想说的话", { exact: true })).toHaveValue("缓冲区里的新草稿");
  expect((await data(page)).letters.find((item: { id: string }) => item.id === original.id).body).toBe("另一窗口已保存的内容");
  await pause.getByRole("button", { name: "以当前文字另存为新信", exact: true }).click();
  await expect(pause.getByRole("button", { name: "保存文字修改", exact: true })).toBeDisabled();
  const saved = await data(page);
  expect(saved.letters).toHaveLength(2);
  expect(saved.letters.map((item: { body: string }) => item.body).sort()).toEqual(["另一窗口已保存的内容", "缓冲区里的新草稿"].sort());
  await other.close();
});

test("工具箱等待写锁期间收到的更新不被旧草稿覆盖，能下载失败草稿", async ({ page, context }) => {
  await page.goto("/");
  const current = await box(page);
  await current.getByRole("button", { name: "留一句安稳的话", exact: true }).click();
  await current.getByLabel("给这句话起个名字", { exact: true }).fill("一直保留");
  await current.getByLabel("想留给自己的话（可不填）", { exact: true }).fill("最初的话");
  await current.getByRole("button", { name: "保存收藏", exact: true }).click();
  await expect(current.locator(".comfort-item")).toHaveCount(1);
  await current.getByRole("button", { name: "编辑一直保留", exact: true }).click();
  await current.getByLabel("想留给自己的话（可不填）", { exact: true }).fill("尚未保存的草稿");
  const owner = await context.newPage();
  await owner.goto("/");
  await hold(owner);
  await current.getByRole("button", { name: "保存收藏", exact: true }).click();
  await expect(current).toHaveAttribute("aria-busy", "true");
  await expect(current.getByLabel("想留给自己的话（可不填）", { exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(current).toBeVisible();
  // The lock owner commits both the authoritative snapshot and its mirror.
  await owner.evaluate(async (storageKey) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const open = indexedDB.open("huanhuan.private.transactions.v2", 1); open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    try {
      const snapshot = await new Promise<any>((resolve, reject) => { const tx = db.transaction("snapshots", "readonly"); const read = tx.objectStore("snapshots").get("current"); tx.oncomplete = () => resolve(read.result); tx.onabort = () => reject(tx.error); });
      snapshot.data.comfortItems[0].body = "持锁窗口的新内容";
      snapshot.data.comfortItems[0].updatedAt = new Date().toISOString();
      const raw = JSON.stringify(snapshot.data);
      const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
      snapshot.hashes.push([...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join(""));
      await new Promise<void>((resolve, reject) => { const tx = db.transaction("snapshots", "readwrite"); tx.objectStore("snapshots").put(snapshot, "current"); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
      localStorage.setItem(storageKey, raw);
    } finally { db.close(); }
  }, key);
  await release(owner);
  await expect(current).toHaveAttribute("aria-busy", "false");
  await expect(current.getByText("这项收藏已在另一个窗口更改。请先查看最新内容，你正在编辑的文字仍保留。", { exact: true })).toBeVisible();
  await expect(current.getByLabel("想留给自己的话（可不填）", { exact: true })).toHaveValue("尚未保存的草稿");
  expect((await data(page)).comfortItems[0].body).toBe("持锁窗口的新内容");
  const downloadPromise = page.waitForEvent("download");
  await current.getByRole("button", { name: "先下载这份文字", exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("缓缓-未保存的收藏.txt");
  await owner.close();
});

test("工具箱最后一个空位的双窗口竞争不会突破上限或丢弃已有收藏", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(({ storageKey, seed }) => localStorage.setItem(storageKey, JSON.stringify(seed)), { storageKey: key, seed: {
    ...emptyData(), comfortItems: Array.from({ length: 199 }, (_, index) => ({ id: `existing-${index}`, kind: "note", title: `已存${index}`, body: "应当保留", createdAt: "2026-10-20T12:00:00.000Z" })),
  } });
  await page.reload();
  const first = await box(page);
  const other = await context.newPage();
  await other.goto("/");
  const second = await box(other);
  await expect(first.locator(".comfort-item")).toHaveCount(20);
  await first.getByRole("button", { name: "留一句安稳的话", exact: true }).click();
  await first.getByLabel("给这句话起个名字", { exact: true }).fill("窗口一的新收藏");
  await second.getByRole("button", { name: "留一句安稳的话", exact: true }).click();
  await second.getByLabel("给这句话起个名字", { exact: true }).fill("窗口二的新收藏");
  await Promise.all([first.getByRole("button", { name: "保存收藏", exact: true }).click(), second.getByRole("button", { name: "保存收藏", exact: true }).click()]);
  await expect(first).toHaveAttribute("aria-busy", "false");
  await expect(second).toHaveAttribute("aria-busy", "false");
  const saved = await data(page);
  expect(saved.comfortItems).toHaveLength(200);
  expect(saved.comfortItems.filter((item: { id: string }) => item.id.startsWith("existing-"))).toHaveLength(199);
  const failed = (await first.locator(".comfort-editor").count()) ? first : second;
  await expect(failed.getByRole("alert")).toContainText("安稳工具箱已满");
  await expect(failed.getByLabel("给这句话起个名字", { exact: true })).not.toHaveValue("");
  await other.close();
});

test("长内容滚动到末尾时，关闭入口仍在手机视口内", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await page.getByRole("button", { name: "温柔的每周回顾", exact: true }).click();
  const review = page.getByRole("dialog", { name: "温柔的每周回顾", exact: true });
  await review.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const close = review.getByRole("button", { name: "关闭", exact: true });
  await expect(close).toBeInViewport();
  await close.click();
  await expect(review).toHaveCount(0);
});
