// “三要素公式”力导向图解（全站导航，不含统计数据）
// 劳动者 / 劳动资料 / 劳动对象 → 全要素生产率↑；三者之间的弧线为“优化组合”。
// 点击 / Enter 节点跳转到对应章节；节点可拖拽，松手后回弹；轻微漂浮（离屏暂停，减少动效时关闭）。
// update(step)：0 全部；1 劳动资料；2 劳动对象；3 劳动者；4 优化组合 + 全要素生产率
import * as d3 from 'd3';
import { observeSize, observeVisible, createSvg, chartHeight } from '../core/chartUtils.js';
import { theme, onThemeChange } from '../core/theme.js';
import { t, isEn } from '../core/i18n.js';
import { goToChapter } from '../core/chapterNav.js';
import '../styles/charts/factorForce.css';

// 节点文案为代码标签：语言在图表创建时读取（切换语言时 figure.js 会重建图表）
const nodeDefs = () => [
  {
    id: 'center',
    name: isEn() ? ['Total factor', 'productivity ↑'] : ['全要素', '生产率↑'],
    desc: t('核心标志', 'Core hallmark'),
    href: '#ch8',
    color: 'var(--combo)',
    ax: 0.5,
    ay: 0.5,
  },
  {
    id: 'tool',
    name: isEn() ? ['Means of', 'labour'] : ['劳动资料'],
    desc: t('算力 · 大模型', 'Compute · large models'),
    href: '#ch2',
    color: 'var(--tool)',
    ax: 0.2,
    ay: 0.27,
  },
  {
    id: 'object',
    name: isEn() ? ['Objects of', 'labour'] : ['劳动对象'],
    desc: t('数据 · AI for Science', 'Data · AI for Science'),
    href: '#ch4',
    color: 'var(--object)',
    ax: 0.8,
    ay: 0.27,
  },
  {
    id: 'worker',
    name: [t('劳动者', 'Workers')],
    desc: t('人机协同 · 新职业', 'Human–AI collaboration · new occupations'),
    href: '#ch5',
    color: 'var(--worker)',
    ax: 0.5,
    ay: 0.8,
  },
];
const comboDef = () => ({
  id: 'combo',
  name: t('优化组合', 'Optimal combination'),
  desc: t('三要素协同跃升', 'Coordinated leap of the three factors'),
  href: '#ch6',
  color: 'var(--combo)',
});
const FACTORS = ['tool', 'object', 'worker'];
const RING = [
  ['tool', 'object'],
  ['object', 'worker'],
  ['worker', 'tool'],
];
const STEP_FOCUS = [null, ['tool'], ['object'], ['worker'], ['combo', 'center']];

/** 把短语在最接近中点的空格处拆成两行 */
function splitTwo(s) {
  const mid = s.length / 2;
  let best = -1;
  for (let i = 0; i < s.length; i++)
    if (s[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  return best < 0 ? [s] : [s.slice(0, best), s.slice(best + 1)];
}

/** 多行 SVG 文本：第一行 dy = firstDy，其余行 1.2em */
function setLines(text, lines, firstDy) {
  text.attr('dy', null).text(null);
  text
    .selectAll('tspan')
    .data(lines)
    .join('tspan')
    .attr('x', 0)
    .attr('dy', (_, i) => (i ? '1.2em' : firstDy))
    .text((l) => l);
}

/** 跳转到章节：平滑滚动 + 更新地址栏 hash（pushState 不触发瞬时跳转） */
function navigate(href) {
  goToChapter(href);
}

export function createFactorForce(container) {
  const NODES = nodeDefs();
  const COMBO = comboDef();
  const goTo = t('，跳转到对应章节', ' — go to the chapter');
  const root = d3.select(container).classed('ff', true);
  const svg = createSvg(container, 'ff__svg')
    .attr('role', 'group')
    .attr(
      'aria-label',
      t(
        '新质生产力三要素公式：点击要素跳转章节',
        'The three-factor formula of new quality productive forces: click a factor to go to its chapter',
      ),
    );
  const uid = Math.random().toString(36).slice(2, 8);
  const defs = svg.append('defs');
  const glow = defs
    .append('filter')
    .attr('id', `ff-glow-${uid}`)
    .attr('x', '-60%')
    .attr('y', '-60%')
    .attr('width', '220%')
    .attr('height', '220%');
  glow.append('feGaussianBlur').attr('stdDeviation', 10).attr('result', 'b');
  const m = glow.append('feMerge');
  m.append('feMergeNode').attr('in', 'b');
  m.append('feMergeNode').attr('in', 'SourceGraphic');
  [...NODES, COMBO].forEach((n) => {
    const gr = defs
      .append('radialGradient')
      .attr('id', `ff-grad-${n.id}-${uid}`)
      .attr('cx', '35%')
      .attr('cy', '30%')
      .attr('r', '75%');
    gr.append('stop').attr('offset', '0%').style('stop-color', n.color).style('stop-opacity', 0.55);
    gr.append('stop').attr('offset', '100%').style('stop-color', n.color).style('stop-opacity', 0.08);
  });

  const gBg = svg.append('g').attr('class', 'ff__bg');
  const gRing = svg.append('g').attr('class', 'ff__ring');
  const gLinks = svg.append('g').attr('class', 'ff__links');
  const gNodes = svg.append('g').attr('class', 'ff__nodes');
  const hint = svg
    .append('text')
    .attr('class', 'ff__hint')
    .attr('x', 4)
    .attr('y', 14)
    .text(t('拖拽节点 · 点击跳转章节', 'Drag nodes · click to jump to a chapter'));

  const nodes = NODES.map((n) => ({ ...n }));
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const links = FACTORS.map((id) => ({ source: id, target: 'center', id }));
  const ringLinks = RING.map(([a, b]) => ({ source: byId[a], target: byId[b], id: `${a}-${b}` }));

  let width = 0;
  let height = 0;
  let focus = null;
  let hover = null;
  let visible = true;
  let r = { center: 52, factor: 38 };
  let pillH = 28; // “优化组合”胶囊高度（英文窄屏时为两行）

  // ---- 力模拟 ----
  const t0 = performance.now();
  const floatForce = (alpha) => {
    if (theme.reducedMotion) return;
    const t = (performance.now() - t0) / 1000;
    nodes.forEach((n, i) => {
      if (n.fx != null) return;
      n.vx += Math.sin(t * 0.7 + i * 1.9) * 0.06 * Math.max(alpha, 0.04);
      n.vy += Math.cos(t * 0.6 + i * 2.7) * 0.06 * Math.max(alpha, 0.04);
    });
  };
  const sim = d3
    .forceSimulation(nodes)
    .force(
      'link',
      d3
        .forceLink(links)
        .id((d) => d.id)
        .strength(0.05),
    )
    .force('charge', d3.forceManyBody().strength(-60))
    .force(
      'collide',
      d3.forceCollide((d) => (d.id === 'center' ? r.center : r.factor) + 18),
    )
    .force('x', d3.forceX((d) => d.ax * width).strength(0.12))
    .force('y', d3.forceY((d) => d.ay * height).strength(0.12))
    .force('float', floatForce)
    .alphaDecay(0.03)
    .on('tick', ticked)
    .stop();

  // ---- DOM ----
  const ringPaths = gRing.selectAll('path.ff__arc').data(ringLinks).join('path').attr('class', 'ff__arc');
  const comboG = gRing
    .append('g')
    .attr('class', 'ff__combo')
    .attr('tabindex', 0)
    .attr('role', 'link')
    .attr('aria-label', `${COMBO.name}${t('：', ': ')}${COMBO.desc}${goTo}`)
    .datum(COMBO);
  comboG.append('rect').attr('class', 'ff__pill-mask').attr('rx', 14).attr('height', 28);
  comboG
    .append('rect')
    .attr('class', 'ff__pill')
    .attr('rx', 14)
    .attr('height', 28)
    .style('fill', `url(#ff-grad-combo-${uid})`);
  comboG
    .append('text')
    .attr('class', 'ff__pill-text')
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em')
    .text(`⟲ ${COMBO.name}`);
  comboG
    .append('text')
    .attr('class', 'ff__desc')
    .attr('text-anchor', 'middle')
    .attr('y', 30)
    .text(COMBO.desc);

  const linkG = gLinks
    .selectAll('g.ff__link')
    .data(links)
    .join((enter) => {
      const g = enter.append('g').attr('class', 'ff__link');
      g.append('line').attr('class', 'ff__link-base');
      g.append('line').attr('class', 'ff__link-flow');
      return g;
    });
  linkG.selectAll('line').style('stroke', (d) => byId[d.id].color);

  const nodeG = gNodes
    .selectAll('g.ff__node')
    .data(nodes, (d) => d.id)
    .join((enter) => {
      const g = enter
        .append('g')
        .attr('class', (d) => `ff__node ff__node--${d.id}`)
        .attr('tabindex', 0)
        .attr('role', 'link');
      g.append('circle').attr('class', 'ff__aura');
      g.append('circle').attr('class', 'ff__mask');
      g.append('circle').attr('class', 'ff__orbit');
      g.append('circle').attr('class', 'ff__core');
      g.append('text').attr('class', 'ff__name').attr('text-anchor', 'middle');
      g.append('text').attr('class', 'ff__desc').attr('text-anchor', 'middle');
      return g;
    });
  nodeG.attr('aria-label', (d) => `${d.name.join(isEn() ? ' ' : '')}${t('：', ': ')}${d.desc}${goTo}`);
  nodeG.select('.ff__aura').style('fill', (d) => d.color);
  nodeG
    .select('.ff__core')
    .style('fill', (d) => `url(#ff-grad-${d.id}-${uid})`)
    .style('stroke', (d) => d.color)
    .style('filter', `url(#ff-glow-${uid})`);
  nodeG.select('.ff__orbit').style('stroke', (d) => d.color);
  nodeG.select('.ff__desc').text((d) => d.desc);

  const interactive = (sel) =>
    sel
      .style('cursor', 'pointer')
      .on('click', (_, d) => navigate(d.href))
      .on('keydown', (event, d) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          navigate(d.href);
        }
      })
      .on('pointerenter focus', (_, d) => {
        hover = d.id;
        applyFocus();
      })
      .on('pointerleave blur', () => {
        hover = null;
        applyFocus();
      });
  interactive(nodeG);
  interactive(comboG);

  const drag = d3
    .drag()
    .clickDistance(5)
    .on('start', (event, d) => {
      if (!event.active) sim.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
      root.classed('is-dragging', true);
    })
    .on('drag', (event, d) => {
      d.fx = Math.max(r.factor, Math.min(width - r.factor, event.x));
      d.fy = Math.max(r.factor, Math.min(height - r.factor, event.y));
    })
    .on('end', (event, d) => {
      if (!event.active) sim.alphaTarget(baseAlpha());
      d.fx = null;
      d.fy = null;
      root.classed('is-dragging', false);
    });
  nodeG.call(drag);

  const baseAlpha = () => (theme.reducedMotion || !visible ? 0 : 0.04);

  function layout() {
    if (!width) return;
    height = chartHeight(width, { aspect: 0.6, min: width < 520 ? 410 : 380, max: 500 });
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
    const s = Math.min(width, height * 1.4);
    r = { center: Math.max(40, Math.min(62, s * 0.085)), factor: Math.max(33, Math.min(48, s * 0.066)) };
    const narrow = width < 520;
    // 窄屏时三要素向两侧和上下拉开，给描述文字留出空间
    byId.tool.ax = narrow ? 0.19 : 0.24;
    byId.object.ax = narrow ? 0.81 : 0.76;
    byId.tool.ay = byId.object.ay = narrow ? 0.17 : 0.22;
    byId.center.ay = narrow ? 0.45 : 0.47;
    byId.worker.ay = narrow ? 0.8 : 0.8;
    // 估算描述文字半宽，避免左右两侧被裁切
    nodes.forEach((n) => {
      let tw = 0;
      for (const ch of n.desc) tw += ch.charCodeAt(0) > 255 ? 12 : 6.8;
      n.half = tw / 2 + 10;
    });
    hint.classed('is-hidden', narrow);

    nodeG.select('.ff__aura').attr('r', (d) => radius(d) + (narrow ? 12 : 22));
    nodeG.select('.ff__orbit').attr('r', (d) => radius(d) + 8);
    nodeG.select('.ff__mask').attr('r', (d) => radius(d) + 1);
    nodeG.select('.ff__core').attr('r', radius);
    // 英文名称较长：按最长一行缩小字号，保证落在圆内
    const nameSize = (d) => {
      const base = d.id === 'center' ? Math.round(r.center * 0.3) : Math.round(r.factor * 0.38);
      if (!isEn()) return base;
      const longest = d3.max(d.name, (s) => s.length);
      return Math.max(9, Math.min(base, Math.floor((radius(d) * 1.7) / (longest * 0.6))));
    };
    nodeG
      .select('.ff__name')
      .style('font-size', (d) => `${nameSize(d)}px`)
      .selectAll('tspan')
      .data((d) =>
        d.name.map((t, i, a) => ({ t, dy: i === 0 ? `${0.35 - (a.length - 1) * 0.6}em` : '1.2em' })),
      )
      .join('tspan')
      .attr('x', 0)
      .attr('dy', (d) => d.dy)
      .text((d) => d.t);
    nodeG.select('.ff__desc').attr('y', (d) => radius(d) + 22);
    let pw = narrow ? 104 : 118;
    let ph = 28;
    if (isEn()) {
      // 英文较长：窄屏时“优化组合”胶囊与说明各折成两行，留在两个要素节点之间
      const pill = narrow ? splitTwo(`⟲ ${COMBO.name}`) : [`⟲ ${COMBO.name}`];
      const desc = narrow ? splitTwo(COMBO.desc) : [COMBO.desc];
      ph = 14 + pill.length * 14;
      pw = Math.max(pw, Math.ceil(d3.max(pill, (l) => l.length) * 13 * 0.6) + 24);
      setLines(comboG.select('.ff__pill-text'), pill, `${0.35 - (pill.length - 1) * 0.6}em`);
      setLines(comboG.select('.ff__desc'), desc, null);
    }
    comboG
      .selectAll('rect')
      .attr('x', -pw / 2)
      .attr('y', -ph / 2)
      .attr('height', ph)
      .attr('width', pw);
    comboG.select('.ff__desc').attr('y', ph / 2 + 18);
    pillH = ph;

    // 背景：同心虚线圆，强调“汇聚”
    gBg
      .selectAll('circle')
      .data([0.18, 0.32, 0.46])
      .join('circle')
      .attr('cx', width / 2)
      .attr('cy', height / 2)
      .attr('r', (k) => k * Math.min(width, height * 1.3));

    sim.force('collide').radius((d) => radius(d) + (narrow ? 10 : 18));
    sim.force('link').distance(() => Math.min(width, height) * 0.32);
    sim.force('x').x((d) => d.ax * width);
    sim.force('y').y((d) => d.ay * height);
    nodes.forEach((n) => {
      if (n.x == null || !Number.isFinite(n.x)) {
        n.x = n.ax * width;
        n.y = n.ay * height;
      }
    });
    sim.alpha(0.6);
    if (theme.reducedMotion || !visible) {
      sim.stop();
      sim.tick(220);
      ticked();
    } else sim.alphaTarget(baseAlpha()).restart();
  }

  const radius = (d) => (d.id === 'center' ? r.center : r.factor);

  function arcPath(d) {
    const a = d.source;
    const b = d.target;
    const c = byId.center;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    let nx = mx - c.x;
    let ny = my - c.y;
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    const bulge = Math.hypot(b.x - a.x, b.y - a.y) * 0.16;
    d.cx = mx + nx * bulge;
    d.cy = my + ny * bulge;
    return `M${a.x},${a.y}Q${d.cx},${d.cy} ${b.x},${b.y}`;
  }

  function ticked() {
    nodes.forEach((n) => {
      const rr = radius(n);
      const hx = Math.max(rr, n.half || 0);
      n.x = Math.max(hx, Math.min(width - hx, n.x));
      n.y = Math.max(rr + 4, Math.min(height - rr - 30, n.y));
    });
    nodeG.attr('transform', (d) => `translate(${d.x},${d.y})`);
    linkG.each(function (d) {
      const s = byId[d.id];
      const t = byId.center;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const len = Math.hypot(dx, dy) || 1;
      const x1 = s.x + (dx / len) * (r.factor + 4);
      const y1 = s.y + (dy / len) * (r.factor + 4);
      const x2 = t.x - (dx / len) * (r.center + 6);
      const y2 = t.y - (dy / len) * (r.center + 6);
      d3.select(this).selectAll('line').attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2);
    });
    ringPaths.attr('d', arcPath);
    const top = ringLinks[0];
    if (top.cx != null) {
      const px = 0.25 * top.source.x + 0.5 * top.cx + 0.25 * top.target.x;
      const py = 0.25 * top.source.y + 0.5 * top.cy + 0.25 * top.target.y;
      comboG.attr('transform', `translate(${px},${Math.max(pillH / 2 + 4, py)})`);
    }
  }

  function applyFocus() {
    const f = hover ? [hover] : focus;
    const on = (id) => !f || f.includes(id);
    nodeG.classed('is-dim', (d) => !on(d.id)).classed('is-hot', (d) => !!f && on(d.id));
    linkG
      .classed('is-dim', (d) => !(on(d.id) || (f && f.includes('center'))))
      .classed('is-hot', (d) => !!f && on(d.id));
    const ringOn = !f || f.includes('combo');
    ringPaths.classed('is-dim', !ringOn).classed('is-hot', !!f && ringOn);
    comboG.classed('is-dim', !ringOn).classed('is-hot', !!f && ringOn);
  }

  const stopSize = observeSize(container, ({ width: w }) => {
    width = w;
    layout();
  });
  const stopVis = observeVisible(container, (v) => {
    visible = v;
    root.classed('is-paused', !v);
    if (!width) return;
    if (v && !theme.reducedMotion) sim.alphaTarget(baseAlpha()).restart();
    else sim.stop();
  });
  const stopTheme = onThemeChange(() => {
    root.classed('is-paused', theme.reducedMotion || !visible);
    if (theme.reducedMotion) sim.stop();
    else if (visible) sim.alphaTarget(baseAlpha()).restart();
  });
  root.classed('is-paused', theme.reducedMotion);
  applyFocus();

  return {
    update(step) {
      focus = STEP_FOCUS[Math.max(0, Math.min(STEP_FOCUS.length - 1, step | 0))];
      applyFocus();
    },
    resize() {
      width = container.clientWidth;
      layout();
    },
    destroy() {
      sim.stop();
      stopSize();
      stopVis();
      stopTheme();
      root.selectAll('*').remove();
      root.classed('ff', false);
    },
  };
}
