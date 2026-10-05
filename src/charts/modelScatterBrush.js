// 知名 AI 模型训练算力散点（Canvas）+ 底部时间刷选缩放
// 数据：Epoch AI notable models（d3.autoType 解析后的 CSV 行）
// update(step)：0 全部模型；1 突出中美（其余淡化，标注各自最高算力模型）；2 里程碑标注；3 自动刷选 2020-01-01 至最新
import * as d3 from 'd3';
import {
  observeSize,
  observeVisible,
  createSvg,
  chartHeight,
  fmt,
  legend,
  note,
  styleAxis,
  srTable,
} from '../core/chartUtils.js';
import { theme, color, GROUP_COLOR, GROUP_LABEL, onThemeChange } from '../core/theme.js';
import { tooltip } from '../core/tooltip.js';
import { t } from '../core/i18n.js';
import '../styles/charts/modelScatterBrush.css';

// 图例分组：“其他”与“未注明”共用一个颜色，合并为一项
const LEGEND_GROUPS = [
  { key: 'CN', members: ['CN'] },
  { key: 'US', members: ['US'] },
  { key: 'EU+UK', members: ['EU+UK'] },
  { key: 'Multi', members: ['Multi'] },
  { key: 'Other', members: ['Other', 'Unknown'], label: () => t('其他 / 未注明', 'Other / unspecified') },
];
const groupLabel = (g) => (g.label ? g.label() : GROUP_LABEL[g.key]);
// 里程碑：按优先级排列（窄屏只保留靠前者）；短名仅用于显示
const MILESTONES = [
  ['GPT-3 175B (davinci)', 'GPT-3'],
  ['DeepSeek-R1', 'DeepSeek-R1'],
  ['AlexNet', 'AlexNet'],
  ['Transformer', 'Transformer'],
  ['GPT-4.5', 'GPT-4.5'],
  ['AlphaGo Lee', 'AlphaGo'],
  ['Gemini 1.0 Ultra', 'Gemini 1.0 Ultra'],
  ['Llama 3.1-405B', 'Llama 3.1-405B'],
  ['Qwen2.5-72B', 'Qwen2.5-72B'],
  ['DeepSeek-V3', 'DeepSeek-V3'],
  ['Grok 3', 'Grok 3'],
];
const ZOOM_START = new Date(2020, 0, 1);
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (n) =>
  String(n)
    .split('')
    .map((c) => (c === '-' ? '⁻' : SUP[+c]))
    .join('');
const pow10 = (v) => `10${sup(Math.round(Math.log10(v)))}`;
const varName = (g) => (GROUP_COLOR[g] || 'var(--other)').slice(6, -1);
const legendKey = (g) => (g === 'Unknown' ? 'Other' : g);

export function createModelScatterBrush(container, data) {
  const rows = data.filter((d) => d.training_compute_flop > 0 && d.date instanceof Date);
  const points = rows.map((d) => ({ ...d, flop: +d.training_compute_flop, lg: legendKey(d.group) }));
  const total = data.length;

  const root = d3.select(container).classed('msb', true);
  const stage = root.append('div').attr('class', 'msb__stage');
  const canvas = stage.append('canvas').attr('class', 'msb__canvas').attr('aria-hidden', 'true');
  const svg = createSvg(stage.node(), 'msb__svg').attr(
    'aria-label',
    t(
      '知名 AI 模型训练算力随时间变化散点图',
      'Scatter plot of training compute of notable AI models over time',
    ),
  );
  const legendWrap = root.append('div').attr('class', 'msb__legend');
  note(
    container,
    t(
      `香港计入中国。含训练算力估计的模型 ${fmt.int(points.length)} / 全部 ${fmt.int(total)}（未估计训练算力的模型不绘制）。训练算力为 Epoch AI 估计值；圆点面积 ∝ 参数量，参数量未公开者以空心小圈表示。`,
      `Hong Kong, China is counted as China. Models with a training-compute estimate: ${fmt.int(points.length)} of ${fmt.int(total)} (models without an estimate are not plotted). Training compute is an Epoch AI estimate; dot area ∝ parameter count, and models with undisclosed parameters are shown as small hollow rings.`,
    ),
    'info',
  );

  const byGroup = d3.group(points, (d) => d.lg);
  srTable(
    container,
    t('各地区知名 AI 模型（含训练算力估计）', 'Notable AI models by region (with training-compute estimate)'),
    [
      t('地区', 'Region'),
      t('模型数', 'Models'),
      t('最高训练算力（FLOP）', 'Highest training compute (FLOP)'),
      t('对应模型', 'Model'),
    ],
    LEGEND_GROUPS.map((g) => {
      const arr = byGroup.get(g.key) || [];
      const top = d3.greatest(arr, (d) => d.flop);
      return [groupLabel(g), arr.length, top ? fmt.sci(top.flop) : '—', top ? top.model : '—'];
    }),
  );

  const margin = { top: 30, right: 14, bottom: 0, left: 50 };
  const CTX_H = 40;
  const defs = svg.append('defs');
  const clipId = `msb-clip-${Math.random().toString(36).slice(2, 8)}`;
  const clipRect = defs.append('clipPath').attr('id', clipId).append('rect');
  const gx = svg.append('g').attr('class', 'x-axis');
  const gy = svg.append('g').attr('class', 'y-axis');
  const yLabel = svg.append('text').attr('class', 'axis-label').attr('x', 0).attr('y', 11);
  const plot = svg.append('g');
  const hit = plot
    .append('rect')
    .attr('class', 'msb__hit')
    .attr('tabindex', 0)
    .attr('role', 'application')
    .attr(
      'aria-label',
      t('散点区：用左右方向键逐个浏览模型', 'Scatter area: use the arrow keys to step through models'),
    );
  const annot = plot.append('g').attr('clip-path', `url(#${clipId})`).style('pointer-events', 'none');
  const hoverRing = plot.append('circle').attr('class', 'hover-ring').attr('r', 0).attr('opacity', 0);
  const ctxG = svg.append('g').attr('class', 'ctx');
  const ctxFrame = ctxG.append('rect').attr('class', 'ctx-frame').attr('rx', 6);
  const ctxAxis = ctxG.append('g').attr('class', 'x-axis');
  const ctxHint = ctxG.append('text').attr('class', 'ctx-hint').attr('text-anchor', 'end');
  const gBrush = ctxG.append('g').attr('class', 'brush');
  const handles = ctxG.append('g');

  let width = 0;
  let height = 0;
  let iw = 0;
  let ih = 0;
  let ctxY0 = 0;
  let step = 0;
  let colors = {};
  let reveal = theme.reducedMotion ? 1 : 0;
  let drawn = [];
  let qt = null;
  let focusIdx = -1;
  let silent = false;
  const hidden = new Set();

  const fullDomain = d3.extent(points, (d) => d.date);
  fullDomain[0] = d3.timeYear.floor(fullDomain[0]);
  let domain = fullDomain.slice();
  let zoomed = null; // 当前刷选区间（Date[]）或 null

  const x = d3.scaleTime();
  const xc = d3.scaleTime().domain(fullDomain);
  const yExt = d3.extent(points, (d) => d.flop);
  const fullExp = [Math.floor(Math.log10(yExt[0])), Math.ceil(Math.log10(yExt[1]))];
  let yExp = fullExp.slice();
  let yGoal = fullExp.slice();
  const y = d3.scaleLog().domain(fullExp.map((e) => 10 ** e));
  const yc = d3.scaleLog().domain(y.domain());
  const maxParams = d3.max(points, (d) => d.parameters) || 1;
  const rScale = d3.scaleSqrt().domain([0, maxParams]).range([0, 15]);
  const radius = (d) => (d.parameters > 0 ? 2.2 + rScale(d.parameters) : 3);
  // 大圆先画、小圆后画，避免遮挡
  const order = points.slice().sort((a, b) => radius(b) - radius(a));

  const milestones = MILESTONES.map(([name, short], i) => {
    const p = points.find((d) => d.model === name);
    return p ? { p, short, rank: i } : null;
  }).filter(Boolean);

  function readColors() {
    colors = {};
    Object.keys(GROUP_COLOR).forEach((g) => (colors[g] = color(varName(g))));
    colors.other = color('other');
    colors.panel = color('panel');
    colors.faint = color('faint');
  }
  readColors();

  // ---------- 图例（可点击切换分组） ----------
  const lg = legend(
    legendWrap.node(),
    LEGEND_GROUPS.map((g) => ({
      key: g.key,
      label: `${groupLabel(g)} ${(byGroup.get(g.key) || []).length}`,
      color: GROUP_COLOR[g.key],
      shape: 'dot',
    })),
  );
  const legendItems = lg
    .selectAll('.legend__item')
    .attr('role', 'button')
    .attr('tabindex', 0)
    .attr('aria-pressed', 'true')
    .attr('title', t('点击显示 / 隐藏该组', 'Click to show / hide this group'))
    .on('click', (_, d) => toggleGroup(d.key))
    .on('keydown', (event, d) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleGroup(d.key);
      }
    });
  legend(legendWrap.node(), [
    { label: t('参数量未公开', 'Parameters undisclosed'), color: 'var(--muted)', shape: 'ring' },
    { label: t('时间轴刷选区', 'Timeline brush selection'), color: 'var(--cyan)', shape: 'square' },
  ]).style('margin-top', '4px');
  // 参数量尺寸图例（HTML 内联 svg，避免与数据重叠）
  {
    const keys = [1e9, 1e11, 1e12].filter((v) => v <= maxParams);
    const rs = keys.map((v) => 2.2 + rScale(v));
    const kw = 0;
    const kh = d3.max(rs) * 2 + 2;
    const wrap = legendWrap.append('div').attr('class', 'legend msb__size');
    wrap.append('span').text(t('圆点面积 ∝ 参数量：', 'Dot area ∝ parameters: '));
    const ks = wrap.append('svg').attr('width', kw).attr('height', kh).attr('aria-hidden', 'true');
    let cx = 0;
    keys.forEach((v, i) => {
      cx += rs[i] + 1;
      ks.append('circle')
        .attr('cx', cx)
        .attr('cy', kh / 2)
        .attr('r', rs[i]);
      ks.append('text')
        .attr('x', cx + rs[i] + 4)
        .attr('y', kh / 2 + 4)
        .text(fmt.cn(v));
      cx += rs[i] + 4 + fmt.cn(v).length * 7 + 14;
    });
    ks.attr('width', cx);
  }

  function toggleGroup(key) {
    if (hidden.has(key)) hidden.delete(key);
    else hidden.add(key);
    if (hidden.size === LEGEND_GROUPS.length) hidden.delete(key);
    syncLegend();
    retargetY();
    draw();
  }
  function syncLegend() {
    legendItems
      .classed('is-off', (d) => hidden.has(d.key))
      .classed('is-dim', (d) => !hidden.has(d.key) && step === 1 && d.key !== 'CN' && d.key !== 'US')
      .attr('aria-pressed', (d) => String(!hidden.has(d.key)));
  }

  const faded = (d) => step === 1 && d.lg !== 'CN' && d.lg !== 'US';

  // ---------- 布局 ----------
  function layout() {
    const mainH = chartHeight(width, { aspect: 0.5, min: 280, max: 470 });
    margin.left = width < 480 ? 42 : 50;
    iw = width - margin.left - margin.right;
    ih = mainH;
    ctxY0 = margin.top + ih + 46;
    height = ctxY0 + CTX_H + 26;

    const dpr = window.devicePixelRatio || 1;
    canvas
      .attr('width', Math.round(width * dpr))
      .attr('height', Math.round(height * dpr))
      .style('width', `${width}px`)
      .style('height', `${height}px`);
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);

    x.range([0, iw]);
    xc.range([0, iw]);
    y.range([ih, 0]);
    yc.range([CTX_H - 5, 5]);
    clipRect.attr('width', iw).attr('height', ih);
    plot.attr('transform', `translate(${margin.left},${margin.top})`);
    hit.attr('width', iw).attr('height', ih);
    gx.attr('transform', `translate(${margin.left},${margin.top + ih})`);
    gy.attr('transform', `translate(${margin.left},${margin.top})`);
    yLabel.text(
      width < 480
        ? t('训练算力（FLOP，对数）', 'Training compute (FLOP, log)')
        : t('训练算力（FLOP，对数刻度）', 'Training compute (FLOP, log scale)'),
    );

    // 上下文时间轴
    ctxG.attr('transform', `translate(${margin.left},${ctxY0})`);
    ctxFrame.attr('width', iw).attr('height', CTX_H);
    ctxAxis.attr('transform', `translate(0,${CTX_H})`).call(
      d3
        .axisBottom(xc)
        .ticks(Math.max(3, Math.floor(iw / 80)))
        .tickFormat(d3.timeFormat('%Y'))
        .tickSize(4),
    );
    styleAxis(ctxAxis);
    ctxHint
      .attr('x', iw)
      .attr('y', -6)
      .text(
        width < 480
          ? t('拖选时间轴缩放 · 点空白处复原', 'Drag to zoom · tap blank to reset')
          : t(
              '在时间轴上拖选以缩放主图 · 点击空白处复原',
              'Drag on the timeline to zoom the main chart · click a blank area to reset',
            ),
      );
    brush.extent([
      [0, 0],
      [iw, CTX_H],
    ]);
    gBrush.call(brush);
    silent = true;
    gBrush.call(brush.move, zoomed ? zoomed.map(xc) : null);
    silent = false;
    syncHandles(zoomed ? zoomed.map(xc) : null);
  }

  // ---------- 刷选 ----------
  const brush = d3.brushX().on('start brush end', brushed);
  function brushed(event) {
    if (silent) return;
    const s = event.selection;
    syncHandles(s);
    // 程序化移动（步骤 3）只同步把手，主图由 zoomTo 平滑过渡
    if (!event.sourceEvent) return;
    svg.interrupt('zoom');
    if (s) {
      zoomed = s.map(xc.invert);
      domain = zoomed.slice();
      retargetY();
      draw();
    } else if (event.type === 'end') {
      zoomed = null;
      zoomTo(fullDomain);
    }
  }
  // y 轴随可见数据自适应（以 10 的整数次幂为边界）
  function yTargetFor(dom) {
    const vis = points.filter((d) => !hidden.has(d.lg) && d.date >= dom[0] && d.date <= dom[1]);
    if (!vis.length) return fullExp.slice();
    const [a, b] = d3.extent(vis, (d) => Math.log10(d.flop));
    return [Math.floor(a - 0.2), Math.ceil(b + 0.2)];
  }
  function retargetY() {
    const goal = yTargetFor(domain);
    if (goal[0] === yGoal[0] && goal[1] === yGoal[1]) return;
    yGoal = goal;
    const iy = d3.interpolateArray(yExp.slice(), goal);
    svg
      .transition('y')
      .duration(Math.min(theme.duration, 400))
      .ease(theme.ease)
      .tween('y', () => (k) => {
        yExp = iy(k);
        draw();
      });
  }
  function syncHandles(s) {
    handles
      .selectAll('rect')
      .data(s ? s : [])
      .join('rect')
      .attr('class', 'brush-handle')
      .attr('x', (d) => d - 3)
      .attr('y', CTX_H / 2 - 9)
      .attr('width', 6)
      .attr('height', 18)
      .attr('rx', 3);
  }
  function zoomTo(target) {
    const from = domain.slice();
    const i0 = d3.interpolateDate(from[0], target[0]);
    const i1 = d3.interpolateDate(from[1], target[1]);
    yGoal = yTargetFor(target);
    const iy = d3.interpolateArray(yExp.slice(), yGoal);
    svg.interrupt('y');
    svg
      .transition('zoom')
      .duration(theme.duration)
      .ease(theme.ease)
      .tween('zoom', () => (k) => {
        domain = [i0(k), i1(k)];
        yExp = iy(k);
        draw();
      });
  }
  function setBrush(target) {
    if (target) {
      const px = target.map(xc);
      const cur = zoomed ? zoomed.map(xc) : null;
      if (cur && Math.abs(cur[0] - px[0]) < 0.5 && Math.abs(cur[1] - px[1]) < 0.5) return;
      zoomed = target.slice();
      if (theme.reducedMotion) gBrush.call(brush.move, px);
      else gBrush.transition().duration(theme.duration).ease(theme.ease).call(brush.move, px);
      zoomTo(target);
    } else if (zoomed) {
      zoomed = null;
      gBrush.interrupt().call(brush.move, null);
      zoomTo(fullDomain);
    }
  }

  // ---------- 绘制 ----------
  function xTickFormat(d) {
    return d3.timeYear(d) < d ? d3.timeFormat(t('%-m 月', '%b'))(d) : d3.timeFormat('%Y')(d);
  }

  function draw() {
    if (!width) return;
    x.domain(domain);
    gx.call(
      d3
        .axisBottom(x)
        .ticks(Math.max(3, Math.floor(iw / 90)))
        .tickFormat(xTickFormat)
        .tickSizeOuter(0),
    );
    styleAxis(gx);

    // y 轴：只在 10 的整数次幂处取刻度
    y.domain([10 ** yExp[0], 10 ** yExp[1]]);
    const e0 = Math.ceil(yExp[0] - 1e-6);
    const e1 = Math.floor(yExp[1] + 1e-6);
    const maxTicks = Math.max(3, Math.floor(ih / 40));
    const stepE = [1, 2, 3, 4, 5, 6].find((k) => (e1 - e0) / k <= maxTicks) || 6;
    const tv = d3
      .range(e0, e1 + 1)
      .filter((e) => e % stepE === 0)
      .map((e) => 10 ** e);
    gy.call(d3.axisLeft(y).tickValues(tv).tickFormat(pow10).tickSize(-iw).tickPadding(6));
    styleAxis(gy);
    gy.selectAll('.tick line').attr('class', 'grid-line');

    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.node().getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // 主图
    ctx.save();
    ctx.beginPath();
    ctx.rect(margin.left - 2, margin.top - 2, iw * reveal + 4, ih + 4);
    ctx.clip();
    drawn = [];
    const passes = [order.filter(faded), order.filter((d) => !faded(d))];
    passes.forEach((list, pass) => {
      list.forEach((d) => {
        if (hidden.has(d.lg)) return;
        const px = x(d.date);
        if (px < -20 || px > iw + 20) return;
        const py = y(d.flop);
        const r = radius(d);
        const c = pass === 0 ? colors.other : colors[d.group] || colors.other;
        ctx.globalAlpha = pass === 0 ? 0.16 : 0.78;
        ctx.beginPath();
        ctx.arc(margin.left + px, margin.top + py, r, 0, Math.PI * 2);
        if (d.parameters > 0) {
          ctx.fillStyle = c;
          ctx.fill();
          ctx.globalAlpha = pass === 0 ? 0.3 : 0.9;
          ctx.lineWidth = 0.8;
          ctx.strokeStyle = colors.panel;
          ctx.stroke();
        } else {
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = c;
          ctx.stroke();
        }
        if (px >= 0 && px <= iw) drawn.push({ d, px, py, r });
      });
    });
    ctx.restore();

    // 上下文缩略图
    ctx.save();
    ctx.translate(margin.left, ctxY0);
    ctx.globalAlpha = 0.7;
    points.forEach((d) => {
      if (hidden.has(d.lg)) return;
      ctx.fillStyle = faded(d) ? colors.faint : colors[d.group] || colors.other;
      ctx.fillRect(xc(d.date) - 1, yc(d.flop) - 1, 2, 2);
    });
    ctx.restore();

    qt = d3
      .quadtree()
      .x((p) => p.px)
      .y((p) => p.py)
      .addAll(drawn);
    drawAnnotations();
    if (hoverRing.attr('opacity') !== '0') hideHover();
  }

  // ---------- 标注（中美最高 / 里程碑），贪心避让 ----------
  const measureCtx = document.createElement('canvas').getContext('2d');
  function textW(s, size = 11) {
    measureCtx.font = `600 ${size}px ${getComputedStyle(container).fontFamily || 'sans-serif'}`;
    return measureCtx.measureText(s).width;
  }

  function annotationItems() {
    const visible = (p) => !hidden.has(p.lg) && x(p.date) >= 0 && x(p.date) <= iw;
    if (step === 1) {
      return ['US', 'CN']
        .map((g, i) => {
          const arr = (byGroup.get(g) || []).filter(visible);
          const top = d3.greatest(arr, (d) => d.flop);
          return top
            ? {
                p: top,
                rank: i,
                title: t(`${GROUP_LABEL[g]}最高：${top.model}`, `Top in ${GROUP_LABEL[g]}: ${top.model}`),
                sub: `${fmt.sci(top.flop)} FLOP`,
              }
            : null;
        })
        .filter(Boolean);
    }
    if (step >= 2) {
      const max = width < 480 ? 5 : width < 720 ? 8 : 11;
      return milestones
        .filter((m) => visible(m.p))
        .slice(0, max)
        .map((m) => ({
          p: m.p,
          rank: m.rank,
          title: m.short,
          sub: `${m.p.date.getFullYear()} · ${fmt.sci(m.p.flop)}`,
        }));
    }
    return [];
  }

  // 候选位置：先贴近点的四个斜向，再向左上空白区（趋势线上方）水平引出
  const NEAR = [
    [-1, -1, 14],
    [1, -1, 14],
    [-1, 1, 14],
    [1, 1, 14],
    [-1, -1, 34],
    [1, -1, 34],
  ];
  const FAR = [];
  [56, 90, 124, 158, 192, 230, 270].forEach((dist) =>
    [0, -18, 18, -36, 36, -54].forEach((dy) => FAR.push([dist, dy])),
  );

  function placeLabels(items) {
    const H = 26;
    // 所有标注点自身也视为障碍
    const boxes = items.map((it) => {
      const px = x(it.p.date);
      const py = y(it.p.flop);
      const r = radius(it.p) + 4;
      return { x0: px - r, x1: px + r, y0: py - r, y1: py + r };
    });
    const hits = (b, list) => list.some((o) => !(b.x1 < o.x0 || b.x0 > o.x1 || b.y1 < o.y0 || b.y0 > o.y1));
    const inside = (b) => b.x0 >= 0 && b.x1 <= iw && b.y0 >= 0 && b.y1 <= ih;
    const segHits = (x1, y1, x2, y2, list) =>
      d3.range(0.15, 1, 0.1).some((k) => {
        const sx = x1 + (x2 - x1) * k;
        const sy = y1 + (y2 - y1) * k;
        return list.some((o) => sx > o.x0 && sx < o.x1 && sy > o.y0 && sy < o.y1);
      });
    // 数据点占用栅格：标签尽量不压在数据点上
    const CELL = 6;
    const cols = Math.ceil(iw / CELL) + 1;
    const rowsN = Math.ceil(ih / CELL) + 1;
    const occ = new Uint8Array(cols * rowsN);
    drawn.forEach(({ px, py, r }) => {
      for (
        let cx = Math.max(0, Math.floor((px - r) / CELL));
        cx <= Math.min(cols - 1, Math.floor((px + r) / CELL));
        cx++
      )
        for (
          let cy = Math.max(0, Math.floor((py - r) / CELL));
          cy <= Math.min(rowsN - 1, Math.floor((py + r) / CELL));
          cy++
        )
          occ[cy * cols + cx] = 1;
    });
    const cover = (b) => {
      let n = 0;
      for (
        let cx = Math.max(0, Math.floor(b.x0 / CELL));
        cx <= Math.min(cols - 1, Math.floor(b.x1 / CELL));
        cx++
      )
        for (
          let cy = Math.max(0, Math.floor(b.y0 / CELL));
          cy <= Math.min(rowsN - 1, Math.floor(b.y1 / CELL));
          cy++
        )
          n += occ[cy * cols + cx];
      return n;
    };
    const labelBoxes = [];
    const placed = [];
    items.forEach((it) => {
      const px = x(it.p.date);
      const py = y(it.p.flop);
      const w = Math.ceil(Math.max(textW(it.title, 11), textW(it.sub, 10))) + 4;
      const cands = [
        ...NEAR.map(([sx, sy, dist]) => {
          const ax = px + sx * dist * 0.6;
          const ay = py + sy * dist;
          const x0 = sx < 0 ? ax - w : ax;
          const y0 = sy < 0 ? ay - H : ay;
          return { x0, y0 };
        }),
        ...FAR.map(([dist, dy]) => ({ x0: px - dist - w, y0: py + dy - H / 2 })),
        ...FAR.map(([dist, dy]) => ({ x0: px + dist, y0: py + dy - H / 2 })),
      ];
      let best = null;
      for (const c of cands) {
        const box = { x0: c.x0, x1: c.x0 + w, y0: c.y0, y1: c.y0 + H };
        if (!inside(box) || hits(box, boxes)) continue;
        const lx = Math.max(box.x0 - 3, Math.min(px, box.x1 + 3));
        const ly = Math.max(box.y0 + 4, Math.min(py, box.y1 - 4));
        if (segHits(px, py, lx, ly, labelBoxes)) continue;
        const score = cover(box);
        if (!best || score < best.score) best = { score, box, lx, ly };
        if (score === 0) break;
      }
      if (best) {
        boxes.push(best.box);
        labelBoxes.push(best.box);
        placed.push({ ...it, px, py, lx: best.lx, ly: best.ly, box: best.box, left: best.box.x1 <= px + 1 });
      }
    });
    return placed;
  }

  function drawAnnotations() {
    const placed = placeLabels(annotationItems());
    const g = annot
      .selectAll('g.ms')
      .data(placed, (d) => d.p.model)
      .join(
        (enter) => {
          const e = enter.append('g').attr('class', 'ms').attr('opacity', 0);
          e.append('path').attr('class', 'ms__leader');
          e.append('circle').attr('class', 'ms__ring');
          e.append('text').attr('class', 'ms__label');
          e.append('text').attr('class', 'ms__sub');
          e.transition().duration(theme.duration).attr('opacity', 1);
          return e;
        },
        (u) => u,
        (exit) => exit.remove(),
      );
    g.select('.ms__ring')
      .attr('cx', (d) => d.px)
      .attr('cy', (d) => d.py)
      .attr('r', (d) => radius(d.p) + 3);
    g.select('.ms__leader').attr('d', (d) => {
      const r = radius(d.p) + 3;
      const ang = Math.atan2(d.ly - d.py, d.lx - d.px);
      return `M${d.px + Math.cos(ang) * r},${d.py + Math.sin(ang) * r}L${d.lx},${d.ly}`;
    });
    const tx = (d) => (d.left ? d.box.x1 - 2 : d.box.x0 + 2);
    g.select('.ms__label')
      .attr('x', tx)
      .attr('y', (d) => d.box.y0 + 11)
      .attr('text-anchor', (d) => (d.left ? 'end' : 'start'))
      .style('fill', (d) => (step === 1 ? GROUP_COLOR[d.p.group] : null))
      .text((d) => d.title);
    g.select('.ms__sub')
      .attr('x', tx)
      .attr('y', (d) => d.box.y0 + 23)
      .attr('text-anchor', (d) => (d.left ? 'end' : 'start'))
      .text((d) => d.sub);
  }

  // ---------- 悬停 / 键盘浏览 ----------
  function tipHtml(d) {
    const country = d.country ? String(d.country) : '—';
    const sep = t('：', ': ');
    const grp = GROUP_LABEL[d.group] || '—';
    return `<strong>${d.model}</strong><br>${d.organization || '—'}<br>
      <em>${t('发布', 'Released')}${sep}</em>${fmt.date(d.date)}<br>
      <em>${t('训练算力', 'Training compute')}${sep}</em>${fmt.sci(d.flop)} FLOP<br>
      <em>${t('参数量', 'Parameters')}${sep}</em>${d.parameters > 0 ? `${fmt.cn(d.parameters)}` : t('未公开', 'undisclosed')}<br>
      <em>${t('国家/地区', 'Country/region')}${sep}</em>${country}${t(`（${grp}）`, ` (${grp})`)}${d.domain ? `<br><em>${t('领域', 'Domain')}${sep}</em>${d.domain}` : ''}`;
  }
  function showHover(p, event) {
    hoverRing
      .attr('cx', p.px)
      .attr('cy', p.py)
      .attr('r', p.r + 3)
      .attr('opacity', 1);
    let ev = event;
    if (!ev || !('clientX' in ev)) {
      const rect = svg.node().getBoundingClientRect();
      ev = { clientX: rect.left + margin.left + p.px, clientY: rect.top + margin.top + p.py };
    }
    tooltip.show(ev, tipHtml(p.d));
  }
  function hideHover() {
    hoverRing.attr('opacity', 0);
    tooltip.hide();
  }
  hit
    .on('pointermove', (event) => {
      if (!qt) return;
      const [mx, my] = d3.pointer(event);
      const p = qt.find(mx, my, 22);
      if (p) showHover(p, event);
      else hideHover();
    })
    .on('pointerleave blur', () => {
      focusIdx = -1;
      hideHover();
    })
    .on('keydown', (event) => {
      if (!drawn.length) return;
      const list = drawn.slice().sort((a, b) => a.d.date - b.d.date);
      if (event.key === 'ArrowRight' || event.key === 'ArrowUp')
        focusIdx = Math.min(list.length - 1, focusIdx + 1);
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') focusIdx = Math.max(0, focusIdx - 1);
      else if (event.key === 'End') focusIdx = list.length - 1;
      else if (event.key === 'Home') focusIdx = 0;
      else if (event.key === 'Escape') {
        focusIdx = -1;
        hideHover();
        return;
      } else return;
      event.preventDefault();
      showHover(list[focusIdx]);
    });

  // ---------- 首次可见时从左向右展开 ----------
  let stopVisible = () => {};
  if (reveal < 1) {
    stopVisible = observeVisible(container, (vis) => {
      if (!vis) return;
      stopVisible();
      svg
        .transition('reveal')
        .duration(1400)
        .ease(d3.easeCubicOut)
        .tween('reveal', () => (k) => {
          reveal = k;
          draw();
        });
    });
  }

  const stopSize = observeSize(container, ({ width: w }) => {
    width = w;
    layout();
    draw();
  });
  const stopTheme = onThemeChange(() => {
    readColors();
    draw();
  });

  return {
    update(s) {
      const prev = step;
      step = s;
      syncLegend();
      if (s >= 3) setBrush([ZOOM_START, fullDomain[1]]);
      else setBrush(null);
      if (prev !== s) draw();
    },
    resize() {
      width = container.clientWidth;
      layout();
      draw();
    },
    destroy() {
      stopSize();
      stopTheme();
      stopVisible();
      svg.interrupt('zoom').interrupt('reveal').interrupt('y');
      gBrush.interrupt();
      tooltip.hide();
      root.selectAll('*').remove();
    },
  };
}
