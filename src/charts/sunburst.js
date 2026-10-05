// 产业分层双环图：内环 = 2024 年各层企业数（家），外环 = 2025 年各层产业规模占比（%）
// 两环是不同指标、不同来源；悬停某一层同时高亮两环对应弧段
// update(step)：0 全部；1 突出同比增速最高的一层
import * as d3 from 'd3';
import {
  observeSize,
  observeVisible,
  createSvg,
  chartHeight,
  fmt,
  note,
  srTable,
} from '../core/chartUtils.js';
import { theme } from '../core/theme.js';
import { tooltip } from '../core/tooltip.js';
import { t, tf, isEn } from '../core/i18n.js';
import '../styles/charts/sunburst.css';

const LAYER_COLOR = ['var(--cyan)', 'var(--violet)', 'var(--green)'];

export function createSunburst(container, data) {
  const inner = data.firms_by_layer_2024 || [];
  const outer = data.structure_2025 || [];
  const total = data.firms_total_2024?.value ?? d3.sum(inner, (d) => d.value);
  // 两组分层按顺序一一对应（基础层 / 技术层↔模型框架层 / 应用层）
  const n = Math.max(inner.length, outer.length);
  const sep = t('：', ': ');
  const L = (o) => (o ? tf(o, 'layer') : ''); // 层名（显示用）；比较仍用中文原值
  const layers = d3.range(n).map((i) => ({
    i,
    inner: inner[i],
    outer: outer[i],
    color: LAYER_COLOR[i] || 'var(--other)',
    name:
      inner[i]?.layer === outer[i]?.layer
        ? L(inner[i])
        : [L(inner[i]), L(outer[i])].filter(Boolean).join(' / '),
  }));
  const fastest = d3.greatest(layers, (l) => l.outer?.yoy ?? -Infinity);
  const renamed = layers.filter((l) => l.inner && l.outer && l.inner.layer !== l.outer.layer);

  const root = d3.select(container).classed('sunburst', true);
  const wrap = root.append('div').attr('class', 'sb__wrap');
  const svgBox = wrap.append('div').attr('class', 'sb__svg');
  const svg = createSvg(svgBox.node()).attr(
    'aria-label',
    t('人工智能产业分层双环图', 'Two-ring chart of AI industry layers'),
  );
  const key = wrap.append('div').attr('class', 'sb__key');
  note(
    container,
    t(
      `内环与外环是两个不同指标：内环为 2024 年各层企业数（发展报告“骨干企业”口径），外环为 2025 年各层占产业规模的比重（中国信通院），两者不可直接换算。${renamed.length ? `报告中的“${renamed.map((l) => l.inner.layer).join('、')}”与信通院的“${renamed.map((l) => l.outer.layer).join('、')}”名称与口径不同，此处仅按层级位置对应。` : ''}`,
      `The inner and outer rings are two different metrics: the inner ring is the number of companies in each layer in 2024 (“backbone enterprises” in the development report); the outer ring is each layer's share of industry size in 2025 (CAICT). One cannot be converted into the other.${renamed.length ? ` The report's “${renamed.map((l) => L(l.inner)).join(', ')}” and CAICT's “${renamed.map((l) => L(l.outer)).join(', ')}” differ in name and definition and are matched here by layer position only.` : ''}`,
    ),
    'warn',
  );
  srTable(
    container,
    t('人工智能产业分层', 'AI industry layers'),
    [
      t('层级（企业数口径）', 'Layer (company-count basis)'),
      t('2024 企业数（家）', 'Companies, 2024'),
      t('层级（规模口径）', 'Layer (industry-size basis)'),
      t('2025 规模占比（%）', 'Share of industry size, 2025 (%)'),
      t('同比（%）', 'YoY (%)'),
    ],
    layers.map((l) => [
      l.inner ? L(l.inner) : '—',
      l.inner?.value ?? '—',
      l.outer ? L(l.outer) : '—',
      l.outer?.share ?? '—',
      l.outer?.yoy ?? '—',
    ]),
  );

  // ---------- 图例表（兼作悬停入口） ----------
  const head = key.append('div').attr('class', 'sb__row sb__row--head');
  head.append('span');
  head
    .append('span')
    .html(t('企业数<small>内环 · 2024</small>', 'Companies<small>Inner ring · 2024</small>'));
  head
    .append('span')
    .html(t('规模占比<small>外环 · 2025</small>', 'Share of size<small>Outer ring · 2025</small>'));
  const rows = key
    .selectAll('div.sb__row--item')
    .data(layers)
    .join('div')
    .attr('class', 'sb__row sb__row--item')
    .attr('tabindex', 0)
    .style('--c', (l) => l.color);
  const nameCell = rows.append('span').attr('class', 'sb__name');
  nameCell.append('i');
  nameCell
    .append('span')
    .html((l) =>
      l.inner && l.outer && l.inner.layer !== l.outer.layer
        ? `${L(l.inner)}<small>${t('外环', 'Outer ring')}${sep}${L(l.outer)}</small>`
        : L(l.inner) || L(l.outer),
    );
  rows
    .append('span')
    .attr('class', 'sb__num')
    .text((l) => (l.inner ? fmt.int(l.inner.value) : '—'));
  rows
    .append('span')
    .attr('class', 'sb__num')
    .html((l) => (l.outer ? `${fmt.num(l.outer.share, 1)}%<small>${yoyText(l.outer.yoy)}</small>` : '—'));
  rows.on('pointerenter focus', (_, l) => setHover(l.i)).on('pointerleave blur', () => setHover(null));

  function yoyText(v) {
    return t(`同比 +${fmt.num(v, 0)}%`, `+${fmt.num(v, 0)}% YoY`);
  }
  // 按可用宽度折行（仅英文）
  function wrapText(el, words, maxW, lineH) {
    el.text(null);
    const x = el.attr('x');
    let ts = el.append('tspan').attr('x', x).attr('dy', 0);
    let lines = 1;
    words.forEach((w, i) => {
      const prev = ts.text();
      ts.text(i === 0 ? w : `${prev} ${w}`);
      if (i > 0 && ts.node().getComputedTextLength() > maxW) {
        ts.text(prev);
        ts = el.append('tspan').attr('x', x).attr('dy', lineH).text(w);
        lines += 1;
      }
    });
    return lines;
  }
  // 中心文字：超出内圈宽度时缩小字号
  function fitText(el, size, maxW) {
    el.style('font-size', `${size}px`);
    const len = el.node().getComputedTextLength?.() || 0;
    if (len > maxW) el.style('font-size', `${Math.max(8, (size * maxW) / len).toFixed(1)}px`);
  }

  const defs = svg.append('defs');
  const glowId = `sb-glow-${Math.random().toString(36).slice(2, 8)}`;
  const f = defs
    .append('filter')
    .attr('id', glowId)
    .attr('x', '-20%')
    .attr('y', '-20%')
    .attr('width', '140%')
    .attr('height', '140%');
  f.append('feGaussianBlur').attr('stdDeviation', 4).attr('result', 'b');
  const fm = f.append('feMerge');
  fm.append('feMergeNode').attr('in', 'b');
  fm.append('feMergeNode').attr('in', 'SourceGraphic');

  const g = svg.append('g');
  const ringBg = g.append('g');
  const arcsIn = g.append('g');
  const arcsOut = g.append('g');
  const labels = g.append('g').attr('class', 'sb-labels');
  const captions = g.append('g').attr('class', 'sb-captions');
  const center = g.append('g').attr('class', 'sb-center');
  const cBig = center.append('text').attr('class', 'sb-center__big').attr('text-anchor', 'middle');
  const cSub = center.append('text').attr('class', 'sb-center__sub').attr('text-anchor', 'middle');
  const cSub2 = center.append('text').attr('class', 'sb-center__sub2').attr('text-anchor', 'middle');

  let width = 0;
  let step = 0;
  let hover = null;
  let progress = theme.reducedMotion ? 1 : 0;
  let geom = null;

  const pieIn = d3
    .pie()
    .sort(null)
    .value((l) => l.inner?.value || 0)
    .padAngle(0.012);
  const pieOut = d3
    .pie()
    .sort(null)
    .value((l) => l.outer?.share || 0)
    .padAngle(0.012);

  function active() {
    if (hover != null) return hover;
    if (step >= 1 && fastest) return fastest.i;
    return null;
  }

  function setHover(i) {
    hover = i;
    paint();
  }

  function render() {
    if (!width) return;
    const w = svgBox.node().clientWidth || width;
    const wide = w >= 520;
    const height = wide ? chartHeight(w, { aspect: 0.66, min: 340, max: 440 }) : Math.round(w * 0.92);
    svg.attr('viewBox', `0 0 ${w} ${height}`).attr('width', w).attr('height', height);
    const side = wide ? (isEn() ? 150 : 120) : 8;
    const R = Math.max(80, Math.min((w - side * 2) / 2, height / 2 - (wide ? 28 : 10)));
    const cx = w / 2;
    const cy = height / 2;
    g.attr('transform', `translate(${cx},${cy})`);
    geom = {
      R,
      wide,
      cx,
      w,
      inR0: R * 0.4,
      inR1: R * 0.66,
      outR0: R * 0.71,
      outR1: R * 0.97,
    };
    ringBg
      .selectAll('circle')
      .data([
        [geom.inR0, geom.inR1],
        [geom.outR0, geom.outR1],
      ])
      .join('circle')
      .attr('r', (d) => (d[0] + d[1]) / 2)
      .style('fill', 'none')
      .style('stroke', 'var(--grid)')
      .style('stroke-width', (d) => d[1] - d[0]);
    paint();
  }

  function paint() {
    if (!geom) return;
    const { R, wide, inR0, inR1, outR0, outR1 } = geom;
    const act = active();
    const arcIn = d3.arc().innerRadius(inR0).outerRadius(inR1).cornerRadius(4);
    const arcOut = d3.arc().innerRadius(outR0).outerRadius(outR1).cornerRadius(4);
    const sweep = (a) => ({ ...a, endAngle: a.startAngle + (a.endAngle - a.startAngle) * progress });
    const op = (l) => (act == null || act === l.i ? 1 : 0.22);

    const pIn = pieIn(layers);
    const pOut = pieOut(layers);
    arcsIn
      .selectAll('path')
      .data(pIn, (a) => a.data.i)
      .join('path')
      .attr('class', 'sb-arc sb-arc--in')
      .attr('d', (a) => arcIn(sweep(a)))
      .style('fill', (a) => a.data.color)
      .style('fill-opacity', (a) => 0.42 * op(a.data) + (act === a.data.i ? 0.2 : 0))
      .style('stroke', (a) => a.data.color)
      .style('stroke-opacity', (a) => op(a.data))
      .style('stroke-width', 1.25)
      .attr('filter', (a) => (act === a.data.i ? `url(#${glowId})` : null))
      .call(bindArc);
    arcsOut
      .selectAll('path')
      .data(pOut, (a) => a.data.i)
      .join('path')
      .attr('class', 'sb-arc sb-arc--out')
      .attr('d', (a) => arcOut(sweep(a)))
      .style('fill', (a) => a.data.color)
      .style('fill-opacity', (a) => 0.88 * op(a.data))
      .style('stroke', 'var(--panel)')
      .style('stroke-width', 1.5)
      .attr('filter', (a) => (act === a.data.i ? `url(#${glowId})` : null))
      .call(bindArc);

    // 弧内数字：内环企业数、外环占比（弧太窄则省略，由右侧表格补全）
    const lab = [];
    pIn.forEach((a) => {
      const span = (a.endAngle - a.startAngle) * (inR0 + inR1) * 0.5;
      if (a.data.inner && span > 34)
        lab.push({ a, r: (inR0 + inR1) / 2, text: fmt.int(a.data.inner.value), cls: 'in' });
    });
    pOut.forEach((a) => {
      const span = (a.endAngle - a.startAngle) * (outR0 + outR1) * 0.5;
      if (a.data.outer && span > 30)
        lab.push({ a, r: (outR0 + outR1) / 2, text: `${fmt.num(a.data.outer.share, 1)}%`, cls: 'out' });
    });
    labels
      .selectAll('text.sb-in-label')
      .data(lab, (d) => `${d.cls}-${d.a.data.i}`)
      .join('text')
      .attr('class', (d) => `sb-in-label sb-in-label--${d.cls}`)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('transform', (d) => {
        const ang = (d.a.startAngle + d.a.endAngle) / 2;
        return `translate(${Math.sin(ang) * d.r},${-Math.cos(ang) * d.r})`;
      })
      .style('opacity', (d) => (progress < 1 ? 0 : act == null || act === d.a.data.i ? 1 : 0.3))
      .text((d) => d.text);

    // 外环外侧标注（宽屏）：层名 + 同比
    const outLab = wide && progress >= 1 ? pOut.filter((a) => a.data.outer) : [];
    const ol = labels
      .selectAll('g.sb-out')
      .data(outLab, (a) => a.data.i)
      .join((enter) => {
        const e = enter.append('g').attr('class', 'sb-out');
        e.append('path');
        e.append('text').attr('class', 'sb-out__name');
        e.append('text').attr('class', 'sb-out__yoy');
        return e;
      });
    ol.style('opacity', (a) => (act == null || act === a.data.i ? 1 : 0.3));
    ol.each(function (a) {
      const ang = (a.startAngle + a.endAngle) / 2;
      const sx = Math.sin(ang);
      const sy = -Math.cos(ang);
      const right = sx >= 0;
      const p0 = [sx * (outR1 + 2), sy * (outR1 + 2)];
      const p1 = [sx * (R + 14), sy * (R + 14)];
      const p2 = [p1[0] + (right ? 14 : -14), p1[1]];
      const el = d3.select(this);
      el.select('path')
        .attr('d', `M${p0}L${p1}L${p2}`)
        .style('fill', 'none')
        .style('stroke', a.data.color)
        .style('stroke-width', 1.25);
      const avail = geom.w / 2 - Math.abs(p2[0]) - 8;
      const nameEl = el
        .select('.sb-out__name')
        .attr('x', p2[0] + (right ? 4 : -4))
        .attr('y', p2[1] - 3)
        .attr('text-anchor', right ? 'start' : 'end');
      const nameText = `${L(a.data.outer)} ${fmt.num(a.data.outer.share, 1)}%`;
      const lines = isEn() ? wrapText(nameEl, nameText.split(' '), avail, 15) : (nameEl.text(nameText), 1);
      el.select('.sb-out__yoy')
        .attr('x', p2[0] + (right ? 4 : -4))
        .attr('y', p2[1] + 13 + (lines - 1) * 15)
        .attr('text-anchor', right ? 'start' : 'end')
        .style('fill', a.data.color)
        .text(yoyText(a.data.outer.yoy));
    });

    // 环名说明（宽屏左侧）
    const caps = wide
      ? [
          {
            r: (outR0 + outR1) / 2,
            ang: -Math.PI * 0.3,
            text: t('外环：2025 年产业规模占比', 'Outer: share of size, 2025'),
          },
          {
            r: (inR0 + inR1) / 2,
            ang: -Math.PI * 0.4,
            text: t('内环：2024 年企业数', 'Inner: companies, 2024'),
          },
        ]
      : [];
    const cp = captions
      .selectAll('g.sb-cap')
      .data(caps)
      .join((enter) => {
        const e = enter.append('g').attr('class', 'sb-cap');
        e.append('path');
        e.append('circle').attr('r', 2.5);
        e.append('text');
        return e;
      });
    cp.each(function (d, i) {
      const px = Math.sin(d.ang) * d.r;
      const py = -Math.cos(d.ang) * d.r;
      const el = d3.select(this);
      const txt = el
        .select('text')
        .attr('x', -geom.cx + 2)
        .attr('y', -R * 0.92 + i * 24 + 4)
        .attr('text-anchor', 'start')
        .text(d.text);
      const tx = -geom.cx + 2 + (txt.node().getComputedTextLength?.() || 140) + 6;
      const ty = -R * 0.92 + i * 24;
      el.select('circle').attr('cx', px).attr('cy', py);
      el.select('path').attr('d', `M${tx},${ty}L${tx + 10},${ty}L${px},${py}`);
    });

    // 中心
    const l = act != null ? layers[act] : null;
    if (l) {
      cBig.text(l.inner ? fmt.int(l.inner.value) : '—').style('fill', l.color);
      // 英文层名较长：中心只写“companies”与内环层名（外环占比见弧上标注与右侧表格）
      cSub.text(t(`${l.inner?.layer || ''}企业（家）`, l.inner ? 'companies' : ''));
      cSub2.text(isEn() ? L(l.inner) : l.outer ? `${l.outer.layer} ${fmt.num(l.outer.share, 1)}%` : '');
    } else {
      cBig.text(fmt.int(total)).style('fill', null);
      cSub.text(t('2024 年企业总数（家）', 'companies in total'));
      cSub2.text(t('', '2024'));
    }
    const big = Math.max(22, Math.min(40, inR0 * 0.5));
    cBig.style('font-size', `${big}px`).attr('y', big * 0.18);
    cSub.attr('y', big * 0.18 + 18);
    cSub2.attr('y', big * 0.18 + 32);
    if (isEn()) {
      // 按该行所在高度处的内圈弦长缩小字号
      const chord = (y) => 2 * Math.sqrt(Math.max(0, inR0 * inR0 - (y + 4) * (y + 4))) - 12;
      fitText(cSub, inR0 < 60 ? 10 : 11, chord(big * 0.18 + 18));
      fitText(cSub2, inR0 < 60 ? 9.5 : 11, chord(big * 0.18 + 32));
    } else {
      cSub.style('font-size', `${inR0 < 60 ? 10 : 11}px`);
      cSub2.style('font-size', `${inR0 < 60 ? 9.5 : 11}px`);
    }
    key
      .selectAll('.sb__row--item')
      .classed('is-active', (r) => act === r.i)
      .classed('is-dim', (r) => act != null && act !== r.i);
  }

  function bindArc(sel) {
    sel
      .attr('tabindex', 0)
      .attr('role', 'img')
      .attr('aria-label', (a) =>
        a.data.inner || a.data.outer
          ? t(
              `${a.data.name}：企业 ${a.data.inner ? fmt.int(a.data.inner.value) : '—'} 家；规模占比 ${a.data.outer ? `${a.data.outer.share}%` : '—'}`,
              `${a.data.name}: ${a.data.inner ? fmt.int(a.data.inner.value) : '—'} companies; share of industry size ${a.data.outer ? `${a.data.outer.share}%` : '—'}`,
            )
          : '',
      )
      .on('pointerenter focus', (event, a) => {
        setHover(a.data.i);
        tooltip.show(event, tipHtml(a.data));
      })
      .on('pointermove', (event) => tooltip.move(event))
      .on('pointerleave blur', () => {
        setHover(null);
        tooltip.hide();
      });
  }

  function tipHtml(l) {
    return `<strong>${l.name}</strong>
      ${l.inner ? `<br>${t(`内环 · ${l.inner.layer}：${fmt.int(l.inner.value)} 家（2024）`, `Inner ring · ${L(l.inner)}: ${fmt.int(l.inner.value)} companies (2024)`)}` : ''}
      ${l.outer ? `<br>${t(`外环 · ${l.outer.layer}：占产业规模 ${fmt.num(l.outer.share, 1)}%（2025），同比 +${fmt.num(l.outer.yoy, 0)}%`, `Outer ring · ${L(l.outer)}: ${fmt.num(l.outer.share, 1)}% of industry size (2025), +${fmt.num(l.outer.yoy, 0)}% YoY`)}` : ''}
      ${l.inner && l.outer && l.inner.layer !== l.outer.layer ? `<br><em>${t('两环层级名称/口径不同，仅按位置对应', 'The two rings use different layer names / definitions and are matched by position only')}</em>` : ''}`;
  }

  // ---------- 进场：弧段扫出 ----------
  let stopVis = () => {};
  if (progress < 1) {
    stopVis = observeVisible(container, (vis) => {
      if (!vis) return;
      stopVis();
      svg
        .transition('sweep')
        .duration(1200)
        .ease(d3.easeCubicInOut)
        .tween('sweep', () => (tt) => {
          progress = tt;
          paint();
        });
    });
  }

  const stop = observeSize(container, ({ width: w }) => {
    width = w;
    requestAnimationFrame(render);
  });

  return {
    update(s) {
      step = s;
      paint();
    },
    resize() {
      width = container.clientWidth;
      render();
    },
    destroy() {
      stop();
      stopVis();
      svg.interrupt('sweep');
      tooltip.hide();
      root.selectAll('*').remove();
    },
  };
}
