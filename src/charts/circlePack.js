// WIPO 生成式 AI 专利：按数据类型的圆堆积图（悬停/聚焦时圆内图标动画）
// update(step)：0 全部；1 突出“分子/基因/蛋白质”（其余淡化）
import * as d3 from 'd3';
import { observeSize, createSvg, tr, chartHeight, fmt, legend, note, srTable } from '../core/chartUtils.js';
import { bindTooltip } from '../core/tooltip.js';
import { t, tf } from '../core/i18n.js';
import '../styles/charts/circlePack.css';

const HOT = 'molecule';
const TYPE_COLOR = {
  image: 'var(--violet)',
  text: 'var(--blue)',
  audio: 'var(--cyan)',
  molecule: 'var(--orange)',
};
const typeColor = (k) => TYPE_COLOR[k] || 'var(--violet)';

/** 在 40×40 的局部坐标（中心为原点）绘制各类型图标 */
const ICONS = {
  image(g) {
    g.append('rect')
      .attr('class', 'ic-frame')
      .attr('x', -18)
      .attr('y', -14)
      .attr('width', 36)
      .attr('height', 28)
      .attr('rx', 4);
    g.append('circle').attr('class', 'ic-sun').attr('cx', 8).attr('cy', -5).attr('r', 4);
    g.append('path').attr('class', 'ic-hill').attr('d', 'M-16,12 L-5,-1 L3,7 L8,3 L16,12 Z');
  },
  text(g) {
    [-10, -3, 4, 11].forEach((yy, i) =>
      g
        .append('rect')
        .attr('class', 'ic-line')
        .attr('x', -16)
        .attr('y', yy - 1.75)
        .attr('width', i === 3 ? 20 : 32)
        .attr('height', 3.5)
        .attr('rx', 1.75)
        .style('animation-delay', `${i * 0.18}s`),
    );
  },
  audio(g) {
    [-14, -7, 0, 7, 14].forEach((xx, i) =>
      g
        .append('rect')
        .attr('class', 'ic-bar')
        .attr('x', xx - 2)
        .attr('y', -14)
        .attr('width', 4)
        .attr('height', 28)
        .attr('rx', 2)
        .style('animation-delay', `${[0.1, 0.35, 0, 0.25, 0.45][i]}s`),
    );
  },
  molecule(g) {
    const rot = g.append('g').attr('class', 'ic-rot');
    const atoms = [
      [0, -12],
      [-11, 7],
      [11, 7],
      [0, 0],
    ];
    [
      [3, 0],
      [3, 1],
      [3, 2],
    ].forEach(([a, b]) =>
      rot
        .append('line')
        .attr('class', 'ic-bond')
        .attr('x1', atoms[a][0])
        .attr('y1', atoms[a][1])
        .attr('x2', atoms[b][0])
        .attr('y2', atoms[b][1]),
    );
    atoms.forEach(([ax, ay], i) =>
      rot
        .append('circle')
        .attr('class', 'ic-atom')
        .attr('cx', ax)
        .attr('cy', ay)
        .attr('r', i === 3 ? 4.5 : 3.5)
        .style('animation-delay', `${i * 0.2}s`),
    );
  },
};

export function createCirclePack(container, data) {
  const items = data.by_data_type || [];
  const unit = tf(data, 'unit') || t('项', 'patents');
  const period = tf(data, 'period_label');
  // 年均增长为截至统计期末的 5 年复合增速（如 2018–2023）；数值保留一位小数（整数不带小数）
  const endY = +(String(data.period_label || '').match(/(\d{4})\s*$/) || [])[1];
  const span = endY ? [endY - 5, endY] : null;
  const growthLong = span
    ? t(`${span[0]}–${span[1]} 年均增长`, `Average annual growth ${span[0]}–${span[1]}`)
    : t('近五年年均增长', 'Average annual growth, last 5 years');
  const growthShort = span
    ? t(`${span[0]}–${span[1]} 年均增长`, `avg. annual growth ${span[0]}–${String(span[1]).slice(2)}`)
    : t('近五年年均增长', 'avg. annual growth, last 5 yrs');
  const cagr = (v) => `${fmt.num(v * 100, 1)}%`;
  const hot = items.find((d) => d.key === HOT);
  const multiNote = (data.notes || '')
    .split('。')
    .filter((s) => s.includes('数据类型'))
    .join('。');

  const root = d3.select(container).classed('circle-pack', true);
  const svg = createSvg(container).attr(
    'aria-label',
    t('生成式 AI 专利按数据类型的圆堆积图', 'Circle-packing chart of generative AI patents by data type'),
  );
  legend(
    root.append('div').node(),
    items.map((d) => ({ label: tf(d, 'name'), color: typeColor(d.key), shape: 'dot' })),
  );
  note(
    container,
    t(
      `${multiNote ? `${multiNote}，` : ''}各圆不可相加得出总量；圆面积 ∝ 专利数。${data.period_label ? `统计期 ${data.period_label}。` : ''}`,
      `${multiNote ? 'A single patent can belong to several data types, so the' : 'The'} circles cannot be added up to a total; circle area ∝ number of patents.${period ? ` Period: ${period}.` : ''}`,
    ),
    'warn',
  );
  srTable(
    container,
    t(
      `生成式 AI 专利按数据类型（${data.period_label || ''}）`,
      `Generative AI patents by data type (${period || ''})`,
    ),
    [t('数据类型', 'Data type'), t(`专利数（${unit}）`, `Patents (${unit})`), growthLong],
    items.map((d) => [tf(d, 'name'), d.value, d.cagr_5y != null ? cagr(d.cagr_5y) : '—']),
  );

  const gUnit = svg.append('text').attr('class', 'axis-label').attr('x', 0).attr('y', 12);
  const plot = svg.append('g');
  const callout = svg.append('g').attr('class', 'cp-callout');

  let width = 0;
  let step = 0;
  let entered = false;

  function render(animate) {
    if (!width) return;
    const wide = width >= 560;
    const top = 22;
    const packW = wide ? Math.min(width * 0.64, 460) : width;
    const packH = wide ? chartHeight(width, { aspect: 0.5, min: 300, max: 420 }) : Math.round(width * 0.92);
    const calloutH = wide ? 0 : 92;
    const height = top + packH + calloutH;
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
    gUnit.text(
      t(
        `单位：${unit}${data.period_label ? `（${data.period_label}）` : ''}`,
        `Unit: ${unit}${period ? ` (${period})` : ''}`,
      ),
    );
    const tt = (sel, delay) => (animate ? tr(sel, delay) : sel);

    const hier = d3
      .hierarchy({ children: items })
      .sum((d) => d.value || 0)
      .sort((a, b) => b.value - a.value);
    const packed = d3
      .pack()
      .size([packW, packH])
      .padding(wide ? 10 : 6)(hier);
    const leaves = packed.leaves();
    plot.attr('transform', `translate(0,${top})`);

    const node = plot
      .selectAll('g.cp-node')
      .data(leaves, (d) => d.data.key)
      .join((enter) => {
        const g = enter.append('g').attr('class', (d) => `cp-node cp-node--${d.data.key}`);
        g.attr('transform', (d) => `translate(${d.x},${d.y}) scale(0.001)`);
        g.append('circle').attr('class', 'cp-pulse');
        g.append('circle').attr('class', 'cp-circle');
        const icon = g.append('g').attr('class', 'cp-icon');
        icon.each(function (d) {
          ICONS[d.data.key]?.(d3.select(this).append('g').attr('class', `ic ic--${d.data.key}`));
        });
        g.append('text').attr('class', 'cp-name');
        g.append('text').attr('class', 'cp-val');
        return g;
      });
    node
      .call(
        bindTooltip,
        (d) =>
          `<strong>${tf(d.data, 'name')}</strong><br>${fmt.int(d.data.value)} ${unit}${d.data.cagr_5y != null ? `<br>${growthLong}${t(' ', ': ')}${cagr(d.data.cagr_5y)}` : ''}${d.data.since ? `<br><em>${t(`${d.data.since} 年以来累计`, `Cumulative since ${d.data.since}`)}</em>` : ''}`,
      )
      .on('pointerenter.icon focus.icon', function () {
        d3.select(this).classed('is-active', true);
      })
      .on('pointerleave.icon blur.icon', function () {
        d3.select(this).classed('is-active', false);
      })
      .attr('aria-label', (d) => `${tf(d.data, 'name')}${t('：', ': ')}${fmt.int(d.data.value)} ${unit}`);

    const target = (d) => `translate(${d.x},${d.y}) scale(1)`;
    const dim = (d) => step >= 1 && d.data.key !== HOT;
    tt(node, entered ? 0 : (d, i) => i * 140)
      .attr('transform', target)
      .style('opacity', (d) => (dim(d) ? 0.32 : 1));
    entered = true;
    node
      .select('.cp-circle')
      .attr('r', (d) => d.r)
      .style('fill', (d) => typeColor(d.data.key))
      .style('fill-opacity', (d) => (d.data.key === HOT ? 0.3 : 0.16))
      .style('stroke', (d) => typeColor(d.data.key))
      .style('stroke-width', (d) => (d.data.key === HOT ? 2 : 1.25));
    node
      .select('.cp-pulse')
      .attr('r', (d) => d.r)
      .style('stroke', (d) => typeColor(d.data.key))
      .style('display', (d) => (d.data.key === HOT ? null : 'none'));

    // 图标大小随半径；小圆仅显示图标
    const fits = (d) => d.r >= 46;
    node
      .select('.cp-icon')
      .attr('transform', (d) => {
        const s = fits(d) ? Math.min(1.6, d.r / 70) : Math.max(0.45, (d.r * 0.9) / 24);
        return `translate(0,${fits(d) ? -d.r * 0.28 : 0}) scale(${s})`;
      })
      .style('color', (d) => typeColor(d.data.key));
    node
      .select('.cp-name')
      .attr('text-anchor', 'middle')
      .attr('y', (d) => d.r * 0.2)
      .style('font-size', (d) => `${Math.max(12, Math.min(16, d.r / 6))}px`)
      .text((d) => (fits(d) ? tf(d.data, 'name') : ''));
    node
      .select('.cp-val')
      .attr('text-anchor', 'middle')
      .attr('y', (d) => d.r * 0.2 + Math.max(18, Math.min(26, d.r / 4.2)))
      .style('font-size', (d) => `${Math.max(14, Math.min(24, d.r / 4.5))}px`)
      .text((d) => (fits(d) ? fmt.int(d.data.value) : ''));

    // 小圆（分子/基因/蛋白质）的外部标注
    callout.selectAll('*').remove();
    const hl = leaves.find((d) => d.data.key === HOT);
    if (hot && hl) {
      const cx = hl.x;
      const cy = hl.y + top;
      let lx;
      let ly;
      let anchor = 'start';
      if (wide) {
        lx = packW + 28;
        ly = Math.max(top + 20, Math.min(height - 70, cy - 26));
      } else {
        lx = 8;
        ly = top + packH + 18;
      }
      const ex = wide ? lx - 8 : cx;
      const ey = wide ? ly + 26 : ly - 6;
      const ang = Math.atan2(ey - cy, ex - cx);
      callout
        .append('path')
        .attr('class', 'cp-leader')
        .style('display', wide ? null : 'none')
        .attr('d', `M${cx + Math.cos(ang) * (hl.r + 3)},${cy + Math.sin(ang) * (hl.r + 3)}L${ex},${ey}`);
      const txt = callout.append('g').attr('transform', `translate(${lx},${ly})`);
      txt.append('circle').attr('cx', 5).attr('cy', -1).attr('r', 5).style('fill', typeColor(HOT));
      txt
        .append('text')
        .attr('class', 'cp-c-name')
        .attr('text-anchor', anchor)
        .attr('x', 16)
        .attr('y', 4)
        .text(tf(hot, 'name'));
      txt
        .append('text')
        .attr('class', 'cp-c-val')
        .attr('text-anchor', anchor)
        .attr('y', 26)
        .text(
          `${fmt.int(hot.value)} ${unit}${hot.since ? t(` · ${hot.since} 年以来`, ` · since ${hot.since}`) : ''}`,
        );
      if (hot.cagr_5y != null) {
        const g2 = txt.append('g').attr('transform', 'translate(0,58)');
        const gt = g2
          .append('text')
          .attr('class', 'cp-c-growth')
          .attr('text-anchor', anchor)
          .text(`+${cagr(hot.cagr_5y)}`);
        g2.append('text')
          .attr('class', 'cp-c-sub')
          .attr('x', (gt.node().getComputedTextLength?.() || 80) + 8)
          .attr('text-anchor', anchor)
          .text(growthShort);
      }
      callout.classed('is-hot', step >= 1);
    }
  }

  const stop = observeSize(container, ({ width: w }) => {
    width = w;
    render(!entered);
  });

  return {
    update(s) {
      step = s;
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
