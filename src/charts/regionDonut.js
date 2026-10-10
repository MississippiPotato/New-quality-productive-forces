// 区域智算规模占比（环图）+ PUE 对照小图
// update(step)：0 全部；1 突出东部与西部（“东数西算”两端）；2 聚焦 PUE
import * as d3 from 'd3';
import {
  observeSize,
  observeVisible,
  createSvg,
  chartHeight,
  tr,
  fmt,
  legend,
  srTable,
  styleAxis,
  toDate,
} from '../core/chartUtils.js';
import { theme } from '../core/theme.js';
import { bindTooltip, tooltip } from '../core/tooltip.js';
import { t, tf, isEn } from '../core/i18n.js';
import '../styles/charts/regionDonut.css';

const REGION_COLOR = {
  东部: 'var(--cyan)',
  西部: 'var(--violet)',
  中部: 'var(--blue)',
  东北: 'var(--orange)',
};
const SMALL_ANGLE = 0.42; // 小于该弧度的扇区改用外部引线标签

export function createRegionDonut(container, data) {
  const rs = data.regional_share;
  const pue = data.pue.map((d) => ({ ...d, d: toDate(d.date) }));
  const regions = rs.records.map((r) => ({ ...r }));
  const dateLabel = t(`${fmt.month(toDate(rs.date))}底`, `End of ${fmt.month(toDate(rs.date))}`);
  const sep = t('：', ': ');
  const regionName = (r) => tf(r, 'region');

  const root = d3.select(container).classed('region-donut', true);
  const grid = root.append('div').attr('class', 'rd__grid');
  const pDonut = grid.append('div').attr('class', 'rd__panel rd__panel--donut');
  const pPue = grid.append('div').attr('class', 'rd__panel rd__panel--pue');
  pDonut
    .append('p')
    .attr('class', 'rd__title')
    .text(t('四大区域智算规模占比', 'AI compute share by region (four regions)'));
  pDonut
    .append('p')
    .attr('class', 'rd__sub')
    .text(`${dateLabel} · ${t('单位', 'Unit')}${sep}${rs.unit}`);
  const svgD = createSvg(pDonut.node(), 'rd__donut').attr(
    'aria-label',
    t('区域智算规模占比环图', 'Donut chart of AI compute share by region'),
  );
  const legD = pDonut.append('div');
  pPue
    .append('p')
    .attr('class', 'rd__title')
    .text(t('PUE（电能利用效率）', 'PUE (power usage effectiveness)'));
  pPue
    .append('p')
    .attr('class', 'rd__sub')
    .text(
      t(
        '越接近 1.0 越节能 · 两点口径不同',
        'Closer to 1.0 = more efficient · the two points use different bases',
      ),
    );
  const svgP = createSvg(pPue.node(), 'rd__pue').attr('aria-label', t('PUE 对照图', 'PUE comparison chart'));
  legend(
    legD.node(),
    regions.map((r) => ({
      label: regionName(r),
      color: REGION_COLOR[r.region] || 'var(--other)',
      shape: 'square',
    })),
  );


  srTable(
    container,
    t(`区域智算规模占比（${dateLabel}）`, `AI compute share by region (${dateLabel})`),
    [t('区域', 'Region'), t(`占比（${rs.unit}）`, `Share (${rs.unit})`)],
    regions.map((r) => [regionName(r), r.value]),
  );
  srTable(
    container,
    'PUE',
    [t('口径', 'Basis'), t('日期', 'Date'), 'PUE'],
    pue.map((d) => [tf(d, 'label'), d.date, d.value]),
  );

  // donut 层
  const gD = svgD.append('g');
  const gSlices = gD.append('g');
  const gInLabels = gD.append('g');
  const gOut = gD.append('g');
  const center = gD.append('g').attr('text-anchor', 'middle');
  center.append('text').attr('class', 'rd__center-small').attr('dy', '-0.6em').text(dateLabel);
  center
    .append('text')
    .attr('class', 'rd__center-big')
    .attr('dy', '0.9em')
    .text(t('智算规模占比', 'AI compute share'));

  // pue 层
  const gP = svgP.append('g');
  const gGrid = gP.append('g');
  const gRef = gP.append('g');
  const gPts = gP.append('g');
  const gTicks = gP.append('g');

  let width = 0;
  let step = 0;
  let grown = theme.reducedMotion;
  const pie = d3
    .pie()
    .sort(null)
    .value((d) => d.value)
    .startAngle(Math.PI / 6)
    .endAngle(Math.PI / 6 + 2 * Math.PI)
    .padAngle(0.012);
  const arcsData = pie(regions);
  const color = (d) => REGION_COLOR[d.data.region] || 'var(--other)';
  const isHot = (d) => step === 1 && (d.data.region === '东部' || d.data.region === '西部');

  function render(animate) {
    if (!width) return;
    const wide = width >= 640;
    grid.classed('is-wide', wide);
    const wD = pDonut.node().clientWidth;
    const wP = pPue.node().clientWidth;
    renderDonut(wD, animate);
    renderPue(wP, wide ? null : 240, animate);
    pDonut.classed('is-dim', step === 2);
    pPue.classed('is-dim', step === 1);
  }

  function renderDonut(w, animate) {
    const h = chartHeight(w, { aspect: 0.72, min: 260, max: 360 });
    svgD.attr('viewBox', `0 0 ${w} ${h}`).attr('width', w).attr('height', h);
    const smallOnes = arcsData.filter((d) => d.endAngle - d.startAngle < SMALL_ANGLE);
    // 英文窄屏：外部标签折成两行（名称 / 数值），避免挤小环图
    const twoLine = isEn() && w < 480;
    const labelW =
      d3.max(smallOnes, (d) => {
        const vw = `${fmt.num(d.data.value, 1)}${rs.unit}`.length * 7.5;
        if (!isEn()) return d.data.region.length * 12 + vw + 8;
        const nw = regionName(d.data).length * 7;
        return (twoLine ? Math.max(nw, vw) : nw + vw) + 8;
      }) || 0;
    // 小扇区位于约 1 点钟方向，外部标签向右上方展开
    const R = Math.max(70, Math.min(h / 2 - 10, w / 2 - 22, (w / 2 - labelW - 40) / 0.55));
    const r0 = R * 0.62;
    gD.attr('transform', `translate(${w / 2},${h / 2})`);
    const arc = d3.arc().innerRadius(r0).outerRadius(R).cornerRadius(3);
    const arcHot = d3
      .arc()
      .innerRadius(r0)
      .outerRadius(R + 6)
      .cornerRadius(3);
    const pick = (d) => (isHot(d) ? arcHot : arc);

    const slices = gSlices
      .selectAll('path.rd__slice')
      .data(arcsData, (d) => d.data.region)
      .join('path')
      .attr('class', 'rd__slice')
      .style('fill', color)
      .style('opacity', (d) => (step === 1 && !isHot(d) ? 0.35 : 1))
      .call(
        bindTooltip,
        (d) =>
          `<strong>${t(`${d.data.region}地区`, `${regionName(d.data)} region`)}</strong><br>${t('智算规模占比', 'AI compute share')}${sep}<b>${fmt.num(d.data.value, 1)}${rs.unit}</b><br><em>${dateLabel}</em>`,
      );

    const justGrew = !grown && animate;
    if (justGrew) {
      grown = true;
      slices.each(function (d) {
        this.__outer = isHot(d) ? R + 6 : R;
      });
      slices
        .attr('d', (d) => pick(d)({ ...d, endAngle: d.startAngle }))
        .transition()
        .duration(theme.duration * 1.4)
        .delay((_, i) => i * 120)
        .ease(d3.easeCubicOut)
        .attrTween('d', (d) => {
          const i = d3.interpolate(d.startAngle, d.endAngle);
          return (t) => pick(d)({ ...d, endAngle: i(t) });
        });
    } else if (grown) {
      // 只对外半径做数值插值（直接插值 path 字符串会破坏弧线标志位）
      const outer = (d) => (isHot(d) ? R + 6 : R);
      const arcAt = (o) => d3.arc().innerRadius(r0).outerRadius(o).cornerRadius(3);
      if (animate) {
        tr(slices).attrTween('d', function (d) {
          const i = d3.interpolateNumber(this.__outer ?? R, outer(d));
          this.__outer = outer(d);
          return (t) => arcAt(i(t))(d);
        });
      } else {
        slices.attr('d', function (d) {
          this.__outer = outer(d);
          return arcAt(outer(d))(d);
        });
      }
    } else {
      slices.attr('d', (d) => pick(d)({ ...d, endAngle: d.startAngle }));
    }

    const big = arcsData.filter((d) => d.endAngle - d.startAngle >= SMALL_ANGLE);
    const small = arcsData.filter((d) => d.endAngle - d.startAngle < SMALL_ANGLE);
    const inl = gInLabels
      .selectAll('g.in')
      .data(big, (d) => d.data.region)
      .join((enter) => {
        const g = enter
          .append('g')
          .attr('class', 'in')
          .attr('text-anchor', 'middle')
          .style('pointer-events', 'none');
        g.append('text').attr('class', 'rd__in-val').attr('dy', '0.15em');
        g.append('text').attr('class', 'rd__in-name').attr('dy', '1.45em');
        return g;
      })
      .attr('transform', (d) => `translate(${pick(d).centroid(d)})`);
    inl.select('.rd__in-val').text((d) => `${fmt.num(d.data.value, 1)}${rs.unit}`);
    inl.select('.rd__in-name').text((d) => regionName(d.data));
    inl.select('.rd__in-val').style('font-size', R < 130 ? '13px' : null);
    inl.select('.rd__in-name').style('font-size', R < 130 ? '11px' : null);
    const showLabels = grown;
    const lag = justGrew ? theme.duration * 1.2 : 0;
    (animate ? tr(inl, lag) : inl).style('opacity', (d) =>
      !showLabels ? 0 : step === 1 && !isHot(d) ? 0.5 : 1,
    );

    // 小扇区：折线引线 + 外部标签（放在右侧）
    const out = gOut
      .selectAll('g.out')
      .data(small, (d) => d.data.region)
      .join((enter) => {
        const g = enter.append('g').attr('class', 'out');
        g.append('polyline').attr('class', 'rd__leader');
        g.append('circle').attr('r', 2).style('fill', 'var(--muted)');
        const txt = g.append('text').attr('class', 'rd__out').attr('dy', '0.35em');
        txt.append('tspan').attr('class', 'n');
        txt.append('tspan').attr('class', 'v').attr('dx', 4);
        return g;
      });
    out.each(function (d, i) {
      const g = d3.select(this);
      const mid = (d.startAngle + d.endAngle) / 2;
      const p0 = d3
        .arc()
        .innerRadius(R + 2)
        .outerRadius(R + 2)
        .centroid(d);
      const right = Math.sin(mid) >= 0;
      const elbow = [(R + 14) * Math.sin(mid), -(R + 14) * Math.cos(mid) - i * 18];
      const end = [elbow[0] + (right ? 18 : -18), elbow[1]];
      g.select('polyline').attr('points', [p0, elbow, end].map((p) => p.join(',')).join(' '));
      g.select('circle').attr('cx', p0[0]).attr('cy', p0[1]);
      const tx = end[0] + (right ? 4 : -4);
      g.select('text')
        .attr('x', tx)
        .attr('y', end[1])
        .attr('dy', twoLine ? '-0.25em' : '0.35em')
        .attr('text-anchor', right ? 'start' : 'end');
      g.select('tspan.n').text(regionName(d.data));
      g.select('tspan.v')
        .attr('x', twoLine ? tx : null)
        .attr('dx', twoLine ? null : 4)
        .attr('dy', twoLine ? '1.2em' : null)
        .text(`${fmt.num(d.data.value, 1)}${rs.unit}`)
        .style('fill', color(d));
    });
    (animate ? tr(out, lag) : out).style('opacity', showLabels ? (step === 1 ? 0.5 : 1) : 0);
    const bigSize = isEn() ? (R < 110 ? 12 : R < 140 ? 14 : 17) : R < 90 ? 14 : 17;
    center.select('.rd__center-big').style('font-size', `${bigSize}px`);
  }

  function renderPue(w, fixedH, animate) {
    const h = fixedH || chartHeight(w, { aspect: 0.9, min: 240, max: 340 });
    svgP.attr('viewBox', `0 0 ${w} ${h}`).attr('width', w).attr('height', h);
    const m = { top: 26, right: 18, bottom: 46, left: 40 };
    const iw = w - m.left - m.right;
    const ih = h - m.top - m.bottom;
    gP.attr('transform', `translate(${m.left},${m.top})`);
    const x = d3
      .scalePoint()
      .domain(pue.map((d) => d.label))
      .range([0, iw])
      .padding(0.55);
    const yMax = d3.max(pue, (d) => d.value);
    const y = d3
      .scaleLinear()
      .domain([1, yMax + (yMax - 1) * 0.25])
      .nice()
      .range([ih, 0]);
    const tt = (s, delay) => (animate ? tr(s, delay) : s);

    gGrid.call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat(d3.format('.1f')));
    styleAxis(gGrid);
    gGrid.selectAll('.tick line').attr('class', 'grid-line');

    // 理想值参考线
    const ref = gRef
      .selectAll('g.ref')
      .data([1])
      .join((enter) => {
        const g = enter.append('g').attr('class', 'ref');
        g.append('line')
          .style('stroke', 'var(--green)')
          .style('stroke-dasharray', '5 4')
          .style('stroke-width', 1.5);
        g.append('text').attr('class', 'rd__ref').attr('text-anchor', 'end').attr('dy', -6);
        return g;
      });
    ref.select('line').attr('x1', 0).attr('x2', iw).attr('y1', y(1)).attr('y2', y(1));
    ref.select('text').attr('x', iw).attr('y', y(1)).text(t('理想值 1.0', 'Ideal 1.0'));

    // 每个点：竖线到基线 + 圆点 + 数值
    const pts = gPts
      .selectAll('g.pt')
      .data(pue, (d) => d.label)
      .join((enter) => {
        const g = enter.append('g').attr('class', 'pt');
        g.append('line')
          .attr('class', 'stem')
          .style('stroke', 'var(--tool)')
          .style('stroke-opacity', 0.45)
          .style('stroke-width', 1.5)
          .style('stroke-dasharray', '1 3');
        g.append('circle')
          .attr('r', 7)
          .style('fill', 'var(--panel)')
          .style('stroke', 'var(--tool)')
          .style('stroke-width', 3);
        g.append('text').attr('class', 'rd__pue-val').attr('text-anchor', 'middle').attr('dy', -16);
        return g;
      })
      .call(
        bindTooltip,
        (d) =>
          `<strong>${tf(d, 'label')}</strong><br>PUE${sep}<b>${fmt.num(d.value, 2)}</b><br><em>${fmt.period(d.date)}</em>`,
      );
    pts.attr('transform', (d) => `translate(${x(d.label)},0)`);
    tt(pts.select('line.stem'))
      .attr('y1', ih)
      .attr('y2', (d) => y(d.value));
    tt(pts.select('circle')).attr('cy', (d) => y(d.value));
    tt(pts.select('text'))
      .attr('y', (d) => y(d.value))
      .text((d) => fmt.num(d.value, 2));

    // x 轴标签：口径 + 日期（两行，按宽度折行）
    const maxChars = Math.max(4, Math.floor(x.step() / 12));
    const tickLines = (d) => {
      const s = tf(d, 'label');
      const lines = [];
      if (isEn()) {
        // 英文按单词折行（约 6.5px / 字符）
        const maxW = Math.max(8, Math.floor(x.step() / 6.5));
        let cur = '';
        s.split(/\s+/).forEach((w) => {
          const next = cur ? `${cur} ${w}` : w;
          if (cur && next.length > maxW) {
            lines.push(cur);
            cur = w;
          } else cur = next;
        });
        if (cur) lines.push(cur);
        return lines;
      }
      for (let i = 0; i < s.length; i += maxChars) lines.push(s.slice(i, i + maxChars));
      return lines;
    };
    const ticks = gTicks
      .selectAll('text.rd__tick')
      .data(pue, (d) => d.label)
      .join('text')
      .attr('class', 'rd__tick')
      .attr('text-anchor', 'middle')
      .attr('x', (d) => x(d.label))
      .attr('y', ih + 16);
    ticks.selectAll('tspan').remove();
    ticks.each(function (d) {
      const sel = d3.select(this);
      const lines = tickLines(d);
      lines.forEach((ln, i) =>
        sel
          .append('tspan')
          .attr('x', x(d.label))
          .attr('dy', i ? '1.25em' : 0)
          .text(ln),
      );
      sel
        .append('tspan')
        .attr('class', 'd')
        .attr('x', x(d.label))
        .attr('dy', '1.25em')
        .text(fmt.period(d.date));
    });
    const extra = d3.max(pue, (d) => tickLines(d).length) + 1;
    const needed = m.top + ih + 16 + extra * 14 + 4;
    if (needed > h) svgP.attr('viewBox', `0 0 ${w} ${needed}`).attr('height', needed);
  }

  const stopSize = observeSize(container, ({ width: w }) => {
    width = w;
    render(false);
  });
  const stopVis = observeVisible(container, (v) => {
    if (v && !grown) render(true);
  });

  return {
    update(s) {
      step = Math.max(0, Math.min(2, +s || 0));
      render(true);
    },
    resize() {
      width = container.clientWidth;
      render(false);
    },
    destroy() {
      tooltip.hide();
      stopSize();
      stopVis();
      root.selectAll('*').interrupt();
      root.selectAll('*').remove();
    },
  };
}
