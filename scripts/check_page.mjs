// 整页自检：逐步滚动触发所有图表与叙事步骤，收集控制台错误，并按章节截图
// 运行：node scripts/check_page.mjs [宽度=1280] [dark|light] [--shots]
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const [width = '1280', mode = 'dark'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const shots = process.argv.includes('--shots');
const base = process.env.DEV_URL || 'http://localhost:5173';
const outDir = resolve(import.meta.dirname, '../shots/page');
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +width, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(`${base}/?theme=${mode}&lang=${process.env.LANG_Q || 'zh'}`, { waitUntil: 'networkidle' });

await page.evaluate(() => (document.documentElement.style.scrollBehavior = 'auto'));
for (let y = 0; y < (await page.evaluate(() => document.body.scrollHeight)) + 900; y += 300) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  await page.waitForTimeout(90);
}
await page.waitForTimeout(1500);

const report = await page.evaluate(() => {
  const figs = [...document.querySelectorAll('figure[data-chart]')];
  return {
    figures: figs.length,
    failed: figs
      .filter((f) => f.querySelector('.chart-note--warn')?.textContent.includes('加载失败') || f.querySelector('[aria-busy="true"]'))
      .map((f) => f.dataset.chart),
    missingFacts: [...document.querySelectorAll('.fact--missing')].map((e) => e.dataset.fact),
    overflowX: document.documentElement.scrollWidth > window.innerWidth,
    wideEls: [...document.querySelectorAll('main *')]
      .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 5)
      .map((e) => `${e.tagName}.${e.className?.baseVal ?? e.className}`),
  };
});
console.log(JSON.stringify(report, null, 1));
console.log(errors.length ? `控制台错误 ${errors.length}：\n${[...new Set(errors)].join('\n')}` : '无控制台错误');

if (shots) {
  const ids = await page.evaluate(() => [...document.querySelectorAll('[data-nav]')].map((e) => e.id));
  for (const id of ids) {
    const el = await page.$(`#${id}`);
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);
    await el.screenshot({ path: resolve(outDir, `${id}-${width}-${mode}.png`) });
  }
  console.log(`截图：${outDir}`);
}
await browser.close();
