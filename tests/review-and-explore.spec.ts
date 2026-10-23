import { expect, test, type Page } from "@playwright/test";
import { emptyData } from "../src/storage";
import { recentDays, weekReview } from "../src/review";
import { explorations, planExploration } from "../src/explorations";

const key = "huanhuan.private.v1";
const date = "2026-10-23";
const stamp = `${date}T06:00:00.000Z`;
async function stored(page: Page) { return page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)!), key); }

test("每周回顾跨年、闰日准确，空白日不算坏心情，重复心情只取最新一条", () => {
  expect(recentDays("2027-01-02")).toEqual(["2026-12-27", "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  expect(recentDays("2028-03-01", 3)).toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);
  const data = {
    ...emptyData(), moods: [
      { id: "a", value: 1, day: date, createdAt: `${date}T01:00:00Z` },
      { id: "b", value: 3, day: date, createdAt: `${date}T06:00:00Z` },
      { id: "outside", value: 4, day: "2026-10-01", createdAt: "2026-10-01T01:00:00Z" },
    ], actions: { "2026-10-17": ["water"], [date]: ["water", "walk"], "2026-10-16": ["rest"] },
  };
  const result = weekReview(data, date);
  expect(result.moodsByDay.size).toBe(1);
  expect(result.moodsByDay.get(date)?.id).toBe("b");
  expect(result.completedActions).toBe(3);
  expect(result.actionDays).toBe(2);
  expect(result.paired).toHaveLength(0);
});

test("每周自评只比较同一条记录的前后值，缺失值与过期记录不参与", () => {
  const session = { id: "first", createdAt: stamp, feeling: "cry", technique: "breathing" as const, durationSeconds: 10 };
  const data = { ...emptyData(), reliefHistory: [
    { ...session, before: 4, after: 2 },
    { ...session, id: "same", before: 3, after: 3 },
    { ...session, id: "higher", before: 2, after: 4 },
    { ...session, id: "no-before", after: 1 },
    { ...session, id: "no-after", before: 5 },
    { ...session, id: "outside", createdAt: "2026-10-01T06:00:00Z", before: 5, after: 1 },
  ] };
  const result = weekReview(data, date);
  expect(result.sessions).toHaveLength(5);
  expect(result.paired).toHaveLength(3);
  expect(result.changes).toEqual({ lower: 1, same: 1, higher: 1 });
});

test("小探索重复加入去重、保留历史、自定义行动上限仍适用", () => {
  const idea = explorations.find((item) => item.id === "explore-song")!;
  const once = planExploration(emptyData(), idea);
  expect(once.customActions).toHaveLength(1);
  expect(once.plannedActions).toEqual([idea.id]);
  expect(once.actions).toEqual({});
  expect(planExploration(once, idea)).toEqual(once);
  const archived = { ...once, plannedActions: [], customActions: [{ ...once.customActions[0], archived: true }], actions: { "2026-10-22": [idea.id] } };
  const restored = planExploration(archived, idea);
  expect(restored.customActions).toHaveLength(1);
  expect(restored.customActions[0].archived).toBe(false);
  expect(restored.actions).toEqual(archived.actions);
  const full = { ...emptyData(), customActions: Array.from({ length: 20 }, (_, index) => ({ id: String(index), title: `自选${index}`, createdAt: stamp })) };
  expect(() => planExploration(full, idea)).toThrow(/20 件/);
  expect(planExploration(full, explorations.find((item) => item.id === "water")!).plannedActions).toEqual(["water"]);
});

test("每周回顾展示真实数据并能带着提示进入新信", async ({ page }) => {
  await page.clock.setFixedTime(new Date(stamp));
  await page.goto("/");
  await page.evaluate(({ storageKey, data }) => localStorage.setItem(storageKey, JSON.stringify(data)), {
    storageKey: key, data: { ...emptyData(), moods: [{ id: "m", value: 3, createdAt: stamp, day: date }], actions: { [date]: ["water"] }, reliefSessions: 1, reliefHistory: [{ id: "s", createdAt: stamp, feeling: "cry", technique: "breathing", durationSeconds: 20, before: 4, after: 3 }] },
  });
  await page.reload();
  await page.getByRole("button", { name: "温柔的每周回顾", exact: true }).click();
  const review = page.getByRole("dialog", { name: "温柔的每周回顾", exact: true });
  await expect(review.locator(".review-counts strong")).toHaveText(["1", "1", "1"]);
  await expect(review.locator(".review-weather li")).toHaveCount(7);
  await expect(review.getByText("未记录", { exact: true })).toHaveCount(6);
  await expect(review).toContainText("目前只有 1 次完整自评");
  await expect(review.locator(".review-changes dd")).toHaveText(["1 次", "0 次", "0 次"]);
  await review.getByRole("button", { name: "写几句话给自己", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "不寄出的信", exact: true });
  await expect(editor.getByLabel("信的正文", { exact: true })).toHaveValue(/想谢谢自己/);
  expect((await stored(page)).letters).toHaveLength(0);
});

test("精力探索可切换和跳过，加入计划不会自动完成也不会重复新增", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "来一点生活小探索", exact: true }).click();
  const explore = page.getByRole("dialog", { name: "一点生活小探索", exact: true });
  await expect(explore.getByRole("button", { name: "只有一点力气", exact: true })).toHaveAttribute("aria-pressed", "true");
  await explore.getByRole("button", { name: "愿意动一动", exact: true }).click();
  await expect(explore.getByRole("heading", { name: "听一首此刻合适的歌", exact: true })).toBeVisible();
  await explore.getByRole("button", { name: "加入我的计划", exact: true }).click();
  await expect(explore.getByRole("button", { name: "已经在我的计划里", exact: true })).toBeDisabled();
  const data = await stored(page);
  expect(data.actions).toEqual({});
  expect(data.customActions).toHaveLength(1);
  expect(data.plannedActions).toEqual(["explore-song"]);
  await explore.getByRole("button", { name: "换一个试试", exact: true }).click();
  await expect(explore.getByRole("heading", { name: "打开窗，看看远处", exact: true })).toBeVisible();
  await explore.getByRole("button", { name: "打开我的行动计划", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("听一首此刻合适的歌");
  expect((await stored(page)).customActions).toHaveLength(1);
});

test("小探索保存失败不显示成功，320px 的探索与回顾均无横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await page.getByRole("button", { name: "来一点生活小探索", exact: true }).click();
  const explore = page.getByRole("dialog", { name: "一点生活小探索", exact: true });
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException("quota", "QuotaExceededError"); }; });
  await explore.getByRole("button", { name: "加入我的计划", exact: true }).click();
  await expect(explore.getByRole("alert")).toContainText("没有加入计划");
  await expect(explore.getByRole("status")).toHaveCount(0);
  expect(await explore.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await explore.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "温柔的每周回顾", exact: true }).click();
  const review = page.getByRole("dialog", { name: "温柔的每周回顾", exact: true });
  await expect(review.locator(".review-counts strong")).toHaveText(["0", "0", "0"]);
  await expect(review.getByText("未记录", { exact: true })).toHaveCount(7);
  expect(await review.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
});
