// 生成式 AI 服务累计备案：阶梯线 + 相邻公告间月均新增（推算）+ 累计登记
// update(step)：0 阶梯线；1 + 月均新增柱（下方面板）；2 + 登记数标记
import * as d3 from 'd3';
import {
  observeSize,
  observeVisible,
  createSvg,
  chartHeight,
  tr,
  fmt,
  legend,
  note,
  styleAxis,
  toDate,
  srTable,
} from '../core/chartUtils.js';
import { bindTooltip } from '../core/tooltip.js';
import { theme } from '../core/theme.js';
import { t, tf } from '../core/i18n.js';
import '../styles/charts/stepFilings.css';

const DAYS_PER_MONTH = 365.25 / 12;

export function createStepFilings(container, data) {
  const unit = tf(data, 'unit') || t('款', 'services');
  const recs = data.records.map((r) => ({ ...r, d: toDate(r.date) })).sort((a, b) => a.d - b.d);
  const registered = recs.filter((r) => r.registered != null);
  const intervals = d3.pairs(recs).map(([a, b]) => {
    const months = d3.timeDay.count(a.d, b.d) / DAYS_PER_MONTH;
    const delta = b.filed - a.filed;
    return { a, b, months, delta, rate: delta / months };
  });
  const annual = (data.annual_new || [])[0];

  const root = d3.select(container).classed('step-filings', true);
  if (annual) {
    const kpi = root.append('div').attr('class', 'sf-kpi');
    kpi
      .append('span')
      .attr('class', 'sf-kpi__label')
      .text(t(`${annual.year} 全年新增备案`, `New filings in ${annual.year}`));
    kpi.append('strong').attr('class', 'sf-kpi__value').text(fmt.int(annual.value));
    kpi.append('span').attr('class', 'sf-kpi__unit').text(unit);
    const last = recs[recs.length - 1];
    const k2 = root.append('div').attr('class', 'sf-kpi sf-kpi--line');
    k2.append('span')
      .attr('class', 'sf-kpi__label')
      .text(t(`截至 ${fmt.month(last.d)}累计备案`, `Cumulative filings as of ${fmt.month(last.d)}`));
    k2.append('strong').attr('class', 'sf-kpi__value').text(fmt.int(last.filed));
    k2.append('span').attr('class', 'sf-kpi__unit').text(unit);
  }
  const svg = createSvg(container).attr(
    'aria-label',
    t('生成式 AI 服务累计备案数阶梯图', 'Step chart of cumulative generative AI service filings'),
  );
  const legendWrap = root.append('div');
  note(
    container,
    t(
      '月均新增 = 相邻两次公告的累计备案数之差 ÷ 间隔月数（按天数 ÷ 30.44 计），由相邻两次公告累计数推算，仅表示区间平均节奏，不代表各月实际新增。',
      'Average monthly new filings = difference in cumulative filings between two consecutive announcements ÷ months between them (days ÷ 30.44). Derived from consecutive cumulative totals, it shows only the average pace over each interval, not actual monthly additions.',
    ),
    'info',
  );
  if (data.notes)
    note(
      container,
      t(`口径说明：${data.notes.replace(/registered\s*/g, '登记数')}`, `Basis: ${tf(data, 'notes')}`),
      'info',
    );
  srTable(
    container,
    t('生成式 AI 服务累计备案与登记数', 'Cumulative generative AI service filings and registrations'),
    [
      t('公告日期', 'Announcement date'),
      t(`累计备案（${unit}）`, `Cumulative filings (${unit})`),
      t(`累计登记（${unit}）`, `Cumulative registrations (${unit})`),
    ],
    recs.map((r) => [r.date, r.filed, r.registered ?? t('未摘录', 'not recorded')]),
  );

  const margin = { top: 34, right: 20, bottom: 30, left: 46 };
  const defs = svg.append('defs');
  const gradId = `sf-grad-${Math.random().toString(36).slice(2, 8)}`;
  const grad = defs
    .append('linearGradient')
    .attr('id', gradId)
    .attr('x1', 0)
    .attr('x2', 0)
    .attr('y1', 0)
    .attr('y2', 1);
  grad.append('stop').attr('offset', '0%').style('stop-color', 'var(--violet)').style('stop-opacity', 0.28);
  grad.append('stop').attr('offset', '100%').style('stop-color', 'var(--violet)').style('stop-opacity', 0);

  const gx = svg.append('g').attr('class', 'x-axis');
  const gy = svg.append('g').attr('class', 'y-axis');
  const gyb = svg.append('g').attr('class', 'y-axis').attr('opacity', 0);
  const yLabel = svg.append('text').attr('class', 'axis-label').attr('x', 0).attr('y', 12);
  const bLabel = svg.append('text').attr('class', 'axis-label').attr('x', 0).attr('opacity', 0);
  const plot = svg.append('g');
  const barsG = plot.append('g');
  const area = plot.append('path').style('fill', `url(#${gradId})`);
  const line = plot
    .append('path')
    .style('fill', 'none')
    .style('stroke', 'var(--violet)')
    .style('stroke-width', 2.5)
    .style('stroke-linejoin', 'round');
  const regG = plot.append('g');
  const ptsG = plot.append('g');

  let width = 0;
  let step = 0;
  let firstRender = true;
  const cleanups = [];

  function render(animate) {
    if (!width) return;
    const height = chartHeight(width, { aspect: 0.56, min: 340, max: 460 });
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
    const narrow = width < 520;
    margin.left = narrow ? 40 : 46;
    const iw = width - margin.left - margin.right;
    const ih = height - margin.top - margin.bottom;
    const tt = (sel, delay) => (animate ? tr(sel, delay) : sel);
    const showBars = step >= 1;
    const showReg = step >= 2;

    // 面板分配：显示柱时上方 64% 为累计线，下方为月均新增
    const gap = 38;
    const topH = showBars ? Math.round(ih * 0.62) : ih;
    const botY = topH + gap;
    const botH = ih - botY;

    plot.attr('transform', `translate(${margin.left},${margin.top})`);
    gy.attr('transform', `translate(${margin.left},${margin.top})`);
    gyb.attr('transform', `translate(${margin.left},${margin.top + botY})`);
    gx.attr('transform', `translate(${margin.left},${margin.top + ih})`);

    const x = d3
      .scaleTime()
      .domain([
        d3.timeMonth.offset(d3.timeMonth.floor(recs[0].d), -2),
        d3.timeMonth.offset(recs[recs.length - 1].d, 2),
      ])
      .range([0, iw]);
    const yMax = d3.max(recs, (r) => Math.max(r.filed, r.registered || 0));
    const y = d3
      .scaleLinear()
      .domain([0, yMax * 1.12])
      .nice()
      .range([topH, 0]);
    const yb = d3
      .scaleLinear()
      .domain([0, d3.max(intervals, (d) => d.rate) * 1.25])
      .nice()
      .range([showBars ? botY + botH : topH, showBars ? botY : topH]);

    gx.call(
      d3
        .axisBottom(x)
        .ticks(d3.timeMonth.every(narrow ? 6 : 3))
        .tickFormat((d) =>
          d.getMonth() === 0
            ? t(`${d.getFullYear()} 年`, `${d.getFullYear()}`)
            : t(`${d.getMonth() + 1} 月`, d3.timeFormat('%b')(d)),
        )
        .tickSizeOuter(0),
    );
    styleAxis(gx);
    tt(gy).call(
      d3
        .axisLeft(y)
        .ticks(Math.max(3, Math.floor(topH / 50)))
        .tickSize(-iw)
        .tickFormat(d3.format(',')),
    );
    styleAxis(gy);
    gy.selectAll('.tick line').attr('class', 'grid-line');
    yLabel.text(t(`累计备案（${unit}）`, 'Cumulative filings'));

    if (showBars) {
      gyb.call(
        d3
          .axisLeft(yb.copy().range([botH, 0]))
          .ticks(3)
          .tickSize(-iw)
          .tickFormat(d3.format(',')),
      );
      styleAxis(gyb);
      gyb.selectAll('.tick line').attr('class', 'grid-line');
    }
    tt(gyb).attr('opacity', showBars ? 1 : 0);
    bLabel
      .attr('y', margin.top + botY - 10)
      .text(
        t(
          `相邻公告间月均新增（${unit}/月，推算）`,
          narrow
            ? 'Avg. new filings per month (derived)'
            : 'Average new filings per month between announcements (derived)',
        ),
      );
    tt(bLabel).attr('opacity', showBars ? 1 : 0);

    // 阶梯线与面积
    const stepLine = d3
      .line()
      .x((d) => x(d.d))
      .y((d) => y(d.filed))
      .curve(d3.curveStepAfter);
    const stepArea = d3
      .area()
      .x((d) => x(d.d))
      .y0(topH)
      .y1((d) => y(d.filed))
      .curve(d3.curveStepAfter);
    if (firstRender) {
      firstRender = false;
      line.attr('d', stepLine(recs));
      area.attr('d', stepArea(recs));
      if (!theme.reducedMotion) {
        const len = line.node().getTotalLength();
        line.attr('stroke-dasharray', `${len} ${len}`).attr('stroke-dashoffset', len);
        area.attr('opacity', 0);
        const stopVis = observeVisible(container, (vis) => {
          if (!vis) return;
          stopVis();
          line
            .transition('draw')
            .duration(1400)
            .ease(d3.easeCubicOut)
            .attr('stroke-dashoffset', 0)
            .on('end', () => line.attr('stroke-dasharray', null).attr('stroke-dashoffset', null));
          area.transition('draw').delay(500).duration(900).attr('opacity', 1);
        });
        cleanups.push(stopVis);
      }
    } else {
      tt(line).attr('d', stepLine(recs));
      tt(area).attr('d', stepArea(recs));
    }

    // 月均新增柱（区间宽度）
    const bars = barsG
      .selectAll('g.sf-bar')
      .data(intervals, (d) => d.a.date)
      .join((enter) => {
        const g = enter.append('g').attr('class', 'sf-bar');
        g.append('rect').attr('class', 'sf-bar__span');
        g.append('rect').attr('class', 'sf-bar__rect');
        g.append('text').attr('class', 'bar-label').attr('text-anchor', 'middle');
        return g;
      });
    bars.call(bindTooltip, (d) =>
      t(
        `<strong>${fmt.date(d.a.d)} → ${fmt.date(d.b.d)}</strong><br>
        累计备案：${fmt.int(d.a.filed)} → ${fmt.int(d.b.filed)}（+${fmt.int(d.delta)} ${unit}）<br>
        间隔约 ${fmt.num(d.months, 1)} 个月 · 月均新增约 ${fmt.int(d.rate)} ${unit}<br><em>由相邻两次公告累计数推算</em>`,
        `<strong>${fmt.date(d.a.d)} → ${fmt.date(d.b.d)}</strong><br>
        Cumulative filings: ${fmt.int(d.a.filed)} → ${fmt.int(d.b.filed)} (+${fmt.int(d.delta)} ${unit})<br>
        Interval about ${fmt.num(d.months, 1)} months · about ${fmt.int(d.rate)} ${unit} added per month on average<br><em>Derived from two consecutive cumulative totals</em>`,
      ),
    );
    bars.attr('pointer-events', showBars ? null : 'none').attr('tabindex', showBars ? 0 : -1);
    const pad = (d) => Math.min(3, (x(d.b.d) - x(d.a.d)) * 0.08);
    bars
      .select('.sf-bar__span')
      .attr('x', (d) => x(d.a.d) + pad(d))
      .attr('width', (d) => Math.max(1, x(d.b.d) - x(d.a.d) - pad(d) * 2))
      .attr('y', botY)
      .attr('height', Math.max(0, botH))
      .style('fill', 'var(--green)')
      .style('fill-opacity', 0.04)
      .call((s) => tt(s).attr('opacity', showBars ? 1 : 0));
    tt(bars.select('.sf-bar__rect'), showBars ? 150 : 0)
      .attr('x', (d) => x(d.a.d) + pad(d))
      .attr('width', (d) => Math.max(1, x(d.b.d) - x(d.a.d) - pad(d) * 2))
      .attr('y', (d) => (showBars ? yb(d.rate) : topH))
      .attr('height', (d) => (showBars ? yb.range()[0] - yb(d.rate) : 0))
      .attr('rx', 3)
      .style('fill', 'var(--green)')
      .style('fill-opacity', 0.75);
    bars
      .select('text')
      .attr('x', (d) => (x(d.a.d) + x(d.b.d)) / 2)
      .style('font-size', narrow ? '10px' : null)
      .text((d) => `${narrow ? '' : '≈'}${fmt.int(d.rate)}`)
      .call((s) =>
        tt(s, showBars ? 300 : 0)
          .attr('y', (d) => (showBars ? yb(d.rate) - 6 : topH))
          .attr('opacity', showBars ? 1 : 0),
      );

    // 累计备案点
    const pts = ptsG
      .selectAll('g.pt')
      .data(recs, (d) => d.date)
      .join((enter) => {
        const g = enter.append('g').attr('class', 'pt');
        g.append('circle').attr('r', 5);
        g.append('text').attr('class', 'pt__label');
        g.append('text').attr('class', 'pt__sub');
        return g;
      });
    pts.call(
      bindTooltip,
      (d) =>
        `<strong>${fmt.date(d.d)}</strong><br>${t('累计备案', 'Cumulative filings')}${t('：', ': ')}${fmt.int(d.filed)} ${unit}${d.registered != null ? `<br>${t('累计登记', 'Cumulative registrations')}${t('：', ': ')}${fmt.int(d.registered)} ${unit}` : ''}`,
    );
    pts
      .select('circle')
      .style('fill', 'var(--panel)')
      .style('stroke', 'var(--violet)')
      .style('stroke-width', 2.5);
    // 标签放在点的左上方（阶梯线左侧为上一级平台，较低，留出空间）
    pts
      .select('.pt__label')
      .attr('text-anchor', (d, i) => (i === 0 ? 'middle' : 'end'))
      .attr('x', (d, i) => (i === 0 ? 0 : -8))
      .attr('y', -10)
      .style('font-size', narrow ? '11px' : null)
      .text((d) => fmt.int(d.filed));
    pts
      .select('.pt__sub')
      .attr('text-anchor', (d, i) => (i === 0 ? 'middle' : 'end'))
      .attr('x', (d, i) => (i === 0 ? 0 : -8))
      .attr('y', -24)
      .text((d) => (narrow ? '' : d3.timeFormat('%-m/%-d')(d.d)));
    tt(pts).attr('transform', (d) => `translate(${x(d.d)},${y(d.filed)})`);

    // 累计登记（仅非空）
    const reg = regG
      .selectAll('g.reg')
      .data(registered, (d) => d.date)
      .join((enter) => {
        const g = enter.append('g').attr('class', 'reg').attr('opacity', 0);
        g.append('path').attr('d', d3.symbol(d3.symbolDiamond, 90)());
        g.append('text').attr('class', 'pt__label').attr('text-anchor', 'start').attr('x', 9).attr('y', 4);
        return g;
      });
    reg.call(
      bindTooltip,
      (d) =>
        `<strong>${fmt.date(d.d)}</strong><br>${t('应用或功能完成登记（累计）：', 'Apps or features registered (cumulative): ')}${fmt.int(d.registered)} ${unit}`,
    );
    reg.attr('pointer-events', showReg ? null : 'none').attr('tabindex', showReg ? 0 : -1);
    reg
      .select('path')
      .style('fill', 'var(--cyan)')
      .style('stroke', 'var(--panel)')
      .style('stroke-width', 1.5);
    reg
      .select('text')
      .style('fill', 'var(--cyan)')
      .text((d, i) =>
        i === 0 && !narrow
          ? t(`登记 ${fmt.int(d.registered)}`, `Registered ${fmt.int(d.registered)}`)
          : fmt.int(d.registered),
      );
    tt(reg, showReg ? 200 : 0)
      .attr('opacity', showReg ? 1 : 0)
      .attr('transform', (d) => `translate(${x(d.d)},${y(d.registered)})`);

    legendWrap.selectAll('*').remove();
    const items = [
      {
        label: t(`累计备案（${unit}）`, `Cumulative filings (${unit})`),
        color: 'var(--violet)',
        shape: 'line',
      },
    ];
    if (showBars)
      items.push({
        label: t(
          `相邻公告间月均新增（推算，${unit}/月）`,
          `Average new filings per month between announcements (derived, ${unit}/month)`,
        ),
        color: 'var(--green)',
        shape: 'square',
      });
    if (showReg)
      items.push({
        label: t(
          `应用或功能完成登记（累计，${unit}；仅部分公告有摘录）`,
          `Apps or features registered (cumulative, ${unit}; recorded for some announcements only)`,
        ),
        color: 'var(--cyan)',
        shape: 'diamond',
      });
    legend(legendWrap.node(), items);
  }

  const stop = observeSize(container, ({ width: w }) => {
    width = w;
    render(false);
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
      cleanups.forEach((f) => f());
      line.interrupt('draw');
      root.selectAll('*').remove();
    },
  };
}
