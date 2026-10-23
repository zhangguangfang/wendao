import { expect, test, type Page } from "@playwright/test";

const key = "huanhuan.private.v1";
const today = "2026-10-22";

function fixture() {
  return {
    version: 1,
    moods: [
      { id: "today", value: 2, createdAt: "2026-10-22T08:00:00.000Z" },
      { id: "earlier", value: 3, createdAt: "2026-10-12T08:00:00.000Z" },
      { id: "older", value: 4, createdAt: "2026-08-12T08:00:00.000Z" },
    ],
    letters: [],
    actions: {},
    reliefSessions: 2,
  };
}

async function seed(page: Page, data = fixture()) {
  await page.clock.setFixedTime(new Date("2026-10-22T12:00:00.000Z"));
  await page.addInitScript(({ storageKey, initial }) => {
    if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(initial));
  }, { storageKey: key, initial: data });
  await page.goto("/");
}

async function openJournal(page: Page) {
  await page.getByRole("navigation", { name: "主要导航" }).getByRole("button", { name: "心情足迹", exact: true }).click();
  return page.getByRole("dialog", { name: "我的心情足迹", exact: true });
}

async function stored(page: Page) {
  return page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)!), key);
}

test("按时间回看心情，历史备注与标签保存后仍属于原来的日期", async ({ page }) => {
  await seed(page);
  const journal = await openJournal(page);
  await expect(journal.locator(".history-item")).toHaveCount(1);
  await expect(journal.locator(".mj-summary")).toContainText("1 天记录");
  await journal.getByRole("button", { name: "最近 30 天", exact: true }).click();
  await expect(journal.locator(".history-item")).toHaveCount(2);
  await journal.getByRole("button", { name: "全部记录", exact: true }).click();
  await expect(journal.locator(".history-item")).toHaveCount(3);
  await journal.getByRole("button", { name: "编辑2026-10-12的心情记录", exact: true }).click();
  await journal.getByLabel("想记下的话（选填）", { exact: true }).fill("有人陪我走了一小段路，心里安稳了一点。");
  await journal.getByRole("button", { name: "安心", exact: true }).click();
  await journal.getByRole("button", { name: "感激", exact: true }).click();
  await journal.getByRole("button", { name: "期待", exact: true }).click();
  await expect(journal.getByRole("button", { name: "疲惫", exact: true })).toBeDisabled();
  await journal.getByRole("button", { name: "保存这段心情", exact: true }).click();
  await expect(journal.getByText("这段心情已经收好。", { exact: true })).toBeVisible();

  const saved = await stored(page);
  expect(saved.moods).toHaveLength(3);
  expect(saved.moods.find((mood: { id: string }) => mood.id === "earlier")).toMatchObject({
    id: "earlier", day: "2026-10-12", value: 3, createdAt: "2026-10-12T08:00:00.000Z",
    note: "有人陪我走了一小段路，心里安稳了一点。", tags: ["安心", "感激", "期待"],
  });

  await page.reload();
  await openJournal(page);
  await journal.getByRole("button", { name: "最近 30 天", exact: true }).click();
  await journal.getByRole("button", { name: "编辑2026-10-12的心情记录", exact: true }).click();
  await expect(journal.getByLabel("想记下的话（选填）", { exact: true })).toHaveValue("有人陪我走了一小段路，心里安稳了一点。");
  await expect(journal.getByRole("button", { name: "安心", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("首页再次选择心情保留当天补充的文字和感受标签", async ({ page }) => {
  await seed(page);
  const journal = await openJournal(page);
  await journal.getByRole("button", { name: `编辑${today}的心情记录`, exact: true }).click();
  await journal.getByLabel("想记下的话（选填）").fill("早上很想念对方，先照顾好自己。");
  await journal.getByRole("button", { name: "想念", exact: true }).click();
  await journal.getByRole("button", { name: "保存这段心情", exact: true }).click();
  await journal.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "有点晴朗", exact: true }).click();
  const record = (await stored(page)).moods.find((mood: { day: string }) => mood.day === today);
  expect(record).toMatchObject({ value: 4, note: "早上很想念对方，先照顾好自己。", tags: ["想念"] });
  await openJournal(page);
  await expect(journal.locator(".history-item")).toHaveCount(1);
  await expect(journal.getByText("早上很想念对方，先照顾好自己。", { exact: true })).toBeVisible();
});

test("离开未保存的备注需要确认，写入失败与删除失败保留内容", async ({ page }) => {
  await seed(page);
  const journal = await openJournal(page);
  await journal.getByRole("button", { name: `编辑${today}的心情记录`, exact: true }).click();
  const note = journal.getByLabel("想记下的话（选填）");
  await note.fill("这段文字还没有收好。");
  await journal.getByRole("button", { name: "关闭", exact: true }).click();
  const discard = page.getByRole("alertdialog", { name: "这些修改还没有收好", exact: true });
  await expect(discard).toBeVisible();
  await discard.getByRole("button", { name: "继续编辑", exact: true }).click();
  await expect(note).toHaveValue("这段文字还没有收好。");
  const before = await stored(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new DOMException("Test quota", "QuotaExceededError"); };
  });
  await journal.getByRole("button", { name: "保存这段心情", exact: true }).click();
  await expect(journal.getByRole("alert")).toContainText("这次还没有保存成功");
  await expect(note).toHaveValue("这段文字还没有收好。");
  expect(await stored(page)).toEqual(before);

  await journal.getByRole("button", { name: `删除${today}的心情记录`, exact: true }).click();
  const deletion = page.getByRole("alertdialog", { name: "要删除这条心情记录吗？", exact: true });
  await deletion.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(deletion.getByRole("alert")).toContainText("暂时无法删除");
  expect(await stored(page)).toEqual(before);
  await deletion.getByRole("button", { name: "保留记录", exact: true }).click();
  await expect(note).toHaveValue("这段文字还没有收好。");
  await page.keyboard.press("Escape");
  await expect(discard).toBeVisible();
  await discard.getByRole("button", { name: "放弃修改", exact: true }).click();
  await expect(journal).toHaveCount(0);
});

test("另一个窗口更新记录时不会覆盖草稿，载入最新内容需要确认", async ({ page, context }) => {
  await seed(page);
  const journal = await openJournal(page);
  await journal.getByRole("button", { name: `编辑${today}的心情记录`, exact: true }).click();
  await journal.getByLabel("想记下的话（选填）").fill("窗口一还在写的文字。");
  const other = await context.newPage();
  await other.goto("/");
  await other.evaluate((storageKey) => {
    const value = JSON.parse(localStorage.getItem(storageKey)!);
    value.moods.find((mood: { id: string }) => mood.id === "today").note = "窗口二已经保存的文字。";
    localStorage.setItem(storageKey, JSON.stringify(value));
  }, key);
  await expect(journal.locator(".mj-conflict")).toContainText("已在另一个窗口中修改");
  await expect(journal.getByLabel("想记下的话（选填）")).toHaveValue("窗口一还在写的文字。");
  await expect(journal.getByRole("button", { name: "保存这段心情", exact: true })).toBeDisabled();
  await journal.getByRole("button", { name: "载入最新记录", exact: true }).click();
  const discard = page.getByRole("alertdialog", { name: "这些修改还没有收好", exact: true });
  await discard.getByRole("button", { name: "继续编辑", exact: true }).click();
  await expect(journal.getByLabel("想记下的话（选填）")).toHaveValue("窗口一还在写的文字。");
  await journal.getByRole("button", { name: "载入最新记录", exact: true }).click();
  await discard.getByRole("button", { name: "放弃修改", exact: true }).click();
  await expect(journal.getByLabel("想记下的话（选填）")).toHaveValue("窗口二已经保存的文字。");
  await other.close();
});

test("窄屏可编辑与删除心情，确认前记录不丢失且键盘留在窗口内", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await seed(page);
  const journal = await openJournal(page);
  await journal.getByRole("button", { name: "最近 30 天", exact: true }).click();
  await journal.getByRole("button", { name: `编辑${today}的心情记录`, exact: true }).click();
  await journal.getByLabel("想记下的话（选填）").fill("给自己留一点时间。".repeat(40));
  await expect(journal.getByLabel("想记下的话（选填）")).toHaveAttribute("maxlength", "500");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await journal.getByRole("button", { name: "保存这段心情", exact: true }).click();
  await journal.getByRole("button", { name: `删除${today}的心情记录`, exact: true }).click();
  const confirmation = page.getByRole("alertdialog", { name: "要删除这条心情记录吗？", exact: true });
  expect((await stored(page)).moods).toHaveLength(3);
  for (const direction of ["Tab", "Shift+Tab"]) {
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press(direction);
      await expect.poll(() => confirmation.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    }
  }
  await confirmation.getByRole("button", { name: "保留记录", exact: true }).click();
  expect((await stored(page)).moods).toHaveLength(3);
  await journal.getByRole("button", { name: `删除${today}的心情记录`, exact: true }).click();
  await confirmation.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  expect((await stored(page)).moods).toHaveLength(2);
  await expect(journal.getByRole("button", { name: `编辑${today}的心情记录`, exact: true })).toHaveCount(0);
});


async function holdWriteLock(page: Page) {
  await page.evaluate(() => {
    const controls = window as typeof window & { releaseMoodLock?: () => void; moodLockHeld?: boolean };
    controls.moodLockHeld = false;
    void navigator.locks.request("huanhuan-private-write", async () => {
      controls.moodLockHeld = true;
      await new Promise<void>((resolve) => { controls.releaseMoodLock = resolve; });
    });
  });
  await expect.poll(() => page.evaluate(() => (window as typeof window & { moodLockHeld?: boolean }).moodLockHeld)).toBe(true);
}

async function releaseWriteLock(page: Page) {
  await page.evaluate(() => (window as typeof window & { releaseMoodLock?: () => void }).releaseMoodLock?.());
}

test("排队保存期间不能重复操作、切换记录或关闭窗口", async ({ page }) => {
  await seed(page);
  const journal = await openJournal(page);
  await journal.getByRole("button", { name: `编辑${today}的心情记录`, exact: true }).click();
  const note = journal.getByLabel("想记下的话（选填）");
  await note.fill("这段心情正在等待妥善保存。");
  await holdWriteLock(page);
  await journal.getByRole("button", { name: "保存这段心情", exact: true }).click();
  await expect(journal.getByRole("button", { name: "正在收好…", exact: true })).toBeDisabled();
  await expect(note).toHaveAttribute("readonly", "");
  await expect(journal.getByRole("button", { name: "最近 30 天", exact: true })).toBeDisabled();
  await expect(journal.getByRole("button", { name: "关闭", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(journal).toBeVisible();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await releaseWriteLock(page);
  await expect(journal.getByText("这段心情已经收好。", { exact: true })).toBeVisible();
  expect((await stored(page)).moods.find((mood: { id: string }) => mood.id === "today").note).toBe("这段心情正在等待妥善保存。");
});

test("等待写锁时另一窗口改动心情，不会用旧草稿覆盖最新记录", async ({ page, context }) => {
  await seed(page);
  const journal = await openJournal(page);
  await journal.getByRole("button", { name: `编辑${today}的心情记录`, exact: true }).click();
  await journal.getByLabel("想记下的话（选填）").fill("我在等待写入的草稿。");
  await holdWriteLock(page);
  await journal.getByRole("button", { name: "保存这段心情", exact: true }).click();
  await expect(journal.getByRole("button", { name: "正在收好…", exact: true })).toBeDisabled();
  const other = await context.newPage();
  await other.goto("/");
  await other.evaluate((storageKey) => {
    const data = JSON.parse(localStorage.getItem(storageKey)!);
    data.moods.find((mood: { id: string }) => mood.id === "today").note = "另一窗口先保存的新内容。";
    localStorage.setItem(storageKey, JSON.stringify(data));
  }, key);
  await releaseWriteLock(page);
  await expect(journal.locator(".mj-error")).toContainText("这次还没有保存成功");
  await expect(journal.getByLabel("想记下的话（选填）")).toHaveValue("我在等待写入的草稿。");
  expect((await stored(page)).moods.find((mood: { id: string }) => mood.id === "today").note).toBe("另一窗口先保存的新内容。");
  await other.close();
});

test("删除确认期间记录被另一窗口修改时，保留最新内容并要求重新确认", async ({ page, context }) => {
  await seed(page);
  const journal = await openJournal(page);
  await journal.getByRole("button", { name: `删除${today}的心情记录`, exact: true }).click();
  const confirmation = page.getByRole("alertdialog", { name: "要删除这条心情记录吗？", exact: true });
  const other = await context.newPage();
  await other.goto("/");
  await other.evaluate((storageKey) => {
    const data = JSON.parse(localStorage.getItem(storageKey)!);
    data.moods.find((mood: { id: string }) => mood.id === "today").note = "确认期间新保存的重要文字。";
    localStorage.setItem(storageKey, JSON.stringify(data));
  }, key);
  await confirmation.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(confirmation.getByRole("alert")).toContainText("暂时无法删除");
  expect((await stored(page)).moods.find((mood: { id: string }) => mood.id === "today").note).toBe("确认期间新保存的重要文字。");
  await confirmation.getByRole("button", { name: "保留记录", exact: true }).click();
  await expect(journal.getByText("确认期间新保存的重要文字。", { exact: true })).toBeVisible();
  await other.close();
});

test("没有心情数据时保留空白，不生成示例记录", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto("/");
  const journal = await openJournal(page);
  await expect(journal.getByText("你的故事，可以从今天开始。", { exact: true })).toBeVisible();
  await expect(journal.locator(".history-item")).toHaveCount(0);
  await expect(journal.locator(".mj-summary")).toContainText("0 天记录");
  await journal.getByRole("button", { name: "最近 30 天", exact: true }).click();
  await expect(journal.locator(".mj-day.is-empty")).toHaveCount(30);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBeNull();
});


test("旧备份同一天有两条记录时列表全部保留，日历显示较晚的一条", async ({ page }) => {
  const initial = fixture();
  initial.moods.push({ id: "same-day-later", value: 4, createdAt: "2026-10-22T10:00:00.000Z" });
  await seed(page, initial);
  const journal = await openJournal(page);
  await expect(journal.locator(".history-item")).toHaveCount(2);
  await expect(journal.locator(".mj-summary")).toContainText("1 天记录");
  await journal.getByRole("button", { name: /有点晴朗，查看记录/ }).click();
  await journal.getByLabel("想记下的话（选填）").fill("为较晚的一条补充文字。");
  await journal.getByRole("button", { name: "保存这段心情", exact: true }).click();
  await expect(journal.getByText("这段心情已经收好。", { exact: true })).toBeVisible();
  const records = (await stored(page)).moods;
  expect(records).toHaveLength(4);
  expect(records.find((mood: { id: string }) => mood.id === "same-day-later").note).toBe("为较晚的一条补充文字。");
  expect(records.find((mood: { id: string }) => mood.id === "today").value).toBe(2);
});
