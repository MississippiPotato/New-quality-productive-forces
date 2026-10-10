// 中国算力增长面积图 + 口径切换器
// 视图：center（算力中心侧 EFLOPS）/ racks（机架规模）/ device（设备侧 FP32，条形）
// update(step)：0 中心侧；1 中心侧并高亮口径差异；2 机架；3 设备侧
import * as d3 from 'd3';
import {
  observeSize,
  createSvg,
  chartHeight,
  tr,
  fmt,
  legend,
  styleAxis,
  toDate,
  srTable,
} from '../core/chartUtils.js';
import { bindTooltip } from '../core/tooltip.js';
import { t, tf } from '../core/i18n.js';

// 语言在图表创建时读取；切换语言时 figure.js 会重建图表
const views = () => [
  { key: 'center', label: t('算力中心侧', 'Data-centre side') },
  { key: 'racks', label: t('机架规模', 'Racks') },
  { key: 'device', label: t('设备侧 FP32', 'Device side FP32') },
];
const metricLabel = () => ({
  total: t('算力总规模', 'Total compute'),
  intelligent: t('智能算力', 'AI compute'),
});

export function createComputeArea(container, data) {
  const root = d3.select(container).classed('compute-area', true);
  const VIEWS = views();
  const METRIC_LABEL = metricLabel();
  const controls = root
    .append('div')
    .attr('class', 'seg')
    .attr('role', 'tablist')
    .attr('aria-label', t('口径切换', 'Measurement basis'));
  const svg = createSvg(container);
  const legendWrap = root.append('div');
  srTable(
    container,
    t('中国算力规模（多口径）', 'China computing power (several bases)'),
    [
      t('日期', 'Date'),
      t('指标', 'Metric'),
      t('数值', 'Value'),
      t('单位', 'Unit'),
      t('精度', 'Precision'),
      t('口径', 'Basis'),
    ],
    data.records.map((r) => [r.date, r.metric, r.value, r.unit, tf(r, 'precision'), tf(r, 'scope')]),
  );

  const margin = { top: 28, right: 72, bottom: 36, left: 56 };
  const gx = svg.append('g').attr('class', 'x-axis');
  const gy = svg.append('g').attr('class', 'y-axis');
  const plot = svg.append('g');
  const yLabel = svg.append('text').attr('class', 'axis-label').attr('x', 0).attr('y', 14);

  let width = 0;
  let height = 0;
  let view = 'center';
  let highlight = false;

  controls
    .selectAll('button')
    .data(VIEWS)
    .join('button')
    .attr('type', 'button')
    .attr('role', 'tab')
    .text((d) => d.label)
    .on('click', (_, d) => {
      view = d.key;
      render(true);
    });

  const center = data.records
    .filter((r) => r.metric === 'total' || r.metric === 'intelligent')
    .map((r) => ({ ...r, d: toDate(r.date) }));
  const target = data.targets[0];
  const racks = data.racks.map((r) => ({ ...r, d: toDate(r.date) }));
  const device = data.records.filter((r) => r.scope.startsWith('设备侧'));
  const DEVICE_LABEL = {
    device_global_total: t('全球 · 总算力', 'World · total'),
    device_total: t('中国 · 总算力', 'China · total'),
    device_intelligent: t('中国 · 智能算力', 'China · AI compute'),
  };

  function render(animate) {
    if (!width) return;
    height = chartHeight(width, { aspect: 0.55, min: 300, max: 460 });
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
    controls
      .selectAll('button')
      .classed('is-active', (d) => d.key === view)
      .attr('aria-selected', (d) => d.key === view);
    const tt = (sel, delay) => (animate ? tr(sel, delay) : sel);
    const iw = width - margin.left - margin.right;
    const ih = height - margin.top - margin.bottom;
    plot.attr('transform', `translate(${margin.left},${margin.top})`);
    gx.attr('transform', `translate(${margin.left},${margin.top + ih})`);
    gy.attr('transform', `translate(${margin.left},${margin.top})`);

    legendWrap.selectAll('*').remove();
    if (view === 'device') return renderDevice(iw, ih, tt);

    const series = view === 'center' ? center : racks;
    const x = d3
      .scaleTime()
      .domain([new Date(2023, 0, 1), new Date(2026, 11, 31)])
      .range([0, iw]);
    const yMax = view === 'center' ? d3.max(center, (d) => d.value) : d3.max(racks, (d) => d.value);
    const y = d3
      .scaleLinear()
      .domain([0, yMax * 1.15])
      .nice()
      .range([ih, 0]);

    tt(gx).call(
      d3.axisBottom(x).ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat('%Y')).tickSizeOuter(0),
    );
    tt(gy).call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat(d3.format(',')));
    styleAxis(gx);
    styleAxis(gy);
    gy.selectAll('.tick line').attr('class', 'grid-line');
    yLabel.text(
      view === 'center'
        ? t('单位：EFLOPS', 'Unit: EFLOPS')
        : t('单位：万标准机架', 'Unit: 10,000 standard racks'),
    );

    // 面积与折线：只连接同一指标的点；精度不同的线段画虚线
    const lineData = view === 'center' ? center.filter((d) => d.metric === 'intelligent') : racks;
    const area = d3
      .area()
      .x((d) => x(d.d))
      .y0(ih)
      .y1((d) => y(d.value))
      .curve(d3.curveMonotoneX);
    const segs = d3.pairs(lineData).map(([a, b]) => ({ a, b, mixed: a.precision !== b.precision }));

    plot
      .selectAll('path.area')
      .data([lineData])
      .join('path')
      .attr('class', 'area')
      .style('fill', 'var(--tool)')
      .style('fill-opacity', 0.14)
      .call((s) => tt(s).attr('d', area));

    plot
      .selectAll('line.seg')
      .data(segs)
      .join('line')
      .attr('class', 'seg')
      .style('stroke', 'var(--tool)')
      .style('stroke-width', 2.5)
      .style('stroke-dasharray', (d) => (d.mixed && view === 'center' ? '6 5' : null))
      .call((s) =>
        tt(s)
          .attr('x1', (d) => x(d.a.d))
          .attr('y1', (d) => y(d.a.value))
          .attr('x2', (d) => x(d.b.d))
          .attr('y2', (d) => y(d.b.value)),
      );

    // 目标线（仅中心侧）
    const targetData = view === 'center' ? [target] : [];
    const tg = plot
      .selectAll('g.target')
      .data(targetData)
      .join((enter) => {
        const g = enter.append('g').attr('class', 'target');
        g.append('line').style('stroke', 'var(--orange)').style('stroke-dasharray', '4 4');
        g.append('text').attr('class', 'annot').attr('text-anchor', 'end').attr('dy', -6);
        return g;
      });
    tg.select('line')
      .attr('x1', 0)
      .attr('x2', iw)
      .attr('y1', (d) => y(d.value))
      .attr('y2', (d) => y(d.value));
    tg.select('text')
      .attr('x', iw)
      .attr('y', (d) => y(d.value))
      .style('fill', 'var(--orange)')
      .text((d) =>
        t(
          `${d.label}：${d.qualifier}${d.value} EFLOPS（行动计划，总算力）`,
          `${tf(d, 'label')}: ${tf(d, 'qualifier')} ${d.value} EFLOPS (action plan, total compute)`,
        ),
      );

    const pts = plot
      .selectAll('g.pt')
      .data(series, (d) => `${d.metric || 'rack'}-${d.date}`)
      .join((enter) => {
        const g = enter.append('g').attr('class', 'pt').attr('opacity', 0);
        g.append('path');
        g.append('text').attr('class', 'pt__label').attr('text-anchor', 'middle').attr('dy', -14);
        g.append('text').attr('class', 'pt__sub').attr('text-anchor', 'middle').attr('dy', 22);
        return g;
      });
    pts.call(bindTooltip, (d) => tipHtml(d));
    pts
      .select('path')
      .attr('d', (d) =>
        d3.symbol(
          d.metric === 'total'
            ? d3.symbolDiamond
            : d.precision === 'FP16'
              ? d3.symbolCircle
              : d3.symbolSquare,
          90,
        )(),
      )
      .style('fill', (d) => (d.metric === 'total' ? 'var(--panel)' : 'var(--tool)'))
      .style('stroke', 'var(--tool)')
      .style('stroke-width', 2);
    pts
      .select('.pt__label')
      .text((d) => `${tf(d, 'qualifier') ? `${tf(d, 'qualifier')} ` : ''}${fmt.int(d.value)}`);
    pts
      .select('.pt__sub')
      .text((d) => (view === 'center' ? `${METRIC_LABEL[d.metric]} · ${tf(d, 'precision')}` : ''))
      .classed('is-hot', (d) => highlight && view === 'center' && d.metric === 'intelligent');
    tt(pts, 120)
      .attr('opacity', 1)
      .attr('transform', (d) => `translate(${x(d.d)},${y(d.value)})`);
    plot.selectAll('rect.bar, text.bar-label').remove();

    legend(
      legendWrap.node(),
      view === 'center'
        ? [
            {
              label: t('智能算力 · 精度未注明', 'AI compute · precision not stated'),
              color: 'var(--tool)',
              shape: 'square',
            },
            { label: t('智能算力 · FP16', 'AI compute · FP16'), color: 'var(--tool)', shape: 'dot' },
            {
              label: t('算力总规模（不同指标）', 'Total compute (different metric)'),
              color: 'var(--tool)',
              shape: 'diamond',
            },
            {
              label: t('口径变化处（虚线）', 'Change of basis (dashed)'),
              color: 'var(--tool)',
              shape: 'dash',
            },
          ]
        : [
            {
              label: t('在用算力中心/数据中心标准机架', 'Standard racks in use'),
              color: 'var(--tool)',
              shape: 'dot',
            },
          ],
    );

  }

  function renderDevice(iw, ih, tt) {
    plot.selectAll('path.area, line.seg, g.target, g.pt').remove();
    const x = d3
      .scaleLinear()
      .domain([0, d3.max(device, (d) => d.value) * 1.1])
      .range([0, iw]);
    const y = d3
      .scaleBand()
      .domain(device.map((d) => d.metric))
      .range([0, ih])
      .padding(0.35);
    tt(gx).call(d3.axisBottom(x).ticks(5).tickSize(-ih).tickFormat(d3.format(',')));
    styleAxis(gx);
    gx.selectAll('.tick line').attr('class', 'grid-line');
    gy.call(
      d3
        .axisLeft(y)
        .tickSize(0)
        .tickFormat(() => ''),
    );
    styleAxis(gy);
    yLabel.text(
      t('单位：EFLOPS（FP32，设备侧，2025 年 6 月）', 'Unit: EFLOPS (FP32, device side, Jun 2025)'),
    );
    plot
      .selectAll('rect.bar')
      .data(device, (d) => d.metric)
      .join((enter) => enter.append('rect').attr('class', 'bar').attr('x', 0).attr('width', 0))
      .attr('y', (d) => y(d.metric))
      .attr('height', y.bandwidth())
      .attr('rx', 4)
      .style('fill', (d) => (d.metric === 'device_global_total' ? 'var(--other)' : 'var(--orange)'))
      .call(bindTooltip, (d) => tipHtml(d))
      .call((s) => tt(s).attr('width', (d) => x(d.value)));
    plot
      .selectAll('text.bar-label')
      .data(device, (d) => d.metric)
      .join('text')
      .attr('class', 'bar-label')
      .attr('x', 8)
      .attr('y', (d) => y(d.metric) - 6)
      .text(
        (d) =>
          `${DEVICE_LABEL[d.metric]}${t('：', ': ')}${fmt.int(d.value)}${d.yoy ? t(`（同比 +${Math.round(d.yoy * 100)}%）`, ` (+${Math.round(d.yoy * 100)}% YoY)`) : ''}`,
      );
    legend(legendWrap.node(), [
      { label: t('中国', 'China'), color: 'var(--orange)', shape: 'square' },
      { label: t('全球', 'World'), color: 'var(--other)', shape: 'square' },
    ]);

  }

  function tipHtml(d) {
    const sep = t('：', ': ');
    return `<strong>${d.date}</strong><br>${METRIC_LABEL[d.metric] || DEVICE_LABEL[d.metric] || t('机架规模', 'Racks')}${sep}${tf(d, 'qualifier') ? `${tf(d, 'qualifier')} ` : ''}${fmt.int(d.value)} ${tf(d, 'unit')}
      ${d.precision ? `<br>${t('精度', 'Precision')}${sep}${tf(d, 'precision')} · ${t('口径', 'Basis')}${sep}${tf(d, 'scope')}` : ''}${d.note ? `<br><em>${tf(d, 'note')}</em>` : ''}`;
  }

  const stop = observeSize(container, ({ width: w }) => {
    width = w;
    render(false);
  });

  return {
    update(step) {
      const next = step >= 3 ? 'device' : step === 2 ? 'racks' : 'center';
      highlight = step === 1;
      view = next;
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
