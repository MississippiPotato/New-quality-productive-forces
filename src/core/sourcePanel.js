// 来源弹窗（单图）与数据来源总面板（全站），中英双语
import { loader } from './loader.js';
import { t, tf, isEn, onLangChange } from './i18n.js';
import { chartMethodsHtml, allMethodsHtml } from './chartMethods.js';

const REL = () => ({
  A: { label: t('A 官方/原始', 'A · Official / primary'), cls: 'a' },
  B: { label: t('B 权威转引', 'B · Authoritative secondary'), cls: 'b' },
  C: { label: t('C 媒体/二手转引', 'C · Media / secondary'), cls: 'c' },
  D: { label: t('推算', 'Derived'), cls: 'd' },
  S: { label: t('示意', 'Illustrative'), cls: 's' },
});
const CHAPTERS = () => [
  t('序章', 'Prologue'),
  t('第 1 章 · 概念与政策', 'Ch. 1 · Concept & policy'),
  t('第 2 章 · 算力', 'Ch. 2 · Computing power'),
  t('第 3 章 · 大模型', 'Ch. 3 · Large models'),
  t('第 4 章 · 劳动对象', 'Ch. 4 · Objects of labour'),
  t('第 5 章 · 劳动者', 'Ch. 5 · Workers'),
  t('第 6 章 · 生产力飞轮', 'Ch. 6 · Productivity flywheel'),
  t('第 7 章 · 产业赋能', 'Ch. 7 · Industry'),
  t('第 8 章 · 经济贡献', 'Ch. 8 · Economic contribution'),
  t('第 9 章 · 全球竞争', 'Ch. 9 · Global competition'),
  t('第 10 章 · 挑战与治理', 'Ch. 10 · Challenges & governance'),
  t('第 11 章 · 展望与模拟器', 'Ch. 11 · Outlook & simulator'),
];

let dialog;
let lastFocus;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function sourceItem(s) {
  const rel = REL()[s.reliability] || REL().C;
  const quoteEn = isEn() && s.quote_en ? `<p class="src__summary"><em>${esc(s.quote_en)}</em></p>` : '';
  return `<li class="src">
    <div class="src__head"><span class="badge badge--${rel.cls}">${rel.label}</span>
      <strong>${esc(tf(s, 'org'))}</strong> · ${esc(tf(s, 'title'))} <span class="src__date">${esc(s.date)}</span></div>
    ${s.quote ? `<blockquote class="src__quote">“${esc(s.quote)}”</blockquote>${quoteEn}` : ''}
    ${s.summary ? `<p class="src__summary">${esc(tf(s, 'summary'))}</p>` : ''}
    ${
      s.url
        ? `<a class="src__url" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a>`
        : `<span class="src__url src__url--todo">${t('链接待补（见 TODO.md）', 'Link pending (see TODO.md)')}</span>`
    }
  </li>`;
}

function ensureDialog() {
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'src-dialog';
  dialog.setAttribute('aria-labelledby', 'src-dialog-title');
  dialog.innerHTML = `<div class="src-dialog__inner">
    <header class="src-dialog__head"><h2 id="src-dialog-title"></h2>
      <button type="button" class="icon-btn src-dialog__close">✕</button></header>
    <div class="src-dialog__body"></div></div>`;
  document.body.append(dialog);
  dialog.querySelector('.src-dialog__close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => lastFocus?.focus?.());
  return dialog;
}

function show(title, html) {
  const d = ensureDialog();
  lastFocus = document.activeElement;
  d.querySelector('.src-dialog__close').setAttribute('aria-label', t('关闭', 'Close'));
  d.querySelector('#src-dialog-title').textContent = title;
  d.querySelector('.src-dialog__body').innerHTML = html;
  d.showModal();
}

export async function openSources(ids, title, chartName) {
  const sources = await loader.json('sources');
  const byId = new Map(sources.map((s) => [s.id, s]));
  const list = ids.map((id) => byId.get(id)).filter(Boolean);
  show(`${t('来源与方法', 'Sources & methods')} · ${title}`, `${chartMethodsHtml(chartName)}<ul class="src-list">${list.map(sourceItem).join('')}</ul>`);
}

export async function openAllSources() {
  const sources = await loader.json('sources');
  const groups = CHAPTERS()
    .map((name, i) => ({ name, items: sources.filter((s) => (s.chapter || []).includes(i)) }))
    .filter((g) => g.items.length);
  const other = sources.filter((s) => !(s.chapter || []).length);
  const legendHtml = Object.values(REL())
    .map((r) => `<span class="badge badge--${r.cls}">${r.label}</span>`)
    .join(' ');
  show(
    t(`数据来源总面板（${sources.length} 条）`, `All data sources (${sources.length})`),
    `${allMethodsHtml()}<p class="src-legend">${t('可信度', 'Reliability')}：${legendHtml}</p>
     ${groups.map((g) => `<h3>${g.name}</h3><ul class="src-list">${g.items.map(sourceItem).join('')}</ul>`).join('')}
     ${other.length ? `<h3>${t('其他', 'Other')}</h3><ul class="src-list">${other.map(sourceItem).join('')}</ul>` : ''}`,
  );
}

/** 页面底部内嵌的来源统计（不弹窗） */
export async function renderSourceTable(el) {
  renderMethods();
  const sources = await loader.json('sources');
  const counts = sources.reduce((m, s) => ((m[s.reliability] = (m[s.reliability] || 0) + 1), m), {});
  el.innerHTML = `<p class="src-summary">${Object.entries(REL())
    .map(([k, r]) => `<span class="badge badge--${r.cls}">${r.label}</span> ${counts[k] || 0}${t(' 条', '')}`)
    .join(' · ')}</p>`;
}

function renderMethods() {
  const el = document.getElementById('chart-methods');
  if (el) el.innerHTML = allMethodsHtml();
}
renderMethods();
onLangChange(() => {
  renderMethods();
  const summary = document.getElementById('source-summary');
  if (summary) renderSourceTable(summary);
});
