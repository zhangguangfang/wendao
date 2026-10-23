import { expect, test, type Page } from "@playwright/test";

const key = "huanhuan.private.v1";
const database = "huanhuan.private.transactions.v2";
async function snapshot(page: Page) {
  return page.evaluate(async (name) => {
    if (!(await indexedDB.databases()).some((entry) => entry.name === name)) return undefined;
    return new Promise<unknown>((resolve, reject) => {
    const open = indexedDB.open(name, 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("snapshots", "readonly");
      const request = tx.objectStore("snapshots").get("current");
      tx.oncomplete = () => { db.close(); resolve(request.result?.data); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
    });
  }, database);
}

test("浏览器禁用事务存储时说明单窗口限制，并保留本地保存能力", async ({ page }) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => { throw new DOMException("disabled", "SecurityError"); };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "隐私与数据", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "隐私与数据", exact: true });
  await expect(settings).toContainText("请只在一个缓缓窗口中编辑记录");
  await settings.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "还算平静", exact: true }).click();
  await expect(page.getByRole("button", { name: "还算平静", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)!).moods[0].value, key)).toBe(3);
});

test("镜像仍是已知旧版本时，事务快照保留新记录并修复后续保存", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => snapshot(page)).toMatchObject({ moods: [] });
  const original = await snapshot(page);
  await page.getByRole("button", { name: "有点低落", exact: true }).click();
  await expect.poll(() => snapshot(page)).toMatchObject({ moods: [{ value: 2 }] });
  // Reproduce a process seeing a previously published mirror, without timing luck.
  await page.evaluate(({ storageKey, value }) => localStorage.setItem(storageKey, JSON.stringify(value)), { storageKey: key, value: original });
  await page.reload();
  await expect(page.getByRole("button", { name: "有点低落", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /慢慢喝一杯温水/ }).click();
  await expect.poll(() => snapshot(page)).toMatchObject({ moods: [{ value: 2 }] });
  const mirror = await page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)!), key);
  expect(mirror.moods[0].value).toBe(2);
  expect(Object.values(mirror.actions).flat()).toEqual(["water"]);
});

test("事务最终提交失败时回退镜像，刷新不会把失败写入当作成功恢复", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => snapshot(page)).toMatchObject({ moods: [] });
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, id) {
      if (value.data?.moods?.some((mood: { value: number }) => mood.value === 3)) {
        throw new DOMException("quota", "QuotaExceededError");
      }
      return original.call(this, value, id);
    };
  });
  await page.getByRole("button", { name: "还算平静", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("没能完成保存");
  expect(await snapshot(page)).toMatchObject({ moods: [] });
  await page.reload();
  await expect(page.getByRole("button", { name: "还算平静", exact: true })).toHaveAttribute("aria-pressed", "false");
  expect(await snapshot(page)).toMatchObject({ moods: [] });
});

test("损坏的事务记录不会被静默覆盖，用户确认清空后可重新使用", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => snapshot(page)).toMatchObject({ moods: [] });
  await page.evaluate((name) => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open(name, 1);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("snapshots", "readwrite");
      tx.objectStore("snapshots").put({ data: { version: 99, privateText: "需要明确删除的原文" }, hashes: [] }, "current");
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }), database);
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("无法读取本地事务记录");
  await page.getByRole("button", { name: "还算平静", exact: true }).click();
  expect(await snapshot(page)).toMatchObject({ version: 99, privateText: "需要明确删除的原文" });
  await page.getByRole("button", { name: "隐私与数据", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "隐私与数据", exact: true });
  await settings.getByRole("button", { name: "删除全部记录", exact: true }).click();
  await settings.getByRole("button", { name: "确认全部删除", exact: true }).click();
  await expect(settings.getByRole("status")).toContainText("全部记录已删除");
  expect(await snapshot(page)).toMatchObject({ version: 3, moods: [], letters: [], comfortItems: [] });
  expect(JSON.stringify(await snapshot(page))).not.toContain("需要明确删除的原文");
});

test("v2 指纹在升级后仍被识别，旧镜像不能覆盖事务快照和新收藏", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => snapshot(page)).toMatchObject({ moods: [] });
  await page.evaluate(async ({ name, storageKey }) => {
    const old = { version: 2, moods: [] as unknown[], letters: [], actions: {}, reliefSessions: 0, reliefHistory: [], customActions: [], plannedActions: [] };
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const latest = { ...old, moods: [{ id: "new-v2-mood", value: 3, createdAt: now.toISOString(), day }] };
    async function hash(value: unknown) {
      const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
      return [...new Uint8Array(bytes)].map((item) => item.toString(16).padStart(2, "0")).join("");
    }
    const hashes = await Promise.all([hash(old), hash(latest)]);
    await navigator.locks.request("huanhuan-private-write", () => new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("snapshots", "readwrite");
        tx.objectStore("snapshots").put({ data: latest, hashes }, "current");
        tx.oncomplete = () => { db.close(); localStorage.setItem(storageKey, JSON.stringify(old)); resolve(); };
        tx.onabort = () => { db.close(); reject(tx.error); };
      };
    }));
    (window as any).oldMirror = JSON.stringify(old);
  }, { name: database, storageKey: key });
  const oldMirror = await page.evaluate(() => (window as any).oldMirror);
  await page.reload();
  await expect(page.getByRole("button", { name: "还算平静", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "我的安稳工具箱", exact: true }).click();
  await page.getByRole("button", { name: "收藏 · 轻柔的呼吸", exact: true }).click();
  await expect(page.getByRole("button", { name: "已收藏 · 轻柔的呼吸", exact: true })).toBeDisabled();
  await page.evaluate(({ storageKey, text }) => localStorage.setItem(storageKey, text), { storageKey: key, text: oldMirror });
  await page.reload();
  await expect(page.getByRole("button", { name: "还算平静", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "我的安稳工具箱", exact: true }).click();
  await expect(page.getByRole("button", { name: "已收藏 · 轻柔的呼吸", exact: true })).toBeDisabled();
  expect(await snapshot(page)).toMatchObject({ version: 3, moods: [{ id: "new-v2-mood" }], comfortItems: [{ technique: "breathing" }] });
});
