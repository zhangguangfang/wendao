import { expect, test, type Page } from "@playwright/test";

const key = "huanhuan.private.v1";
const firstLetter = {
  id: "letter-first",
  title: "给今天的自己",
  body: "今天想去公园走走。",
  createdAt: "2026-10-19T08:00:00.000Z",
  updatedAt: "2026-10-21T08:00:00.000Z",
  favorite: false,
};

async function seed(page: Page, letters = [firstLetter]) {
  await page.goto("/");
  await page.evaluate(({ storageKey, records }) => {
    localStorage.setItem(storageKey, JSON.stringify({
      version: 1, moods: [], letters: records, actions: {}, reliefSessions: 0,
    }));
  }, { storageKey: key, records: letters });
  await page.reload();
}

async function openLetters(page: Page) {
  await page.getByRole("navigation", { name: "主要导航" })
    .getByRole("button", { name: /^不寄出的信/ }).click();
  return page.getByRole("dialog", { name: "不寄出的信", exact: true });
}

async function savedLetters(page: Page) {
  return page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)!).letters, key);
}

async function holdWriteLock(page: Page) {
  await page.evaluate(() => new Promise<void>((acquired) => {
    void navigator.locks.request("huanhuan-private-write", () => new Promise<void>((release) => {
      (window as Window & { releaseLetterTestLock?: () => void }).releaseLetterTestLock = release;
      acquired();
    }));
  }));
}

async function releaseWriteLock(page: Page) {
  await page.evaluate(() => {
    (window as Window & { releaseLetterTestLock?: () => void }).releaseLetterTestLock?.();
  });
}

test("信箱按编辑时间整理，可搜索正文、筛选收藏并保存收藏状态", async ({ page }) => {
  await seed(page, [firstLetter, {
    ...firstLetter, id: "letter-second", title: "留给明天的话", body: "记得吃一顿热饭。",
    createdAt: "2026-10-20T08:00:00.000Z", updatedAt: "2026-10-20T08:00:00.000Z", favorite: true,
  }]);
  const editor = await openLetters(page);
  await expect(editor.locator(".letter-list-item-title")).toHaveText(["给今天的自己", "留给明天的话"]);
  await editor.getByLabel("搜索标题或正文").fill("热饭");
  await expect(editor.locator(".letter-list-item-title")).toHaveText(["留给明天的话"]);
  await editor.getByLabel("搜索标题或正文").fill("不存在的内容");
  await expect(editor.getByText("没有找到这封信，试试别的词。")).toBeVisible();
  await editor.getByRole("button", { name: "查看全部信件" }).click();
  await editor.getByRole("button", { name: "只看收藏", exact: true }).click();
  await expect(editor.locator(".letter-list-item-title")).toHaveText(["留给明天的话"]);
  await editor.getByRole("button", { name: "只看收藏", exact: true }).click();
  await editor.getByRole("button", { name: /^给今天的自己/ }).click();
  await editor.getByRole("button", { name: "收藏这封信", exact: true }).click();
  await expect(editor.getByText("收藏状态会随这次修改一起保存。")).toBeVisible();
  await editor.getByRole("button", { name: "收好这封信", exact: true }).click();
  await expect(editor.getByRole("button", { name: "已经收好", exact: true })).toBeDisabled();
  const stored = await savedLetters(page);
  const changed = stored.find((letter: { id: string }) => letter.id === firstLetter.id);
  expect(changed.favorite).toBe(true);
  expect(changed.createdAt).toBe(firstLetter.createdAt);
  expect(Date.parse(changed.updatedAt)).toBeGreaterThan(Date.parse(firstLetter.updatedAt));
  await page.reload();
  const reopened = await openLetters(page);
  await reopened.getByRole("button", { name: "只看收藏", exact: true }).click();
  await expect(reopened.locator(".letter-list-item")).toHaveCount(2);
});

test("主题引导只追加正文，保留选中的文字并在字数不足时说明原因", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  const editor = await openLetters(page);
  const body = editor.getByLabel("信的正文", { exact: true });
  await body.fill("这些话是我自己写的，请保留。");
  await body.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(0, element.value.length));
  await editor.getByLabel("想从哪里写起").selectOption("boundaries");
  await expect(body).toHaveValue("这些话是我自己写的，请保留。");
  await editor.getByRole("button", { name: "我的界限", exact: false }).click();
  await expect(body).toHaveValue("这些话是我自己写的，请保留。\n\n为了照顾自己，目前我不愿意接受的是：\n");
  const longBody = "字".repeat(7999);
  await body.fill(longBody);
  await editor.getByRole("button", { name: "我的界限", exact: false }).click();
  await expect(editor.getByRole("status")).toHaveText("剩余字数放不下这条提示，你的正文没有改变。");
  await expect(body).toHaveValue(longBody);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await editor.getByRole("button", { name: "关闭写信窗口" }).click();
  const confirmation = page.getByRole("alertdialog", { name: "这封信还没有收好" });
  for (let index = 0; index < 5; index += 1) {
    await page.keyboard.press("Tab");
    expect(await confirmation.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await confirmation.getByRole("button", { name: "继续写信" }).click();
  await expect(body).toHaveValue(longBody);
});

test("另一个窗口修改信件时保留两份内容，不能静默覆盖", async ({ page, context }) => {
  await seed(page);
  const editor = await openLetters(page);
  await editor.getByRole("button", { name: /^给今天的自己/ }).click();
  await editor.getByLabel("信的正文").fill("这个窗口尚未保存的文字。");
  const otherPage = await context.newPage();
  await otherPage.goto("/");
  const otherEditor = await openLetters(otherPage);
  await otherEditor.getByRole("button", { name: /^给今天的自己/ }).click();
  await otherEditor.getByLabel("信的正文").fill("另一个窗口已经收好的文字。");
  await otherEditor.getByRole("button", { name: "收好这封信", exact: true }).click();
  await expect(editor.getByText(/这封信在另一个窗口中有了修改/)).toBeVisible();
  await expect(editor.getByLabel("信的正文")).toHaveValue("这个窗口尚未保存的文字。");
  await editor.getByRole("button", { name: "收好这封信", exact: true }).click();
  const conflict = page.getByRole("alertdialog", { name: "这封信在别处有了变化" });
  await expect(conflict).toBeVisible();
  expect((await savedLetters(page))).toHaveLength(1);
  await conflict.getByRole("button", { name: "另存为新信", exact: true }).click();
  await expect(editor.getByRole("button", { name: "已经收好", exact: true })).toBeDisabled();
  const stored = await savedLetters(page);
  expect(stored).toHaveLength(2);
  expect(stored.find((letter: { id: string }) => letter.id === firstLetter.id).body).toBe("另一个窗口已经收好的文字。");
  expect(stored.find((letter: { id: string }) => letter.id !== firstLetter.id).body).toBe("这个窗口尚未保存的文字。");
  await expect(editor.getByRole("status")).toHaveText("已经保存在此浏览器。愿此刻的你，能轻松一点。");
  await otherPage.close();
});

test("在别处删除的信不会被原编辑页复活，草稿可明确另存", async ({ page, context }) => {
  await seed(page);
  const editor = await openLetters(page);
  await editor.getByRole("button", { name: /^给今天的自己/ }).click();
  await editor.getByLabel("信的正文").fill("这份草稿还想留住。");
  const otherPage = await context.newPage();
  await otherPage.goto("/");
  const otherEditor = await openLetters(otherPage);
  await otherEditor.getByRole("button", { name: /^给今天的自己/ }).click();
  await otherEditor.getByRole("button", { name: "删除这封信", exact: true }).click();
  await otherPage.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(editor.getByText(/这封信已在另一个窗口中被删除/)).toBeVisible();
  await editor.getByRole("button", { name: "收好这封信", exact: true }).click();
  const conflict = page.getByRole("alertdialog", { name: "这封信在别处有了变化" });
  await conflict.getByRole("button", { name: "继续保留草稿" }).click();
  await expect(editor.getByLabel("信的正文")).toHaveValue("这份草稿还想留住。");
  expect(await savedLetters(page)).toHaveLength(0);
  await editor.getByRole("button", { name: "收好这封信", exact: true }).click();
  await conflict.getByRole("button", { name: "另存为新信", exact: true }).click();
  await expect(editor.getByRole("button", { name: "已经收好", exact: true })).toBeDisabled();
  const stored = await savedLetters(page);
  expect(stored).toHaveLength(1);
  expect(stored[0].id).not.toBe(firstLetter.id);
  expect(stored[0].body).toBe("这份草稿还想留住。");
  await otherPage.close();
});

test("含时区偏移的导入信件按真实编辑时刻排序", async ({ page }) => {
  await seed(page, [
    { ...firstLetter, updatedAt: "2026-10-21T09:00:00+08:00" },
    { ...firstLetter, id: "later-letter", title: "实际更晚的信", updatedAt: "2026-10-21T02:00:00Z" },
  ]);
  const editor = await openLetters(page);
  await expect(editor.locator(".letter-list-item-title")).toHaveText(["实际更晚的信", "给今天的自己"]);
});

test("等待写锁时保留编辑页并阻止关闭、重复保存和删除确认切换", async ({ page, context }) => {
  await seed(page);
  const editor = await openLetters(page);
  await editor.getByRole("button", { name: /^给今天的自己/ }).click();
  await editor.getByLabel("信的正文").fill("等待另一个窗口保存后，这些文字也要留下。");
  const lockOwner = await context.newPage();
  await lockOwner.goto("/");
  await holdWriteLock(lockOwner);
  await editor.getByRole("button", { name: "收好这封信", exact: true }).click();
  await expect(editor).toHaveAttribute("aria-busy", "true");
  await expect(editor.getByLabel("信的正文")).toBeDisabled();
  await expect(editor.getByRole("button", { name: "关闭写信窗口", exact: true })).toBeDisabled();
  await expect(editor.getByRole("button", { name: "写一封新的信", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "正在收好…", exact: true }).evaluate((button: HTMLButtonElement) => button.click());
  expect((await savedLetters(page))[0].body).toBe(firstLetter.body);
  await releaseWriteLock(lockOwner);
  await expect(editor.getByRole("button", { name: "已经收好", exact: true })).toBeDisabled();
  expect(await savedLetters(page)).toHaveLength(1);
  expect((await savedLetters(page))[0].body).toBe("等待另一个窗口保存后，这些文字也要留下。");

  await editor.getByRole("button", { name: "删除这封信", exact: true }).click();
  const confirmation = page.getByRole("alertdialog", { name: "要放下这封信吗？" });
  await holdWriteLock(lockOwner);
  await confirmation.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(confirmation).toHaveAttribute("aria-busy", "true");
  await expect(confirmation.getByRole("button", { name: "先留着", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(confirmation).toBeVisible();
  await releaseWriteLock(lockOwner);
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("信的正文")).toHaveValue("");
  expect(await savedLetters(page)).toHaveLength(0);
  await lockOwner.close();
});

test("排队之后收到的信件更新也不能被旧草稿覆盖", async ({ page, context }) => {
  await seed(page);
  const editor = await openLetters(page);
  await editor.getByRole("button", { name: /^给今天的自己/ }).click();
  await editor.getByLabel("信的正文").fill("我在排队前写下的草稿。");
  const lockOwner = await context.newPage();
  await lockOwner.goto("/");
  await holdWriteLock(lockOwner);
  await editor.getByRole("button", { name: "收好这封信", exact: true }).click();
  await expect(editor).toHaveAttribute("aria-busy", "true");
  // Simulate another compliant writer updating the record while it owns the lock.
  await lockOwner.evaluate((storageKey) => {
    const data = JSON.parse(localStorage.getItem(storageKey)!);
    data.letters[0].body = "持有写锁的窗口刚刚保存的新版本。";
    data.letters[0].updatedAt = new Date().toISOString();
    localStorage.setItem(storageKey, JSON.stringify(data));
  }, key);
  await releaseWriteLock(lockOwner);
  await expect(editor).toHaveAttribute("aria-busy", "false");
  await expect(editor.getByRole("alert")).toContainText("这次没能保存");
  await expect(editor.getByLabel("信的正文")).toHaveValue("我在排队前写下的草稿。");
  expect((await savedLetters(page))[0].body).toBe("持有写锁的窗口刚刚保存的新版本。");
  await editor.getByRole("button", { name: "收好这封信", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "这封信在别处有了变化" })).toBeVisible();
  await lockOwner.close();
});

test("删除确认期间的外部更新受到保护，可显式载入最新版本", async ({ page, context }) => {
  await seed(page);
  const editor = await openLetters(page);
  await editor.getByRole("button", { name: /^给今天的自己/ }).click();
  await editor.getByRole("button", { name: "删除这封信", exact: true }).click();
  const otherPage = await context.newPage();
  await otherPage.goto("/");
  const otherEditor = await openLetters(otherPage);
  await otherEditor.getByRole("button", { name: /^给今天的自己/ }).click();
  await otherEditor.getByLabel("信的正文").fill("确认框出现之后的新内容。");
  await otherEditor.getByRole("button", { name: "收好这封信", exact: true }).click();
  await expect.poll(async () => (await savedLetters(page))[0].body).toBe("确认框出现之后的新内容。");
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  const conflict = page.getByRole("alertdialog", { name: "这封信在别处有了变化" });
  await expect(conflict).toBeVisible();
  expect(await savedLetters(page)).toHaveLength(1);
  await conflict.getByRole("button", { name: "载入最新版本" }).click();
  await expect(editor.getByLabel("信的正文")).toHaveValue("确认框出现之后的新内容。");
  await editor.getByRole("button", { name: "关闭写信窗口" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await otherPage.close();
});
