import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const storageKey = "huanhuan.private.v1";
const fixedTime = new Date("2026-10-22T12:00:00+08:00");
const fixedDay = "2026-10-22";

type StoredData = {
  moods: { id: string; value: number }[];
  letters: { id: string; title: string; body: string }[];
  actions: Record<string, string[]>;
};

test.use({ timezoneId: "Asia/Shanghai" });


async function openTwoPages(page: Page, context: BrowserContext) {
  const other = await context.newPage();
  await Promise.all([
    page.clock.setFixedTime(fixedTime),
    other.clock.setFixedTime(fixedTime),
  ]);
  await Promise.all([page.goto("/"), other.goto("/")]);
  return other;
}

async function readData(page: Page): Promise<StoredData | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, storageKey);
}

function action(page: Page, name: RegExp) {
  return page.getByRole("button", { name });
}

async function openLetterEditor(page: Page) {
  await page
    .getByRole("navigation", { name: "主要导航" })
    .getByRole("button", { name: /^不寄出的信/ })
    .click();
  return page.getByRole("dialog", { name: "不寄出的信", exact: true });
}

test("two tabs completing different actions at the same time retain both changes", async ({
  page,
  context,
}) => {
  const other = await openTwoPages(page, context);
  const water = action(page, /慢慢喝一杯温水/);
  const walk = action(other, /出去走上 5 分钟/);

  // Repeated normal clicks expose a lost-update race without intercepting storage events.
  // Each round starts only once both tabs have observed the previous result.
  for (let round = 0; round < 8; round += 1) {
    await Promise.all([water.click(), walk.click()]);
    const completed = round % 2 === 0;
    await expect
      .poll(async () =>
        [...((await readData(page))?.actions[fixedDay] ?? [])].sort(),
      )
      .toEqual(completed ? ["walk", "water"] : []);
    await expect(water).toHaveAttribute("aria-pressed", String(completed));
    await expect(walk).toHaveAttribute("aria-pressed", String(completed));
    await expect(action(other, /慢慢喝一杯温水/)).toHaveAttribute(
      "aria-pressed",
      String(completed),
    );
    await expect(action(page, /出去走上 5 分钟/)).toHaveAttribute(
      "aria-pressed",
      String(completed),
    );
  }

  await Promise.all([water.click(), walk.click()]);
  await expect
    .poll(async () => [...((await readData(page))?.actions[fixedDay] ?? [])].sort())
    .toEqual(["walk", "water"]);
  await Promise.all([page.reload(), other.reload()]);
  await expect(water).toHaveAttribute("aria-pressed", "true");
  await expect(walk).toHaveAttribute("aria-pressed", "true");
});

test("concurrent letters and a mood change keep every independently created record", async ({
  page,
  context,
}) => {
  const other = await openTwoPages(page, context);
  const firstEditor = await openLetterEditor(page);
  const secondEditor = await openLetterEditor(other);
  await firstEditor.getByLabel(/给这封信一个名字/).fill("给今天的自己");
  await firstEditor.getByLabel("信的正文", { exact: true }).fill("今天想去看一看天空。");
  await secondEditor.getByLabel(/给这封信一个名字/).fill("给明天的自己");
  await secondEditor.getByLabel("信的正文", { exact: true }).fill("明天也可以按自己的节奏走。");

  await Promise.all([
    firstEditor.getByRole("button", { name: "收好这封信", exact: true }).click(),
    secondEditor.getByRole("button", { name: "收好这封信", exact: true }).click(),
  ]);
  await expect
    .poll(async () => (await readData(page))?.letters.map((letter) => letter.title).sort())
    .toEqual(["给今天的自己", "给明天的自己"]);
  await expect(firstEditor.getByRole("button", { name: "已经收好", exact: true })).toBeDisabled();
  await expect(secondEditor.getByRole("button", { name: "已经收好", exact: true })).toBeDisabled();

  await firstEditor.getByLabel("信的正文", { exact: true }).fill("今天想去看一看天空，也想给自己多一点时间。");
  await secondEditor.getByRole("button", { name: "关闭写信窗口", exact: true }).click();
  await Promise.all([
    firstEditor.getByRole("button", { name: "收好这封信", exact: true }).click(),
    other.getByRole("button", { name: "还算平静", exact: true }).click(),
  ]);
  await expect.poll(async () => {
    const saved = await readData(page);
    return {
      letters: saved?.letters.length,
      revised: saved?.letters.some((letter) => letter.body.includes("多一点时间")),
      mood: saved?.moods.map((mood) => mood.value),
    };
  }).toEqual({ letters: 2, revised: true, mood: [3] });
  await page.reload();
  expect((await readData(page))?.letters).toHaveLength(2);
  await expect(page.getByRole("button", { name: "还算平静", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("clearing one tab while another updates never brings deleted private records back", async ({ browser }) => {
  const initial = {
    version: 1,
    moods: [{ id: "previous-mood", value: 2, createdAt: fixedTime.toISOString() }],
    letters: [{
      id: "previous-letter",
      title: "准备放下的旧信",
      body: "这封信应当随清空操作被删除。",
      createdAt: fixedTime.toISOString(),
    }],
    actions: {},
    reliefSessions: 0,
  };

  for (let round = 0; round < 6; round += 1) {
    // Each round is a separate browser profile: direct fixture seeding must not
    // masquerade as restoring a previously deleted snapshot in the same store.
    const context = await browser.newContext({ timezoneId: "Asia/Shanghai" });
    try {
    const page = await context.newPage();
    const other = await openTwoPages(page, context);
    // Seed a valid previous-version account to also exercise clear after migration.
    await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), {
      key: storageKey,
      data: initial,
    });
    await Promise.all([page.reload(), other.reload()]);
    await expect(other.getByRole("button", { name: "有点低落", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "隐私与数据", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "隐私与数据", exact: true });
    await settings.getByRole("button", { name: "删除全部记录", exact: true }).click();
    await Promise.all([
      settings.getByRole("button", { name: "确认全部删除", exact: true }).click(),
      action(other, /慢慢喝一杯温水/).click(),
    ]);
    await expect(settings.getByRole("button", { name: "删除全部记录", exact: true })).toBeVisible();
    await expect.poll(async () => {
      const saved = await readData(page);
      return { moods: saved?.moods.length ?? 0, letters: saved?.letters.length ?? 0 };
    }).toEqual({ moods: 0, letters: 0 });

    // Whichever operation acquired the lock first, the deleted entities must stay gone
    // after a further action and reload. The new water action may be cleared or retained.
    await action(other, /出去走上 5 分钟/).click();
    await expect.poll(async () => (await readData(other))?.actions[fixedDay] ?? []).toContain("walk");
    await Promise.all([page.reload(), other.reload()]);
    const saved = await readData(page);
    expect(saved?.moods).toEqual([]);
    expect(saved?.letters).toEqual([]);
    } finally { await context.close(); }
  }
});
