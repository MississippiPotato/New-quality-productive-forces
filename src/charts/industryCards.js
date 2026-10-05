// 行业卡片网格：点击 / Enter / 空格翻面（CSS 3D），正面图标 + 行业名，背面为有来源的数据或定性案例
// update(step)：0 全部正面；≥1 依次翻到背面（滚动叙事自动展示数据，用户仍可手动翻转）
import * as d3 from 'd3';
import { fmt, srTable } from '../core/chartUtils.js';
import { theme } from '../core/theme.js';
import { t, tf, isEn } from '../core/i18n.js';
import '../styles/charts/industryCards.css';

// 自绘线性图标（48×48，描边取 currentColor）
const ICONS = {
  factory: ['M5 42V24l10 6v-6l10 6v-6l10 6V8h7v34z', 'M11 36h4M21 36h4M31 36h4', 'M35 8V4h7v4'],
  bank: ['M5 17L24 6l19 11z', 'M10 21v15M18 21v15M30 21v15M38 21v15', 'M6 40h36M4 44h40', 'M24 11.5v.5'],
  dna: [
    'M15 4c0 11 18 9 18 20S15 33 15 44',
    'M33 4c0 11-18 9-18 20s18 9 18 20',
    'M18 9h12M20 17h8M20 31h8M18 39h12',
  ],
  car: ['M4 33v-8l6-11h26l8 11v8z', 'M13 24l3.5-6h14l4.5 6z', 'M4 33h40'],
  cart: ['M3 8h6l5 23h25l5-16H11.5', 'M16 23h25'],
  leaf: ['M9 39C9 19 21 8 41 8c0 19-11 31-32 31z', 'M9 39L30 18', 'M19 29h7M24 24v-6'],
  book: ['M24 12c-5-3-11-4-17-3v27c6-1 12 0 17 3', 'M24 12c5-3 11-4 17-3v27c-6-1-12 0-17 3', 'M24 12v27'],
};
const ICON_CIRCLES = {
  car: [
    [14, 34, 4.5],
    [34, 34, 4.5],
  ],
  cart: [
    [18, 39, 3],
    [35, 39, 3],
  ],
};
const ACCENTS = [
  'var(--cyan)',
  'var(--violet)',
  'var(--green)',
  'var(--blue)',
  'var(--orange)',
  'var(--worker)',
  'var(--rose)',
];

// 只认中文 label 中的“（预测）”标注：AlphaFold 的“蛋白质结构预测”是技术名词，不是预测值
const isForecast = (f) => /[（(]预测[)）]/.test(f.label);
const cleanLabel = (s) => (s || '').replace(/（预测）|\(预测\)|\s*\(forecast\)/gi, '').trim();
// 英文模式下优先使用数据提供的 value_en / unit_en（如“2000–3400 亿美元”→“$200–340 billion”）
const valueOf = (f) => (isEn() && f.value_en != null ? f.value_en : f.value);
const unitOf = (f) => (isEn() && f.unit_en != null ? f.unit_en : f.unit);
const factLabel = (f) => cleanLabel(tf(f, 'label'));
const kindLabel = (kind) => (kind === 'case' ? t('案例', 'Case') : t('数据', 'Data'));

function fmtValue(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  return Number.isInteger(v) ? fmt.int(v) : fmt.num(v, 2);
}

export function createIndustryCards(container, data) {
  const root = d3.select(container).classed('ic', true);
  const grid = root.append('div').attr('class', 'ic__grid').attr('role', 'list');
  const records = data.records || [];
  srTable(
    container,
    tf(data, 'title') || t('行业卡片', 'Industry cards'),
    [t('行业', 'Industry'), t('类型', 'Type'), t('指标', 'Indicator'), t('数值', 'Value'), t('单位', 'Unit')],
    records.flatMap((r) =>
      r.facts?.length
        ? r.facts.map((f) => [
            tf(r, 'name'),
            kindLabel(r.kind),
            tf(f, 'label'),
            fmtValue(valueOf(f)) ?? '—',
            unitOf(f) || '',
          ])
        : [[tf(r, 'name'), kindLabel('case'), tf(r, 'text') || '', '—', '']],
    ),
  );

  const cell = grid
    .selectAll('div.ic__cell')
    .data(records, (d) => d.key)
    .join('div')
    .attr('class', 'ic__cell')
    .attr('role', 'listitem');
  const card = cell
    .append('div')
    .attr('class', (d) => `ic__card ic__card--${d.kind}`)
    .attr('role', 'button')
    .attr('tabindex', 0)
    .attr('aria-pressed', 'false')
    .attr('aria-label', (d) =>
      t(
        `${d.name}：翻面查看${d.kind === 'case' ? '案例说明' : '数据'}`,
        `${tf(d, 'name')}: flip to see ${d.kind === 'case' ? 'case note' : 'data'}`,
      ),
    )
    .style('--accent', (d, i) => (d.kind === 'case' ? 'var(--slate)' : ACCENTS[i % ACCENTS.length]))
    .style('--i', (_, i) => i);
  const inner = card.append('div').attr('class', 'ic__inner');

  // ---- 正面 ----
  const front = inner.append('div').attr('class', 'ic__face ic__front');
  const icon = front
    .append('div')
    .attr('class', 'ic__icon')
    .append('svg')
    .attr('viewBox', '0 0 48 48')
    .attr('aria-hidden', 'true');
  icon.each(function (d) {
    const s = d3.select(this);
    (ICONS[d.icon] || ICONS.factory).forEach((p) => s.append('path').attr('d', p));
    (ICON_CIRCLES[d.icon] || []).forEach(([cx, cy, r]) =>
      s.append('circle').attr('cx', cx).attr('cy', cy).attr('r', r),
    );
  });
  front
    .append('h4')
    .attr('class', 'ic__name')
    .text((d) => tf(d, 'name'));
  front
    .append('span')
    .attr('class', (d) => `ic__kind ic__kind--${d.kind}`)
    .text((d) => kindLabel(d.kind));
  front
    .append('p')
    .attr('class', 'ic__teaser')
    .text((d) => (d.facts?.length ? d.facts.map(factLabel).join(' / ') : tf(d, 'text') || ''));
  front
    .append('span')
    .attr('class', 'ic__hint')
    .attr('aria-hidden', 'true')
    .text(t('点击翻面 ↻', 'Click to flip ↻'));

  // ---- 背面 ----
  const back = inner.append('div').attr('class', 'ic__face ic__back').attr('aria-hidden', 'true');
  const bh = back.append('div').attr('class', 'ic__back-head');
  bh.append('span')
    .attr('class', 'ic__back-name')
    .text((d) => tf(d, 'name'));
  bh.append('span')
    .attr('class', (d) => `ic__kind ic__kind--${d.kind}`)
    .text((d) => kindLabel(d.kind));
  back
    .filter((d) => d.facts?.length)
    .append('ul')
    .attr('class', 'ic__facts')
    .selectAll('li')
    .data((d) => d.facts)
    .join('li')
    .attr(
      'class',
      (f) => `ic__fact ${isForecast(f) ? 'is-forecast' : ''} ${f.value == null ? 'is-qual' : ''}`,
    )
    .each(function (f) {
      const li = d3.select(this);
      const v = fmtValue(valueOf(f));
      if (v != null) {
        const row = li.append('div').attr('class', 'ic__value');
        if (f.from != null)
          row
            .append('span')
            .attr('class', 'ic__from')
            .text(`${fmtValue(isEn() && f.from_en != null ? f.from_en : f.from)} → `);
        row.append('span').attr('class', 'ic__num').text(v);
        const unit = unitOf(f);
        if (unit) row.append('span').attr('class', 'ic__unit').text(unit);
        if (isForecast(f)) row.append('span').attr('class', 'tag tag--forecast').text(t('预测', 'Forecast'));
      } else {
        li.append('span').attr('class', 'ic__qual').text(t('定性', 'Qualitative'));
      }
      li.append('div').attr('class', 'ic__label').text(factLabel(f));
    });
  back
    .filter((d) => d.kind === 'case' || !d.facts?.length)
    .append('p')
    .attr('class', 'ic__text')
    .text((d) => tf(d, 'text') || t('暂无可靠量化来源。', 'No reliable quantitative source yet.'));
  back
    .append('span')
    .attr('class', 'ic__hint')
    .attr('aria-hidden', 'true')
    .text(t('再次点击翻回 ↺', 'Click again to flip back ↺'));

  function setFlip(sel, on) {
    sel.classed('is-flipped', on).attr('aria-pressed', String(on));
    sel.select('.ic__front').attr('aria-hidden', on ? 'true' : null);
    sel.select('.ic__back').attr('aria-hidden', on ? null : 'true');
  }
  card
    .on('click', function () {
      const s = d3.select(this);
      setFlip(s, !s.classed('is-flipped'));
    })
    .on('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const s = d3.select(this);
        setFlip(s, !s.classed('is-flipped'));
      }
    });

  let timers = [];
  const clearTimers = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };

  return {
    update(step) {
      clearTimers();
      const on = (step | 0) >= 1;
      if (theme.reducedMotion) return setFlip(card, on);
      card.each(function (_, i) {
        timers.push(setTimeout(() => setFlip(d3.select(this), on), i * 90));
      });
    },
    resize() {},
    destroy() {
      clearTimers();
      root.selectAll('*').remove();
      root.classed('ic', false);
    },
  };
}
