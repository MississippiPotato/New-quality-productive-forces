// 中国人工智能（核心）产业规模：柱（亿元）+ 上方独立面板的同比增速折线（%）
// 两个量纲分属上下两个面板（共享横轴），避免双轴叠加误读
// update(step)：0 全部；1 突出同比增速；2 突出口径变化与初步测算
import * as d3 from 'd3';
import {
  observeSize,
  createSvg,
  chartHeight,
  tr,
  fmt,
  legend,
  hatch,
  note,
  styleAxis,
  srTable,
} from '../core/chartUtils.js';
import { bindTooltip } from '../core/tooltip.js';
import { t, tf, isEn } from '../core/i18n.js';
import '../styles/charts/comboBarLine.css';

export function createComboBarLine(container, data) {
  const unit = data.unit || '亿元';
  // 数值单位为“亿元”：英文按 billion yuan 显示（数值 ÷ 10），整句中用 fmt.cn 换算（12000 亿元 → 1.2 trillion yuan）
  const unitLabel = t(unit, 'billion yuan');
  const axisVal = (v) => (isEn() ? v / 10 : v);
  const money = (v) => (isEn() ? `${fmt.cn(v * 1e8)} yuan` : `${fmt.int(v)} ${unit}`);
  const q = (o, field = 'qualifier') => {
    const s = tf(o, field) || '';
    return isEn() && s ? `${s} ` : s;
  };
  const sep = t('：', ': ');
  const recLabel = (r) => (isEn() ? r.label_en || fmt.period(r.period) : r.label);
  const recs = data.records.map((r, i) => ({ ...r, i }));
  const yoyPts = recs.filter((r) => r.yoy != null);
  const scopeChanges = d3
    .pairs(recs)
    .filter(([a, b]) => a.scope !== b.scope)
    .map(([a, b]) => ({ a, b }));
  const f26 = data.firms_2026_06;

  const root = d3.select(container).classed('combo-bl', true);
  if (f26) {
    const kpi = root.append('div').attr('class', 'cbl-kpi');
    kpi
      .append('span')
      .attr('class', 'cbl-kpi__label')
      .text(t('截至 2026 年 6 月 人工智能企业', 'AI companies as of Jun 2026'));
    kpi
      .append('strong')
      .attr('class', 'cbl-kpi__value')
      .text(`${q(f26)}${fmt.int(f26.value)}`);
    kpi.append('span').attr('class', 'cbl-kpi__unit').text(t('家', 'companies'));
    if (f26.global_share != null)
      kpi
        .append('span')
        .attr('class', 'cbl-kpi__share')
        .text(
          t(
            `占全球 ${fmt.num(f26.global_share, 1)}%`,
            `${fmt.num(f26.global_share, 1)}% of the global total`,
          ),
        );
  }
  const svg = createSvg(container).attr(
    'aria-label',
    t('中国人工智能产业规模柱状图与同比增速', 'Bar chart of China AI industry size with year-on-year growth'),
  );
  const legendWrap = root.append('div');
  note(
    container,
    t(
      `口径说明：${data.notes || ''} 柱高按报道数值绘制，“超/接近”为原文限定词；虚线分隔处统计口径发生变化，前后不宜直接计算增速。`,
      `Basis: ${tf(data, 'notes') || ''} Bar heights follow the reported figures; “over / nearly” are qualifiers in the original sources. Dashed lines mark a change in statistical basis — growth rates should not be computed across them.`,
    ),
    'warn',
  );
  srTable(
    container,
    t('中国人工智能产业规模', 'China AI industry size'),
    [
      t('时间', 'Period'),
      t(`规模（${unit}）`, `Size (${unitLabel})`),
      t('同比（%）', 'YoY (%)'),
      t('口径', 'Basis'),
      t('初步测算', 'Preliminary'),
      t('企业数（家）', 'Companies'),
    ],
    recs.map((r) => [
      recLabel(r),
      `${q(r)}${axisVal(r.value)}`,
      r.yoy ?? '—',
      tf(r, 'scope'),
      r.preliminary ? t('是', 'Yes') : t('否', 'No'),
      r.firms != null ? `${q(r, 'firms_qualifier')}${r.firms}` : '—',
    ]),
  );

  const hatchUrl = hatch(svg, `cbl-hatch-${Math.random().toString(36).slice(2, 8)}`, 'var(--cyan)');
  const gyL = svg.append('g').attr('class', 'y-axis');
  const gyR = svg.append('g').attr('class', 'y-axis');
  const gx = svg.append('g').attr('class', 'x-axis');
  const labL = svg.append('text').attr('class', 'axis-label');
  const labR = svg.append('text').attr('class', 'axis-label').attr('text-anchor', 'end');
  const plot = svg.append('g');
  const divG = plot.append('g');
  const barG = plot.append('g');
  const lineG = plot.append('g');

  legend(legendWrap.node(), [
    {
      label: t(`产业规模（${unit}）`, `Industry size (${unitLabel})`),
      color: 'var(--cyan)',
      shape: 'square',
    },
    { label: t('初步测算', 'Preliminary estimate'), color: 'var(--cyan)', shape: 'hatch' },
    { label: t('同比增速（%）', 'Year-on-year growth (%)'), color: 'var(--green)', shape: 'line' },
    { label: t('统计口径变化处', 'Change in statistical basis'), color: 'var(--orange)', shape: 'dash' },
  ]);

  let width = 0;
  let step = 0;
  let entered = false;

  // 柱内企业数文字（窄屏英文拆成三行以适应柱宽）
  function firmLines(d) {
    if (d.firms == null) return [];
    const n = fmt.int(d.firms);
    const fq = tf(d, 'firms_qualifier') || '';
    const label = d.firms_label ? tf(d, 'firms_label') : ''; // 如“相关企业”
    if (isEn())
      return width < 520
        ? [fq, n, ...(label || 'firms').split(' ')].filter(Boolean)
        : [label || 'Firms', `${fq} ${n}`.trim()];
    // 窄屏柱宽有限：有专门名称（如“相关企业”）时只写名称
    return width < 520 ? [`${fq}${n}`, label || '家企业'] : [label || '企业', `${fq}${n} 家`];
  }
  // 横轴下方的口径小字：中文按“（”断行；英文按词折行以适应柱距
  function scopeLines(s, stepW) {
    if (!isEn()) return s.split('（').map((p, i) => (i === 0 ? p : `（${p}`));
    const max = Math.max(8, Math.floor(stepW / 5.6));
    const lines = [];
    s.split(/\s+/)
      .filter(Boolean)
      .forEach((w) => {
        const last = lines[lines.length - 1];
        if (last != null && `${last} ${w}`.length <= max) lines[lines.length - 1] = `${last} ${w}`;
        else lines.push(w);
      });
    return lines;
  }

  function render(animate) {
    if (!width) return;
    const narrow = width < 520;
    const height = chartHeight(width, { aspect: 0.62, min: 400, max: 500 });
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
    // 英文窄屏：口径小字按词折行，需要更高的底部空间
    const m = {
      top: 26,
      right: narrow ? 34 : 44,
      bottom: narrow ? (isEn() ? 100 : 70) : 52,
      left: narrow ? 46 : 54,
    };
    const iw = width - m.left - m.right;
    const ih = height - m.top - m.bottom;
    const lineH = Math.round(ih * 0.24);
    const gap = 40;
    const barTop = lineH + gap;
    const barH = ih - barTop;
    const tt = (sel, delay) => (animate ? tr(sel, delay) : sel);

    const x = d3
      .scaleBand()
      .domain(recs.map((r) => r.label))
      .range([0, iw])
      .padding(narrow ? 0.28 : 0.38);
    const yB = d3
      .scaleLinear()
      .domain([0, d3.max(recs, (r) => r.value) * 1.18])
      .nice()
      .range([barTop + barH, barTop]);
    const yL = d3
      .scaleLinear()
      .domain([0, (d3.max(yoyPts, (r) => r.yoy) || 1) * 1.35])
      .nice()
      .range([lineH, 0]);

    plot.attr('transform', `translate(${m.left},${m.top})`);
    gyL.attr('transform', `translate(${m.left},${m.top})`).call(
      d3
        .axisLeft(yB)
        .ticks(4)
        .tickSize(-iw)
        .tickFormat((d) => d3.format(',')(axisVal(d))),
    );
    styleAxis(gyL);
    gyL.selectAll('.tick line').attr('class', 'grid-line');
    gyR.attr('transform', `translate(${m.left + iw},${m.top})`).call(
      d3
        .axisRight(yL)
        .ticks(2)
        .tickSize(-iw)
        .tickFormat((d) => `${d}%`),
    );
    styleAxis(gyR);
    gyR.selectAll('.tick line').attr('class', 'grid-line').style('stroke-dasharray', '2 4');
    labL
      .attr('x', 0)
      .attr('y', m.top + barTop - 10)
      .text(t(`产业规模（${unit}）`, narrow ? `Size (${unitLabel})` : `Industry size (${unitLabel})`));
    labR.attr('x', width).attr('y', 12).text(t('同比增速（%）', 'Year-on-year growth (%)'));

    // 横轴：时间 + 口径（小字）
    gx.attr('transform', `translate(${m.left},${m.top + ih})`).call(
      d3.axisBottom(x).tickSize(0).tickPadding(10),
    );
    styleAxis(gx);
    gx.selectAll('.tick text').each(function (lab) {
      const r = recs.find((d) => d.label === lab);
      const el = d3.select(this).text(null);
      const shown = r ? recLabel(r) : lab;
      // 窄屏把“2022 年 7 月”拆成两行（英文 “Jul 2022” 同理）
      const mm = narrow ? shown.match(isEn() ? /^(\S+)\s+(.+)$/ : /^(\d{4} 年)\s*(.+)$/) : null;
      el.append('tspan')
        .attr('x', 0)
        .attr('dy', '0.71em')
        .style('fill', 'var(--text)')
        .text(mm ? mm[1] : shown);
      if (mm) el.append('tspan').attr('x', 0).attr('dy', '1.2em').style('fill', 'var(--text)').text(mm[2]);
      const parts = scopeLines((r && tf(r, 'scope')) || '', x.step());
      parts.forEach((p, i) =>
        el
          .append('tspan')
          .attr('x', 0)
          .attr('dy', i === 0 ? '1.5em' : '1.3em')
          .style('font-size', '10px')
          .style('fill', 'var(--faint)')
          .text(p),
      );
    });

    // 口径变化分隔线
    const div = divG
      .selectAll('g.cbl-div')
      .data(scopeChanges, (d) => d.a.label)
      .join((enter) => {
        const g = enter.append('g').attr('class', 'cbl-div');
        g.append('line');
        g.append('text');
        return g;
      });
    div.attr('transform', (d) => `translate(${(x(d.a.label) + x.bandwidth() + x(d.b.label)) / 2},0)`);
    div
      .select('line')
      .attr('y1', barTop - 6)
      .attr('y2', ih + (narrow ? 6 : 30))
      .style('stroke', 'var(--orange)')
      .style('stroke-dasharray', '4 4')
      .style('stroke-width', step >= 2 ? 2 : 1.25)
      .style('opacity', step === 1 ? 0.35 : 1);
    div
      .select('text')
      .attr('y', barTop - 10)
      .attr('text-anchor', 'middle')
      .style('fill', 'var(--orange)')
      .style('font-size', '11px')
      .style('font-weight', step >= 2 ? 700 : 400)
      .text((d, i) => (narrow && i > 0 ? '' : t('口径变化', 'Basis change')));

    // 柱
    const bar = barG
      .selectAll('g.cbl-bar')
      .data(recs, (d) => d.label)
      .join((enter) => {
        const g = enter.append('g').attr('class', 'cbl-bar');
        g.append('rect').attr('class', 'cbl-bar__rect');
        g.append('text').attr('class', 'bar-label cbl-bar__val').attr('text-anchor', 'middle');
        g.append('text').attr('class', 'cbl-bar__firms').attr('text-anchor', 'middle');
        const tag = g.append('g').attr('class', 'cbl-tag');
        tag.append('rect');
        tag.append('text').attr('text-anchor', 'middle');
        return g;
      });
    bar.call(
      bindTooltip,
      (
        d,
      ) => `<strong>${recLabel(d)}</strong><br>${t('产业规模', 'Industry size')}${sep}${q(d)}${money(d.value)}${d.yoy != null ? `<br>${t('同比增长', 'YoY growth')}${sep}${d.yoy}%` : ''}
        <br>${t('口径', 'Basis')}${sep}${tf(d, 'scope')}${d.preliminary ? `<br><em>${t('初步测算', 'Preliminary estimate')}</em>` : ''}${d.firms != null ? `<br>${d.firms_label ? tf(d, 'firms_label') : t('企业数', 'Companies')}${sep}${q(d, 'firms_qualifier')}${fmt.int(d.firms)}${t(' 家', '')}` : ''}`,
    );
    tt(bar).style('opacity', step === 1 ? 0.4 : 1);
    const rects = bar
      .select('.cbl-bar__rect')
      .attr('x', (d) => x(d.label))
      .attr('width', x.bandwidth())
      .attr('rx', 4)
      .style('fill', (d) => (d.preliminary ? hatchUrl : 'var(--cyan)'))
      .style('fill-opacity', (d) => (d.preliminary ? 1 : 0.82))
      .style('stroke', 'var(--cyan)')
      .style('stroke-width', (d) => (d.preliminary ? 1.5 : 0))
      .style('stroke-dasharray', (d) => (d.preliminary ? '5 3' : null));
    if (!entered) rects.attr('y', yB(0)).attr('height', 0);
    tt(rects, entered ? 0 : (d, i) => i * 120)
      .attr('y', (d) => yB(d.value))
      .attr('height', (d) => yB(0) - yB(d.value));
    bar
      .select('.cbl-bar__val')
      .attr('x', (d) => x(d.label) + x.bandwidth() / 2)
      .style('font-size', narrow ? '12px' : '14px')
      .text((d) => `${q(d)}${fmt.int(axisVal(d.value))}`)
      .call((s) => tt(s, entered ? 0 : 300).attr('y', (d) => yB(d.value) - 8));
    bar
      .select('.cbl-bar__firms')
      .attr('x', (d) => x(d.label) + x.bandwidth() / 2)
      .attr('y', yB(0) - 10)
      .style('display', (d) =>
        d.firms != null && yB(0) - yB(d.value) > 44 + (firmLines(d).length - 2) * 13 ? null : 'none',
      )
      .each(function (d) {
        const el = d3.select(this).text(null);
        if (d.firms == null) return;
        const lines = firmLines(d);
        lines.forEach((line, i) =>
          el
            .append('tspan')
            .attr('x', x(d.label) + x.bandwidth() / 2)
            .attr('dy', i === 0 ? `${-(lines.length - 1) * 1.2}em` : '1.2em')
            .text(line),
        );
      });
    const tag = bar.select('.cbl-tag').style('display', (d) => (d.preliminary ? null : 'none'));
    tag.attr('transform', (d) => `translate(${x(d.label) + x.bandwidth() / 2},${yB(d.value) - 34})`);
    const tagW = isEn() ? 76 : 60;
    tag
      .select('rect')
      .attr('x', -tagW / 2)
      .attr('y', -11)
      .attr('width', tagW)
      .attr('height', 18)
      .attr('rx', 9)
      .style('fill', 'var(--panel)')
      .style('stroke', 'var(--orange)')
      .style('stroke-width', step >= 2 ? 2 : 1);
    tag
      .select('text')
      .attr('y', 3)
      .style('fill', 'var(--orange)')
      .style('font-size', '11px')
      .style('font-weight', 700)
      .text(t('初步测算', 'Preliminary'));

    // 同比折线（仅非空）
    const cx = (d) => x(d.label) + x.bandwidth() / 2;
    const segs = d3.pairs(yoyPts).map(([a, b]) => ({ a, b, dashed: a.preliminary || b.preliminary }));
    const lineOpacity = step === 2 ? 0.45 : 1;
    lineG
      .selectAll('line.cbl-yoy')
      .data(segs)
      .join('line')
      .attr('class', 'cbl-yoy')
      .style('stroke', 'var(--green)')
      .style('stroke-width', step === 1 ? 3 : 2)
      .style('stroke-dasharray', (d) => (d.dashed ? '6 4' : null))
      .attr('x1', (d) => cx(d.a))
      .attr('x2', (d) => cx(d.b))
      .call((s) =>
        tt(s)
          .attr('y1', (d) => yL(d.a.yoy))
          .attr('y2', (d) => yL(d.b.yoy))
          .style('opacity', lineOpacity),
      );
    const pt = lineG
      .selectAll('g.cbl-pt')
      .data(yoyPts, (d) => d.label)
      .join((enter) => {
        const g = enter.append('g').attr('class', 'cbl-pt');
        g.append('circle').attr('r', 5);
        g.append('text').attr('class', 'pt__label').attr('text-anchor', 'middle').attr('y', -11);
        return g;
      });
    pt.call(
      bindTooltip,
      (d) =>
        `<strong>${recLabel(d)}</strong><br>${t(`同比增长 ${d.yoy}%`, `YoY growth ${d.yoy}%`)}${d.preliminary ? t('（初步测算）', ' (preliminary estimate)') : ''}`,
    );
    pt.select('circle')
      .style('fill', (d) => (d.preliminary ? 'var(--panel)' : 'var(--green)'))
      .style('stroke', 'var(--green)')
      .style('stroke-width', 2);
    pt.select('text')
      .style('fill', 'var(--green)')
      .text((d) => `+${d.yoy}%`);
    tt(pt)
      .attr('transform', (d) => `translate(${cx(d)},${yL(d.yoy)})`)
      .style('opacity', lineOpacity);
    entered = true;
  }

  const stop = observeSize(container, ({ width: w }) => {
    width = w;
    render(!entered);
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
      root.selectAll('*').remove();
    },
  };
}
