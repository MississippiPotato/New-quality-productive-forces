// WEF 未来就业：创造 vs 替代的发散条形图，“挤出”净增
// update(step)：0 新创造（右）与被替代（左）对峙；≥1 重叠部分相互抵消，剩余净增段滑入独立一行
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
import { theme } from '../core/theme.js';
import { t, tf, isEn } from '../core/i18n.js';
import '../styles/charts/divergingBar.css';

// 语言在图表创建时读取；切换语言时 figure.js 会重建图表
const modes = () => [
  { key: 0, label: t('新创造与被替代', 'Created vs displaced') },
  { key: 1, label: t('抵消后的净增', 'Net gain') },
];
// “百万个岗位” → 中文万/亿；英文 million/billion（精确换算：× 1,000,000）
const toCn = (millions) => fmt.cn(millions * 1e6);

export function createDivergingBar(container, data, options = {}) {
  const root = d3.select(container).classed('diverging-bar', true);
  const MODES = modes();
  const { created, displaced, net, horizon } = data;
  const unit = tf(data, 'unit');
  const sep = t('：', ': ');
  const head = root.append('div').attr('class', 'diverging-bar__head');
  const controls = head
    .append('div')
    .attr('class', 'seg')
    .attr('role', 'tablist')
    .attr('aria-label', t('视图', 'View'));
  head
    .append('span')
    .attr('class', 'tag tag--forecast')
    .text(`${t('预测', 'Forecast')} · ${horizon}`);
  const svg = createSvg(container);
  legend(root.node(), [
    { label: t('新创造岗位', 'Jobs created'), color: 'var(--green)', shape: 'square' },
    { label: t('被替代岗位', 'Jobs displaced'), color: 'var(--rose)', shape: 'square' },
    { label: t('相互抵消部分', 'Offsetting part'), color: 'var(--muted)', shape: 'hatch' },
  ]);
  const facts = root.append('div').attr('class', 'diverging-bar__facts');
  note(
    container,
    t(
      `单位换算：原文单位为“${unit}”，1 亿 = 100 百万，1 万 = 0.01 百万。净增为原文给出值；图中抵消动画仅示意“新创造 − 被替代 = 净增”。`,
      `Values are in ${unit}, as in the source. The net gain is the figure given in the source; the offsetting animation only illustrates "created − displaced = net gain".`,
    ),
    'info',
  );
  srTable(
    container,
    t(`WEF 2025–2030 岗位变化（${unit}）`, `WEF job changes 2025–2030 (${unit})`),
    [t('项目', 'Item'), t('数值', 'Value'), t('单位', 'Unit')],
    [
      [t('新创造', 'Created'), created.value, unit],
      [t('被替代', 'Displaced'), displaced.value, unit],
      [t('净增', 'Net gain'), net.value, unit],
      [t('结构性变动', 'Structural churn'), data.structural_churn.value, data.structural_churn.unit],
    ],
  );

  // 背景说明卡片：结构性变动与调查覆盖面（数字全部取自数据）
  const s = data.survey;
  const churn = `${fmt.num(data.structural_churn.value)}${data.structural_churn.unit}`;
  facts
    .append('div')
    .attr('class', 'diverging-bar__fact')
    .html(
      t(
        `<strong>结构性变动</strong>${horizon} 年间岗位结构变动率 <b>${churn}</b>（新创造与被替代合计占当前就业的比重，WEF 口径）`,
        `<strong>Structural churn</strong>Labour-market churn of <b>${churn}</b> over ${horizon} (jobs created plus displaced as a share of current employment, WEF definition)`,
      ),
    );
  facts
    .append('div')
    .attr('class', 'diverging-bar__fact')
    .html(
      t(
        `<strong>调查覆盖</strong><b>${fmt.int(s.employers)}</b> ${s.qualifier}家雇主 · 代表 <b>${toCn(s.workers_million)}</b> 名员工 · <b>${s.industries}</b> 个行业 · <b>${s.economies}</b> 个经济体`,
        `<strong>Survey coverage</strong>${tf(s, 'qualifier') ? `${tf(s, 'qualifier')} ` : ''}<b>${fmt.int(s.employers)}</b> employers · representing <b>${toCn(s.workers_million)}</b> workers · <b>${s.industries}</b> industries · <b>${s.economies}</b> economies`,
      ),
    );

  const plot = svg.append('g');
  const gx = svg.append('g').attr('class', 'x-axis');
  const grid = plot.append('g');
  const bars = plot.append('g');
  const labels = plot.append('g');
  const center = plot.append('line').attr('class', 'center-line');
  const unitLabel = svg.append('text').attr('class', 'axis-label');
  const hatchUrl = hatch(svg, 'diverging-cancel', 'var(--muted)');

  const rows = [
    { key: 'created', title: t('新创造', 'Created'), v: created.value, sign: 1, color: 'var(--green)' },
    { key: 'displaced', title: t('被替代', 'Displaced'), v: displaced.value, sign: -1, color: 'var(--rose)' },
    { key: 'net', title: t('净增', 'Net gain'), v: net.value, sign: 1, color: 'var(--green)' },
  ];

  const createdBar = bars.append('rect').attr('class', 'bar').style('--bar-c', 'var(--green)');
  const displacedBar = bars.append('rect').attr('class', 'bar').style('--bar-c', 'var(--rose)');
  const cancelR = bars.append('rect').attr('class', 'cancel').style('fill', hatchUrl);
  const ghost = bars.append('rect').attr('class', 'ghost');
  const netBar = bars.append('rect').attr('class', 'bar').style('--bar-c', 'var(--green)');
  const cancelLabel = labels.append('text').attr('class', 'cancel-label').attr('text-anchor', 'middle');
  const arrow = labels.append('path').attr('class', 'net-arrow');

  let width = 0;
  let mode = options.step != null && +options.step >= 1 ? 1 : 0;

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

  const tip = (r) =>
    t(
      `<strong>${r.title}</strong>（${horizon}）<br>${fmt.int(r.v)} ${unit}<br>≈ ${toCn(r.v)} 个岗位<br><em>来源：WEF《未来就业报告 2025》</em>`,
      `<strong>${r.title}</strong> (${horizon})<br>${fmt.int(r.v)} ${unit}<br><em>Source${sep}WEF Future of Jobs Report 2025</em>`,
    );

  function render(animate) {
    if (!width) return;
    controls
      .selectAll('button')
      .classed('is-active', (d) => d.key === mode)
      .attr('aria-selected', (d) => d.key === mode);
    const narrow = width < 520;
    const margin = { top: 26, right: 12, bottom: 34, left: 12 };
    const barH = narrow ? 26 : 32;
    const rowGap = narrow ? 48 : 54;
    const rowY = (i) => 22 + i * (barH + rowGap);
    const ih = rowY(2) + barH + 10;
    const height = margin.top + ih + margin.bottom;
    const iw = width - margin.left - margin.right;
    svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);
    plot.attr('transform', `translate(${margin.left},${margin.top})`);
    unitLabel
      .attr('x', margin.left)
      .attr('y', 14)
      .text(t(`单位：${unit}（标签已换算为万 / 亿）`, `Unit: ${unit}`));

    const maxV = d3.max(rows, (r) => r.v);
    const x = d3
      .scaleLinear()
      .domain([-maxV * 1.04, maxV * 1.04])
      .range([0, iw]);
    gx.attr('transform', `translate(${margin.left},${margin.top + ih})`).call(
      d3
        .axisBottom(x)
        .ticks(narrow ? 5 : 9)
        .tickSize(0)
        .tickPadding(10)
        .tickFormat((v) => fmt.int(Math.abs(v))),
    );
    styleAxis(gx);
    grid
      .selectAll('line')
      .data(x.ticks(narrow ? 5 : 9))
      .join('line')
      .attr('class', 'grid-line')
      .attr('x1', (v) => x(v))
      .attr('x2', (v) => x(v))
      .attr('y1', 0)
      .attr('y2', ih);
    center
      .attr('x1', x(0))
      .attr('x2', x(0))
      .attr('y1', -6)
      .attr('y2', ih + 4);

    const on = mode >= 1;
    const tt = (sel, delay = 0) => (animate ? tr(sel, delay) : sel);
    const D = animate ? theme.duration : 0;

    // 基础两行
    createdBar
      .attr('y', rowY(0))
      .attr('height', barH)
      .attr('rx', 4)
      .style('fill', 'var(--green)')
      .datum(rows[0])
      .call(bindTooltip, tip);
    tt(createdBar)
      .attr('x', x(0))
      .attr('width', x(created.value) - x(0))
      .style('opacity', on ? 0.35 : 1);
    displacedBar
      .attr('y', rowY(1))
      .attr('height', barH)
      .attr('rx', 4)
      .style('fill', 'var(--rose)')
      .datum(rows[1])
      .call(bindTooltip, tip);
    tt(displacedBar)
      .attr('x', x(-displaced.value))
      .attr('width', x(0) - x(-displaced.value))
      .style('opacity', on ? 0.35 : 1);

    // 幽灵条：被替代条翻转到右侧，与新创造条重叠
    ghost.attr('height', barH).attr('rx', 4).style('fill', 'var(--rose)').style('pointer-events', 'none');
    if (on) {
      ghost
        .attr('x', x(-displaced.value))
        .attr('y', rowY(1))
        .attr('width', x(0) - x(-displaced.value))
        .style('opacity', animate ? 0.9 : 0);
      tt(ghost).attr('x', x(0)).attr('y', rowY(0)).style('opacity', 0.9);
      tt(ghost, D * 0.9).style('opacity', 0);
    } else {
      ghost.interrupt().style('opacity', 0);
    }
    // 抵消区：斜线纹理覆盖重叠段
    cancelR
      .attr('x', x(0))
      .attr('y', rowY(0))
      .attr('height', barH)
      .attr('width', x(displaced.value) - x(0))
      .attr('rx', 4);
    tt(cancelR, on ? D * 0.8 : 0).style('opacity', on ? 1 : 0);
    cancelLabel
      .attr('x', (x(0) + x(displaced.value)) / 2)
      .attr('y', rowY(0) + barH + 16)
      .text(
        narrow
          ? t('相互抵消', 'Offset')
          : t(
              `与被替代的 ${toCn(displaced.value)} 相互抵消`,
              `Offset by the ${toCn(displaced.value)} displaced`,
            ),
      );
    tt(cancelLabel, on ? D : 0).style('opacity', on ? 1 : 0);

    // 净增条：从新创造条剩余段“挤出”，滑入第三行
    netBar
      .attr('height', barH)
      .attr('rx', 4)
      .style('fill', 'var(--green)')
      .datum(rows[2])
      .call(bindTooltip, tip);
    const netStartX = x(created.value - net.value);
    if (on) {
      if (animate) {
        netBar
          .interrupt()
          .attr('x', netStartX)
          .attr('y', rowY(0))
          .attr('width', x(net.value) - x(0))
          .style('opacity', 0);
        tr(netBar, D * 1.1)
          .style('opacity', 1)
          .transition()
          .duration(D)
          .ease(theme.ease)
          .attr('x', x(0))
          .attr('y', rowY(2));
      } else
        netBar
          .attr('x', x(0))
          .attr('y', rowY(2))
          .attr('width', x(net.value) - x(0))
          .style('opacity', 1);
    } else tt(netBar).attr('x', netStartX).attr('y', rowY(0)).style('opacity', 0);

    const mx = (netStartX + x(created.value)) / 2;
    const nx = (x(0) + x(net.value)) / 2;
    const midY = (rowY(0) + barH + rowY(2)) / 2;
    arrow.attr('d', `M${mx},${rowY(0) + barH + 4} C${mx},${midY} ${nx},${midY} ${nx},${rowY(2) - 22}`);
    tt(arrow, on ? D * 2 : 0).style('opacity', on ? 0.8 : 0);

    // 行标题与数值
    const lab = labels
      .selectAll('g.row-label')
      .data(rows, (r) => r.key)
      .join((enter) => {
        const g = enter.append('g').attr('class', 'row-label');
        g.append('text').attr('class', 'row__title');
        g.append('text').attr('class', 'row__value');
        g.append('text').attr('class', 'row__raw');
        return g;
      });
    lab.each(function (r, i) {
      const g = d3.select(this);
      const right = r.sign > 0;
      const anchor = right ? 'start' : 'end';
      const x0 = right ? x(0) + 8 : x(0) - 8;
      g.attr('transform', `translate(0,${rowY(i) - 8})`);
      g.select('.row__title').attr('x', x0).attr('text-anchor', anchor).text(r.title);
      const titleW = g.select('.row__title').node().getComputedTextLength();
      g.select('.row__value')
        .attr('x', right ? x0 + titleW + 8 : x0 - titleW - 8)
        .attr('text-anchor', anchor)
        .style('fill', r.color)
        .text(`${right ? '+' : '−'}${toCn(r.v)}`);
      const end = right ? x(r.v) + 8 : x(-r.v) - 8;
      g.select('.row__raw')
        .attr('x', end)
        .attr('y', 8 + barH / 2 + 4)
        .attr('text-anchor', anchor)
        // 中文另标原文单位“百万”；英文标签本身已是 million，不再重复
        .text(narrow || isEn() ? '' : `${fmt.int(r.v)} 百万`);
    });
    const netLabel = lab.filter((r) => r.key === 'net');
    const createdLabel = lab.filter((r) => r.key === 'created');
    tt(netLabel, on ? D * 1.8 : 0).style('opacity', on ? 1 : 0);
    createdLabel.select('.row__raw').style('opacity', on ? 0 : 1);
  }

  const stop = observeSize(container, ({ width: w }) => {
    width = w;
    render(false);
  });

  return {
    update(step) {
      const next = step >= 1 ? 1 : 0;
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
      root.classed('diverging-bar', false);
    },
  };
}
