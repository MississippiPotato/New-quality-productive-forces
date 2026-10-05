// 各国/地区 notable AI 模型数：两年哑铃图 + 中美顶级模型性能差距卡片
// update(step)：0 全部；1 突出中国（其余淡化）
import * as d3 from 'd3';
import {
  observeSize,
  observeVisible,
  createSvg,
  tr,
  fmt,
  legend,
  note,
  styleAxis,
  srTable,
} from '../core/chartUtils.js';
import { theme } from '../core/theme.js';
import { bindTooltip } from '../core/tooltip.js';
import { t, tf, isEn } from '../core/i18n.js';
import '../styles/charts/dumbbell.css';

const REGION_COLOR = { 美国: 'var(--us)', 中国: 'var(--cn)', 欧洲: 'var(--eu)' };
const regionColor = (r) => REGION_COLOR[r] || 'var(--other)';

export function createNotableDumbbell(container, data) {
  const unit = tf(data, 'unit') || t('个', 'models');
  const sep = t('：', ': ');
  const delta = (d) => {
    const v = d.b.value - d.a.value;
    return v >= 0 ? `+${fmt.int(v)}` : `−${fmt.int(-v)}`;
  };
  const NA = t('未摘录', 'not recorded');
  // AI Index 2026 发布值：作为参照刻度（与本站统计口径不同）
  const refBlock = data.ai_index_2026;
  const refRecs = refBlock?.records || [];
  const refLabel = refBlock ? tf(refBlock, 'label') : '';
  const refOf = (region) => refRecs.find((r) => r.region === region);
  const years = [...new Set(data.records.map((r) => r.year))].sort();
  const [y0, y1] = [years[0], years[years.length - 1]];
  const rows = d3
    .groups(data.records, (r) => r.region)
    .map(([region, recs]) => {
      const a = recs.find((r) => r.year === y0);
      const b = recs.find((r) => r.year === y1);
      return { region, name: tf(a || b, 'region'), a, b, ref: refOf(region) };
    })
    .sort((p, q) => (q.b?.value ?? -1) - (p.b?.value ?? -1) || (q.a?.value ?? 0) - (p.a?.value ?? 0));

  const root = d3.select(container).classed('dumbbell', true);
  const layout = root.append('div').attr('class', 'db__layout');
  const chartBox = layout.append('div').attr('class', 'db__chart');
  const svg = createSvg(chartBox.node()).attr(
    'aria-label',
    t(
      `${y0}–${y1} 年各地区 notable AI 模型数哑铃图`,
      `Dumbbell chart of notable AI models by region, ${y0}–${y1}`,
    ),
  );
  const gap = data.performance_gap;
  let tile = null;
  if (gap) {
    tile = layout.append('div').attr('class', 'db__tile').attr('tabindex', 0);
    tile.append('div').attr('class', 'db__tile-label').text(tf(gap, 'label'));
    const v = tile.append('div').attr('class', 'db__tile-value');
    v.append('span').attr('class', 'db__tile-num').text(fmt.num(gap.value, 1));
    v.append('span').attr('class', 'db__tile-unit').text(tf(gap, 'unit'));
    tile
      .append('div')
      .attr('class', 'db__tile-foot')
      .text(
        t(
          '数值越小，两国顶级模型表现越接近',
          "The smaller the value, the closer the two countries' top models perform",
        ),
      );
  }
  const legendWrap = root.append('div');
  legend(legendWrap.node(), [
    { label: t(`${y0} 年`, `${y0}`), color: 'var(--muted)', shape: 'ring' },
    { label: t(`${y1} 年`, `${y1}`), color: 'var(--muted)', shape: 'dot' },
    ...rows.map((r) => ({ label: r.name, color: regionColor(r.region), shape: 'square' })),
    ...(refRecs.length ? [{ label: refLabel, color: 'var(--text)', shape: 'tick' }] : []),
  ]);
  const refList = refRecs.map((r) => `${tf(r, 'region')} ${fmt.int(r.value)}`);
  const missing = rows.filter((r) => !r.b).map((r) => r.name);
  note(
    container,
    t(
      `“+N”为两年数值之差，由相邻两年数值相减推算。${missing.length ? `${missing.join('、')} ${y1} 年数值未摘录，仅显示 ${y0} 年。` : ''}${refList.length ? `竖线刻度为 ${refLabel}：${refList.join('、')}。` : ''}${data.notes || ''}`,
      `“+N” / “−N” is the change between the two years, derived by subtracting the earlier value from the later one.${missing.length ? ` ${missing.join(', ')}: ${y1} value not recorded; only ${y0} is shown.` : ''}${refList.length ? ` Vertical ticks: ${refLabel} — ${refList.join(', ')}.` : ''}${data.notes ? ` ${tf(data, 'notes')}` : ''}`,
    ),
    'info',
  );
  srTable(
    container,
    t('notable AI 模型数', 'Number of notable AI models'),
    [
      t('地区', 'Region'),
      t(`${y0} 年（${unit}）`, `${y0} (${unit})`),
      t(`${y1} 年（${unit}）`, `${y1} (${unit})`),
      ...(refRecs.length ? [refLabel] : []),
    ],
    rows.map((r) => [
      r.name,
      r.a?.value ?? NA,
      r.b?.value ?? NA,
      ...(refRecs.length ? [r.ref?.value ?? '—'] : []),
    ]),
  );

  const margin = { top: 46, right: 24, bottom: 28, left: 52 };
  const gx = svg.append('g').attr('class', 'x-axis');
  const plot = svg.append('g');
  const yearHead = svg.append('g');

  let width = 0;
  let step = 0;
  let grown = theme.reducedMotion;

  // 英文地区名较长：按实际文字宽度确定左边距
  const measureCtx = document.createElement('canvas').getContext('2d');
  function nameWidth(size) {
    measureCtx.font = `700 ${size}px ${getComputedStyle(container).fontFamily || 'sans-serif'}`;
    return d3.max(rows, (r) => measureCtx.measureText(r.name || '').width) || 0;
  }

  function render(animate) {
    if (!width) return;
    const narrow = width < 480;
    const rowH = narrow ? 58 : 66;
    const height = margin.top + margin.bottom + rowH * rows.length;
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
    // 英文名较宽，与靠近 0 的数值标签之间多留 14px
    const nameX = isEn() ? -24 : -10;
    margin.left = Math.max(narrow ? 40 : 52, Math.ceil(nameWidth(narrow ? 13 : 14)) - nameX + 8);
    margin.right = narrow ? 64 : 92;
    const iw = width - margin.left - margin.right;
    const ih = rowH * rows.length;
    const tt = (sel, delay) => (animate ? tr(sel, delay) : sel);

    const max = d3.max([...data.records, ...refRecs], (r) => r.value);
    const x = d3
      .scaleLinear()
      .domain([0, max * 1.08])
      .nice()
      .range([0, iw]);
    const y = d3
      .scaleBand()
      .domain(rows.map((r) => r.region))
      .range([0, ih])
      .padding(0.2);
    plot.attr('transform', `translate(${margin.left},${margin.top})`);
    gx.attr('transform', `translate(${margin.left},${margin.top + ih})`).call(
      d3
        .axisBottom(x)
        .ticks(narrow ? 4 : 6)
        .tickSize(-ih)
        .tickFormat((d) => `${d}`),
    );
    styleAxis(gx);
    gx.selectAll('.tick line').attr('class', 'grid-line');
    yearHead.attr('transform', 'translate(0,12)');
    yearHead
      .selectAll('text')
      .data([t(`单位：${unit}`, `Unit: ${unit}`)])
      .join('text')
      .attr('class', 'axis-label')
      .text((d) => d);

    const row = plot
      .selectAll('g.db-row')
      .data(rows, (d) => d.region)
      .join((enter) => {
        const g = enter.append('g').attr('class', 'db-row');
        g.append('rect').attr('class', 'db-row__bg');
        g.append('text').attr('class', 'db-row__name');
        g.append('line').attr('class', 'db-row__link');
        g.append('path').attr('class', 'db-row__arrow');
        g.append('circle').attr('class', 'db-row__a');
        g.append('circle').attr('class', 'db-row__b');
        g.append('text').attr('class', 'db-row__va label');
        g.append('text').attr('class', 'db-row__vb label');
        g.append('text').attr('class', 'db-row__delta');
        g.append('text').attr('class', 'db-row__miss');
        const ref = g.append('g').attr('class', 'db-row__ref');
        ref.append('line');
        ref.append('text');
        return g;
      });
    row.attr('transform', (d) => `translate(0,${y(d.region) + y.bandwidth() / 2})`);
    row.call(
      bindTooltip,
      (d) =>
        `<strong>${d.name}</strong><br>${t(`${y0} 年`, `${y0}`)}${sep}${d.a ? `${fmt.int(d.a.value)} ${unit}` : NA}<br>${t(`${y1} 年`, `${y1}`)}${sep}${d.b ? `${fmt.int(d.b.value)} ${unit}` : NA}${d.a && d.b ? `<br><em>${t(`变化 ${delta(d)}（推算）`, `Change ${delta(d)} (derived)`)}</em>` : ''}${d.ref ? `<br>${refLabel}${sep}${fmt.int(d.ref.value)} ${unit}` : ''}`,
    );
    const dim = (d) => step >= 1 && d.region !== '中国';
    tt(row).attr('opacity', (d) => (dim(d) ? 0.35 : 1));

    row
      .select('.db-row__bg')
      .attr('x', -margin.left + 4)
      .attr('y', -y.bandwidth() / 2)
      .attr('width', iw + margin.left - 4)
      .attr('height', y.bandwidth())
      .attr('rx', 8)
      .style('fill', (d) => regionColor(d.region))
      .style('fill-opacity', (d) => (step >= 1 && d.region === '中国' ? 0.1 : 0.04));
    row
      .select('.db-row__name')
      .attr('x', nameX)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .style('fill', 'var(--text)')
      .style('font-size', narrow ? '13px' : '14px')
      .style('font-weight', 700)
      .text((d) => d.name);

    const ax = (d) => x(d.a ? d.a.value : d.b.value);
    const bx = (d) => (d.b ? x(d.b.value) : ax(d));
    const bShown = (d) => (grown ? bx(d) : ax(d));
    // 数值减少的行：连线、标签方向反过来
    const down = (d) => d.a && d.b && d.b.value < d.a.value;
    // 减少且终点贴近 0：左侧放不下数值，改放在圆点下方
    const vbBelow = (d) => down(d) && bx(d) < 34;

    tt(row.select('.db-row__link'))
      .attr('x1', ax)
      .attr('x2', (d) =>
        d.b && d.a ? (down(d) ? Math.min(ax(d), bShown(d) + 9) : Math.max(ax(d), bShown(d) - 9)) : ax(d),
      )
      .attr('y1', 0)
      .attr('y2', 0)
      .style('stroke', (d) => regionColor(d.region))
      .style('stroke-width', 3)
      .style('stroke-opacity', 0.55);
    tt(row.select('.db-row__a'))
      .attr('cx', ax)
      .attr('r', (d) => (d.a ? 7 : 0))
      .style('fill', 'var(--panel)')
      .style('stroke', (d) => regionColor(d.region))
      .style('stroke-width', 2.5);
    tt(row.select('.db-row__b'))
      .attr('cx', bShown)
      .attr('r', (d) => (d.b ? 9 : 0))
      .style('fill', (d) => regionColor(d.region))
      .style('stroke', 'var(--panel)')
      .style('stroke-width', 2);

    // 数值标签：较早年份放左侧，较近年份放右侧
    tt(row.select('.db-row__va'))
      .attr('x', (d) => (down(d) ? ax(d) + 12 : ax(d) - 12))
      .attr('dy', '0.35em')
      .attr('text-anchor', (d) => (down(d) ? 'start' : 'end'))
      .text((d) => (d.a ? fmt.int(d.a.value) : ''));
    row
      .select('.db-row__va')
      .attr('opacity', (d) => (d.a && d.b && !down(d) && x(d.b.value) - x(d.a.value) < 30 ? 0 : 1))
      .style('fill', 'var(--muted)');
    tt(row.select('.db-row__vb'))
      .attr('x', (d) => (vbBelow(d) ? bShown(d) : down(d) ? bShown(d) - 14 : bShown(d) + 14))
      .attr('y', (d) => (vbBelow(d) ? 20 : 0))
      .attr('dy', '0.35em')
      .attr('text-anchor', (d) => (vbBelow(d) ? 'middle' : down(d) ? 'end' : 'start'))
      .style('font-size', '15px')
      .text((d) => (d.b ? fmt.int(d.b.value) : ''));
    tt(row.select('.db-row__delta'))
      .attr('x', (d) => (ax(d) + bShown(d)) / 2)
      .attr('y', -12)
      .attr('text-anchor', 'middle')
      .style('fill', (d) => regionColor(d.region))
      .style('font-size', '12px')
      .style('font-weight', 700)
      .attr('opacity', (d) => (grown && d.a && d.b ? 1 : 0))
      .text((d) => (d.a && d.b ? delta(d) : ''));
    // AI Index 发布值参照刻度（画在圆点之上，数值标在下方）
    const refG = row.select('.db-row__ref').style('display', (d) => (d.ref ? null : 'none'));
    tt(refG)
      .attr('transform', (d) => `translate(${d.ref ? x(d.ref.value) : 0},0)`)
      .attr('opacity', grown ? 1 : 0);
    refG.raise();
    refG.select('line').attr('y1', -12).attr('y2', 12);
    refG
      .select('text')
      .attr('y', narrow ? 21 : 23)
      .attr('text-anchor', 'middle')
      // 与 2025 年数值相同时不重复标注数字
      .text((d) => (d.ref && d.ref.value !== d.b?.value ? fmt.int(d.ref.value) : ''));

    // 单年份：显示“未摘录”
    row
      .select('.db-row__miss')
      .attr('x', (d) => ax(d) + 14)
      .attr('dy', '0.35em')
      .style('fill', 'var(--faint)')
      .style('font-size', '12px')
      .style('font-style', 'italic')
      .text((d) => (d.b ? '' : t(`${y1} 未摘录`, `${y1} not recorded`)));
    // 年份角标（第一行上方）
    const first = rows.find((r) => r.a && r.b);
    const heads = first
      ? [
          { x: ax(first), label: `${y0}` },
          { x: bShown(first), label: `${y1}` },
        ]
      : [];
    tt(
      plot
        .selectAll('text.db-head')
        .data(heads)
        .join('text')
        .attr('class', 'db-head axis-label')
        .attr('text-anchor', 'middle')
        .attr('y', y(first?.region) - 12),
    )
      .attr('x', (d) => d.x)
      .text((d) => d.label);
  }

  const stopVis = grown
    ? () => {}
    : observeVisible(container, (vis) => {
        if (!vis || grown) return;
        grown = true;
        stopVis();
        render(true);
      });

  const stop = observeSize(chartBox.node(), ({ width: w }) => {
    width = w;
    render(false);
  });

  return {
    update(s) {
      step = s;
      tile?.classed('is-hot', s >= 1);
      render(true);
    },
    resize() {
      width = chartBox.node().clientWidth;
      render(false);
    },
    destroy() {
      stop();
      stopVis();
      root.selectAll('*').remove();
    },
  };
}
