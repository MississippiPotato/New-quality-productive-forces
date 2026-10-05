// IFR 工业机器人颗粒图：1 点 = 1,000 台 2024 年新装机
// 中国与“其他国家合计（= 全球 − 中国）”两簇向日葵（phyllotaxis）排布，进入视口时飞入
// 侧栏：中国运行存量、国产品牌本土市场份额（斜率图）
// update(step)：0 全部；1 突出中国；2 突出侧栏
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
import { bindTooltip } from '../core/tooltip.js';
import { theme } from '../core/theme.js';
import { t, tf, isEn } from '../core/i18n.js';
import '../styles/charts/dotRobots.css';

const PER_DOT = 1000;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** 英文按单词折行，返回行数组；measure 返回文字宽度 */
function wrapWords(text, maxW, measure) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  words.forEach((w) => {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && measure(next) > maxW) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  });
  if (cur) lines.push(cur);
  return lines;
}

export function createDotRobots(container, data, options = {}) {
  const root = d3.select(container).classed('dot-robots', true);
  const en = isEn();
  const inst = data.installations_2024;
  const unit = tf(inst, 'unit');
  const stockUnit = tf(data.china_stock, 'unit');
  // fmt.cn 的量级与单位拼接：中文“29.5 万台”，英文“2.027 million units” / “295,000 units”
  const magUnit = (mag, u) => (en ? `${mag ? `${mag} ` : ''}${u}` : `${mag}${u}`);
  const restValue = inst.world.value - inst.china.value; // 推算值
  const clusters = [
    {
      key: 'cn',
      name: t('中国', 'China'),
      value: inst.china.value,
      color: 'var(--cn)',
      share: inst.china.share,
    },
    {
      key: 'rest',
      name: t('其他国家合计', 'Rest of world'),
      value: restValue,
      color: 'var(--other)',
      derived: true,
    },
  ];
  clusters.forEach((c) => (c.n = Math.round(c.value / PER_DOT)));
  const exact = clusters.every((c) => c.value % PER_DOT === 0);
  const dots = clusters.flatMap((c) => d3.range(c.n).map((i) => ({ c, i })));

  const svg = createSvg(container);
  legend(root.node(), [
    {
      label: t(
        `1 点 = ${fmt.int(PER_DOT)} ${unit}（2024 年新装机）`,
        `1 dot = ${fmt.int(PER_DOT)} ${unit} (new installations, 2024)`,
      ),
      color: 'var(--muted)',
      shape: 'dot',
    },
    { label: t('中国', 'China'), color: 'var(--cn)', shape: 'dot' },
    { label: t('其他国家合计', 'Rest of world'), color: 'var(--other)', shape: 'dot' },
  ]);
  note(
    container,
    t(
      `其他国家合计 = 全球 − 中国，由两值推算（${fmt.int(inst.world.value)} − ${fmt.int(inst.china.value)} = ${fmt.int(restValue)} ${unit}）。${exact ? '' : '点数按千台四舍五入。'}中国占比 ${inst.china.share}% 为 IFR 原文给出。`,
      `Rest of world = world − China, derived from the two values (${fmt.int(inst.world.value)} − ${fmt.int(inst.china.value)} = ${fmt.int(restValue)} ${unit}). ${exact ? '' : `Dot counts are rounded to the nearest ${fmt.int(PER_DOT)} ${unit}. `}China's ${inst.china.share}% share is as given by the IFR.`,
    ),
    'info',
  );
  srTable(
    container,
    t('IFR 工业机器人（2024）', 'IFR industrial robots (2024)'),
    [t('指标', 'Indicator'), t('数值', 'Value'), t('单位', 'Unit')],
    [
      [t('全球新装机', 'New installations, world'), inst.world.value, unit],
      [t('中国新装机', 'New installations, China'), inst.china.value, unit],
      [t('中国占比', 'China share'), inst.china.share, '%'],
      [t('其他国家合计（推算）', 'Rest of world (derived)'), restValue, unit],
      [t('中国运行存量', 'Operational stock, China'), data.china_stock.value, stockUnit],
      ...data.domestic_brand_share.map((d) => [
        t(`国产品牌本土份额 ${d.year}`, `Chinese brands' domestic market share ${d.year}`),
        d.value,
        d.unit,
      ]),
    ],
  );

  const clusterG = svg.selectAll('g.cluster').data(clusters).join('g').attr('class', 'cluster');
  const dotLayer = clusterG.append('g').attr('class', 'dots');
  const labelLayer = clusterG.append('g').attr('class', 'labels');
  labelLayer.append('text').attr('class', 'cl-name').attr('text-anchor', 'middle');
  labelLayer.append('text').attr('class', 'cl-value').attr('text-anchor', 'middle');
  labelLayer.append('text').attr('class', 'cl-third cl-sub').attr('text-anchor', 'middle');
  clusterG.call(bindTooltip, (c) =>
    t(
      `<strong>${c.name}</strong>：${fmt.int(c.value)} ${unit}<br>${c.n} 个点 × ${fmt.int(PER_DOT)} ${unit}${c.share ? `<br>占全球 ${c.share}%` : ''}${c.derived ? '<br><em>由“全球 − 中国”推算</em>' : '<br><em>来源：IFR World Robotics 2025</em>'}`,
      `<strong>${c.name}</strong>: ${fmt.int(c.value)} ${unit}<br>${c.n} dots × ${fmt.int(PER_DOT)} ${unit}${c.share ? `<br>${c.share}% of world total` : ''}${c.derived ? '<br><em>Derived as world − China</em>' : '<br><em>Source: IFR World Robotics 2025</em>'}`,
    ),
  );
  const side = svg.append('g').attr('class', 'side');

  let width = 0;
  let step = options.step != null ? +options.step : 0;
  let played = theme.reducedMotion;
  let geom = null;

  function render() {
    if (!width) return;
    const wide = width >= 680;
    const clW = wide ? width * 0.64 : width;
    const clH = chartHeight(width, { aspect: wide ? 0.4 : 0.62, min: 230, max: 380 });
    const sideH = wide ? 0 : en ? 220 : 190; // 英文侧栏标题可能折行
    const height = clH + sideH;
    svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);

    const labelH = 64;
    const gap = wide ? 48 : 20;
    const sq = clusters.map((c) => Math.sqrt(c.n));
    const cMax = Math.min((clW - gap - 8) / (2 * d3.sum(sq) + 2), (clH - labelH - 14) / (2 * d3.max(sq) + 1));
    const spacing = Math.max(2.2, cMax);
    const dotR = spacing * 0.62;
    const R = sq.map((s) => spacing * s + dotR);
    const totalW = d3.sum(R) * 2 + gap;
    let x = (clW - totalW) / 2;
    clusters.forEach((c, i) => {
      c.cx = x + R[i];
      c.cy = labelH + (clH - labelH - 6) / 2;
      c.R = R[i];
      x += R[i] * 2 + gap;
    });
    geom = { spacing, dotR };

    clusterG.attr('transform', (c) => `translate(${c.cx},${c.cy})`);
    clusterG.each(function (c) {
      const g = d3.select(this);
      g.select('.cl-name')
        .attr('y', -c.R - 44)
        .text(c.name);
      const [num, mag = ''] = fmt.cn(c.value).split(' ');
      const v = g
        .select('.cl-value')
        .attr('y', -c.R - 22)
        .style('fill', c.color);
      v.selectAll('tspan')
        .data([num, ` ${magUnit(mag, unit)}`])
        .join('tspan')
        .attr('class', (_, i) => (i ? 'u' : null))
        .text((d) => d);
      g.select('.cl-third')
        .attr('y', -c.R - 6)
        .attr('class', c.share ? 'cl-third cl-share' : 'cl-third cl-sub')
        .text(
          c.share
            ? t(`占全球 ${c.share}%`, `${c.share}% of world total`)
            : t('由全球 − 中国推算', 'Derived: world − China'),
        );
    });

    const sel = dotLayer
      .selectAll('circle')
      .data((c) => dots.filter((d) => d.c === c))
      .join('circle')
      .attr('r', dotR)
      .style('fill', (d) => d.c.color);
    sel.each((d) => {
      const r = spacing * Math.sqrt(d.i + 0.5);
      const a = d.i * GOLDEN;
      d.x = r * Math.cos(a);
      d.y = r * Math.sin(a);
    });
    if (played)
      sel
        .interrupt()
        .attr('cx', (d) => d.x)
        .attr('cy', (d) => d.y)
        .attr('opacity', 1);
    else sel.attr('cx', 0).attr('cy', 0).attr('opacity', 0);

    renderSide(
      wide,
      wide
        ? { x: width * 0.68, y: 18, w: width * 0.32 - 4, h: clH - 18 }
        : { x: 0, y: clH + 8, w: width, h: sideH - 8 },
    );
    applyStep();
  }

  function renderSide(wide, box) {
    side.selectAll('*').remove();
    side.attr('transform', `translate(${box.x},${box.y})`);
    const stock = data.china_stock;
    const shares = data.domestic_brand_share;
    const colW = wide ? box.w : box.w / 2 - 10;
    // 存量
    const s1 = side.append('g');
    if (wide)
      s1.append('line')
        .attr('class', 'side-rule')
        .attr('x1', -14)
        .attr('x2', -14)
        .attr('y1', 0)
        .attr('y2', box.h);
    else
      s1.append('line')
        .attr('class', 'side-rule')
        .attr('x1', 0)
        .attr('x2', box.w)
        .attr('y1', -4)
        .attr('y2', -4);
    // 标题：英文可能较长，按列宽折行，后续内容整体下移 shift
    const title = (g, text) => {
      const el = g.append('text').attr('class', 'side-title').attr('y', 14);
      if (!en) {
        el.text(text);
        return 0;
      }
      const probe = el.append('tspan');
      const lines = wrapWords(text, colW - 4, (s) => probe.text(s).node().getComputedTextLength());
      probe.remove();
      el.selectAll('tspan')
        .data(lines)
        .join('tspan')
        .attr('x', 0)
        .attr('dy', (_, i) => (i ? 15 : null))
        .text((s) => s);
      return (lines.length - 1) * 15;
    };
    const shift1 = title(s1, t('中国工业机器人运行存量', 'Industrial robots in operation in China'));
    const [snum, smag = ''] = fmt.cn(stock.value).split(' ');
    const big = s1
      .append('text')
      .attr('class', 'side-big')
      .attr('y', 48 + shift1)
      .text(snum);
    s1.append('text')
      .attr('class', 'side-unit')
      .attr('x', big.node().getComputedTextLength() + 6)
      .attr('y', 48 + shift1)
      .style('font-size', '16px')
      .style('fill', 'var(--cn)')
      .style('font-weight', 700)
      .text(magUnit(smag, stockUnit));
    s1.append('text')
      .attr('class', 'side-unit')
      .attr('y', 68 + shift1)
      .style('font-size', '11px')
      .text(t(`（${fmt.int(stock.value)} ${stock.unit}）`, `(${fmt.int(stock.value)} ${stockUnit})`));

    // 国产品牌份额斜率
    const s2 = side
      .append('g')
      .attr(
        'transform',
        wide ? `translate(0,${Math.min(110, box.h * 0.36) + shift1})` : `translate(${colW + 20},0)`,
      );
    const shift2 = title(s2, t('国产品牌本土市场份额', "Chinese brands' share of the domestic market"));
    const sw = Math.min(colW - 20, 220);
    const sh = wide ? Math.max(90, Math.min(140, box.h - 160)) : 110;
    const x = d3
      .scalePoint()
      .domain(shares.map((d) => d.year))
      .range([18, sw - 18]);
    const y = d3
      .scaleLinear()
      .domain([0, 100])
      .range([sh + 24 + shift2, 34 + shift2]);
    s2.append('line')
      .attr('class', 'slope-base')
      .attr('x1', 0)
      .attr('x2', sw)
      .attr('y1', y(0))
      .attr('y2', y(0));
    const line = s2
      .append('path')
      .attr('class', 'slope-line')
      .attr(
        'd',
        d3.line(
          (d) => x(d.year),
          (d) => y(d.value),
        )(shares),
      );
    const len = line.node().getTotalLength();
    if (!theme.reducedMotion)
      line.attr('stroke-dasharray', `${len} ${len}`).attr('stroke-dashoffset', played ? 0 : len);
    s2.selectAll('circle')
      .data(shares)
      .join('circle')
      .attr('class', 'slope-dot')
      .attr('r', 5)
      .attr('cx', (d) => x(d.year))
      .attr('cy', (d) => y(d.value));
    s2.selectAll('text.slope-val')
      .data(shares)
      .join('text')
      .attr('class', 'slope-val')
      .attr('x', (d) => x(d.year))
      .attr('y', (d) => y(d.value) - 10)
      .attr('text-anchor', 'middle')
      .text((d) => `${d.value}${d.unit}`);
    s2.selectAll('text.slope-year.yr')
      .data(shares)
      .join('text')
      .attr('class', 'slope-year yr')
      .attr('x', (d) => x(d.year))
      .attr('y', y(0) + 14)
      .attr('text-anchor', 'middle')
      .text((d) => d.year);
    side.node().__slope = { line, len };
  }

  function applyStep() {
    clusterG.classed('is-dim', (c) => (step === 1 ? c.key !== 'cn' : step >= 2));
    side.classed('is-dim', step === 1);
  }

  function play() {
    if (played || !geom) return;
    played = true;
    const rand = d3.randomLcg(42);
    const sel = dotLayer.selectAll('circle');
    sel
      .attr('cx', (d) => (rand() - 0.5) * width * 0.9 - (d.c.key === 'cn' ? -40 : 40))
      .attr('cy', () => -(rand() * 300 + 120))
      .attr('opacity', 0)
      .transition()
      .delay((d) => (d.c.key === 'cn' ? 0 : 500) + d.i * 3.2)
      .duration(900)
      .ease(d3.easeCubicOut)
      .attr('cx', (d) => d.x)
      .attr('cy', (d) => d.y)
      .attr('opacity', 1);
    const sl = side.node().__slope;
    if (sl)
      sl.line
        .transition()
        .delay(1400)
        .duration(theme.duration * 1.4)
        .attr('stroke-dashoffset', 0);
  }

  const stopSize = observeSize(container, ({ width: w }) => {
    width = w;
    render();
  });
  const stopVis = observeVisible(container, (vis) => vis && play());

  return {
    update(s) {
      step = s;
      play();
      applyStep();
    },
    resize() {
      width = container.clientWidth;
      render();
    },
    destroy() {
      stopSize();
      stopVis();
      root.selectAll('*').interrupt().remove();
      root.classed('dot-robots', false);
    },
  };
}
