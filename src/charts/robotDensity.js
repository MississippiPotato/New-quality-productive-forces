// IFR 工业机器人密度：横向条形图（按数值排序）
// suspect=true 的记录画斜线纹理并标注“待回查”
// update(step)：0 全部；≥1 突出中国（待回查）
import * as d3 from 'd3';
import {
  observeSize,
  createSvg,
  tr,
  fmt,
  legend,
  note,
  srTable,
  styleAxis,
  hatch,
} from '../core/chartUtils.js';
import { bindTooltip } from '../core/tooltip.js';
import { t, tf, isEn } from '../core/i18n.js';
import '../styles/charts/robotDensity.css';

export function createRobotDensity(container, data, options = {}) {
  const root = d3.select(container).classed('robot-density', true);
  const en = isEn();
  const recs = [...data.records].sort((a, b) => b.value - a.value);
  const unit = tf(data, 'unit');
  const flag = tf(data, 'flag');
  const pending = t('待回查', 'To verify');
  // 来源：数据年份取自 data.year（报告名称见“来源”面板）
  const srcText = data.year
    ? t(`来源：IFR（${data.year} 年数据）`, `Source: IFR (${data.year} data)`)
    : t('来源：IFR', 'Source: IFR');
  const svg = createSvg(container);
  const hatchUrl = hatch(svg, 'density-suspect', 'var(--cn)');
  const hasSuspect = recs.some((r) => r.suspect);
  const isCn = (r) => r.country === '中国';
  legend(root.node(), [
    { label: t('其他经济体', 'Other economies'), color: 'var(--tool)', shape: 'square' },
    ...(recs.some((r) => isCn(r) && !r.suspect)
      ? [{ label: t('中国', 'China'), color: 'var(--cn)', shape: 'square' }]
      : []),
    ...(hasSuspect
      ? [{ label: t('待回查（数值存疑）', 'To verify (value in doubt)'), color: 'var(--cn)', shape: 'hatch' }]
      : []),
  ]);
  // 口径说明（method_note）优先；旧数据中的 flag（待回查提示）作为后备
  if (data.method_note)
    note(container, `${t('口径说明：', 'Method note: ')}${tf(data, 'method_note')}`, 'info');
  else if (data.flag)
    note(
      container,
      t(
        `⚠ ${data.flag}。斜线纹理条仅作占位展示，请勿据此比较。`,
        `⚠ ${String(flag).replace(/\.\s*$/, '')}. The hatched bar is a placeholder only; do not use it for comparison.`,
      ),
      'warn',
    );
  srTable(
    container,
    t(`工业机器人密度（${data.unit}）`, `Industrial robot density (${unit})`),
    [t('国家', 'Country'), t('数值', 'Value'), t('状态', 'Status')],
    recs.map((r) => [tf(r, 'country'), r.value, r.suspect ? pending : '—']),
  );

  const gx = svg.append('g').attr('class', 'x-axis');
  const plot = svg.append('g');
  const grid = plot.append('g');
  const rowsG = plot.append('g');
  const unitLabel = svg.append('text').attr('class', 'axis-label');

  let width = 0;
  let step = options.step != null ? +options.step : 0;
  let first = true;

  function render(animate) {
    if (!width) return;
    const narrow = width < 520;
    const margin = { top: 30, right: narrow ? 92 : 120, bottom: 30, left: narrow ? 46 : 64 };
    if (en) {
      // 英文国名更长：按最长名称加宽左边距（上限为宽度的 30%），“To verify” 标签更宽
      const probe = rowsG.append('text').attr('class', 'row-name');
      const maxName = d3.max(recs, (r) => probe.text(tf(r, 'country')).node().getComputedTextLength());
      probe.remove();
      margin.left = Math.min(Math.max(margin.left, maxName + 18), width * (narrow ? 0.38 : 0.3));
      if (hasSuspect) margin.right += 16;
    }
    const barH = narrow ? 26 : 30;
    const rowH = barH + (narrow ? 16 : 18);
    const ih = recs.length * rowH;
    const height = margin.top + ih + margin.bottom;
    const iw = width - margin.left - margin.right;
    svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);
    plot.attr('transform', `translate(${margin.left},${margin.top})`);
    unitLabel
      .attr('x', 0)
      .attr('y', 14)
      .text(`${t('单位', 'Unit')}${t('：', ': ')}${unit}`);

    const x = d3
      .scaleLinear()
      .domain([0, d3.max(recs, (r) => r.value)])
      .nice()
      .range([0, iw]);
    gx.attr('transform', `translate(${margin.left},${margin.top + ih})`).call(
      d3
        .axisBottom(x)
        .ticks(narrow ? 3 : 6)
        .tickSize(0)
        .tickPadding(8)
        .tickFormat(d3.format(',')),
    );
    styleAxis(gx);
    grid
      .selectAll('line')
      .data(x.ticks(narrow ? 3 : 6))
      .join('line')
      .attr('class', 'grid-line')
      .attr('x1', (v) => x(v))
      .attr('x2', (v) => x(v))
      .attr('y1', 0)
      .attr('y2', ih);

    const rows = rowsG
      .selectAll('g.bar-row')
      .data(recs, (r) => r.country)
      .join((enter) => {
        const g = enter.append('g').attr('class', 'bar-row');
        g.append('rect').attr('class', 'bar').attr('width', 0);
        g.append('text').attr('class', 'row-name').attr('text-anchor', 'end');
        g.append('text').attr('class', 'row-value');
        g.append('g').attr('class', 'flag');
        return g;
      })
      .attr('transform', (_, i) => `translate(0,${i * rowH + (rowH - barH) / 2})`);
    rows.call(
      bindTooltip,
      (r) =>
        `<strong>${tf(r, 'country')}</strong><br>${fmt.int(r.value)} ${unit}${r.suspect ? `<br><em style="color:var(--rose)">${pending}${t('：', ': ')}${flag || ''}</em>` : `<br><em>${srcText}</em>`}`,
    );
    const bar = rows
      .select('rect.bar')
      .attr('height', barH)
      .attr('rx', 4)
      .classed('bar--suspect', (r) => !!r.suspect)
      .style('fill', (r) => (r.suspect ? hatchUrl : isCn(r) ? 'var(--cn)' : 'var(--tool)'));
    (first || animate ? tr(bar, first ? 150 : 0) : bar).attr('width', (r) => Math.max(2, x(r.value)));
    rows
      .select('.row-name')
      .attr('x', -10)
      .attr('y', barH / 2 + 4.5)
      .style('fill', (r) => (isCn(r) ? 'var(--cn)' : null))
      .text((r) => tf(r, 'country'));
    rows
      .select('.row-value')
      .attr('x', (r) => x(r.value) + 8)
      .attr('y', barH / 2 + 4.5)
      .text((r) => fmt.int(r.value));
    rows.select('.flag').each(function (r) {
      const g = d3.select(this);
      g.selectAll('*').remove();
      if (!r.suspect) return;
      const vw = g.node().parentNode.querySelector('.row-value').getComputedTextLength();
      const fx = x(r.value) + 8 + vw + 8;
      g.attr('transform', `translate(${fx},${barH / 2 - 9})`);
      const rect = g.append('rect').attr('width', 48).attr('height', 18).attr('rx', 9);
      const label = g.append('text').attr('x', 24).attr('y', 13).attr('text-anchor', 'middle').text(pending);
      if (en) {
        // 英文标签按文字宽度
        const tw = Math.max(48, label.node().getComputedTextLength() + 16);
        rect.attr('width', tw);
        label.attr('x', tw / 2);
      }
    });
    rows.classed('is-dim', (r) => step >= 1 && !isCn(r));
    first = false;
  }

  const stop = observeSize(container, ({ width: w }) => {
    width = w;
    render(false);
  });

  return {
    update(s) {
      step = s;
      rowsG.selectAll('g.bar-row').classed('is-dim', (r) => step >= 1 && !isCn(r));
    },
    resize() {
      width = container.clientWidth;
      render(false);
    },
    destroy() {
      stop();
      root.selectAll('*').interrupt().remove();
      root.classed('robot-density', false);
    },
  };
}
