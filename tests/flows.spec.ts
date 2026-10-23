import { expect, test, type Page } from "@playwright/test";

const STORAGE_KEY = "huanhuan.private.v1";

type SavedData = {
  moods: { value: number }[];
  letters: { id: string; title: string; body: string }[];
  actions: Record<string, string[]>;
  reliefSessions: number;
};

async function readSavedData(page: Page): Promise<SavedData | null> {
  return page.evaluate((key) => {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  }, STORAGE_KEY);
}

function navigation(page: Page) {
  return page.getByRole("navigation", { name: "主要导航" });
}

async function openLetters(page: Page) {
  await navigation(page)
    .getByRole("button", { name: /^不寄出的信/ })
    .click();
  return page.getByRole("dialog", { name: "不寄出的信", exact: true });
}

test("心情更新、足迹与小行动真实保存，并在刷新后恢复", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "慢一点，也没关系。",
  );
  await page.getByRole("button", { name: "有点低落", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "有点低落", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "还算平静", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "还算平静", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  const water = page.getByRole("button", { name: /慢慢喝一杯温水/ });
  await water.click();
  await expect(water).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByText("今天，你已为自己做了 1 件小事。", { exact: true }),
  ).toBeVisible();

  const saved = await readSavedData(page);
  expect(saved?.moods).toHaveLength(1);
  expect(saved?.moods[0].value).toBe(3);
  expect(Object.values(saved?.actions ?? {}).flat()).toEqual(["water"]);

  await page.reload();
  await expect(
    page.getByRole("button", { name: "还算平静", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(water).toHaveAttribute("aria-pressed", "true");
  await navigation(page)
    .getByRole("button", { name: "心情足迹", exact: true })
    .click();
  const history = page.getByRole("dialog", {
    name: "我的心情足迹",
    exact: true,
  });
  await expect(history).toBeVisible();
  await expect(history.locator(".history-item")).toHaveCount(1);
  await expect(history.getByText("还算平静", { exact: true })).toBeVisible();
  await history.getByRole("button", { name: "关闭", exact: true }).click();

  await water.click();
  await expect(water).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await expect(water).toHaveAttribute("aria-pressed", "false");
  expect(
    Object.values((await readSavedData(page))?.actions ?? {}).flat(),
  ).toEqual([]);
});

test("信件创建、持久化、编辑与删除，并保护尚未保存的内容", async ({ page }) => {
  await page.goto("/");
  let editor = await openLetters(page);
  await editor.getByLabel(/给这封信一个名字/).fill("写给今天的自己");
  await editor
    .getByLabel("信的正文", { exact: true })
    .fill("今天有些难过，但我愿意慢慢照顾自己。");
  await editor.getByRole("button", { name: "收好这封信", exact: true }).click();
  await expect(editor.getByRole("status")).toHaveText(
    "已经保存在此浏览器。愿此刻的你，能轻松一点。",
  );
  await expect(
    editor.getByRole("button", { name: "已经收好", exact: true }),
  ).toBeDisabled();
  expect((await readSavedData(page))?.letters).toHaveLength(1);

  await page.reload();
  editor = await openLetters(page);
  await editor.getByRole("button", { name: /^写给今天的自己/ }).click();
  await expect(editor.getByLabel(/给这封信一个名字/)).toHaveValue(
    "写给今天的自己",
  );
  await expect(editor.getByLabel("信的正文", { exact: true })).toHaveValue(
    "今天有些难过，但我愿意慢慢照顾自己。",
  );

  await editor
    .getByLabel("信的正文", { exact: true })
    .fill("今天有些难过，但我愿意慢慢照顾自己。\n明天想去散散步。");
  await editor
    .getByRole("button", { name: "关闭写信窗口", exact: true })
    .click();
  const discard = page.getByRole("alertdialog", {
    name: "这封信还没有收好",
    exact: true,
  });
  await expect(discard).toBeVisible();
  await discard.getByRole("button", { name: "继续写信", exact: true }).click();
  editor = page.getByRole("dialog", { name: "不寄出的信", exact: true });
  await expect(editor.getByLabel("信的正文", { exact: true })).toHaveValue(
    /明天想去散散步。/,
  );
  await editor.getByRole("button", { name: "收好这封信", exact: true }).click();
  expect((await readSavedData(page))?.letters).toHaveLength(1);
  expect((await readSavedData(page))?.letters[0].body).toContain(
    "明天想去散散步。",
  );

  await editor
    .getByRole("button", { name: "写一封新的信", exact: true })
    .click();
  await editor
    .getByLabel("信的正文", { exact: true })
    .fill("这段文字我还不想保存。");
  await page.keyboard.press("Escape");
  await expect(discard).toBeVisible();
  await discard.getByRole("button", { name: "放弃修改", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  editor = await openLetters(page);
  await editor.getByRole("button", { name: /^写给今天的自己/ }).click();
  await editor.getByRole("button", { name: "删除这封信", exact: true }).click();
  const deleteConfirmation = page.getByRole("alertdialog", {
    name: "要放下这封信吗？",
    exact: true,
  });
  await expect(deleteConfirmation).toBeVisible();
  await deleteConfirmation
    .getByRole("button", { name: "先留着", exact: true })
    .click();
  expect((await readSavedData(page))?.letters).toHaveLength(1);
  await editor.getByRole("button", { name: "删除这封信", exact: true }).click();
  await deleteConfirmation
    .getByRole("button", { name: "确认删除", exact: true })
    .click();
  await expect(
    editor.getByText("这里还很安静。", { exact: false }),
  ).toBeVisible();
  expect((await readSavedData(page))?.letters).toEqual([]);
  await page.reload();
  editor = await openLetters(page);
  await expect(
    editor.getByText("这里还很安静。", { exact: false }),
  ).toBeVisible();
});

test("缓一缓支持呼吸暂停与感官练习，完成后保存练习次数", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-22T12:00:00+08:00") });
  await page.goto("/");
  await navigation(page)
    .getByRole("button", { name: "陪我缓一缓", exact: true })
    .click();
  let relief = page.getByRole("dialog");
  await relief.getByRole("button", { name: /有点想哭/ }).click();
  await expect(
    relief.getByRole("button", { name: /有点想哭/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    relief.getByText("想哭的时候，可以让眼泪待一会儿。你不需要马上振作。", {
      exact: true,
    }),
  ).toBeVisible();
  await relief.getByRole("button", { name: "陪我缓一缓", exact: true }).click();
  await relief.getByRole("button", { name: "开始呼吸", exact: true }).click();
  await expect(relief.locator(".relief-breath-label")).toHaveText("轻轻吸气");
  await page.clock.runFor(4000);
  await expect(relief.locator(".relief-breath-label")).toHaveText("慢慢呼气");
  await relief.getByRole("button", { name: "暂停一下", exact: true }).click();
  await page.clock.runFor(4000);
  await expect(
    relief.getByRole("button", { name: "继续练习", exact: true }),
  ).toBeVisible();
  await expect(relief.locator(".relief-breath-label")).toHaveText(
    "按自己的节奏",
  );
  await relief.getByRole("button", { name: "感受此刻", exact: true }).click();
  await expect(relief.locator(".relief-grounding li")).toHaveCount(5);
  await expect(
    relief.getByText("不必做完。任何一项不方便，都可以跳过。", { exact: true }),
  ).toBeVisible();
  await relief.getByRole("button", { name: "继续", exact: true }).click();
  await relief.getByRole("button", { name: /慢慢喝一杯水/ }).click();
  await relief
    .getByRole("button", { name: "带着这件小事，慢慢来", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await readSavedData(page))?.reliefSessions).toBe(1);
  await page.reload();
  expect((await readSavedData(page))?.reliefSessions).toBe(1);
  await navigation(page)
    .getByRole("button", { name: "陪我缓一缓", exact: true })
    .click();
  relief = page.getByRole("dialog");
  await relief
    .getByRole("button", { name: "关闭，回到首页", exact: true })
    .click();
  expect((await readSavedData(page))?.reliefSessions).toBe(1);
});

test("隐私设置清除前需要确认，删除后刷新也没有旧记录", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "很难受", exact: true }).click();
  await page.getByRole("button", { name: /慢慢喝一杯温水/ }).click();
  const editor = await openLetters(page);
  await editor
    .getByLabel("信的正文", { exact: true })
    .fill("这是一封稍后会删除的私密信件。");
  await editor.getByRole("button", { name: "收好这封信", exact: true }).click();
  await editor
    .getByRole("button", { name: "关闭写信窗口", exact: true })
    .click();
  await page.getByRole("button", { name: "隐私与数据", exact: true }).click();
  const settings = page.getByRole("dialog", {
    name: "隐私与数据",
    exact: true,
  });
  await settings
    .getByRole("button", { name: "删除全部记录", exact: true })
    .click();
  await expect(
    settings.getByRole("group", { name: "确认删除全部记录", exact: true }),
  ).toBeVisible();
  await settings.getByRole("button", { name: "保留记录", exact: true }).click();
  expect((await readSavedData(page))?.letters).toHaveLength(1);
  await settings
    .getByRole("button", { name: "删除全部记录", exact: true })
    .click();
  await settings
    .getByRole("button", { name: "确认全部删除", exact: true })
    .click();
  await expect(settings.getByRole("status")).toContainText("全部记录已删除");
  expect(await readSavedData(page)).toBeNull();
  await settings.getByRole("button", { name: "关闭", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "很难受", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(
    page.getByRole("button", { name: /慢慢喝一杯温水/ }),
  ).toHaveAttribute("aria-pressed", "false");
  await navigation(page)
    .getByRole("button", { name: "心情足迹", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByText("你的故事，可以从今天开始。", { exact: true }),
  ).toBeVisible();
  expect(await readSavedData(page)).toBeNull();
});

test("手机宽度没有横向溢出，导航、写信和练习仍可操作", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await navigation(page)
    .getByRole("button", { name: "我的小行动", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "今天，为自己做一件小事。",
      exact: true,
    }),
  ).toBeInViewport();
  const editor = await openLetters(page);
  await editor.getByLabel(/给这封信一个名字/).fill("手机上的一封信");
  await editor
    .getByLabel("信的正文", { exact: true })
    .fill("在小屏幕上，也能为自己留一点空间。");
  await editor.getByRole("button", { name: "收好这封信", exact: true }).click();
  await expect(
    editor.getByRole("button", { name: "已经收好", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await editor
    .getByRole("button", { name: "关闭写信窗口", exact: true })
    .click();
  await navigation(page)
    .getByRole("button", { name: "陪我缓一缓", exact: true })
    .click();
  const relief = page.getByRole("dialog");
  await relief.getByRole("button", { name: "先跳过", exact: true }).click();
  await relief.getByRole("button", { name: "跳过练习", exact: true }).click();
  await relief.getByRole("button", { name: "先休息一下", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await readSavedData(page))?.reliefSessions).toBe(1);
});
