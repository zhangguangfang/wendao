import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { emptyData } from '../src/storage';
import { resolveGuidedAction, setGuidedCompletion, stepsForAction } from '../src/guidedActions';
import type { ComfortItem } from '../src/types';

const key = 'huanhuan.private.v1';
const stamp = '2026-10-24T05:00:00Z';
const contact: ComfortItem = { id: 'trusted-person', kind: 'contact', title: '可信任的朋友', body: '晚上通常方便，先问问有没有时间。', createdAt: stamp };
const stored = (page: Page) => page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey) ?? 'null'), key);
async function openAction(page: Page) {
  await page.getByRole('button', { name: '分步开始：慢慢喝一杯温水', exact: true }).click();
  return page.getByRole('dialog', { name: '陪你做一件小事', exact: true });
}
async function seedContact(page: Page) {
  await page.goto('/');
  await page.evaluate(({ storageKey, data }) => localStorage.setItem(storageKey, JSON.stringify(data)), { storageKey: key, data: { ...emptyData(), comfortItems: [contact] } });
  await page.reload();
}
async function openComposer(page: Page) {
  await page.getByRole('button', { name: '我的安稳工具箱', exact: true }).click();
  await page.getByRole('button', { name: '准备一句求助的话', exact: true }).click();
  return page.getByRole('dialog', { name: '准备一句求助的话', exact: true });
}
async function holdLock(page: Page) {
  await page.evaluate(() => new Promise<void>((ready) => {
    void navigator.locks.request('huanhuan-private-write', () => new Promise<void>((resolve) => { (window as any).releaseInteraction = resolve; ready(); }));
  }));
}
async function failWrites(page: Page) {
  await page.evaluate(() => { (window as any).realInteractionSetItem = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; });
}
async function restoreWrites(page: Page) { await page.evaluate(() => { Storage.prototype.setItem = (window as any).realInteractionSetItem; }); }

test('分步完成是幂等状态操作，自定义行动变动会被拒绝，归档后仍能撤销旧记录', () => {
  const original = { id: 'mine', title: '照顾桌边的植物', createdAt: stamp };
  const data = { ...emptyData(), customActions: [original] };
  const action = resolveGuidedAction(data, 'mine')!;
  const once = setGuidedCompletion(data, action, '2026-10-24', true);
  expect(setGuidedCompletion(once, action, '2026-10-24', true)).toEqual(once);
  const archived = { ...once, customActions: [{ ...original, archived: true }] };
  expect(() => setGuidedCompletion(archived, action, '2026-10-25', true)).toThrow(/调整或归档/);
  expect(setGuidedCompletion(archived, action, '2026-10-24', false).actions['2026-10-24']).toEqual([]);
  expect(resolveGuidedAction(archived, 'mine')).toBeUndefined();
  expect(stepsForAction(action)).toHaveLength(3);
});

test('查看步骤和计时结束不自动打卡，明确完成后刷新可见，并可撤销', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  const dialog = await openAction(page);
  await dialog.getByRole('button', { name: '试过这一步了', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: '慢慢喝一小口', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: '跳过这一步', exact: true }).click();
  await dialog.getByRole('button', { name: '试过这一步了', exact: true }).click();
  await expect(dialog).toContainText('已查看 3 / 3 步');
  await dialog.locator('summary').click();
  await dialog.getByRole('button', { name: '开始计时', exact: true }).click();
  await page.clock.runFor(60_000);
  await expect(dialog.getByRole('timer')).toHaveText('还剩 0 秒');
  expect((await stored(page))?.actions ?? {}).toEqual({});
  await dialog.getByRole('button', { name: '将这件小事记为完成', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('今天同一件事只记一次');
  await page.reload();
  await expect(page.locator('.action-item').filter({ hasText: '慢慢喝一杯温水' })).toHaveAttribute('aria-pressed', 'true');
  await openAction(page);
  await dialog.getByRole('button', { name: '撤销这条完成记录', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('已撤销');
  expect(Object.values((await stored(page)).actions).flat()).toEqual([]);
});

test('分步陪伴计时离开后台会暂停，步骤跳转也暂停', async ({ page }) => {
  await page.clock.install(); await page.goto('/');
  const dialog = await openAction(page);
  await dialog.locator('summary').click();
  await dialog.getByRole('button', { name: '开始计时', exact: true }).click();
  await page.clock.runFor(10_000);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.clock.runFor(80_000);
  await expect(dialog.getByRole('timer')).toHaveText('还剩 50 秒');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await dialog.getByRole('button', { name: '继续计时', exact: true }).click();
  await page.clock.runFor(5_000);
  await dialog.getByRole('button', { name: '试过这一步了', exact: true }).click();
  await page.clock.runFor(60_000);
  await expect(dialog.getByRole('timer')).toHaveText('还剩 45 秒');
  await dialog.getByRole('button', { name: '重新计时', exact: true }).click();
  await expect(dialog.getByRole('timer')).toHaveText('还剩 60 秒');
  await expect(dialog.getByRole('button', { name: '开始计时', exact: true })).toBeEnabled();
});

test('分步保存失败保留步骤，重试成功不会重复记录', async ({ page }) => {
  await page.goto('/'); const dialog = await openAction(page);
  await dialog.getByRole('button', { name: '试过这一步了', exact: true }).click();
  await failWrites(page);
  await dialog.getByRole('button', { name: '将这件小事记为完成', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog).toContainText('已查看 1 / 3 步');
  expect((await stored(page))?.actions ?? {}).toEqual({});
  await restoreWrites(page);
  await dialog.getByRole('button', { name: '将这件小事记为完成', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('已记在');
  expect(Object.values((await stored(page)).actions).flat()).toEqual(['water']);
});

test('两个窗口同时确认同一行动只保留一次完成，等待时不能重复或关闭', async ({ page, context }) => {
  await page.goto('/'); const other = await context.newPage(); await other.goto('/');
  const left = await openAction(page), right = await openAction(other);
  const owner = await context.newPage(); await owner.goto('/'); await holdLock(owner);
  await left.getByRole('button', { name: '将这件小事记为完成', exact: true }).click();
  await right.getByRole('button', { name: '将这件小事记为完成', exact: true }).click();
  await expect(left.getByRole('button', { name: '关闭', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape'); await expect(left).toBeVisible();
  await owner.evaluate(() => (window as any).releaseInteraction());
  await expect(left.getByRole('status')).toContainText('已记在');
  await expect(right.getByRole('status')).toContainText('已记在');
  expect(Object.values((await stored(page)).actions).flat()).toEqual(['water']);
});

test('跨天后撤销仍只影响原日期，再次完成记到新日期', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-24T12:00:00Z')); await page.goto('/');
  const dialog = await openAction(page);
  await dialog.getByRole('button', { name: '将这件小事记为完成', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('已记在');
  const first = Object.keys((await stored(page)).actions)[0];
  await page.clock.setFixedTime(new Date('2026-10-25T12:00:00Z'));
  await dialog.getByRole('button', { name: '撤销这条完成记录', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText(`已撤销 ${first}`);
  await dialog.getByRole('button', { name: '将这件小事记为完成', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('已记在');
  const result = (await stored(page)).actions;
  expect(result[first]).toEqual([]);
  expect(Object.entries(result).find(([day]) => day !== first)?.[1]).toEqual(['water']);
});

test('求助话术切换只改变预览，替换与离开都保护改过的草稿', async ({ page }) => {
  await seedContact(page); const dialog = await openComposer(page);
  const input = dialog.getByLabel('按自己的语气改一改', { exact: true });
  await input.fill('我想保留自己的表达。');
  await dialog.getByRole('button', { name: '想有人陪一会儿', exact: true }).click();
  await expect(input).toHaveValue('我想保留自己的表达。');
  await dialog.getByRole('button', { name: '把这段话放入编辑框', exact: true }).click();
  const confirmation = dialog.getByRole('group', { name: '替换前保留文字' });
  await expect(confirmation.getByRole('button', { name: '继续编辑' })).toBeFocused();
  await confirmation.getByRole('button', { name: '继续编辑' }).click();
  await expect(input).toBeFocused(); await expect(input).toHaveValue('我想保留自己的表达。');
  await page.keyboard.press('Escape');
  await expect(dialog.getByRole('group', { name: '离开前保留求助草稿' })).toBeVisible();
  await dialog.getByRole('button', { name: '继续编辑' }).click();
  await dialog.getByRole('button', { name: '把这段话放入编辑框', exact: true }).click();
  await dialog.getByRole('button', { name: '确认替换文字', exact: true }).click();
  await expect(input).toHaveValue(/陪我散散步/);
  expect((await stored(page)).comfortItems).toEqual([contact]);
});

test('剪贴板被拒绝时文字可选中并下载，既不发送也不改联系人', async ({ page }) => {
  await seedContact(page);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } }));
  const dialog = await openComposer(page);
  const input = dialog.getByLabel('按自己的语气改一改', { exact: true });
  await input.fill('这是一段虚构的求助草稿。');
  await dialog.getByRole('button', { name: '复制这段话', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('没有允许复制');
  await expect(input).toBeFocused();
  expect(await input.evaluate((node: HTMLTextAreaElement) => node.selectionEnd - node.selectionStart)).toBe('这是一段虚构的求助草稿。'.length);
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '下载文字', exact: true }).click();
  expect(await readFile((await (await download).path())!, 'utf8')).toBe('这是一段虚构的求助草稿。');
  expect((await stored(page)).comfortItems).toEqual([contact]);
});

test('复制成功只复制编辑内容，复制后再次修改仍有离开保护', async ({ page }) => {
  await seedContact(page);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as any).copiedSupport = text; } } }));
  const dialog = await openComposer(page), input = dialog.getByLabel('按自己的语气改一改', { exact: true });
  await input.fill('我希望被听见，不急着得到建议。');
  await dialog.getByRole('button', { name: '复制这段话', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('已经复制');
  expect(await page.evaluate(() => (window as any).copiedSupport)).toBe('我希望被听见，不急着得到建议。');
  await input.fill('复制后新增的文字'); await page.keyboard.press('Escape');
  await expect(dialog.getByRole('group', { name: '离开前保留求助草稿' })).toBeVisible();
});

test('心情保存成功后才能选下一步，失败不触发引导，选择不自动记录练习', async ({ page }) => {
  await page.goto('/'); await failWrites(page);
  await page.getByRole('button', { name: '有点低落', exact: true }).click();
  await expect(page.locator('.storage-warning')).toBeVisible();
  await expect(page.getByRole('group', { name: '心情记录后的下一步' })).toHaveCount(0);
  await restoreWrites(page);
  await page.getByRole('button', { name: '有点低落', exact: true }).click();
  const next = page.getByRole('group', { name: '心情记录后的下一步' });
  await expect(next).toBeVisible();
  await next.getByRole('button', { name: '陪我稳一稳', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: '感受此刻', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect((await stored(page)).reliefSessions).toBe(0);
});

test('首页保存等待期间禁用重复操作，释放写锁后仍只记一次', async ({ page, context }) => {
  await page.goto('/'); const owner = await context.newPage(); await owner.goto('/'); await holdLock(owner);
  const water = page.locator('.action-item').filter({ hasText: '慢慢喝一杯温水' });
  await water.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(water).toBeDisabled();
  expect(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event); return event.defaultPrevented;
  })).toBe(true);
  await owner.evaluate(() => (window as any).releaseInteraction());
  await expect(water).toBeEnabled(); await expect(water).toHaveAttribute('aria-pressed', 'true');
  expect(Object.values((await stored(page)).actions).flat()).toEqual(['water']);
});

for (const flow of ['action', 'support'] as const) test(`320px ${flow} 交互无横向溢出，语义与对比度检查通过`, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  if (flow === 'support') { await seedContact(page); await openComposer(page); }
  else { await page.goto('/'); await openAction(page); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const dialog = page.getByRole('dialog');
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(scan.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([]);
});

test('探索加入计划后能分步开始，自定义行动在别处归档不会被完成按钮复活', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '来一点生活小探索', exact: true }).click();
  await page.getByRole('button', { name: '愿意动一动', exact: true }).click();
  await page.getByRole('button', { name: '加入我的计划', exact: true }).click();
  await expect(page.getByRole('button', { name: '已经在我的计划里', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '打开我的行动计划', exact: false }).click();
  await page.getByRole('dialog', { name: '我的小行动计划', exact: true }).getByRole('button', { name: '分步开始：听一首此刻合适的歌', exact: true }).click();
  const guide = page.getByRole('dialog', { name: '陪你做一件小事', exact: true });
  await expect(guide).toContainText('听一首此刻合适的歌');
  const other = await context.newPage(); await other.goto('/');
  await other.getByRole('button', { name: '安排我的小行动', exact: false }).click();
  await other.getByRole('button', { name: '挑选我的小行动', exact: true }).click();
  await other.getByRole('button', { name: '归档小行动：听一首此刻合适的歌', exact: true }).click();
  await other.getByRole('button', { name: '确认归档', exact: true }).click();
  await expect(other.getByRole('status')).toContainText('归档');
  await guide.getByRole('button', { name: '将这件小事记为完成', exact: true }).click();
  await expect(guide.getByRole('alert')).toContainText('调整或归档');
  const saved = await stored(page);
  expect(saved.customActions[0].archived).toBe(true);
  expect(saved.actions).toEqual({});
});

test('行动计划编辑期间不能通过分步入口丢弃编辑框', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '安排我的小行动', exact: true }).click();
  const planner = page.getByRole('dialog');
  await planner.getByRole('button', { name: '加入计划：慢慢喝一杯温水', exact: true }).click();
  await expect(planner.getByRole('button', { name: '分步开始：慢慢喝一杯温水', exact: true })).toBeEnabled();
  await planner.getByRole('button', { name: '写一个自己的小行动', exact: true }).click();
  await planner.getByLabel(/这件小事叫什么/).fill('还没收好的小事');
  await expect(planner.getByRole('button', { name: '分步开始：慢慢喝一杯温水', exact: true })).toBeDisabled();
  await expect(planner.getByLabel(/这件小事叫什么/)).toHaveValue('还没收好的小事');
});

test('联系线索在另一窗口修改时提示变化，保留当前求助草稿', async ({ page, context }) => {
  await seedContact(page); const dialog = await openComposer(page);
  await dialog.getByLabel('按自己的语气改一改', { exact: true }).fill('仍在编辑的表达');
  const other = await context.newPage(); await other.goto('/');
  await other.getByRole('button', { name: '我的安稳工具箱', exact: true }).click();
  await other.getByRole('button', { name: '编辑可信任的朋友', exact: true }).click();
  await other.getByLabel('怎么称呼 TA', { exact: true }).fill('新的称呼');
  await other.getByRole('button', { name: '保存收藏', exact: true }).click();
  await expect(other.getByRole('status')).toContainText('收进安稳工具箱');
  await expect(dialog.getByRole('status')).toContainText('修改或移除');
  await expect(dialog.getByLabel('按自己的语气改一改', { exact: true })).toHaveValue('仍在编辑的表达');
  expect((await stored(page)).comfortItems[0].title).toBe('新的称呼');
});

test('复制待授权期间防止重复点击，完成后才能继续修改或关闭', async ({ page }) => {
  await seedContact(page);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => new Promise<void>((resolve) => { (window as any).copyInvocations = ((window as any).copyInvocations ?? 0) + 1; (window as any).finishSupportCopy = resolve; }) } }));
  const dialog = await openComposer(page);
  await dialog.getByRole('button', { name: '复制这段话', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '正在复制…', exact: true })).toBeDisabled();
  await expect(dialog.getByLabel('按自己的语气改一改', { exact: true })).toBeDisabled();
  await page.keyboard.press('Escape'); await expect(dialog).toBeVisible();
  await page.evaluate(() => (window as any).finishSupportCopy());
  await expect(dialog.getByRole('status')).toContainText('已经复制');
  expect(await page.evaluate(() => (window as any).copyInvocations)).toBe(1);
  await expect(dialog.getByLabel('按自己的语气改一改', { exact: true })).toBeEnabled();
});
