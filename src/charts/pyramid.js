// 智能工厂梯度培育金字塔：卓越级（顶）/ 先进级 / 基础级（底）
// 默认宽度按对数比例；可切换为线性宽度查看真实比例
// update(step)：0 对数宽度；≥1 线性宽度（真实比例）
import * as d3 from 'd3';
import { observeSize, createSvg, tr, fmt, legend, note, srTable } from '../core/chartUtils.js';
import { bindTooltip } from '../core/tooltip.js';
import { theme } from '../core/theme.js';
import { t, tf, isEn } from '../core/i18n.js';
import '../styles/charts/pyramid.css';

const PREFIX_Q = new Set(['超', '近', '约', '逾']);
// 语言在图表创建时读取；切换语言时 figure.js 会重建图表
const modes = () => [
  { key: 'log', label: t('对数宽度', 'Log width') },
  { key: 'linear', label: t('线性宽度（真实比例）', 'Linear (true proportions)') },
];

export function createPyramid(container, data, options = {}) {
  const root = d3.select(container).classed('pyramid', true);
  const MODES = modes();
  const en = isEn();
  const recs = [...data.records].sort((a, b) => a.value - b.value); // 顶部为最少
  const unit = tf(data, 'unit');
  const period = tf(data, 'period_label');
  // 英文限定词一律前置：“over 35,000”“more than 7,000”
  // 限定词与单位相同（如 qualifier “家”）时视为无限定词，避免出现“15 家家”
  const qOf = (d) => (d.qualifier && d.qualifier !== data.unit ? d.qualifier : '');
  const qEn = (d) => (qOf(d) ? tf(d, 'qualifier') : '');
  const preQ = (d) => (en ? (qEn(d) ? `${qEn(d)} ` : '') : PREFIX_Q.has(qOf(d)) ? `${qOf(d)} ` : '');
  const postQ = (d) => (en ? ` ${unit}` : PREFIX_Q.has(qOf(d)) ? ` ${unit}` : ` ${qOf(d)}${unit}`);
  const valueText = (d) => `${preQ(d)}${fmt.int(d.value)}${postQ(d)}`;

  const head = root.append('div').attr('class', 'pyramid__head');
  const controls = head
    .append('div')
    .attr('class', 'seg')
    .attr('role', 'tablist')
    .attr('aria-label', t('宽度比例', 'Width scale'));
  head
    .append('span')
    .attr('class', 'pyramid__period')
    .text(t(`${data.period_label}累计培育（单位：${unit}）`, `Cumulative total, ${period} (unit: ${unit})`));
  const svg = createSvg(container);
  legend(root.node(), [
    {
      label: t('智能工厂（颜色越亮层级越高）', 'Smart factories (brighter = higher level)'),
      color: 'var(--tool)',
      shape: 'square',
    },
  ]);
  const caveat = note(container, '', 'info');
  srTable(
    container,
    t(`智能工厂梯度培育（${data.period_label}）`, `Tiered development of smart factories (${period})`),
    [t('层级', 'Level'), t('数量', 'Number'), t('限定词', 'Qualifier'), t('单位', 'Unit')],
    recs.map((r) => [tf(r, 'level'), r.value, (en ? qEn(r) : qOf(r)) || '—', unit]),
  );

  const guidesG = svg.append('g');
  const tiersG = svg.append('g');
  const ticksG = svg.append('g');

  let width = 0;
  let mode = options.step != null && +options.step >= 1 ? 'linear' : 'log';
  let first = true;

  controls
    .selectAll('button')
    .data(MODES)
    .join('button')
    .attr('type', 'button')
    .attr('role', 'tab')
    .text((d) => d.label)
    .on('click', (_, d) => {
      mode = d.key;
      render(true);
    });

  const minV = d3.min(recs, (d) => d.value);
  const maxV = d3.max(recs, (d) => d.value);

  function render(animate) {
    if (!width) return;
    controls
      .selectAll('button')
      .classed('is-active', (d) => d.key === mode)
      .attr('aria-selected', (d) => d.key === mode);
    const narrow = width < 520;
    const tierH = narrow ? 64 : 78;
    const gap = 8;
    const top = 8;
    const height = top + recs.length * (tierH + gap) + 26;
    const maxW = Math.min(width - 8, 760);
    svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);
    const cx = width / 2;

    const w =
      mode === 'log'
        ? d3.scaleLog().domain([1, maxV]).range([0, maxW])
        : d3.scaleLinear().domain([0, maxV]).range([0, maxW]);

    caveat.html(
      mode === 'log'
        ? t(
            `宽度按对数比例：宽度 ∝ log₁₀(数量)，以便在同一图中看清 ${fmt.int(minV)} 与 ${fmt.int(maxV)} 两个量级；视觉宽度差<strong>远小于</strong>真实数量差，切换“线性宽度”可看真实比例。`,
            `Log width: width ∝ log₁₀(number), so that both ${fmt.int(minV)} and ${fmt.int(maxV)} are legible in one chart. Visual differences in width are <strong>far smaller</strong> than the real differences in number; switch to "Linear" to see true proportions.`,
          )
        : t(
            `线性宽度：宽度与数量成正比。按此比例，${recs[0].level}几乎只是一条细线。`,
            `Linear width: width is proportional to number. At this scale, the ${tf(recs[0], 'level')} tier is little more than a thin line.`,
          ),
    );

    const yOf = (i) => top + i * (tierH + gap);
    const tt = (sel, delay) => (animate ? tr(sel, delay) : sel);

    const tiers = tiersG
      .selectAll('g.tier')
      .data(recs, (d) => d.level)
      .join((enter) => {
        const g = enter.append('g').attr('class', (_, i) => `tier${i === 0 ? ' tier--top' : ''}`);
        g.append('rect').attr('class', 'block').attr('rx', 6);
        g.append('text').attr('class', 'tier__level').attr('text-anchor', 'middle');
        const v = g.append('text').attr('class', 'tier__value').attr('text-anchor', 'middle');
        v.append('tspan').attr('class', 'pre q');
        v.append('tspan').attr('class', 'num');
        v.append('tspan').attr('class', 'post q');
        return g;
      });
    tiers.call(bindTooltip, (d) =>
      t(
        `<strong>${d.level}智能工厂</strong><br>${data.period_label}：${valueText(d)}<br><em>来源：工业和信息化部</em>`,
        `<strong>Smart factories · ${tf(d, 'level')}</strong><br>${period}: ${valueText(d)}<br><em>Source: Ministry of Industry and Information Technology (MIIT)</em>`,
      ),
    );
    const n = recs.length;
    tiers
      .select('rect.block')
      .attr('y', (_, i) => yOf(i))
      .attr('height', tierH)
      .style('fill', 'var(--tool)')
      .style('fill-opacity', (_, i) => 0.85 - (i / Math.max(1, n - 1)) * 0.6)
      .each(function (d) {
        const r = d3.select(this);
        const target = Math.max(3, w(d.value));
        if (first && !theme.reducedMotion && animate !== false) {
          r.attr('x', cx).attr('width', 0);
        }
        (first ? tr(r, (n - 1 - recs.indexOf(d)) * 220) : tt(r))
          .attr('x', cx - target / 2)
          .attr('width', target);
      });
    tiers
      .select('.tier__level')
      .attr('x', cx)
      .attr('y', (_, i) => yOf(i) + tierH / 2 - 6)
      .text((d) => tf(d, 'level'));
    const val = tiers
      .select('.tier__value')
      .attr('x', cx)
      .attr('y', (_, i) => yOf(i) + tierH / 2 + 18);
    val.select('.pre').text((d) => preQ(d));
    val.select('.num').text((d) => fmt.int(d.value));
    val.select('.post').text((d) => postQ(d));

    // 金字塔轮廓虚线：连接相邻层左右边缘
    const edges = d3.pairs(recs.map((d, i) => ({ w: Math.max(3, w(d.value)), y: yOf(i) })));
    const guideData = edges.flatMap(([a, b]) => [
      { x1: cx - a.w / 2, y1: a.y + tierH, x2: cx - b.w / 2, y2: b.y },
      { x1: cx + a.w / 2, y1: a.y + tierH, x2: cx + b.w / 2, y2: b.y },
    ]);
    tt(guidesG.selectAll('line.guide').data(guideData).join('line').attr('class', 'guide'))
      .attr('x1', (d) => d.x1)
      .attr('y1', (d) => d.y1)
      .attr('x2', (d) => d.x2)
      .attr('y2', (d) => d.y2);

    // 底部比例尺说明
    ticksG
      .selectAll('text')
      .data([
        mode === 'log'
          ? t('宽度：对数比例（log₁₀）', 'Width: log scale (log₁₀)')
          : t('宽度：线性比例', 'Width: linear scale'),
      ])
      .join('text')
      .attr('class', 'scale-tick')
      .attr('x', cx)
      .attr('y', height - 6)
      .attr('text-anchor', 'middle')
      .text((d) => d);
    first = false;
  }

  const stop = observeSize(container, ({ width: w }) => {
    width = w;
    render(width && first ? true : false);
  });

  return {
    update(step) {
      const next = step >= 1 ? 'linear' : 'log';
      if (next === mode) return;
      mode = next;
      render(true);
    },
    resize() {
      width = container.clientWidth;
      render(false);
    },
    destroy() {
      stop();
      root.selectAll('*').interrupt().remove();
      root.classed('pyramid', false);
    },
  };
}
