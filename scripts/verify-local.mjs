import { chromium, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const project = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(project, 'release', '缓缓');
const { startLocal } = await import(pathToFileURL(join(root, 'scripts', 'start-local.mjs')).href);
const expected = JSON.parse(await readFile(join(project, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(join(project, 'release', 'update.json'), 'utf8'));
const archive = await readFile(join(project, 'release', '缓缓.zip'));
expect(manifest).toMatchObject({ app: 'huanhuan', format: 1, version: expected.version, bytes: archive.byteLength, sha256: createHash('sha256').update(archive).digest('hex') });
const running = await startLocal({ projectDirectory: root, port: 0, open: false, logger: { log() {} } });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true });
const errors = [], external = [];
const artifactPrefix = `huanhuan-v${expected.version.replaceAll('.', '')}`;
const readStored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('huanhuan.private.v1') ?? 'null'));
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (!request.url().startsWith(running.address) && !request.url().startsWith('data:') && !request.url().startsWith('blob:')) external.push(request.url());
  });
  await page.goto(running.address);
  await expect(page.locator('.page-footer')).toContainText(`v${expected.version}`);
  await page.screenshot({ path: join(tmpdir(), `${artifactPrefix}-desktop.png`), fullPage: true, animations: 'disabled' });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 390) await page.screenshot({ path: join(tmpdir(), `${artifactPrefix}-mobile.png`), fullPage: true, animations: 'disabled' });
  }
  await page.getByRole('button', { name: '有点低落', exact: true }).click();
  await expect(page.getByRole('button', { name: '有点低落', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('group', { name: '心情记录后的下一步' })).toBeVisible();
  await page.getByRole('button', { name: '现在这样就好', exact: true }).click();
  await page.getByRole('button', { name: '给今天补充一句话', exact: false }).click();
  const journal = page.getByRole('dialog', { name: '我的心情足迹', exact: true });
  await journal.getByRole('button', { name: /^编辑.*的心情记录$/ }).click();
  await journal.getByLabel('想记下的话（选填）').fill('验收示例：今天想给自己留一点时间。');
  await journal.getByRole('button', { name: '保存这段心情', exact: true }).click();
  await expect(journal.getByText('这段心情已经收好。', { exact: true })).toBeVisible();
  await journal.getByRole('button', { name: '关闭', exact: true }).click();

  await page.getByRole('navigation', { name: '主要导航' }).getByRole('button', { name: /^不寄出的信/ }).click();
  const letters = page.getByRole('dialog', { name: '不寄出的信', exact: true });
  await letters.getByLabel('信的正文', { exact: true }).fill('这是自动验收的虚构文字。');
  await letters.getByRole('button', { name: '收好这封信', exact: true }).click();
  await expect(letters.getByRole('button', { name: '已经收好', exact: true })).toBeDisabled();
  await letters.getByRole('button', { name: '关闭写信窗口', exact: true }).click();

  await page.getByRole('button', { name: /很想联系对方/ }).click();
  const pause = page.getByRole('dialog', { name: '给决定留一点空间' });
  await pause.getByLabel('想说的话', { exact: true }).fill('验收示例：这些话先留给自己。');
  await pause.getByRole('button', { name: '先缓一缓', exact: true }).click();
  await pause.getByRole('button', { name: '看看下一步', exact: true }).click();
  await pause.getByRole('button', { name: '收进不寄出的信', exact: true }).click();
  await expect(pause.getByRole('button', { name: '保存文字修改', exact: true })).toBeDisabled();
  await pause.getByRole('button', { name: '关闭', exact: true }).click();

  await page.getByRole('button', { name: '我的安稳工具箱', exact: true }).click();
  const box = page.getByRole('dialog', { name: '我的安稳工具箱', exact: true });
  await box.getByRole('button', { name: '添加支持我的人', exact: true }).click();
  await box.getByLabel('怎么称呼 TA', { exact: true }).fill('验收示例联系人');
  await box.getByLabel('联系线索或想说的话（可不填）', { exact: true }).fill('仅用于验证，不是真实个人信息。');
  await box.getByRole('button', { name: '保存收藏', exact: true }).click();
  await expect(box.locator('.comfort-item')).toHaveCount(1);
  await box.getByRole('button', { name: '收藏 · 轻柔的呼吸', exact: true }).click();
  await expect(box.locator('.comfort-item')).toHaveCount(2);
  await box.getByRole('button', { name: '关闭', exact: true }).click();

  await page.getByRole('button', { name: '分步开始：慢慢喝一杯温水', exact: true }).click();
  const companion = page.getByRole('dialog', { name: '陪你做一件小事', exact: true });
  await companion.getByRole('button', { name: '试过这一步了', exact: true }).click();
  expect(Object.values((await readStored(page)).actions).flat()).toEqual([]);
  await companion.getByRole('button', { name: '将这件小事记为完成', exact: true }).click();
  await expect(companion.getByRole('status')).toContainText('已记在');
  expect(Object.values((await readStored(page)).actions).flat()).toEqual(['water']);
  await companion.getByRole('button', { name: '撤销这条完成记录', exact: true }).click();
  await expect(companion.getByRole('status')).toContainText('已撤销');
  await page.screenshot({ path: join(tmpdir(), `${artifactPrefix}-action.png`), animations: 'disabled' });
  await companion.getByRole('button', { name: '关闭', exact: true }).click();

  await page.getByRole('button', { name: '我的安稳工具箱', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '准备一句求助的话', exact: true }).click();
  const composer = page.getByRole('dialog', { name: '准备一句求助的话', exact: true });
  await composer.getByLabel('按自己的语气改一改', { exact: true }).fill('验收用的虚构求助文字。');
  const draftDownload = page.waitForEvent('download');
  await composer.getByRole('button', { name: '下载文字', exact: true }).click();
  expect(await readFile(await (await draftDownload).path(), 'utf8')).toBe('验收用的虚构求助文字。');
  await page.screenshot({ path: join(tmpdir(), `${artifactPrefix}-support.png`), animations: 'disabled' });
  await composer.getByRole('button', { name: '关闭', exact: true }).click();
  await composer.getByRole('button', { name: '放弃这份草稿并离开', exact: true }).click();

  await page.getByRole('button', { name: '来一点生活小探索', exact: true }).click();
  const explore = page.getByRole('dialog', { name: '一点生活小探索', exact: true });
  await explore.getByRole('button', { name: '愿意动一动', exact: true }).click();
  await explore.getByRole('button', { name: '加入我的计划', exact: true }).click();
  await expect(explore.getByRole('button', { name: '已经在我的计划里', exact: true })).toBeDisabled();
  await explore.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '温柔的每周回顾', exact: true }).click();
  const review = page.getByRole('dialog', { name: '温柔的每周回顾', exact: true });
  await expect(review.locator('.review-counts strong')).toHaveText(['1', '0', '0']);
  await review.getByRole('button', { name: '关闭', exact: true }).click();

  await page.reload();
  await expect(page.getByRole('button', { name: '有点低落', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '隐私与数据', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载数据备份', exact: true }).click();
  const downloaded = await downloading;
  const backup = JSON.parse(await readFile(await downloaded.path(), 'utf8'));
  expect(backup.data.version).toBe(3);
  expect(backup.data.moods[0].note).toContain('验收示例');
  expect(backup.data.letters).toHaveLength(2);
  expect(backup.data.comfortItems).toHaveLength(2);
  expect(backup.data.plannedActions).toEqual(['explore-song']);
  expect(Object.values(backup.data.actions).flat()).toEqual([]);
  await context.close();

  // The managed browser forbids direct file: navigation. Validate the very same
  // standalone bytes in an offline context without bypassing that restriction.
  const offline = await browser.newContext({ offline: true, viewport: { width: 390, height: 844 } });
  const single = await offline.newPage();
  single.on('pageerror', (error) => errors.push(error.message));
  const html = await readFile(join(root, '打开缓缓.html'), 'utf8');
  let requests = 0;
  await offline.route('**/*', (route) => {
    requests++;
    if (route.request().url() === 'http://127.0.0.1:6174/') return route.fulfill({ status: 200, contentType: 'text/html', body: html });
    external.push(route.request().url());
    return route.abort();
  });
  await single.goto('http://127.0.0.1:6174/');
  await expect(single.locator('.page-footer')).toContainText(`v${expected.version}`);
  await single.getByRole('button', { name: '还算平静', exact: true }).click();
  await expect(single.getByRole('button', { name: '还算平静', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await single.reload();
  await expect(single.getByRole('button', { name: '还算平静', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await single.getByRole('button', { name: '我的安稳工具箱', exact: true }).click();
  await single.getByRole('button', { name: '收藏 · 感受此刻', exact: true }).click();
  await expect(single.getByRole('button', { name: '已收藏 · 感受此刻', exact: true })).toBeDisabled();
  await single.getByRole('button', { name: '开始这个练习', exact: true }).click();
  await single.getByRole('button', { name: '跳过练习', exact: true }).click();
  await single.getByRole('button', { name: '先休息一下', exact: true }).click();
  await expect(single.getByRole('dialog')).toHaveCount(0);
  expect((await readStored(single)).comfortItems).toHaveLength(1);
  expect((await readStored(single)).reliefSessions).toBe(1);
  await single.getByRole('button', { name: '分步开始：慢慢喝一杯温水', exact: true }).click();
  await single.getByRole('button', { name: '将这件小事记为完成', exact: true }).click();
  await expect(single.getByRole('dialog').getByRole('status')).toContainText('已记在');
  expect(Object.values((await readStored(single)).actions).flat()).toEqual(['water']);

  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  console.log(JSON.stringify({
    version: running.identity.version, build: running.identity.build,
    widths: [320, 390, 768, 1024, 1440],
    production: 'mood follow-up, letters, contact pause, comfort box, guided action and undo, editable support draft download, exploration, weekly review, reload and backup passed',
    standalone: 'offline inline HTML, reload, comfort collection, relief and guided completion passed',
    standaloneRequests: requests, pageErrors: errors.length, externalRequests: external.length,
    updateManifest: 'archive byte length and SHA-256 match',
  }));
  await offline.close();
} finally {
  await browser.close();
  running.server.closeAllConnections();
  await new Promise((resolve) => running.server.close(resolve));
}
