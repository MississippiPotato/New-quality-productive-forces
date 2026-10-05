// 传统生产力 vs 新质生产力：示意雷达图（非统计数据）
// 轴标签按三要素着色；进入视口时多边形由“传统”形变为“新质”
// update(step)：0 仅传统形态；≥1 形变为新质生产力
import * as d3 from 'd3';
import {
  observeSize,
  observeVisible,
  createSvg,
  chartHeight,
  legend,
  note,
  srTable,
} from '../core/chartUtils.js';
import { bindTooltip } from '../core/tooltip.js';
import { theme, FACTOR_COLOR } from '../core/theme.js';
import { t, tf, isEn } from '../core/i18n.js';
import '../styles/charts/radar.css';

let uid = 0;
const FACTOR_TERMS = ['劳动资料', '劳动对象', '劳动者'];
/** 窄屏折行（中文）：优先在“劳动者 / 劳动资料 / 劳动对象”之后断开，否则对半分 */
function wrap(label) {
  const term = FACTOR_TERMS.find((f) => label.startsWith(f) && label.length > f.length);
  const k = term ? term.length : Math.ceil(label.length / 2);
  return [label.slice(0, k), label.slice(k)];
}
/** 英文按单词折行（连字符后也可断开）：每行宽度不超过 maxW（用 measure 测量） */
function wrapWords(label, maxW, measure) {
  const words = String(label).split(/\s+|(?<=-)/);
  const lines = [];
  let cur = '';
  words.forEach((w) => {
    const next = cur ? `${cur}${cur.endsWith('-') ? '' : ' '}${w}` : w;
    if (cur && measure(next) > maxW) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  });
  if (cur) lines.push(cur);
  return lines;
}

export function createRadar(container, data, options = {}) {
  const root = d3.select(container).classed('radar', true);
  const id = `radar-grad-${(uid += 1)}`;
  const axes = data.axes;
  const [oldS, newS] = data.series;
  const sep = t('：', ': ');
  const notesText = String(tf(data, 'notes'));
  const tagText = notesText.split(/[：:]/)[0];
  const oldName = tf(oldS, 'name');
  const newName = tf(newS, 'name');
  const FACTOR_NAME = {
    worker: t('劳动者', 'Workers'),
    tool: t('劳动资料', 'Means of labour'),
    object: t('劳动对象', 'Objects of labour'),
    combo: t('要素组合', 'Factor combination'),
  };

  const head = root.append('div').attr('class', 'radar__head');
  const controls = head
    .append('div')
    .attr('class', 'seg')
    .attr('role', 'tablist')
    .attr('aria-label', t('形态切换', 'Switch form'));
  head.append('span').attr('class', 'tag tag--illustrative radar__tag').text(tagText);
  const svg = createSvg(container);
  legend(root.node(), [
    { label: `${oldName}${t('（虚线）', ' (dashed)')}`, color: 'var(--other)', shape: 'dash' },
    { label: newName, color: 'var(--tool)', shape: 'square' },
    { label: FACTOR_NAME.worker, color: FACTOR_COLOR.worker, shape: 'dot' },
    { label: FACTOR_NAME.tool, color: FACTOR_COLOR.tool, shape: 'dot' },
    { label: FACTOR_NAME.object, color: FACTOR_COLOR.object, shape: 'dot' },
    { label: FACTOR_NAME.combo, color: FACTOR_COLOR.combo, shape: 'dot' },
  ]);
  note(container, notesText, 'info');
  srTable(
    container,
    t(`${data.title}（${tagText}）`, `${tf(data, 'title')} (${tagText})`),
    [t('维度', 'Dimension'), t('要素', 'Factor'), oldName, newName],
    axes.map((a) => [
      tf(a, 'label'),
      isEn() ? FACTOR_NAME[a.factor] || a.factor : a.factor,
      oldS.values[a.key],
      newS.values[a.key],
    ]),
  );

  // 渐变：按轴顺序取要素颜色（去重）
  const defs = svg.append('defs');
  const factors = [...new Set(axes.map((a) => a.factor))];
  const grad = defs
    .append('linearGradient')
    .attr('id', id)
    .attr('x1', 0)
    .attr('y1', 0)
    .attr('x2', 1)
    .attr('y2', 1);
  grad
    .selectAll('stop')
    .data(factors)
    .join('stop')
    .attr('offset', (_, i) => `${(i / Math.max(1, factors.length - 1)) * 100}%`)
    .style('stop-color', (f) => FACTOR_COLOR[f]);

  const plot = svg.append('g');
  const gridG = plot.append('g');
  const labelG = plot.append('g');
  const oldPath = plot.append('path').attr('class', 'poly--old');
  const newPath = plot
    .append('path')
    .attr('class', 'poly--new')
    .style('fill', `url(#${id})`)
    .style('stroke', `url(#${id})`);
  const vertsG = plot.append('g');

  const STATES = [
    { key: 0, label: oldName },
    { key: 1, label: newName },
  ];
  controls
    .selectAll('button')
    .data(STATES)
    .join('button')
    .attr('type', 'button')
    .attr('role', 'tab')
    .text((d) => d.label)
    .on('click', (_, d) => setState(d.key, true));

  const maxV = d3.max(data.series, (s) => d3.max(axes, (a) => s.values[a.key]));
  let width = 0;
  let R = 100;
  let state = options.step != null ? (+options.step >= 1 ? 1 : 0) : 1;
  let shown = theme.reducedMotion ? state : 0; // 当前绘制的形态（0..1 插值）
  let visible = false;

  const angle = (i) => (i / axes.length) * Math.PI * 2 - Math.PI / 2;
  const r = (v) => (v / maxV) * R;
  const pt = (i, v) => [Math.cos(angle(i)) * r(v), Math.sin(angle(i)) * r(v)];
  const polyPath = (vals) => `${d3.line()(vals.map((v, i) => pt(i, v)))}Z`;
  const mix = (k) => axes.map((a) => oldS.values[a.key] + (newS.values[a.key] - oldS.values[a.key]) * k);

  function render() {
    if (!width) return;
    const narrow = width < 520;
    const height = chartHeight(width, { aspect: 0.72, min: 320, max: 480 });
    const padX = isEn() ? (narrow ? 92 : 130) : narrow ? 64 : 120; // 英文轴标签更长，留出更多边距
    R = Math.max(70, Math.min((width - padX * 2) / 2, (height - 96) / 2 / 1.12));
    svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);
    plot.attr('transform', `translate(${width / 2},${height / 2 + 4})`);

    // 网格：同心多边形 + 辐条
    const rings = d3.range(1, maxV + 1);
    gridG
      .selectAll('path.ring')
      .data(rings)
      .join('path')
      .attr('class', (v) => `ring${v === maxV ? ' ring--outer' : ''}`)
      .attr('d', (v) => polyPath(axes.map(() => v)));
    gridG
      .selectAll('line.spoke')
      .data(axes)
      .join('line')
      .attr('class', 'spoke')
      .attr('x2', (_, i) => pt(i, maxV)[0])
      .attr('y2', (_, i) => pt(i, maxV)[1]);
    gridG
      .selectAll('text.ring-label')
      .data(rings)
      .join('text')
      .attr('class', 'ring-label')
      .attr('x', 4)
      .attr('y', (v) => -r(v) + 11)
      .text((v) => v);

    // 轴标签：按要素着色；窄屏折行
    const lab = labelG
      .selectAll('text.axis-name')
      .data(axes)
      .join('text')
      .attr('class', 'axis-name')
      .style('fill', (a) => FACTOR_COLOR[a.factor] || 'var(--text)');
    lab.each(function (a, i) {
      const el = d3.select(this);
      const [cx, cy] = pt(i, maxV * 1.12);
      const cos = Math.cos(angle(i));
      const anchor = Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end';
      const label = tf(a, 'label');
      let lines;
      if (isEn()) {
        // 英文：按可用宽度按词折行（左右两侧受画布边缘限制）
        const half = width / 2 - 6;
        const room = anchor === 'middle' ? Math.min(width - 12, 200) : half - Math.abs(cx);
        const maxW = Math.max(56, Math.min(narrow ? 120 : 180, room));
        const probe = el.append('tspan');
        const measure = (s) => probe.text(s).node().getComputedTextLength();
        lines = wrapWords(label, maxW, measure);
        probe.remove();
      } else lines = narrow && label.length > 4 ? wrap(label) : [label];
      const sin = Math.sin(angle(i));
      const dy0 =
        sin < -0.5 ? -(lines.length - 1) * 15 - 2 : sin > 0.5 ? 12 : 4 - ((lines.length - 1) * 15) / 2;
      el.attr('text-anchor', anchor).attr('transform', `translate(${cx},${cy})`);
      el.selectAll('tspan')
        .data(lines)
        .join('tspan')
        .attr('x', 0)
        .attr('dy', (_, j) => (j === 0 ? dy0 : 15))
        .text((s) => s);
    });

    oldPath.attr('d', polyPath(axes.map((a) => oldS.values[a.key])));
    draw(shown);
  }

  function draw(k) {
    const vals = mix(k);
    newPath.attr('d', polyPath(vals)).style('opacity', 0.25 + 0.75 * k);
    const vs = vertsG
      .selectAll('circle.vertex')
      .data(axes)
      .join('circle')
      .attr('class', 'vertex')
      .attr('r', 6)
      .style('fill', (a) => FACTOR_COLOR[a.factor] || 'var(--text)')
      .attr('cx', (_, i) => pt(i, vals[i])[0])
      .attr('cy', (_, i) => pt(i, vals[i])[1])
      .style('opacity', 0.3 + 0.7 * k);
    vs.call(bindTooltip, (a) =>
      t(
        `<strong style="color:${FACTOR_COLOR[a.factor]}">${a.label}</strong><br>${oldS.name}：${oldS.values[a.key]} 分<br>${newS.name}：${newS.values[a.key]} 分<br><em>${tagText}（1–${maxV} 分定性对比）</em>`,
        `<strong style="color:${FACTOR_COLOR[a.factor]}">${tf(a, 'label')}</strong><br>${oldName}${sep}${oldS.values[a.key]}<br>${newName}${sep}${newS.values[a.key]}<br><em>${tagText} (qualitative 1–${maxV} score)</em>`,
      ),
    );
  }

  function setState(next, animate) {
    state = next;
    controls
      .selectAll('button')
      .classed('is-active', (d) => d.key === state)
      .attr('aria-selected', (d) => d.key === state);
    if (!visible && !animate) return;
    const from = shown;
    if (!animate || theme.reducedMotion) {
      shown = state;
      draw(shown);
      return;
    }
    svg
      .interrupt('morph')
      .transition('morph')
      .duration(theme.duration * 1.6)
      .ease(theme.ease)
      .tween('morph', () => (t) => {
        shown = from + (state - from) * t;
        draw(shown);
      });
  }

  controls
    .selectAll('button')
    .classed('is-active', (d) => d.key === state)
    .attr('aria-selected', (d) => d.key === state);
  const stopSize = observeSize(container, ({ width: w }) => {
    width = w;
    render();
  });
  const stopVis = observeVisible(container, (vis) => {
    if (vis && !visible) {
      visible = true;
      setState(state, true);
    }
  });

  return {
    update(step) {
      visible = true;
      setState(step >= 1 ? 1 : 0, true);
    },
    resize() {
      width = container.clientWidth;
      render();
    },
    destroy() {
      stopSize();
      stopVis();
      svg.interrupt('morph');
      root.selectAll('*').interrupt().remove();
      root.classed('radar', false);
    },
  };
}
