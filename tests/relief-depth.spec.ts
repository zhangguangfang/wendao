import { expect, test, type Page } from "@playwright/test";

const storageKey = "huanhuan.private.v1";

async function openRelief(page: Page) {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "主要导航" })
    .getByRole("button", { name: "陪我缓一缓", exact: true })
    .click();
  return page.getByRole("dialog");
}

async function savedData(page: Page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, storageKey);
}

async function freezeClock(page: Page) {
  await page.clock.install({ time: new Date("2026-10-22T10:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-22T10:00:01Z"));
}

test("练习记录保留前后感受与计划，时长排除暂停和未开始的时间", async ({ page }) => {
  await freezeClock(page);
  const relief = await openRelief(page);
  await relief.getByRole("button", { name: /反复想起/ }).click();
  await relief.getByRole("group", { name: "开始前，有多难受？ 可不选" })
    .getByRole("button", { name: "4 分", exact: true }).click();
  await relief.getByRole("button", { name: "陪我缓一缓", exact: true }).click();
  await expect(relief.getByText("念头来了，先轻轻认出它", { exact: true })).toBeVisible();

  await page.clock.runFor(30_000);
  await expect(relief.getByLabel("本次实际练习时长")).toContainText("已练习 0 秒");
  await relief.getByRole("button", { name: "开始呼吸", exact: true }).click();
  await page.clock.runFor(9_000);
  await relief.getByRole("button", { name: "暂停一下", exact: true }).click();
  await page.clock.runFor(20_000);
  await expect(relief.getByLabel("本次实际练习时长")).toContainText("已练习 9 秒");

  await relief.getByRole("button", { name: "感受此刻", exact: true }).click();
  await relief.getByRole("button", { name: "开始感官练习", exact: true }).click();
  await page.clock.runFor(5_000);
  const found = relief.getByRole("button", { name: "已留意到 5 样你看见的东西", exact: true });
  await found.click();
  await expect(found).toHaveAttribute("aria-pressed", "true");
  const skipped = relief.getByRole("button", { name: "跳过 2 种你闻到的气味", exact: true });
  await skipped.click();
  await expect(skipped).toHaveAttribute("aria-pressed", "true");
  await relief.getByRole("button", { name: "继续", exact: true }).click();
  await expect(relief.locator(".relief-session-summary")).toContainText("14 秒");
  await expect(relief.locator(".relief-session-summary")).toContainText("1 类身边的感受");
  await page.clock.runFor(60_000);
  await relief.getByRole("group", { name: "现在，有多难受？ 可不选" })
    .getByRole("button", { name: "3 分", exact: true }).click();
  await relief.getByRole("button", { name: /去窗边站一会儿/ }).click();
  await relief.getByRole("button", { name: "带着这件小事，慢慢来", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const saved = await savedData(page);
  expect(saved.reliefSessions).toBe(1);
  expect(saved.reliefHistory).toHaveLength(1);
  expect(saved.reliefHistory[0]).toMatchObject({
    feeling: "repeat", technique: "grounding", durationSeconds: 14, before: 4, after: 3, action: "window",
  });
  expect(saved.plannedActions).toContain("window");
  expect(Object.values(saved.actions).flat()).not.toContain("window");
  await page.reload();
  expect((await savedData(page)).reliefHistory).toEqual(saved.reliefHistory);
});

test("切换练习和离开页面会停止计时，回到页面不自动继续", async ({ page }) => {
  await freezeClock(page);
  const relief = await openRelief(page);
  await relief.getByRole("button", { name: "先跳过", exact: true }).click();
  await relief.getByRole("button", { name: "开始呼吸", exact: true }).click();
  await page.clock.runFor(3_000);
  await relief.getByRole("button", { name: "感受此刻", exact: true }).click();
  await page.clock.runFor(8_000);
  await expect(relief.getByLabel("本次实际练习时长")).toContainText("已练习 3 秒");
  await relief.getByRole("button", { name: "开始感官练习", exact: true }).click();
  await page.clock.runFor(2_000);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(40_000);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(relief.getByRole("status")).toHaveText("离开页面时已暂停。准备好后，再继续就好。");
  await expect(relief.getByLabel("本次实际练习时长")).toContainText("已练习 5 秒");
  await relief.getByRole("button", { name: "继续感官练习", exact: true }).click();
  await page.clock.runFor(2_000);
  await relief.getByRole("button", { name: "继续", exact: true }).click();
  await relief.getByRole("button", { name: "先休息一下", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await savedData(page)).reliefHistory[0].durationSeconds).toBe(7);
});

test("保存失败保留练习选择，恢复存储后重试只记一次", async ({ page }) => {
  const relief = await openRelief(page);
  await relief.getByRole("button", { name: /有些睡不着/ }).click();
  await relief.getByRole("button", { name: "5 分，很强烈", exact: true }).click();
  await relief.getByRole("button", { name: "陪我缓一缓", exact: true }).click();
  await relief.getByRole("button", { name: "跳过练习", exact: true }).click();
  await relief.getByRole("button", { name: "4 分", exact: true }).click();
  await relief.getByRole("button", { name: /给自己一点休息/ }).click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as Window & { restoreStorage?: () => void }).restoreStorage = () => {
      Storage.prototype.setItem = original;
    };
    Storage.prototype.setItem = function () {
      throw new DOMException("Test storage failure", "QuotaExceededError");
    };
  });
  await relief.getByRole("button", { name: "带着这件小事，慢慢来", exact: true }).click();
  await expect(relief.getByRole("alert")).toContainText("这次没能保存练习记录");
  await expect(relief.getByRole("button", { name: "4 分", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(relief.getByRole("button", { name: /给自己一点休息/ })).toHaveAttribute("aria-pressed", "true");
  expect(await savedData(page)).toBeNull();
  await page.evaluate(() => (window as Window & { restoreStorage?: () => void }).restoreStorage?.());
  await relief.getByRole("button", { name: "带着这件小事，慢慢来", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const saved = await savedData(page);
  expect(saved.reliefSessions).toBe(1);
  expect(saved.reliefHistory).toHaveLength(1);
  expect(saved.reliefHistory[0]).toMatchObject({ durationSeconds: 0, before: 5, after: 4, action: "rest" });
});

test("小屏幕下前后自评都可清空，跳过练习不会伪造时长", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const relief = await openRelief(page);
  await relief.getByRole("button", { name: "2 分", exact: true }).click();
  await relief.getByRole("button", { name: "暂不记录分数", exact: true }).click();
  await relief.getByRole("button", { name: "先跳过", exact: true }).click();
  await relief.getByRole("button", { name: "跳过练习", exact: true }).click();
  await relief.getByRole("button", { name: "3 分", exact: true }).click();
  await relief.getByRole("button", { name: "3 分", exact: true }).click();
  await expect(relief.locator(".relief-session-summary")).toContainText("这次没有计时练习");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await relief.getByRole("button", { name: "先休息一下", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const session = (await savedData(page)).reliefHistory[0];
  expect(session.durationSeconds).toBe(0);
  expect(session).not.toHaveProperty("before");
  expect(session).not.toHaveProperty("after");
});

test("等待另一个窗口保存时无法重复提交，键盘焦点留在练习窗口", async ({ page }) => {
  const relief = await openRelief(page);
  await relief.getByRole("button", { name: "先跳过", exact: true }).click();
  await relief.getByRole("button", { name: "跳过练习", exact: true }).click();
  await relief.getByRole("button", { name: "3 分", exact: true }).click();
  await relief.getByRole("button", { name: /慢慢喝一杯水/ }).click();

  await page.evaluate(() => new Promise<void>((resolve) => {
    void navigator.locks.request("huanhuan-private-write", () => new Promise<void>((release) => {
      (window as Window & { releaseTestWrite?: () => void }).releaseTestWrite = release;
      resolve();
    }));
  }));
  await relief.getByRole("button", { name: "带着这件小事，慢慢来", exact: true }).click();
  await expect(relief).toHaveAttribute("aria-busy", "true");
  await expect(relief.getByRole("button", { name: "正在收好…", exact: true })).toBeDisabled();
  await expect(relief.getByRole("button", { name: "关闭，回到首页", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(relief).toBeVisible();
  for (const key of ["Tab", "Shift+Tab", "Tab"]) {
    await page.keyboard.press(key);
    await expect.poll(() => relief.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await expect.poll(() => relief.evaluate(() => document.activeElement?.matches(":disabled"))).toBe(false);
  }
  expect(await savedData(page)).toBeNull();
  await page.evaluate(() => (window as Window & { releaseTestWrite?: () => void }).releaseTestWrite?.());
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const saved = await savedData(page);
  expect(saved.reliefSessions).toBe(1);
  expect(saved.reliefHistory).toHaveLength(1);
  expect(saved.reliefHistory[0]).toMatchObject({ after: 3, action: "water", durationSeconds: 0 });
  expect(saved.plannedActions).toEqual(["water"]);
});
