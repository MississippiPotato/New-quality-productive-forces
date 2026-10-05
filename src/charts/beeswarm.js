// IMF：就业的 AI 暴露度蜂群图（经济体分组 = 大标记，国家 = 小圆点）
// 位置由 d3.forceSimulation 同步计算后再以过渡动画就位
// update(step)：0 全部；1 高亮发达经济体；2 高亮新兴市场与低收入国家
import * as d3 from 'd3';
import {
  observeSize,
  observeVisible,
  createSvg,
  chartHeight,
  tr,
  fmt,
  legend,
  note,
  styleAxis,
  srTable,
} from '../core/chartUtils.js';
import { bindTooltip } from '../core/tooltip.js';
import { theme } from '../core/theme.js';
import { t, tf, isEn } from '../core/i18n.js';
import '../styles/charts/beeswarm.css';

const GROUP_COLOR = {
  world: 'var(--text)',
  advanced: 'var(--tool)',
  emerging: 'var(--orange)',
  low_income: 'var(--object)',
};
const FOCUS = { 1: ['advanced'], 2: ['emerging', 'low_income'] };

export function createBeeswarm(container, data, options = {}) {
  const root = d3.select(container).classed('beeswarm', true);
  const sep = t('：', ': ');
  const groupName = Object.fromEntries(data.groups.map((g) => [g.key, tf(g, 'name')]));
  const svg = createSvg(container);
  legend(root.node(), [
    ...data.groups.map((g) => ({
      label: tf(g, 'name'),
      color: GROUP_COLOR[g.key] || 'var(--other)',
      shape: 'ring',
    })),
    { label: t('国家（颜色 = 所属组）', 'Country (colour = group)'), color: 'var(--muted)', shape: 'dot' },
  ]);
  note(
    container,
    t(
      `⚠ ${data.notes}图中仅含已摘录的 ${data.countries.length} 个国家，不代表各国分布全貌。`,
      `⚠ ${tf(data, 'notes')} Only the ${data.countries.length} countries extracted so far are shown; they do not represent the full distribution across countries.`,
    ),
    'warn',
  );
  srTable(
    container,
    `IMF${sep}${tf(data, 'unit')}`,
    [t('名称', 'Name'), t('类型', 'Type'), t('数值（%）', 'Value (%)')],
    [
      ...data.groups.map((g) => [tf(g, 'name'), t('经济体分组', 'Economy group'), g.value]),
      ...data.countries.map((c) => [tf(c, 'name'), groupName[c.group], c.value]),
    ],
  );

  const gx = svg.append('g').attr('class', 'x-axis');
  const plot = svg.append('g');
  const grid = plot.append('g');
  const lane = plot.append('line').attr('class', 'lane');
  const worldLine = plot.append('line').attr('class', 'world-line');
  const nodesG = plot.append('g');
  const unitLabel = svg.append('text').attr('class', 'axis-label');

  const nodes = [
    ...data.groups.map((g) => ({ ...g, kind: 'group', id: `g-${g.key}`, gkey: g.key })),
    ...data.countries.map((c) => ({ ...c, kind: 'country', id: `c-${c.name}`, gkey: c.group })),
  ];

  let width = 0;
  let step = options.step != null ? +options.step : 0;
  let played = theme.reducedMotion;
  let layoutDone = null;

  function simulate(x, cy, rG, rC, pad) {
    nodes.forEach((n) => {
      n.r = n.kind === 'group' ? rG : rC;
      n.x = x(n.value);
      n.y = cy + (n.kind === 'group' ? -1 : 1) * 2; // 分组略偏上、国家略偏下，确定性初值
    });
    const sim = d3
      .forceSimulation(nodes)
      .force('x', d3.forceX((n) => x(n.value)).strength(1))
      .force('y', d3.forceY(cy).strength(0.06))
      .force('collide', d3.forceCollide((n) => n.r + pad).iterations(4))
      .stop();
    for (let i = 0; i < 300; i += 1) sim.tick();
  }

  /** 贪心放置标签：依次尝试上 / 下 / 右 / 左，避开圆与已放置标签 */
  function placeLabels(sel, iw, ih, twoLine = false) {
    const boxes = nodes.map((n) => ({
      x0: n.x - n.r,
      x1: n.x + n.r,
      y0: n.y - n.r,
      y1: n.y + n.r,
      id: n.id,
    }));
    // 重叠面积（含越界惩罚），0 表示无冲突
    const cost = (b, own) => {
      let c = 0;
      boxes.forEach((o) => {
        if (o.id === own) return;
        const ox = Math.min(b.x1, o.x1) - Math.max(b.x0, o.x0);
        const oy = Math.min(b.y1, o.y1) - Math.max(b.y0, o.y0);
        if (ox > 0 && oy > 0) c += ox * oy;
      });
      if (b.x0 < -4 || b.x1 > iw + 4 || b.y0 < -24 || b.y1 > ih) c += 1e6;
      return c;
    };
    const order = [...nodes].sort((a, b) => b.r - a.r);
    order.forEach((n) => {
      const text = sel.filter((d) => d.id === n.id).select('.node__label');
      // twoLine（英文窄屏）：名称与数值分两行，宽度取较长一行
      const extra = twoLine ? 13 : 0;
      const w = twoLine
        ? Math.max(
            text.select('tspan.n').node().getComputedTextLength(),
            text.select('tspan.v').node().getComputedTextLength(),
          ) || 60
        : text.node().getComputedTextLength() || 60;
      const h = 14 + extra;
      const gap = 5;
      const R = n.r + gap;
      const cand = (dx, dy, anchor) => {
        const x0 = anchor === 'middle' ? dx - w / 2 : anchor === 'start' ? dx : dx - w;
        return { dx, dy, anchor, box: [x0, x0 + w, dy - h + 3, dy + 3] };
      };
      const cands = [
        cand(0, -R, 'middle'),
        cand(0, R + h - 3, 'middle'),
        cand(R, 4 + extra / 2, 'start'),
        cand(-R, 4 + extra / 2, 'end'),
        cand(n.r * 0.6, -R, 'start'),
        cand(-n.r * 0.6, -R, 'end'),
        cand(n.r * 0.6, R + h - 3, 'start'),
        cand(-n.r * 0.6, R + h - 3, 'end'),
        cand(0, -R - h, 'middle'),
        cand(0, R + 2 * h - 3, 'middle'),
      ];
      if (n.y > ih / 2 + 1) {
        [cands[0], cands[1]] = [cands[1], cands[0]];
        [cands[4], cands[6]] = [cands[6], cands[4]];
        [cands[5], cands[7]] = [cands[7], cands[5]];
      }
      let pick = cands[0];
      let best = Infinity;
      for (const c of cands) {
        const k = cost(
          { x0: n.x + c.box[0], x1: n.x + c.box[1], y0: n.y + c.box[2], y1: n.y + c.box[3] },
          n.id,
        );
        if (k < best) {
          best = k;
          pick = c;
        }
        if (k === 0) break;
      }
      boxes.push({
        x0: n.x + pick.box[0],
        x1: n.x + pick.box[1],
        y0: n.y + pick.box[2],
        y1: n.y + pick.box[3],
        id: `${n.id}-label`,
      });
      text
        .attr('x', pick.dx)
        .attr('y', pick.dy - extra)
        .attr('text-anchor', pick.anchor);
      text
        .select('tspan.v')
        .attr('x', twoLine ? pick.dx : null)
        .attr('dy', twoLine ? extra : null);
    });
  }

  function render(animate) {
    if (!width) return;
    const narrow = width < 520;
    const height = chartHeight(width, { aspect: 0.32, min: narrow ? 300 : 260, max: 320 });
    const margin = { top: 34, right: 16, bottom: 36, left: 16 };
    const iw = width - margin.left - margin.right;
    const ih = height - margin.top - margin.bottom;
    svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);
    plot.attr('transform', `translate(${margin.left},${margin.top})`);
    unitLabel
      .attr('x', margin.left)
      .attr('y', 14)
      .text(t('横轴：就业暴露于 AI 的比例（%）', 'Share of employment exposed to AI (%)'));

    const x = d3.scaleLinear().domain([0, 100]).range([0, iw]);
    gx.attr('transform', `translate(${margin.left},${margin.top + ih})`).call(
      d3
        .axisBottom(x)
        .ticks(narrow ? 5 : 10)
        .tickSize(0)
        .tickPadding(10)
        .tickFormat((v) => `${v}%`),
    );
    styleAxis(gx);
    grid
      .selectAll('line')
      .data(x.ticks(narrow ? 5 : 10))
      .join('line')
      .attr('class', 'grid-line')
      .attr('x1', (v) => x(v))
      .attr('x2', (v) => x(v))
      .attr('y1', 0)
      .attr('y2', ih);
    const cy = ih / 2;
    lane.attr('x1', 0).attr('x2', iw).attr('y1', cy).attr('y2', cy);
    const world = data.groups.find((g) => g.key === 'world');
    if (world) worldLine.attr('x1', x(world.value)).attr('x2', x(world.value)).attr('y1', 0).attr('y2', ih);

    const rG = narrow ? 13 : 18;
    const rC = narrow ? 6 : 8;
    simulate(x, cy, rG, rC, narrow ? 9 : 3);

    const sel = nodesG
      .selectAll('g.node')
      .data(nodes, (n) => n.id)
      .join((enter) => {
        const g = enter.append('g').attr('class', (n) => `node node--${n.kind}`);
        g.filter((n) => n.kind === 'group')
          .append('circle')
          .attr('class', 'halo')
          .style('fill', (n) => GROUP_COLOR[n.gkey])
          .style('stroke', (n) => GROUP_COLOR[n.gkey]);
        g.filter((n) => n.kind === 'group')
          .append('circle')
          .attr('class', 'core')
          .style('fill', (n) => GROUP_COLOR[n.gkey]);
        g.filter((n) => n.kind === 'country')
          .append('circle')
          .style('fill', (n) => GROUP_COLOR[n.gkey]);
        const label = g
          .append('text')
          .attr('class', 'node__label')
          .style('fill', (n) => (n.kind === 'group' ? GROUP_COLOR[n.gkey] : 'var(--text)'));
        label.append('tspan').attr('class', 'n');
        label.append('tspan').attr('class', 'v');
        return g;
      });
    sel.call(bindTooltip, (n) =>
      t(
        `<strong>${n.name}</strong>${n.kind === 'country' ? `（${groupName[n.gkey]}）` : '（经济体分组）'}<br>就业暴露于 AI：约 ${fmt.int(n.value)}%<br><em>来源：IMF SDN/2024/001</em>`,
        `<strong>${tf(n, 'name')}</strong> (${n.kind === 'country' ? groupName[n.gkey] : 'economy group'})<br>Employment exposed to AI: about ${fmt.int(n.value)}%<br><em>Source: IMF SDN/2024/001</em>`,
      ),
    );
    sel.select('circle.halo').attr('r', (n) => n.r);
    sel.select('circle.core').attr('r', (n) => n.r * 0.32);
    sel
      .filter((n) => n.kind === 'country')
      .select('circle')
      .attr('r', (n) => n.r);
    // 窄屏用简称，避免标签互相遮挡（完整名称见图例与提示框）
    const short = (name) =>
      narrow ? name.replace(isEn() ? /\s+(economies|markets|countries)$/i : /经济体|国家|市场/g, '') : name;
    sel
      .select('tspan.n')
      .text(
        (n) => `${n.kind === 'group' ? short(tf(n, 'name')) : tf(n, 'name')}${narrow && isEn() ? '' : ' '}`,
      );
    sel.select('tspan.v').text((n) => `${fmt.int(n.value)}%`);
    placeLabels(sel, iw, ih, narrow && isEn());
    sel.classed('is-dim', (n) => (FOCUS[step] ? !FOCUS[step].includes(n.gkey) : false));

    layoutDone = { x };
    if (!played) {
      // 待进入视口后播放飞入动画
      sel.attr('transform', () => `translate(${x(0)},${cy})`).attr('opacity', 0);
    } else if (animate) {
      tr(sel)
        .attr('transform', (n) => `translate(${n.x},${n.y})`)
        .attr('opacity', 1);
    } else
      sel
        .interrupt()
        .attr('transform', (n) => `translate(${n.x},${n.y})`)
        .attr('opacity', 1);
  }

  function play() {
    if (played || !layoutDone) return;
    played = true;
    const sel = nodesG.selectAll('g.node');
    sel
      .transition()
      .delay((n, i) => (n.kind === 'group' ? 0 : 500) + i * 90)
      .duration(theme.duration * 1.4)
      .ease(d3.easeCubicOut)
      .attr('transform', (n) => `translate(${n.x},${n.y})`)
      .attr('opacity', 1);
  }

  const stopSize = observeSize(container, ({ width: w }) => {
    width = w;
    render(false);
  });
  const stopVis = observeVisible(container, (vis) => {
    if (vis) play();
  });

  return {
    update(s) {
      step = s;
      if (!played) play();
      nodesG
        .selectAll('g.node')
        .classed('is-dim', (n) => (FOCUS[step] ? !FOCUS[step].includes(n.gkey) : false));
    },
    resize() {
      width = container.clientWidth;
      render(false);
    },
    destroy() {
      stopSize();
      stopVis();
      root.selectAll('*').interrupt().remove();
      root.classed('beeswarm', false);
    },
  };
}
