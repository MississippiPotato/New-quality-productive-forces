import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.DEV_URL || 'http://127.0.0.1:4176';
const width = Number(process.argv[2] || 1280);
const lang = process.argv[3] || 'zh';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width, height: 900 } });
const errors = [];
const externalResponses = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('response', (response) => {
  const url = new URL(response.url());
  if (response.status() >= 400 && url.origin !== new URL(base).origin) externalResponses.push({ host: url.hostname, status: response.status() });
});
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  const location = message.location().url;
  if (/429/.test(message.text()) && location && new URL(location).origin !== new URL(base).origin) return;
  errors.push(message.text());
});
await mkdir('output/playwright', { recursive: true });
const current = () => page.evaluate(() => document.body.dataset.chapter);
async function openChapter(id) {
  await page.locator('.reader-menu').click();
  await page.locator(`.directory-list a[href="#${id}"]`).click();
  await page.waitForFunction((expected) => document.body.dataset.chapter === expected, id);
  await page.waitForTimeout(180);
}
try {
  await page.goto(`${base}/?lang=${lang}&theme=${width < 800 ? 'light' : 'dark'}`, { waitUntil: 'networkidle' });
  assert.equal(await current(), 'top');
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `output/playwright/home-${width}-${lang}.png` });
  await openChapter('ch5');
  assert.equal(await page.locator('[data-nav]:visible').count(), 1);
  await page.locator('.reader-next').click();
  assert.equal(await current(), 'ch6');
  await page.locator('.reader-back').click();
  await page.waitForFunction(() => document.body.dataset.chapter === 'ch5');
  await page.goForward();
  await page.waitForFunction(() => document.body.dataset.chapter === 'ch6');
  await page.locator('.reader-prev').click();
  assert.equal(await current(), 'ch5');
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await current(), 'ch5');
  await page.locator('.reader-menu').click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.chapter-directory').evaluate((el) => el.open), false);
  await openChapter('ch1');
  await page.locator('figure[data-chart="factorForce"]').scrollIntoViewIfNeeded();
  await page.locator('.ff__node--worker').press('Enter');
  await page.waitForFunction(() => document.body.dataset.chapter === 'ch5');
  const touch = await page.locator('.reader-nav button').evaluateAll((buttons) => buttons.every((button) => button.getBoundingClientRect().height >= 44));
  assert.ok(touch, 'Reading navigation touch targets must be at least 44px high');
  const ids = await page.locator('[data-nav]').evaluateAll((sections) => sections.map((section) => section.id));
  const failures = [];
  let charts = 0;
  for (const id of ids) {
    console.log(`Checking ${id} (${width}, ${lang})`);
    await openChapter(id);
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; });
    for (let y = 0; y < (await page.evaluate(() => document.documentElement.scrollHeight)) + 900; y += 500) {
      await page.evaluate((offset) => window.scrollTo(0, offset), y);
      await page.waitForTimeout(85);
    }
    await page.waitForTimeout(300);
    await page.waitForFunction(() => [...document.querySelectorAll('[data-nav]:not([hidden]) figure[data-chart]')].every((fig) => fig.querySelector('.fig__body')?.children.length), null, { timeout: 30000 });
    await page.waitForFunction(() => !document.querySelector('[data-nav]:not([hidden]) [aria-busy="true"]'), null, { timeout: 30000 });
    const report = await page.locator(`#${id}`).evaluate((chapter) => ({
      count: chapter.querySelectorAll('figure[data-chart]').length,
      failed: [...chapter.querySelectorAll('figure[data-chart]')].filter((fig) => !fig.querySelector('.fig__body')?.children.length || fig.querySelector('.chart-note--warn')?.textContent.includes('加载失败')).map((fig) => fig.dataset.chart),
      missing: chapter.querySelectorAll('.fact--missing').length,
      overflow: document.documentElement.scrollWidth > innerWidth,
    }));
    charts += report.count;
    if (report.failed.length || report.missing || report.overflow) failures.push({ id, ...report });
  }
  for (const [id, name, snippet] of [['ch2', 'computeArea', lang === 'en' ? 'FP16' : '算力总规模'], ['ch2', 'regionDonut', 'PUE'], ['ch6', 'flywheel', lang === 'en' ? 'conceptual' : '概念']]) {
    await openChapter(id);
    const figure = page.locator(`figure[data-chart="${name}"]`);
    await figure.scrollIntoViewIfNeeded();
    await figure.locator('.fig__src').click();
    assert.ok((await page.locator('.src-dialog .source-methods').innerText()).includes(snippet));
    await page.keyboard.press('Escape');
    assert.equal(await figure.locator('.chart-note--warn').count(), 0);
  }
  await openChapter('ch5');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `output/playwright/work-${width}-${lang}.png` });
  await page.locator('#btn-lang').click();
  assert.equal(await current(), 'ch5');
  const other = lang === 'en' ? 'zh' : 'en';
  assert.equal(await page.locator('html').getAttribute('data-lang'), other);
  await openChapter('ch2');
  const compute = page.locator('figure[data-chart="computeArea"]');
  await compute.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await compute.locator('.fig__src').click();
  assert.ok((await page.locator('.src-dialog .source-methods').innerText()).includes(other === 'en' ? 'different metrics' : '不同指标'));
  await page.keyboard.press('Escape');
  await page.locator('.reader-menu').click();
  await page.screenshot({ path: `output/playwright/directory-${width}-${lang}.png` });
  await page.keyboard.press('Escape');
  assert.equal(charts, 34);
  if (errors.length || failures.length) console.log(JSON.stringify({ errors, failures }));
  assert.deepEqual(failures, []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ width, lang, chapters: ids.length, charts, failures, errors, externalResponses, navigation: 'passed', methods: 'passed', languageSwitch: 'passed' }));
} finally {
  await browser.close();
}
