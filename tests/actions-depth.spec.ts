import { expect, test, type Page } from "@playwright/test";

const storageKey = "huanhuan.private.v1";
test.use({ timezoneId: "Asia/Shanghai" });

async function openPlanner(page: Page) {
  await page.getByRole("button", { name: "安排我的小行动", exact: true }).click();
  return page.getByRole("dialog", { name: "我的小行动计划", exact: true });
}

async function readData(page: Page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, storageKey);
}

async function createAction(page: Page, title: string) {
  const planner = page.getByRole("dialog", { name: "我的小行动计划", exact: true });
  const toggle = planner.getByRole("button", { name: "挑选我的小行动", exact: true });
  if (await toggle.isVisible()) await toggle.click();
  await planner.getByRole("button", { name: "写一个自己的小行动", exact: true }).click();
  await planner.getByLabel(/这件小事叫什么/).fill(title);
  await planner.getByLabel(/想给自己的小提醒/).fill("只做一点点，也可以。");
  await planner.getByRole("button", { name: "保存并加入计划", exact: true }).click();
  await expect(planner.locator(".planner-editor")).toHaveCount(0);
}

test("自己的小行动可以安排、完成、编辑和归档，过去的照顾仍然保留", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-22T12:00:00+08:00"));
  await page.goto("/");
  const planner = await openPlanner(page);
  await createAction(page, "听一首喜欢的歌");
  let data = await readData(page);
  expect(data.customActions).toHaveLength(1);
  const id = data.customActions[0].id;
  expect(data.plannedActions).toEqual([id]);
  expect(data.actions["2026-10-22"] ?? []).toEqual([]);

  await planner.getByRole("button", { name: "完成：听一首喜欢的歌", exact: true }).click();
  await expect(planner.getByRole("button", { name: "取消完成：听一首喜欢的歌", exact: true })).toHaveAttribute("aria-pressed", "true");
  await planner.getByRole("button", { name: "编辑小行动：听一首喜欢的歌", exact: true }).click();
  await planner.getByLabel(/这件小事叫什么/).fill("听一首熟悉的歌");
  await planner.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(planner.getByRole("button", { name: "取消完成：听一首熟悉的歌", exact: true })).toBeVisible();
  await planner.getByRole("button", { name: "归档小行动：听一首熟悉的歌", exact: true }).click();
  const confirmation = page.getByRole("alertdialog", { name: "先把这件小事收起来吗？", exact: true });
  await confirmation.getByRole("button", { name: "先留着", exact: true }).click();
  expect((await readData(page)).customActions[0].archived).not.toBe(true);
  await planner.getByRole("button", { name: "归档小行动：听一首熟悉的歌", exact: true }).click();
  await confirmation.getByRole("button", { name: "确认归档", exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  data = await readData(page);
  expect(data.customActions[0]).toMatchObject({ id, title: "听一首熟悉的歌", archived: true });
  expect(data.plannedActions).toEqual([]);
  expect(data.actions["2026-10-22"]).toEqual([id]);
  await expect(planner.locator(".planner-history")).toContainText("听一首熟悉的歌");
  await planner.getByRole("button", { name: /已归档的小行动/ }).click();
  await planner.getByRole("button", { name: "恢复小行动：听一首熟悉的歌", exact: true }).click();
  await expect(planner.getByRole("button", { name: "加入计划：听一首熟悉的歌", exact: true })).toBeVisible();
  expect((await readData(page)).plannedActions).toEqual([]);
  await page.reload();
  await openPlanner(page);
  await expect(planner.locator(".planner-history")).toContainText("听一首熟悉的歌");
});

test("未保存离开有确认，配额失败不丢草稿，归档失败不丢历史", async ({ page }) => {
  await page.goto("/");
  const planner = await openPlanner(page);
  await planner.getByRole("button", { name: "写一个自己的小行动", exact: true }).click();
  const title = planner.getByLabel(/这件小事叫什么/);
  await title.fill("把窗帘拉开一点");
  await planner.getByRole("button", { name: "关闭", exact: true }).click();
  const discard = page.getByRole("alertdialog", { name: "这件小行动还没有保存", exact: true });
  await discard.getByRole("button", { name: "继续编辑", exact: true }).click();
  await page.evaluate(() => {
    (window as unknown as { originalSetItem: typeof Storage.prototype.setItem }).originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException("quota", "QuotaExceededError"); };
  });
  await planner.getByRole("button", { name: "保存并加入计划", exact: true }).click();
  await expect(planner.getByRole("alert")).toContainText("暂时没有保存成功");
  await expect(title).toHaveValue("把窗帘拉开一点");
  expect(await readData(page)).toBeNull();
  await page.evaluate(() => {
    Storage.prototype.setItem = (window as unknown as { originalSetItem: typeof Storage.prototype.setItem }).originalSetItem;
  });
  await planner.getByRole("button", { name: "保存并加入计划", exact: true }).click();
  await expect(planner.locator(".planner-editor")).toHaveCount(0);
  const before = await readData(page);
  await planner.getByRole("button", { name: "归档小行动：把窗帘拉开一点", exact: true }).click();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new DOMException("quota", "QuotaExceededError"); };
  });
  const archive = page.getByRole("alertdialog", { name: "先把这件小事收起来吗？", exact: true });
  await archive.getByRole("button", { name: "确认归档", exact: true }).click();
  await expect(archive.getByRole("alert")).toContainText("暂时没有保存成功");
  expect(await readData(page)).toEqual(before);
});

test("等待写锁时只保存一次且不会关闭仍在保存的编辑器", async ({ page }) => {
  await page.goto("/");
  const planner = await openPlanner(page);
  await planner.getByRole("button", { name: "写一个自己的小行动", exact: true }).click();
  await planner.getByLabel(/这件小事叫什么/).fill("去阳台站一分钟");
  await page.evaluate(() => {
    const state = window as unknown as { releaseActionLock?: () => void; actionLockHeld?: boolean };
    void navigator.locks.request("huanhuan-private-write", () => new Promise<void>((resolve) => {
      state.releaseActionLock = resolve;
      state.actionLockHeld = true;
    }));
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as { actionLockHeld?: boolean }).actionLockHeld)).toBe(true);
  const save = planner.getByRole("button", { name: "保存并加入计划", exact: true });
  await save.click();
  await expect(save).toBeDisabled();
  await expect(planner.getByLabel(/这件小事叫什么/)).toBeDisabled();
  await page.keyboard.press("Escape");
  await planner.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(planner).toBeVisible();
  expect(await readData(page)).toBeNull();
  await page.evaluate(() => (window as unknown as { releaseActionLock: () => void }).releaseActionLock());
  await expect(planner.locator(".planner-editor")).toHaveCount(0);
  const data = await readData(page);
  expect(data.customActions).toHaveLength(1);
  expect(data.plannedActions).toEqual([data.customActions[0].id]);
});

test("另一窗口修改小行动后保存不会覆盖新版本", async ({ page, context }) => {
  await page.goto("/");
  const planner = await openPlanner(page);
  await createAction(page, "整理桌上的一个角落");
  await planner.getByRole("button", { name: "编辑小行动：整理桌上的一个角落", exact: true }).click();
  await planner.getByLabel(/这件小事叫什么/).fill("第一个窗口还在修改");
  const other = await context.newPage();
  await other.goto("/");
  const otherPlanner = await openPlanner(other);
  await otherPlanner.getByRole("button", { name: "挑选我的小行动", exact: true }).click();
  await otherPlanner.getByRole("button", { name: "编辑小行动：整理桌上的一个角落", exact: true }).click();
  await otherPlanner.getByLabel(/这件小事叫什么/).fill("第二个窗口先收好了");
  await otherPlanner.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(otherPlanner.locator(".planner-editor")).toHaveCount(0);
  await planner.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(planner.getByRole("alert")).toContainText("已在另一个窗口改变");
  await expect(planner.getByLabel(/这件小事叫什么/)).toHaveValue("第一个窗口还在修改");
  expect((await readData(page)).customActions[0].title).toBe("第二个窗口先收好了");
});

test("计划跨天保留，午夜后的完成属于新的一天，320px仍能操作", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.clock.setFixedTime(new Date("2026-10-22T23:59:59+08:00"));
  await page.goto("/");
  const planner = await openPlanner(page);
  await createAction(page, "留给自己一个很长很长但仍然可行的小小提醒".repeat(2));
  let data = await readData(page);
  const action = data.customActions[0];
  await page.clock.setFixedTime(new Date("2026-10-23T00:00:01+08:00"));
  await planner.getByRole("button", { name: `完成：${action.title}`, exact: true }).click();
  await expect(planner.getByRole("button", { name: `取消完成：${action.title}`, exact: true })).toHaveAttribute("aria-pressed", "true");
  data = await readData(page);
  expect(data.plannedActions).toEqual([action.id]);
  expect(data.actions["2026-10-23"]).toEqual([action.id]);
  expect(data.actions["2026-10-22"]).toBeUndefined();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect.poll(() => planner.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test("两个窗口同时添加最后一个空位时仍遵守20项上限", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate((key) => {
    localStorage.setItem(key, JSON.stringify({
      version: 2, moods: [], letters: [], actions: {}, reliefSessions: 0,
      reliefHistory: [], plannedActions: [],
      customActions: Array.from({ length: 19 }, (_, index) => ({
        id: `custom-${index}`, title: `已有的小事 ${index + 1}`, createdAt: "2026-10-22T00:00:00.000Z",
      })),
    }));
  }, storageKey);
  await page.reload();
  const other = await context.newPage();
  await other.goto("/");
  const first = await openPlanner(page);
  const second = await openPlanner(other);
  await first.getByRole("button", { name: "写一个自己的小行动", exact: true }).click();
  await second.getByRole("button", { name: "写一个自己的小行动", exact: true }).click();
  await first.getByLabel(/这件小事叫什么/).fill("第一个窗口的小事");
  await second.getByLabel(/这件小事叫什么/).fill("第二个窗口的小事");
  await Promise.all([
    first.getByRole("button", { name: "保存并加入计划", exact: true }).click(),
    second.getByRole("button", { name: "保存并加入计划", exact: true }).click(),
  ]);
  await expect.poll(async () => (await readData(page)).customActions.length).toBe(20);
  await expect.poll(async () => (await first.locator(".planner-editor").count()) + (await second.locator(".planner-editor").count())).toBe(1);
  const unsuccessful = (await first.locator(".planner-editor").count()) ? first : second;
  await expect(unsuccessful.getByRole("alert")).toContainText("20 件自定义小行动");
  await expect(unsuccessful.getByLabel(/这件小事叫什么/)).not.toHaveValue("");
  expect((await readData(page)).plannedActions).toHaveLength(1);
});

test("归档后新增同名行动，恢复旧项会说明冲突并保留历史", async ({ page }) => {
  await page.goto("/");
  const planner = await openPlanner(page);
  await createAction(page, "给植物浇一点水");
  await planner.getByRole("button", { name: "完成：给植物浇一点水", exact: true }).click();
  await planner.getByRole("button", { name: "归档小行动：给植物浇一点水", exact: true }).click();
  await planner.getByRole("button", { name: "确认归档", exact: true }).click();
  await expect(planner.getByRole("alertdialog")).toHaveCount(0);
  const original = (await readData(page)).customActions[0];
  await createAction(page, "给植物浇一点水");
  await planner.getByRole("button", { name: /已归档的小行动/ }).click();
  await planner.getByRole("button", { name: "恢复小行动：给植物浇一点水", exact: true }).click();
  await expect(planner.getByRole("alert")).toContainText("已有同名的小行动");
  const data = await readData(page);
  expect(data.customActions.find((action: { id: string }) => action.id === original.id).archived).toBe(true);
  expect(Object.values(data.actions).flat()).toContain(original.id);
  expect(data.customActions.filter((action: { archived?: boolean }) => !action.archived)).toHaveLength(1);
});
