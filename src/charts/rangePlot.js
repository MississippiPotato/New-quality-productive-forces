// AI 经济贡献测算（预测区间）：三个独立刻度的小多图 + 中国 2035 预测卡片
// update(step)：0 全部；1/2/3 依次突出第 1/2/3 个面板；4 突出中国 2035 预测
import * as d3 from 'd3';
import { observeSize, observeVisible, createSvg, tr, fmt, note, srTable } from '../core/chartUtils.js';
import { theme } from '../core/theme.js';
import { bindTooltip } from '../core/tooltip.js';
import { t, tf, isEn } from '../core/i18n.js';
import '../styles/charts/rangePlot.css';

const panelDefs = () => [
  { key: 'value_ranges', title: t('全球年度经济价值', 'Global annual economic value') },
  { key: 'industry_ranges', title: t('分行业年度价值', 'Annual value by industry') },
  { key: 'productivity_ranges', title: t('劳动生产率增速提升', 'Boost to labour-productivity growth') },
];
const num = (v) => (Math.abs(v) >= 100 ? fmt.int(v) : fmt.num(v, 1));
const clean = (v) => +v.toFixed(6);

// 含“万亿 / 亿”量级的中文单位：英文换算为等值（亿美元 → $ billion，数值 ÷ 10；万亿元 → trillion yuan）
const EN_SCALE = [
  [/^万亿美元/, 1, '$', 'trillion'],
  [/^亿美元/, 0.1, '$', 'billion'],
  [/^万亿元/, 1, '', 'trillion yuan'],
  [/^亿元/, 0.1, '', 'billion yuan'],
];
/** 返回 { k: 数值换算系数, unit: 单位文字, range(lo, hi), one(v) } */
function unitInfo(o) {
  const u = o.unit || '';
  if (isEn()) {
    for (const [re, k, cur, word] of EN_SCALE) {
      const rest = u.replace(re, '');
      if (rest === u || (rest && rest !== '/年')) continue;
      const per = rest ? ' per year' : '';
      return {
        k,
        unit: `${cur ? 'US$ ' : ''}${word}${per}`,
        range: (lo, hi) => `${cur}${num(lo)}–${num(hi)} ${word}${per}`,
        one: (v) => `${cur}${num(v)} ${word}${per}`,
      };
    }
  }
  const unit = tf(o, 'unit') || '';
  return { k: 1, unit, range: (lo, hi) => `${num(lo)}–${num(hi)} ${unit}`, one: (v) => `${num(v)} ${unit}` };
}

export function createRangePlot(container, data) {
  const panels = panelDefs()
    .filter((p) => data[p.key]?.records?.length)
    .map((p) => {
      const u = unitInfo(data[p.key]);
      const records = data[p.key].records.map((r) => ({
        ...r,
        low: clean(r.low * u.k),
        high: clean(r.high * u.k),
      }));
      return { ...p, ...data[p.key], u, records };
    });
  const cn = data.china_gdp_2035;
  const cnU = cn ? unitInfo(cn) : null;
  const tagText = t('预测', 'Forecast');
  const uid = Math.random().toString(36).slice(2, 8);

  const root = d3.select(container).classed('range-plot', true);
  const grid = root.append('div').attr('class', 'rp-grid');
  const cards = grid.selectAll('section.rp-panel').data(panels).join('section').attr('class', 'rp-panel');
  const head = cards.append('header').attr('class', 'rp-panel__head');
  head
    .append('span')
    .attr('class', 'rp-panel__title')
    .text((p) => p.title);
  head.append('span').attr('class', 'tag tag--forecast').text(tagText);
  cards
    .append('div')
    .attr('class', 'rp-panel__unit')
    .text((p) => t(`单位：${p.unit}`, `Unit: ${p.u.unit}`));
  const svgs = cards
    .append('div')
    .attr('class', 'rp-panel__body')
    .nodes()
    .map((n) => createSvg(n));

  let tile = null;
  if (cn) {
    tile = root.append('div').attr('class', 'rp-cn').attr('tabindex', 0);
    const left = tile.append('div').attr('class', 'rp-cn__main');
    left
      .append('div')
      .attr('class', 'rp-cn__eyebrow')
      .html(`<span class="tag tag--forecast">${tagText}</span> ${t('2035 年 · 中国', '2035 · China')}`);
    const v = left.append('div').attr('class', 'rp-cn__value');
    v.append('span')
      .attr('class', 'rp-cn__q')
      .text(tf(cn, 'qualifier') || '');
    v.append('strong').text(fmt.num(clean(cn.value * cnU.k), 1));
    v.append('span').attr('class', 'rp-cn__u').text(cnU.unit);
    left
      .append('div')
      .attr('class', 'rp-cn__desc')
      .text(t('人工智能对 GDP 的贡献规模', "AI's contribution to GDP"));
    if (cn.gdp_share_low != null) {
      const share = tile.append('div').attr('class', 'rp-cn__share');
      share.append('div').attr('class', 'rp-cn__desc').text(t('占 GDP 比重', 'Share of GDP'));
      share
        .append('div')
        .attr('class', 'rp-cn__range')
        .text(`${fmt.num(cn.gdp_share_low, 1)}%–${fmt.num(cn.gdp_share_high, 1)}%`);
      // 0–10% 迷你刻度上的区间条
      const bar = share.append('div').attr('class', 'rp-cn__bar');
      bar
        .append('i')
        .style('left', `${cn.gdp_share_low * 10}%`)
        .style('width', `${(cn.gdp_share_high - cn.gdp_share_low) * 10}%`);
      share.append('div').attr('class', 'rp-cn__scale').html('<span>0%</span><span>10%</span>');
    }
    tile
      .append('div')
      .attr('class', 'rp-cn__org')
      .text(`${t('测算：', 'Estimate: ')}${tf(cn, 'org')}`);
  }
  note(
    container,
    t(
      '以上均为机构测算的预测区间（低值–高值），并非统计实际值；三个面板单位与刻度各不相同，不可横向比较长度。',
      'All figures are forecast ranges (low–high) estimated by institutions, not statistical actuals. The three panels use different units and scales, so bar lengths cannot be compared across panels.',
    ),
    'forecast',
  );
  srTable(
    container,
    t('AI 经济贡献测算区间（预测）', 'Estimated economic contribution of AI (forecast ranges)'),
    [
      t('类别', 'Category'),
      t('项目', 'Item'),
      t('低值', 'Low'),
      t('高值', 'High'),
      t('单位', 'Unit'),
      t('机构', 'Institution'),
    ],
    [
      ...panels.flatMap((p) =>
        p.records.map((r) => [p.title, tf(r, 'label'), r.low, r.high, p.u.unit, tf(r, 'org')]),
      ),
      ...(cn
        ? [
            [
              t('中国 2035', 'China 2035'),
              t('AI 对 GDP 的贡献', 'AI contribution to GDP'),
              t(
                `${cn.qualifier || ''}${cn.value}`,
                `${tf(cn, 'qualifier') || ''} ${clean(cn.value * cnU.k)}`.trim(),
              ),
              '',
              cnU.unit,
              tf(cn, 'org'),
            ],
          ]
        : []),
    ],
  );

  let width = 0;
  let step = 0;
  let shown = theme.reducedMotion;

  function renderPanel(svg, p, pi, animate) {
    const w = svg.node().parentNode.clientWidth;
    if (!w) return;
    const rowH = 64;
    const m = { top: 6, right: 14, bottom: 24, left: 12 };
    const height = m.top + m.bottom + rowH * p.records.length;
    svg.attr('viewBox', `0 0 ${w} ${height}`).attr('width', w).attr('height', height);
    const iw = w - m.left - m.right;
    const max = d3.max(p.records, (r) => r.high);
    const x = d3
      .scaleLinear()
      .domain([0, max * 1.12])
      .nice()
      .range([0, iw]);
    const tt = (sel, delay) => (animate ? tr(sel, delay) : sel);

    let defs = svg.select('defs');
    if (defs.empty()) {
      defs = svg.append('defs');
      const g = defs
        .append('linearGradient')
        .attr('id', `rp-grad-${uid}`)
        .attr('x1', 0)
        .attr('x2', 1)
        .attr('y1', 0)
        .attr('y2', 0);
      [
        [0, 0.15],
        [0.5, 0.75],
        [1, 0.15],
      ].forEach(([o, a]) =>
        g.append('stop').attr('offset', o).style('stop-color', 'var(--orange)').style('stop-opacity', a),
      );
    }
    const gx = svg.selectAll('g.x-axis').data([0]).join('g').attr('class', 'x-axis axis');
    gx.attr('transform', `translate(${m.left},${m.top + rowH * p.records.length})`).call(
      d3
        .axisBottom(x)
        .ticks(Math.max(2, Math.floor(iw / 70)))
        .tickSize(-(rowH * p.records.length))
        .tickFormat((d) => num(d)),
    );
    gx.select('.domain').remove();
    gx.selectAll('.tick line').attr('class', 'grid-line');

    const plot = svg.selectAll('g.rp-plot').data([0]).join('g').attr('class', 'rp-plot');
    plot.attr('transform', `translate(${m.left},${m.top})`);
    const row = plot
      .selectAll('g.rp-row')
      .data(p.records, (r) => r.label)
      .join((enter) => {
        const g = enter.append('g').attr('class', 'rp-row');
        g.append('text').attr('class', 'rp-label');
        g.append('rect').attr('class', 'rp-range');
        g.append('line').attr('class', 'rp-cap rp-cap--lo');
        g.append('line').attr('class', 'rp-cap rp-cap--hi');
        g.append('text').attr('class', 'rp-val rp-val--lo');
        g.append('text').attr('class', 'rp-val rp-val--hi');
        return g;
      });
    row.attr('transform', (r, i) => `translate(0,${i * rowH})`);
    row.call(
      bindTooltip,
      (r) =>
        `<strong>${tf(r, 'label')}</strong><br>${p.u.range(r.low, r.high)}<br><em>${tf(r, 'org')} · ${t('预测区间', 'forecast range')}</em>${r.note ? `<br>${tf(r, 'note')}` : ''}`,
    );
    const by = 30;
    const bh = 14;
    const label = row.select('.rp-label').attr('x', 0).attr('y', 16).text(null);
    label
      .append('tspan')
      .attr('class', 'rp-label__main')
      .text((r) => tf(r, 'label'));
    label
      .append('tspan')
      .attr('class', 'rp-label__org')
      .attr('dx', 8)
      .text((r) => tf(r, 'org'));
    // 英文标签较长：放不下时先省略机构名（悬停提示中仍有），仍放不下则缩小字号
    label.each(function () {
      const el = d3.select(this);
      const len = () => this.getComputedTextLength?.() || 0;
      if (len() <= iw) return;
      el.select('.rp-label__org').remove();
      const l = len();
      if (l > iw)
        el.select('.rp-label__main').style('font-size', `${Math.max(10, (13 * iw) / l).toFixed(1)}px`);
    });

    const lo = (r) => (shown ? x(r.low) : x((r.low + r.high) / 2));
    const hi = (r) => (shown ? x(r.high) : x((r.low + r.high) / 2));
    tt(row.select('.rp-range'), pi * 120)
      .attr('x', lo)
      .attr('width', (r) => Math.max(0, hi(r) - lo(r)))
      .attr('y', by)
      .attr('height', bh)
      .attr('rx', bh / 2);
    row.select('.rp-range').style('fill', `url(#rp-grad-${uid})`);
    tt(row.select('.rp-cap--lo'), pi * 120)
      .attr('x1', lo)
      .attr('x2', lo)
      .attr('y1', by - 4)
      .attr('y2', by + bh + 4);
    tt(row.select('.rp-cap--hi'), pi * 120)
      .attr('x1', hi)
      .attr('x2', hi)
      .attr('y1', by - 4)
      .attr('y2', by + bh + 4);
    // 端点数值：放在端点外侧，空间不足时放到区间内侧
    row.select('.rp-val--lo').each(function (r) {
      const el = d3.select(this).text(num(r.low));
      const outside = x(r.low) - 6 - 30 >= 0;
      el.attr('text-anchor', outside ? 'end' : 'start')
        .attr('y', by + bh / 2 + 4)
        .attr('x', outside ? x(r.low) - 6 : x(r.low) + 6);
    });
    row.select('.rp-val--hi').each(function (r) {
      const el = d3.select(this).text(num(r.high));
      const outside = x(r.high) + 6 + 34 <= iw;
      el.attr('text-anchor', outside ? 'start' : 'end')
        .attr('y', by + bh / 2 + 4)
        .attr('x', outside ? x(r.high) + 6 : x(r.high) - 6);
    });
    tt(row.selectAll('.rp-val'), 300).attr('opacity', shown ? 1 : 0);
  }

  function render(animate) {
    if (!width) return;
    cards
      .classed('is-dim', (p, i) => step >= 1 && step !== i + 1)
      .classed('is-hot', (p, i) => step === i + 1);
    tile?.classed('is-hot', step >= 4).classed('is-dim', step >= 1 && step < 4);
    svgs.forEach((svg, i) => renderPanel(svg, panels[i], i, animate));
  }

  const stopVis = shown
    ? () => {}
    : observeVisible(container, (vis) => {
        if (!vis || shown) return;
        shown = true;
        stopVis();
        render(true);
      });

  const stop = observeSize(container, ({ width: w }) => {
    width = w;
    // 等网格布局完成后再按各面板宽度绘制
    requestAnimationFrame(() => render(false));
  });

  return {
    update(s) {
      step = s;
      render(true);
    },
    resize() {
      width = container.clientWidth;
      render(false);
    },
    destroy() {
      stop();
      stopVis();
      root.selectAll('*').remove();
    },
  };
}
