// 截图自检：node scripts/shot.mjs <chart|page> [step] [width] [theme]
//   第 5 个参数为语言 zh|en，例：node scripts/shot.mjs computeArea 2 900 dark en
//   node scripts/shot.mjs computeArea 2 900 dark   → shots/computeArea-s2-900-dark.png（dev.html 单图）
//   node scripts/shot.mjs page 0 1280 dark         → 首页整页截图（含滚动）
// 需要先运行 dev 服务器（默认 http://localhost:5173，可用 DEV_URL 覆盖），使用系统 Chrome。
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const [name = 'computeArea', step = '', width = '900', themeMode = 'dark', lang = 'zh'] = process.argv.slice(2);
const base = process.env.DEV_URL || 'http://localhost:5173';
const outDir = resolve(import.meta.dirname, '../shots');
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: Math.max(+width + 80, 400), height: 900 }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

let file;
if (name === 'page') {
  await page.setViewportSize({ width: +width, height: 900 });
  await page.goto(`${base}/?theme=${themeMode}&lang=${lang}`, { waitUntil: 'networkidle' });
  await page.evaluate((t) => ((document.documentElement.dataset.theme = t), (document.documentElement.style.scrollBehavior = 'auto')), themeMode);
  // 逐屏滚动触发懒加载与步骤
  const total = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < total; y += 600) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y).catch(() => {});
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(1200);
  const target = step ? `#${step}` : null;
  if (target) {
    const el = await page.$(target);
    file = resolve(outDir, `page-${step}-${width}-${themeMode}${lang === 'en' ? '-en' : ''}.png`);
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    await el.screenshot({ path: file });
  } else {
    file = resolve(outDir, `page-${width}-${themeMode}.png`);
    await page.screenshot({ path: file, fullPage: true });
  }
} else {
  const q = new URLSearchParams({ chart: name, w: width, theme: themeMode, lang });
  if (step !== '') q.set('step', step);
  file = resolve(outDir, `${name}-s${step || 'x'}-${width}-${themeMode}${lang === 'en' ? '-en' : ''}.png`);
  // 其他文件被编辑时 Vite 会整页热重载，截图失败则重试
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      await page.goto(`${base}/dev.html?${q}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('body[data-ready="true"]', { timeout: 15000 }).catch(() => logs.push('[timeout] 未就绪'));
      await page.waitForTimeout(2000);
      await page.locator('#dev-stage').screenshot({ path: file });
      break;
    } catch (e) {
      if (attempt === 4) throw e;
      await page.waitForTimeout(1500);
    }
  }
}
console.log(file);
if (logs.length) console.log(logs.join('\n'));
await browser.close();
