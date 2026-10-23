import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function accessible(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(result.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }))).toEqual([]);
}

for (const width of [390, 1440]) {
  test(`首页 ${width}px 的语义与文字对比度`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await accessible(page);
  });
}

for (const [name, entry] of [
  ['缓冲区', /很想联系对方/], ['安稳工具箱', /^我的安稳工具箱$/],
  ['每周回顾', /^温柔的每周回顾$/], ['生活探索', /^来一点生活小探索$/],
  ['场景指南', /脑中反复回放/], ['数据设置', /^只属于你的空间$/],
] as const) {
  test(`${name}的语义、标签与文字对比度`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: entry }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    if (name === '数据设置') await page.getByText('本地更新与版本', { exact: false }).click();
    await accessible(page);
  });
}

test('更新说明可仅用键盘展开、进入下载链接，再反向返回', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '只属于你的空间', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('选择备份文件', { exact: true }).focus();
  await page.keyboard.press('Tab');
  const summary = dialog.locator('.local-update-help summary');
  await expect(summary).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog.locator('.local-update-help')).toHaveAttribute('open', '');
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('link', { name: '打开 GitHub 下载页面（新窗口）', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(summary).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByLabel('选择备份文件', { exact: true })).toBeFocused();
});
