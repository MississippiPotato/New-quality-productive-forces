// 全球数据中心用电：2024（实际）→ 2030（预测）斜率图 + 能效回应（PUE、枢纽新增算力占比）
// update(step)：0 聚焦用电斜率（回应面板淡化）；≥1 高亮回应面板
import * as d3 from 'd3';
import {
  observeSize,
  observeVisible,
  createSvg,
  chartHeight,
  tr,
  fmt,
  legend,
  hatch,
  note,
  srTable,
  styleAxis,
} from '../core/chartUtils.js';
import { theme } from '../core/theme.js';
import { bindTooltip } from '../core/tooltip.js';
import { t, tf, isEn } from '../core/i18n.js';
import '../styles/charts/energySlope.css';

const digits = (v) => (Number.isInteger(v) ? 0 : String(v).split('.')[1].length);
const fmtV = (v) => d3.format(`,.${digits(v)}f`)(v);
// 斜率图数值标签：英文限定词（about …）较长，用小号 tspan；中文保持原样“约415”
const setVal = (el, d, n) => {
  const q = tf(d, 'qualifier') || '';
  if (isEn() && q)
    el.selectAll('tspan')
      .data([`${q}\u00a0`, n])
      .join('tspan')
      .attr('class', (_, i) => (i ? null : 'es__vq'))
      .text((v) => v);
  else el.text(`${q}${n}`);
};
// 限定词 + 数值：中文“约415”，英文“about 415”（qualifier_en 由数据提供）
const qv = (d, v) => {
  const q = tf(d, 'qualifier') || '';
  return isEn() && q ? `${q} ${v}` : `${q}${v}`;
};

export function createEnergySlope(container, data) {
  const root = d3.select(container).classed('es', true);
  const elec = data.datacenter_electricity;
  const recs = elec.records.slice().sort((a, b) => a.year - b.year);
  const actual = recs.find((r) => !r.forecast) || recs[0];
  const forecast = recs.find((r) => r.forecast) || recs[recs.length - 1];
  const multiple = forecast.value / actual.value;
  const unit = tf(elec, 'unit');
  const sep = t('：', ': ');
  const tagW = isEn() ? 62 : 40;
  const statusLabel = (d) => (d.forecast ? t('预测', 'forecast') : t('实际', 'actual'));

  const grid = root.append('div').attr('class', 'es__grid');
  const left = grid.append('div').attr('class', 'es__left');
  const svg = createSvg(left.node(), 'es__svg').attr(
    'aria-label',
    t('全球数据中心用电斜率图', 'Slope chart of global data-centre electricity use'),
  );
  const right = grid.append('div').attr('class', 'es__right');
  legend(container, [
    { label: t('实际', 'Actual'), color: 'var(--rose)', shape: 'dot' },
    { label: t('预测', 'Forecast'), color: 'var(--orange)', shape: 'hatch' },
    { label: t('预测区段（虚线）', 'Forecast segment (dashed)'), color: 'var(--orange)', shape: 'dash' },
  ]);
  note(
    container,
    t(
      `* 倍数由两值推算：${fmtV(forecast.value)} ÷ ${fmtV(actual.value)} ≈ ${fmt.num(multiple, 2)}，两值均为“${actual.qualifier || ''}”值，倍数仅示意量级。`,
      `* Multiple derived from the two values: ${fmtV(forecast.value)} ÷ ${fmtV(actual.value)} ≈ ${fmt.num(multiple, 2)}. Both are “${tf(actual, 'qualifier') || ''}” values, so the multiple only indicates the order of magnitude.`,
    ),
  );
  if (elec.verify) note(container, `⚠ ${tf(elec, 'verify')}`, 'warn');
  srTable(
    container,
    t('全球数据中心用电', 'Global data-centre electricity use'),
    [t('年份', 'Year'), t('用电', 'Electricity'), t('单位', 'Unit'), t('性质', 'Status')],
    recs.map((r) => [r.year, qv(r, r.value), unit, statusLabel(r)]),
  );

  // ---- 回应面板 ----
  right
    .append('h4')
    .attr('class', 'es__rh')
    .text(t('回应：能效提升与算力布局', 'Response: efficiency gains and compute siting'));
  const items = right
    .selectAll('div.es__item')
    .data(data.responses || [])
    .join('div')
    .attr('class', 'es__item');
  const val = items.append('div').attr('class', 'es__val');
  // 英文限定词（over / more than …）放在数字前；中文“以上”等放在数字后
  if (isEn())
    val
      .append('span')
      .attr('class', 'es__q es__q--pre')
      .text((d) => tf(d, 'qualifier') || '');
  const num = val.append('span').attr('class', 'es__num');
  val
    .append('span')
    .attr('class', 'es__unit')
    .text((d) => tf(d, 'unit') || '');
  if (!isEn())
    val
      .append('span')
      .attr('class', 'es__q')
      .text((d) => d.qualifier || '');
  items
    .append('div')
    .attr('class', 'es__label')
    .text((d) => tf(d, 'label'));
  right
    .append('p')
    .attr('class', 'es__hint')
    .text(
      t(
        'PUE（电能利用效率）= 数据中心总能耗 ÷ IT 设备能耗，越低越节能。',
        'PUE (power usage effectiveness) = total data-centre energy ÷ IT equipment energy; lower means more efficient.',
      ),
    );

  // ---- 斜率图 ----
  const pat = hatch(svg, `es-hatch-${Math.random().toString(36).slice(2, 8)}`, 'var(--orange)');
  const defs = svg.select('defs');
  const gradId = `es-grad-${Math.random().toString(36).slice(2, 8)}`;
  const lg = defs
    .append('linearGradient')
    .attr('id', gradId)
    .attr('x1', 0)
    .attr('x2', 1)
    .attr('y1', 0)
    .attr('y2', 0);
  lg.append('stop').attr('offset', '0%').style('stop-color', 'var(--rose)');
  lg.append('stop').attr('offset', '100%').style('stop-color', 'var(--orange)');
  const areaId = `es-area-${Math.random().toString(36).slice(2, 8)}`;
  const ag = defs
    .append('linearGradient')
    .attr('id', areaId)
    .attr('x1', 0)
    .attr('x2', 0)
    .attr('y1', 0)
    .attr('y2', 1);
  ag.append('stop').attr('offset', '0%').style('stop-color', 'var(--orange)').style('stop-opacity', 0.22);
  ag.append('stop').attr('offset', '100%').style('stop-color', 'var(--orange)').style('stop-opacity', 0);

  const gy = svg.append('g').attr('class', 'y-axis');
  const gx = svg.append('g').attr('class', 'x-axis');
  const plot = svg.append('g');
  const yLabel = svg
    .append('text')
    .attr('class', 'axis-label')
    .attr('x', 0)
    .attr('y', 14)
    .text(`${t('单位', 'Unit')}${sep}${unit}`);
  const area = plot.append('path').attr('class', 'es__area').style('fill', `url(#${areaId})`);
  const link = plot.append('path').attr('class', 'es__line').style('stroke', `url(#${gradId})`);
  const mult = plot.append('g').attr('class', 'es__mult');
  mult.append('text').attr('class', 'es__mult-big').attr('text-anchor', 'middle');
  mult.append('text').attr('class', 'es__mult-sub').attr('text-anchor', 'middle');
  const pts = plot
    .selectAll('g.es__pt')
    .data(recs)
    .join((enter) => {
      const g = enter.append('g').attr('class', 'es__pt');
      g.append('circle').attr('class', 'es__halo');
      g.append('circle').attr('class', 'es__dot');
      g.append('text').attr('class', 'es__val-label');
      g.append('text').attr('class', 'es__year-label');
      const tag = g.append('g').attr('class', 'es__tag');
      tag.append('rect').attr('rx', 9).attr('height', 18).attr('width', tagW);
      tag
        .append('text')
        .attr('x', tagW / 2)
        .attr('y', 13)
        .attr('text-anchor', 'middle')
        .text(t('预测', 'Forecast'));
      return g;
    });
  pts.call(
    bindTooltip,
    (d) =>
      `<strong>${t(`${d.year} 年`, `${d.year}`)}${d.forecast ? t('（预测）', ' (forecast)') : ''}</strong><br>${t('全球数据中心用电', 'Global data-centre electricity use')}${sep}${qv(d, fmtV(d.value))} ${unit}`,
  );

  let width = 0;
  let played = false;
  let step = null;

  function render(animate) {
    if (!width) return;
    const sideBySide = width >= 640;
    grid.classed('is-side', sideBySide);
    const w = sideBySide ? Math.round(width * 0.58) : width;
    const h = chartHeight(w, { aspect: 0.72, min: 300, max: 400 });
    svg.attr('viewBox', `0 0 ${w} ${h}`).attr('width', w).attr('height', h);
    const m = { top: 70, right: 58, bottom: 34, left: 48 };
    const iw = w - m.left - m.right;
    const ih = h - m.top - m.bottom;
    plot.attr('transform', `translate(${m.left},${m.top})`);
    gy.attr('transform', `translate(${m.left},${m.top})`);
    gx.attr('transform', `translate(${m.left},${m.top + ih})`);
    const x = d3
      .scaleLinear()
      .domain([actual.year, forecast.year])
      .range([Math.min(60, iw * 0.2), iw - 8]);
    const y = d3
      .scaleLinear()
      .domain([0, forecast.value * 1.12])
      .nice()
      .range([ih, 0]);
    gy.call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat(d3.format(',')));
    styleAxis(gy);
    gy.selectAll('.tick line').attr('class', 'grid-line');
    gy.selectAll('.tick text').attr('x', -8);
    gx.call(
      d3
        .axisBottom(x)
        .tickValues(recs.map((r) => r.year))
        .tickFormat((v) => `${v}`)
        .tickSize(0),
    );
    styleAxis(gx);
    gx.selectAll('.tick text').attr('dy', '1.4em');
    yLabel.attr('x', 0);

    const xa = x(actual.year);
    const xf = x(forecast.value != null ? forecast.year : actual.year);
    const ya = y(actual.value);
    const yf = y(forecast.value);
    area.attr('d', `M${xa},${ya}L${xf},${yf}L${xf},${ih}L${xa},${ih}Z`);
    link.attr('d', `M${xa},${ya}L${xf},${yf}`);
    const len = Math.hypot(xf - xa, yf - ya);

    pts.attr('transform', (d) => `translate(${x(d.year)},${y(d.value)})`);
    pts
      .select('.es__halo')
      .attr('r', 15)
      .style('fill', (d) => (d.forecast ? 'var(--orange)' : 'var(--rose)'));
    pts
      .select('.es__dot')
      .attr('r', 8)
      .style('fill', (d) => (d.forecast ? pat : 'var(--rose)'))
      .style('stroke', (d) => (d.forecast ? 'var(--orange)' : 'var(--panel)'))
      .style('stroke-width', 2.5);
    pts
      .select('.es__val-label')
      .attr('text-anchor', 'middle')
      .attr('x', 0)
      .attr('y', -20)
      .style('fill', (d) => (d.forecast ? 'var(--orange)' : 'var(--text)'));
    pts
      .select('.es__year-label')
      .attr('text-anchor', 'middle')
      .attr('x', 0)
      .attr('y', 30)
      .text((d) => `${unit} · ${d.year} ${statusLabel(d)}`);
    pts
      .select('.es__tag')
      .style('display', (d) => (d.forecast ? null : 'none'))
      .attr('transform', `translate(${-tagW / 2},-64)`);

    const mx = (xa + xf) / 2;
    const my = (ya + yf) / 2;
    mult.attr('transform', `translate(${mx - 14},${my - 22})`);
    mult.select('.es__mult-big').text(`×${fmt.num(multiple, 1)}*`);
    mult.select('.es__mult-sub').attr('y', 18).text(`${forecast.year} ÷ ${actual.year}`);

    const showVals = (k) =>
      pts.select('.es__val-label').each(function (d) {
        setVal(d3.select(this), d, fmt.int(d.value * (d.forecast ? k : 1)));
      });

    if (animate && !theme.reducedMotion) {
      link
        .attr('stroke-dasharray', `${len} ${len}`)
        .attr('stroke-dashoffset', len)
        .transition()
        .duration(1200)
        .ease(d3.easeCubicInOut)
        .attr('stroke-dashoffset', 0)
        .on('end', () => link.attr('stroke-dasharray', null));
      area.attr('opacity', 0).transition().delay(500).duration(900).attr('opacity', 1);
      const fp = pts.filter((d) => d.forecast);
      fp.attr('opacity', 0).transition().delay(1000).duration(400).attr('opacity', 1);
      mult.attr('opacity', 0).transition().delay(1300).duration(500).attr('opacity', 1);
      showVals(0);
      fp.select('.es__val-label')
        .transition()
        .delay(1000)
        .duration(theme.countDuration)
        .ease(d3.easeCubicOut)
        .tween('count', function (d) {
          const el = d3.select(this);
          return (k) => setVal(el, d, fmt.int(d.value * k));
        });
      items
        .select('.es__num')
        .transition()
        .duration(theme.countDuration)
        .ease(d3.easeCubicOut)
        .tween('count', function (d) {
          const el = d3.select(this);
          return (k) =>
            el.text(
              d3
                .format(`,.${digits(d.value)}f`)(d.value * k)
                .replace(/^-?0(\.0+)?$/, '0'),
            );
        })
        .on('end', function (d) {
          d3.select(this).text(fmtV(d.value));
        });
    } else {
      link.interrupt().attr('stroke-dasharray', null).attr('stroke-dashoffset', null);
      area.interrupt().attr('opacity', 1);
      pts.interrupt().attr('opacity', 1);
      mult.interrupt().attr('opacity', 1);
      showVals(1);
      num.text((d) => fmtV(d.value));
    }
  }

  function applyStep() {
    const s = step;
    right.classed('is-hot', s != null && s >= 1).classed('is-dim', s === 0);
    tr(link).style('opacity', s != null && s >= 1 ? 0.55 : 1);
    tr(area).style('opacity', s != null && s >= 1 ? 0.5 : 1);
  }

  num.text((d) => fmtV(d.value));
  const stopSize = observeSize(container, ({ width: w }) => {
    width = w;
    render(false);
  });
  const stopVis = observeVisible(container, (v) => {
    if (!v || played) return;
    played = true;
    render(true);
  });

  return {
    update(s) {
      step = Math.max(0, s | 0);
      applyStep();
    },
    resize() {
      width = container.clientWidth;
      render(false);
    },
    destroy() {
      stopSize();
      stopVis();
      svg.selectAll('*').interrupt();
      root.selectAll('*').remove();
      root.classed('es', false);
    },
  };
}
