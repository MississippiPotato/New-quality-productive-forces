// AI 生产力飞轮（优化组合）：算力 → 模型 → 应用 → 数据 →（反哺）模型，劳动者（人机协同）居中
// 粒子沿环流动（rAF，离屏暂停，减少动效时关闭）；节点证据取自各章数据。
// update(step)：0 算力→模型；1 +应用；2 +数据与反哺弧（闭环，粒子加速）；3 劳动者枢纽连接全部节点
import * as d3 from 'd3';
import {
  observeSize,
  observeVisible,
  createSvg,
  chartHeight,
  fmt,
  legend,
  note,
  srTable,
} from '../core/chartUtils.js';
import { theme, onThemeChange } from '../core/theme.js';
import { bindTooltip, tooltip } from '../core/tooltip.js';
import { t, tf, isEn } from '../core/i18n.js';
import '../styles/charts/flywheel.css';

const DEG = Math.PI / 180;
const polar = (a, r) => [r * Math.sin(a), -r * Math.cos(a)];

// 节点与边的文案为代码标签：语言在图表创建时读取（切换语言时 figure.js 会重建图表）
const TOOL = () => t('劳动资料', 'Means of labour');
const OBJECT = () => t('劳动对象', 'Objects of labour');
const WORKER = () => t('劳动者', 'Workers');
const nodeDefs = () => [
  { id: 'compute', name: t('算力', 'Compute'), factor: TOOL(), color: 'var(--tool)', angle: 0, step: 0 },
  { id: 'model', name: t('模型', 'Models'), factor: TOOL(), color: 'var(--tool)', angle: 90, step: 0 },
  { id: 'app', name: t('应用', 'Apps'), factor: OBJECT(), color: 'var(--object)', angle: 180, step: 1 },
  { id: 'data', name: t('数据', 'Data'), factor: OBJECT(), color: 'var(--object)', angle: 270, step: 2 },
];
// lines：英文窄屏时的折行
const edgeDefs = () => [
  {
    id: 'c2m',
    from: 'compute',
    to: 'model',
    label: t('驱动训练', 'Drives training'),
    color: 'var(--tool)',
    step: 0,
  },
  { id: 'm2a', from: 'model', to: 'app', label: t('赋能应用', 'Powers apps'), color: 'var(--tool)', step: 1 },
  {
    id: 'a2d',
    from: 'app',
    to: 'data',
    label: t('产生数据', 'Generates data'),
    color: 'var(--object)',
    step: 2,
  },
  {
    id: 'd2m',
    from: 'data',
    to: 'model',
    label: t('数据反哺模型', 'Data feeds back into models'),
    color: 'var(--combo)',
    step: 2,
    feedback: true,
  },
];

/** 把短语在最接近中点的空格处拆成两行 */
function splitTwo(s) {
  const mid = s.length / 2;
  let best = -1;
  for (let i = 0; i < s.length; i++)
    if (s[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  return best < 0 ? [s] : [s.slice(0, best), s.slice(best + 1)];
}

/** 从各章数据中提取节点证据（不做任何估算） */
export function flywheelEvidence(data) {
  const out = {};
  const comp = (data.compute?.records || [])
    .filter((r) => r.metric === 'intelligent')
    .sort((a, b) => d3.ascending(a.date, b.date))
    .pop();
  if (comp) {
    const q = tf(comp, 'qualifier') || '';
    out.compute = {
      value: isEn() ? `${q ? `${q} ` : ''}${fmt.int(comp.value)}` : `${q}${fmt.int(comp.value)}`,
      unit: tf(comp, 'unit'),
      caption: `${t('智能算力', 'AI compute')} · ${comp.precision === '未注明' ? t('精度未注明', 'precision not stated') : tf(comp, 'precision')} · ${tf(comp, 'scope')}`,
      date: comp.date,
    };
  }
  const fil = (data.filings?.records || [])
    .slice()
    .sort((a, b) => d3.ascending(a.date, b.date))
    .pop();
  if (fil) {
    const unit = data.filings.unit || '款';
    out.model = {
      value: fmt.int(fil.filed),
      unit: isEn() ? (unit === '款' ? 'services' : tf(data.filings, 'unit')) : unit,
      caption: t('生成式 AI 服务累计备案', 'Generative AI services filed (cumulative)'),
      date: fil.date,
    };
  }
  const users = data.objects?.users;
  const u = users?.records?.[0];
  if (u) {
    const unit = users.unit || '亿人';
    // 英文：亿人 → million people（1 亿 = 100 million）
    const en = isEn() && unit === '亿人';
    out.app = {
      value: en ? fmt.num(u.value * 100, 2) : fmt.num(u.value, 2),
      unit: en ? 'million people' : isEn() ? tf(users, 'unit') : unit,
      caption: tf(u, 'use'),
      date: users.date,
    };
  }
  out.data = {
    text: t(
      '使用中沉淀的数据回流训练，模型迭代后再赋能应用',
      'Data generated in use flows back into training; improved models then power applications',
    ),
    caption: t('概念框架，无对应统计口径', 'Conceptual framework; no corresponding statistical measure'),
  };
  const occ = data.jobs?.new_occupations;
  if (occ?.occupations) {
    out.worker = {
      value: fmt.int(occ.occupations.value),
      unit: t('个新职业', 'new occupations'),
      caption: t('人社部发布', 'Released by MOHRSS'),
      date: occ.date,
    };
  }
  return out;
}

export function createFlywheel(container, data) {
  const NODE_DEFS = nodeDefs();
  const EDGE_DEFS = edgeDefs();
  const root = d3.select(container).classed('fw', true);
  const head = root.append('div').attr('class', 'fw__head');
  head.append('span').attr('class', 'tag tag--illustrative').text(t('示意', 'Illustrative'));
  head
    .append('span')
    .attr('class', 'fw__head-text')
    .text(
      t(
        '因果循环为概念框架，节点数字为各章证据',
        'The causal loop is a conceptual framework; node figures are evidence from each chapter',
      ),
    );

  const svg = createSvg(container, 'fw__svg').attr(
    'aria-label',
    t('AI 生产力飞轮示意图', 'Illustrative AI productivity flywheel'),
  );
  const cardsWrap = root.append('div').attr('class', 'fw__cards');
  legend(container, [
    { label: t('劳动资料（算力、模型）', 'Means of labour (compute, models)'), color: 'var(--tool)' },
    { label: t('劳动对象（应用、数据）', 'Objects of labour (apps, data)'), color: 'var(--object)' },
    { label: t('劳动者（人机协同）', 'Workers (human–AI collaboration)'), color: 'var(--worker)' },
    {
      label: t('反哺回路（优化组合）', 'Feedback loop (optimal combination)'),
      color: 'var(--combo)',
      shape: 'line',
    },
  ]);
  note(
    container,
    t(
      '飞轮的箭头方向表达概念上的因果关系，并非统计估计；各节点数字来自不同来源、不同时点，不可相互换算。',
      'Arrows express conceptual causality, not statistical estimates; node figures come from different sources and dates and cannot be converted into one another.',
    ),
  );

  const ev = flywheelEvidence(data);
  srTable(
    container,
    t('AI 生产力飞轮节点证据', 'AI productivity flywheel: evidence by node'),
    [t('节点', 'Node'), t('证据', 'Evidence'), t('日期', 'Date')],
    [...NODE_DEFS, { id: 'worker', name: WORKER() }].map((n) => {
      const e = ev[n.id] || {};
      return [
        n.name,
        e.value ? `${e.value} ${e.unit}${t(`（${e.caption}）`, ` (${e.caption})`)}` : e.text || '—',
        e.date || '—',
      ];
    }),
  );

  const uid = Math.random().toString(36).slice(2, 8);
  const defs = svg.append('defs');
  const glow = defs
    .append('filter')
    .attr('id', `fw-glow-${uid}`)
    .attr('x', '-50%')
    .attr('y', '-50%')
    .attr('width', '200%')
    .attr('height', '200%');
  glow.append('feGaussianBlur').attr('stdDeviation', 6).attr('result', 'b');
  const gm = glow.append('feMerge');
  gm.append('feMergeNode').attr('in', 'b');
  gm.append('feMergeNode').attr('in', 'SourceGraphic');
  [...NODE_DEFS, { id: 'worker', color: 'var(--worker)' }].forEach((n) => {
    const gr = defs
      .append('radialGradient')
      .attr('id', `fw-grad-${n.id}-${uid}`)
      .attr('cx', '35%')
      .attr('cy', '30%')
      .attr('r', '80%');
    gr.append('stop').attr('offset', '0%').style('stop-color', n.color).style('stop-opacity', 0.6);
    gr.append('stop').attr('offset', '100%').style('stop-color', n.color).style('stop-opacity', 0.1);
  });

  const g = svg.append('g');
  const gWheel = g.append('g').attr('class', 'fw__wheel');
  const gSpokes = g.append('g').attr('class', 'fw__spokes');
  const gEdges = g.append('g').attr('class', 'fw__edges');
  const gParticles = g.append('g').attr('class', 'fw__particles');
  const gNodes = g.append('g').attr('class', 'fw__nodes');

  const nodes = NODE_DEFS.map((n) => ({ ...n, a: n.angle * DEG }));
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const hub = {
    id: 'worker',
    name: WORKER(),
    sub: t('人机协同', 'Human–AI collaboration'),
    color: 'var(--worker)',
    step: 3,
  };
  const edges = EDGE_DEFS.map((e) => ({ ...e }));
  const spokes = nodes.map((n) => ({ id: `w2${n.id}`, to: n, color: 'var(--worker)', step: 3 }));

  let width = 0;
  let step = 3;
  let visible = false;
  let raf = 0;
  let geom = null;
  let particles = [];

  const isOn = (d) => d.step <= step;

  // ---- 证据卡片（HTML，响应式网格） ----
  const cardData = [...nodes, hub];
  const cards = cardsWrap
    .selectAll('div.fw__card')
    .data(cardData, (d) => d.id)
    .join('div')
    .attr('class', (d) => `fw__card fw__card--${d.id}`)
    .style('--c', (d) => d.color);
  const ch = cards.append('div').attr('class', 'fw__card-head');
  ch.append('i').attr('class', 'fw__card-dot');
  ch.append('span')
    .attr('class', 'fw__card-name')
    .text((d) => d.name);
  ch.append('span')
    .attr('class', 'fw__card-factor')
    .text((d) => d.factor || WORKER());
  cards.each(function (d) {
    const e = ev[d.id];
    const c = d3.select(this);
    if (!e) return c.append('p').attr('class', 'fw__card-cap').text(t('暂无数据', 'No data'));
    if (e.value != null) {
      const v = c.append('div').attr('class', 'fw__card-value');
      v.append('span').attr('class', 'fw__card-num').text(e.value);
      v.append('span').attr('class', 'fw__card-unit').text(e.unit);
    } else {
      c.append('div').attr('class', 'fw__card-text').text(e.text);
    }
    const cap = c.append('p').attr('class', 'fw__card-cap').text(e.caption);
    if (e.date) cap.append('span').attr('class', 'fw__card-date').text(` · ${e.date}`);
  });

  // ---- 几何 ----
  function arcPoints(a0, a1, R, n = 48) {
    return d3.range(n + 1).map((i) => polar(a0 + ((a1 - a0) * i) / n, R));
  }
  function feedbackPoints(a0, a1, R, Rf, n = 80) {
    const ramp = 26 * DEG;
    return d3.range(n + 1).map((i) => {
      const a = a0 + ((a1 - a0) * i) / n;
      const k = Math.min(1, (a - a0) / ramp, (a1 - a) / ramp);
      const s = k * k * (3 - 2 * k); // smoothstep
      return polar(a, R + (Rf - R) * s);
    });
  }
  const line = d3.line().curve(d3.curveCatmullRom.alpha(0.5));

  function render() {
    if (!width) return;
    const narrow = width < 520;
    const h = chartHeight(width, { aspect: 0.64, min: narrow ? 360 : 380, max: 500 });
    svg.attr('viewBox', `0 0 ${width} ${h}`).attr('width', width).attr('height', h);
    const nr = Math.max(26, Math.min(40, width * 0.05));
    const R = Math.max(80, Math.min(width * (narrow ? 0.3 : 0.21), (h - 2 * nr - 90) / 2));
    const Rf = R + nr + (narrow ? 20 : 30);
    const cx = width / 2;
    const cy = Rf + (narrow ? 26 : 34) + (h - (Rf + R + nr + 2 * (narrow ? 26 : 34) + 18)) / 2;
    g.attr('transform', `translate(${cx},${cy})`);
    geom = { R, Rf, nr, narrow };
    const gapA = Math.asin(Math.min(1, (nr + 8) / R));

    // 飞轮底盘：缓慢旋转的虚线圆 + 刻度
    gWheel
      .selectAll('circle.fw__rim')
      .data([R, R * 0.62])
      .join('circle')
      .attr('class', 'fw__rim')
      .attr('r', (d) => d);
    gWheel
      .selectAll('line.fw__cog')
      .data(d3.range(0, 360, 10))
      .join('line')
      .attr('class', 'fw__cog')
      .attr('x1', (d) => polar(d * DEG, R - 5)[0])
      .attr('y1', (d) => polar(d * DEG, R - 5)[1])
      .attr('x2', (d) => polar(d * DEG, R - 11)[0])
      .attr('y2', (d) => polar(d * DEG, R - 11)[1]);

    // 边：环上弧 + 外侧反哺弧
    edges.forEach((e) => {
      const a = byId[e.from].a;
      let b = byId[e.to].a;
      if (e.feedback) {
        b += 2 * Math.PI;
        // 从“数据”外侧出发，抬升到外圈越过顶部，再落到“模型”外侧
        e.pts = feedbackPoints(a, b, R + nr + 4, Rf);
      } else {
        e.pts = arcPoints(a + gapA, b - gapA, R);
      }
      e.d = line(e.pts);
      const mid = e.feedback ? 0 : (a + b) / 2;
      // 英文标签较长：折成两行、居中放在主环与外侧反哺弧之间，避免压到反哺弧
      const en = isEn() && !e.feedback;
      const lr = e.feedback ? Rf + 14 : en ? (R + Rf) / 2 : R + (narrow ? 14 : 18);
      [e.lx, e.ly] = polar(mid, lr);
      e.lines = en ? splitTwo(e.label) : [e.label];
      e.anchor =
        e.feedback || en ? 'middle' : Math.sin(mid) > 0.2 ? 'start' : Math.sin(mid) < -0.2 ? 'end' : 'middle';
    });
    spokes.forEach((s) => {
      const p0 = polar(s.to.a, nr * 0.95 + 8);
      const p1 = polar(s.to.a, R - nr - 8);
      s.d = `M${p0[0]},${p0[1]}L${p1[0]},${p1[1]}`;
    });

    const edgeG = gEdges
      .selectAll('g.fw__edge')
      .data(edges, (d) => d.id)
      .join((enter) => {
        const eg = enter.append('g').attr('class', (d) => `fw__edge ${d.feedback ? 'fw__edge--fb' : ''}`);
        eg.append('path').attr('class', 'fw__track');
        eg.append('path').attr('class', 'fw__flow');
        eg.append('path').attr('class', 'fw__arrow');
        eg.append('text').attr('class', 'fw__elabel');
        return eg;
      });
    edgeG
      .selectAll('path.fw__track, path.fw__flow')
      .attr('d', (d) => d.d)
      .style('stroke', (d) => d.color);
    edgeG.select('.fw__flow').each(function (d) {
      d.el = this;
      d.len = this.getTotalLength();
    });
    edgeG
      .select('.fw__arrow')
      .attr('d', 'M-6,-5L4,0L-6,5Z')
      .style('fill', (d) => d.color)
      .attr('transform', (d) => {
        const p = d.pts;
        const [x1, y1] = p[p.length - 2];
        const [x2, y2] = p[p.length - 1];
        return `translate(${x2},${y2}) rotate(${(Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI})`;
      });
    edgeG
      .select('.fw__elabel')
      .attr('x', (d) => d.lx)
      .attr('y', (d) => d.ly)
      .attr('dy', (d) => (d.feedback ? '-0.2em' : d.lines.length > 1 ? null : '0.35em'))
      .attr('text-anchor', (d) => d.anchor)
      .style('fill', (d) => d.color)
      .each(function (d) {
        const el = d3.select(this);
        el.text(null);
        el.selectAll('tspan')
          .data(d.lines)
          .join('tspan')
          .attr('x', d.lx)
          .attr('dy', (_, i) => (i ? '1.15em' : d.lines.length > 1 ? '-0.2em' : null))
          .text((l) => l);
      });

    const spokeG = gSpokes
      .selectAll('path.fw__spoke')
      .data(spokes, (d) => d.id)
      .join('path')
      .attr('class', 'fw__spoke')
      .attr('d', (d) => d.d);
    spokeG.each(function (d) {
      d.el = this;
      d.len = this.getTotalLength();
    });

    // 节点
    const all = [...nodes, hub];
    const nodeG = gNodes
      .selectAll('g.fw__node')
      .data(all, (d) => d.id)
      .join((enter) => {
        const ng = enter.append('g').attr('class', (d) => `fw__node fw__node--${d.id}`);
        ng.append('circle').attr('class', 'fw__halo');
        ng.append('circle').attr('class', 'fw__core');
        ng.append('text').attr('class', 'fw__name').attr('text-anchor', 'middle');
        ng.append('text').attr('class', 'fw__factor').attr('text-anchor', 'middle');
        return ng;
      });
    nodeG.attr('transform', (d) => (d.id === 'worker' ? null : `translate(${polar(d.a, R)})`));
    const rOf = (d) => (d.id === 'worker' ? nr * 1.25 : nr);
    nodeG
      .select('.fw__halo')
      .attr('r', (d) => rOf(d) + 9)
      .style('stroke', (d) => d.color);
    nodeG
      .select('.fw__core')
      .attr('r', rOf)
      .style('fill', (d) => `url(#fw-grad-${d.id}-${uid})`)
      .style('stroke', (d) => d.color)
      .style('filter', `url(#fw-glow-${uid})`);
    // 英文名称较长：按圆的直径缩小字号
    const nameSize = (d) => {
      const base = Math.round(rOf(d) * (d.id === 'worker' ? 0.4 : 0.5));
      return isEn()
        ? Math.max(10, Math.min(base, Math.floor((rOf(d) * 1.7) / (d.name.length * 0.62))))
        : base;
    };
    nodeG
      .select('.fw__name')
      .attr('dy', (d) => (d.id === 'worker' ? '-0.15em' : '0.35em'))
      .style('font-size', (d) => `${nameSize(d)}px`)
      .text((d) => d.name);
    nodeG
      .select('.fw__factor')
      .attr('dy', (d) => (d.id === 'worker' ? '1.3em' : null))
      .attr('y', (d) => (d.id === 'worker' ? 0 : factorLabelY(d, nr)))
      .attr('x', (d) => (d.id === 'worker' ? 0 : factorLabelX(d, nr)))
      .attr('text-anchor', (d) =>
        d.id === 'worker' || narrow || d.angle % 180 === 0 ? 'middle' : d.angle === 90 ? 'start' : 'end',
      )
      .each(function (d) {
        const el = d3.select(this);
        // 英文下劳动者枢纽的副标题折成两行，落在圆内
        const lines =
          d.id === 'worker'
            ? isEn()
              ? splitTwo(d.sub)
              : [d.sub]
            : isEn() && narrow && d.angle % 180 !== 0
              ? splitTwo(d.factor)
              : [d.factor];
        el.text(null);
        el.selectAll('tspan')
          .data(lines)
          .join('tspan')
          .attr('x', d.id === 'worker' ? 0 : factorLabelX(d, nr))
          .attr('dy', (_, i) => (i ? '1.15em' : null))
          .text((l) => l);
      });
    nodeG.call(bindTooltip, (d) => tipHtml(d));

    buildParticles();
    apply(false);
  }

  // 侧边节点：宽屏标在外侧，窄屏标在下方，避免被裁切
  const factorLabelY = (d, nr) => (d.angle === 0 ? -nr - 10 : d.angle === 180 || geom.narrow ? nr + 18 : 4);
  const factorLabelX = (d, nr) =>
    geom.narrow ? 0 : d.angle === 90 ? nr + 10 : d.angle === 270 ? -nr - 10 : 0;

  function tipHtml(d) {
    const e = ev[d.id];
    if (!e) return `<strong>${d.name}</strong>`;
    const body =
      e.value != null
        ? `${e.value} ${e.unit}<br><em>${e.caption}${e.date ? ` · ${e.date}` : ''}</em>`
        : `<em>${e.text}</em>`;
    return `<strong>${d.name}</strong> · ${d.factor || WORKER()}<br>${body}`;
  }

  // ---- 粒子 ----
  function buildParticles() {
    particles = [];
    const paths = [...edges, ...spokes];
    paths.forEach((p) => {
      const n = Math.max(2, Math.round(p.len / (p.feedback ? 46 : 38)));
      for (let i = 0; i < n; i++) particles.push({ p, off: i / n, r: p.step === 3 ? 2 : 2.6 });
    });
    gParticles
      .selectAll('circle')
      .data(particles)
      .join('circle')
      .attr('class', 'fw__particle')
      .attr('r', (d) => d.r)
      .style('fill', (d) => d.p.color);
    placeParticles(0);
  }

  function placeParticles(time) {
    const speed = step >= 2 ? 1.8 : 1;
    gParticles.selectAll('circle').each(function (d) {
      const on = isOn(d.p) && !theme.reducedMotion;
      this.style.display = on ? '' : 'none';
      if (!on || !d.p.el) return;
      const v = (time / 1000) * speed * 0.16;
      const f = (d.off + v * (d.p.feedback ? 0.8 : 1)) % 1;
      const pt = d.p.el.getPointAtLength(f * d.p.len);
      this.setAttribute('cx', pt.x);
      this.setAttribute('cy', pt.y);
      this.setAttribute('opacity', Math.sin(f * Math.PI) * 0.9 + 0.1);
    });
  }

  function loop(t) {
    placeParticles(t);
    raf = requestAnimationFrame(loop);
  }
  function startLoop() {
    if (raf || theme.reducedMotion || !visible) return;
    raf = requestAnimationFrame(loop);
  }
  function stopLoop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function apply(animate) {
    if (!geom) return;
    const dur = animate ? theme.duration : 0;
    root.classed('is-fast', step >= 2);
    gEdges.selectAll('g.fw__edge').each(function (d) {
      const eg = d3.select(this);
      const on = isOn(d);
      eg.classed('is-on', on);
      const flow = eg.select('.fw__flow');
      const was = flow.attr('data-on') === '1';
      flow.attr('data-on', on ? '1' : '0').attr('stroke-dasharray', `${d.len} ${d.len}`);
      if (on && !was && dur) {
        flow
          .attr('stroke-dashoffset', d.len)
          .transition()
          .duration(dur * 1.4)
          .ease(d3.easeCubicOut)
          .attr('stroke-dashoffset', 0);
      } else flow.interrupt().attr('stroke-dashoffset', on ? 0 : d.len);
      eg.select('.fw__arrow')
        .transition()
        .duration(dur)
        .delay(on && dur ? dur : 0)
        .style('opacity', on ? 1 : 0);
      eg.select('.fw__elabel')
        .transition()
        .duration(dur)
        .style('opacity', on ? 1 : 0.25);
    });
    gSpokes
      .selectAll('path.fw__spoke')
      .classed('is-on', isOn)
      .transition()
      .duration(dur)
      .style('opacity', (d) => (isOn(d) ? 1 : 0.12));
    gNodes
      .selectAll('g.fw__node')
      .classed('is-on', (d) => isOn(d))
      .transition()
      .duration(dur)
      .style('opacity', (d) => (isOn(d) ? 1 : 0.22));
    cards.classed('is-dim', (d) => !isOn(d));
    placeParticles(performance.now());
  }

  const stopSize = observeSize(container, ({ width: w }) => {
    width = w;
    render();
  });
  const stopVis = observeVisible(container, (v) => {
    visible = v;
    root.classed('is-paused', !v);
    if (v) startLoop();
    else stopLoop();
  });
  const stopTheme = onThemeChange(() => {
    if (theme.reducedMotion) stopLoop();
    else startLoop();
    placeParticles(performance.now());
  });

  return {
    update(s) {
      step = Math.max(0, Math.min(3, s | 0));
      apply(true);
    },
    resize() {
      width = container.clientWidth;
      render();
    },
    destroy() {
      tooltip.hide();
      stopLoop();
      stopSize();
      stopVis();
      stopTheme();
      svg.selectAll('*').interrupt();
      root.selectAll('*').remove();
      root.classed('fw is-fast is-paused', false);
    },
  };
}
