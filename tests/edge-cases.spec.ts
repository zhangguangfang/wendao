import { expect, test } from "@playwright/test";

const storageKey = "huanhuan.private.v1";

test("unreadable private records are preserved instead of silently overwritten", async ({
  page,
}) => {
  const original = '{"version":1,"moods":[';
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: storageKey, value: original },
  );
  await page.goto("/");

  await expect(
    page.getByRole("alert").filter({ hasText: "暂时无法读取本地记录" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "很难受", exact: true }).click();

  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), storageKey))
    .toBe(original);
  await expect(
    page.getByRole("button", { name: "很难受", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
});

test("failed letter saves and deletions retain both the stored letter and edited text", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "主要导航" })
    .getByRole("button", { name: "不寄出的信", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "不寄出的信" });
  await editor.getByLabel(/给这封信一个名字/).fill("写给今天的自己");
  await editor.getByLabel("信的正文").fill("我想慢慢找回自己的节奏。");
  await editor.getByRole("button", { name: "收好这封信", exact: true }).click();
  await expect(
    editor.getByRole("button", { name: "已经收好", exact: true }),
  ).toBeVisible();
  const stored = await page.evaluate(
    (key) => localStorage.getItem(key),
    storageKey,
  );
  expect(JSON.parse(stored!).letters).toHaveLength(1);

  await page.evaluate(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException("Test storage failure", "QuotaExceededError");
    };
  });
  const revised = "今天还是有点难受，但我愿意给自己一点时间。";
  await editor.getByLabel("信的正文").fill(revised);
  await editor.getByRole("button", { name: "收好这封信", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText("这次没能保存");
  await expect(editor.getByLabel("信的正文")).toHaveValue(revised);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(stored);

  await editor.getByRole("button", { name: "删除这封信", exact: true }).click();
  const confirmation = page.getByRole("alertdialog", {
    name: "要放下这封信吗？",
  });
  await confirmation
    .getByRole("button", { name: "确认删除", exact: true })
    .click();
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByRole("alert")).toContainText("这次没能删除");
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(stored);
  await confirmation
    .getByRole("button", { name: "先留着", exact: true })
    .click();
  await expect(editor.getByLabel("信的正文")).toHaveValue(revised);
});

test("keyboard focus remains inside settings after its focused clear button is replaced", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "隐私与数据", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "隐私与数据" });
  await settings
    .getByRole("button", { name: "删除全部记录", exact: true })
    .click();
  await expect(
    settings.getByRole("group", { name: "确认删除全部记录" }),
  ).toBeVisible();

  for (let index = 0; index < 6; index += 1) {
    await page.keyboard.press("Tab");
    await expect
      .poll(() =>
        settings.evaluate((dialog) => dialog.contains(document.activeElement)),
      )
      .toBe(true);
  }
  for (let index = 0; index < 6; index += 1) {
    await page.keyboard.press("Shift+Tab");
    await expect
      .poll(() =>
        settings.evaluate((dialog) => dialog.contains(document.activeElement)),
      )
      .toBe(true);
  }
  await expect(
    settings.getByRole("group", { name: "确认删除全部记录" }),
  ).toBeVisible();
});

test.describe("local-day boundaries", () => {
  test.use({ timezoneId: "Asia/Shanghai" });

  test("an action immediately after midnight belongs to the new day without waiting for the refresh timer", async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date("2026-10-22T23:59:59+08:00"));
    await page.goto("/");
    await expect(page.locator(".date-label")).toContainText("10月22日");

    // Changing Date without ticking intervals reproduces a page left open over midnight.
    await page.clock.setFixedTime(new Date("2026-10-23T00:00:01+08:00"));
    await page.getByRole("button", { name: /慢慢喝一杯温水/ }).click();

    const actions = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).actions,
      storageKey,
    );
    expect(actions["2026-10-23"]).toEqual(["water"]);
    expect(actions["2026-10-22"]).toBeUndefined();
    await expect(page.locator(".date-label")).toContainText("10月23日");
  });
});
