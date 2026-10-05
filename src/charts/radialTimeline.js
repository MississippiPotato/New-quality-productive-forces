// 径向时间线：d3.scaleTime 映射到约 310° 的圆弧，事件按“概念 / 政策 / 基础设施 / 就业”着色
// 宽屏：外侧标签 + 引线；窄屏：节点编号 + 下方事件列表。点击 / Enter 打开详情卡片。
// update(step)：0 全部事件；1 高亮概念类并打开 2024-01-31 定义卡片；
//               2 高亮政策 + 基础设施并打开“人工智能+”行动意见卡片；3 高亮就业类并打开新职业卡片
import * as d3 from 'd3';
import { observeSize, createSvg, chartHeight, legend, note, srTable, toDate } from '../core/chartUtils.js';
import { theme } from '../core/theme.js';
import { bindTooltip, tooltip } from '../core/tooltip.js';
import { t, tf, isEn } from '../core/i18n.js';
import '../styles/charts/radialTimeline.css';

const CAT_COLOR = {
  concept: 'var(--combo)',
  policy: 'var(--violet)',
  infra: 'var(--tool)',
  jobs: 'var(--worker)',
};
const CAT_ORDER = ['concept', 'policy', 'infra', 'jobs'];
const STEP_CATS = [null, ['concept'], ['policy', 'infra'], ['jobs']];
const A0 = (25 / 180) * Math.PI; // 圆弧起点（12 点方向顺时针 25°）
const A1 = (335 / 180) * Math.PI; // 圆弧终点，顶部留出缺口

const polar = (a, r) => [r * Math.sin(a), -r * Math.cos(a)];

/** 按 date_precision 输出日期（中文 / 英文） */
export function formatEventDate(r) {
  const [y, m, d] = r.date.split('-').map(Number);
  if (isEn()) {
    if (r.date_precision === 'year') return String(y);
    const date = new Date(y, m - 1, d || 1);
    return d3.timeFormat(r.date_precision === 'month' ? '%b %Y' : '%-d %b %Y')(date);
  }
  if (r.date_precision === 'year') return `${y} 年`;
  if (r.date_precision === 'month') return `${y} 年 ${m} 月`;
  return `${y} 年 ${m} 月 ${d} 日`;
}
function shortDate(r) {
  const [y, m, d] = r.date.split('-');
  if (r.date_precision === 'year') return y;
  if (r.date_precision === 'month') return `${y}.${m}`;
  return `${y}.${m}.${d}`;
}

/** 近似文本宽度：中文按 1em，ASCII 按 0.56em */
function textWidth(s, fs) {
  let w = 0;
  for (const ch of s) w += ch.charCodeAt(0) > 255 ? fs : fs * 0.56;
  return w;
}
function wrapText(s, maxW, fs, maxLines = 3) {
  if (isEn()) return wrapWords(s, maxW, fs, maxLines);
  const lines = [];
  let line = '';
  for (const ch of s) {
    if (textWidth(line + ch, fs) > maxW && line) {
      lines.push(line);
      line = ch;
    } else line += ch;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].slice(0, -1)}…`;
    return kept;
  }
  return lines;
}

/** 英文按单词折行，超出行数时末行截断加省略号 */
function wrapWords(s, maxW, fs, maxLines) {
  const lines = [];
  let line = '';
  for (const w of String(s).split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${w}` : w;
    if (line && textWidth(next, fs) > maxW) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && textWidth(`${last}…`, fs) > maxW) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.trimEnd()}…`;
    return kept;
  }
  return lines;
}

/** 单侧标签避让：按期望 y 排序后逐个下推，越界再整体上推 */
function relax(items, top, bottom) {
  items.sort((a, b) => a.want - b.want);
  let y = top;
  for (const it of items) {
    it.y = Math.max(it.want - it.h / 2, y);
    y = it.y + it.h;
  }
  let limit = bottom;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.y + it.h > limit) it.y = limit - it.h;
    limit = it.y;
  }
}

export function createRadialTimeline(container, data) {
  const root = d3.select(container).classed('rt', true);
  const cats = data.categories || {};
  const catName = (k) => tf(cats, k) || '';
  const sep = t('：', ': ');
  const events = data.records
    .map((r, i) => ({ ...r, i, d: toDate(r.date), key: `${r.date}-${i}` }))
    .sort((a, b) => a.d - b.d)
    .map((r, i) => ({ ...r, n: i + 1 }));

  const grid = root.append('div').attr('class', 'rt__grid');
  const stage = grid.append('div').attr('class', 'rt__stage');
  const svg = createSvg(stage.node(), 'rt__svg').attr(
    'aria-label',
    tf(data, 'title') || t('时间线', 'Timeline'),
  );
  const card = grid.append('div').attr('class', 'rt__card').attr('aria-live', 'polite');
  const list = root.append('ol').attr('class', 'rt__list').attr('aria-label', t('事件列表', 'Event list'));
  legend(
    container,
    CAT_ORDER.filter((k) => events.some((e) => e.category === k)).map((k) => ({
      label: catName(k) || k,
      color: CAT_COLOR[k],
    })),
  );
  if (events.some((e) => e.date_precision))
    note(
      container,
      t(
        '注：仅确定到月 / 年的事件取该月 / 年内的占位日绘制，卡片中只显示到月 / 年。',
        'Note: events dated only to the month / year are plotted at a placeholder day within that month / year; cards show only the month / year.',
      ),
    );
  srTable(
    container,
    tf(data, 'title') || t('时间线', 'Timeline'),
    [t('日期', 'Date'), t('类别', 'Category'), t('事件', 'Event'), t('说明', 'Details')],
    events.map((e) => [
      formatEventDate(e),
      catName(e.category) || e.category,
      tf(e, 'title'),
      tf(e, 'detail'),
    ]),
  );

  const defs = svg.append('defs');
  const glowId = `rt-glow-${Math.random().toString(36).slice(2, 8)}`;
  const f = defs
    .append('filter')
    .attr('id', glowId)
    .attr('x', '-100%')
    .attr('y', '-100%')
    .attr('width', '300%')
    .attr('height', '300%');
  f.append('feGaussianBlur').attr('stdDeviation', 4).attr('result', 'b');
  const fm = f.append('feMerge');
  fm.append('feMergeNode').attr('in', 'b');
  fm.append('feMergeNode').attr('in', 'SourceGraphic');

  const g = svg.append('g');
  const gDecor = g.append('g').attr('class', 'rt__decor');
  const gYears = g.append('g').attr('class', 'rt__years');
  const gTrack = g.append('g').attr('class', 'rt__track');
  const gLeaders = g.append('g').attr('class', 'rt__leaders');
  const gLabels = g.append('g').attr('class', 'rt__labels');
  const gNodes = g.append('g').attr('class', 'rt__nodes');
  const gCenter = g.append('g').attr('class', 'rt__center').attr('aria-hidden', 'true');

  const t0 = d3.timeYear.floor(d3.min(events, (e) => e.d));
  const t1 = d3.timeYear.offset(d3.timeYear.floor(d3.max(events, (e) => e.d)), 1);
  const angle = d3.scaleTime().domain([t0, t1]).range([A0, A1]);
  const years = d3.timeYear.range(t0, t1);

  let width = 0;
  let wide = false;
  let activeCats = null;
  let selected = null;
  let hovered = null;
  let drawn = false;
  let geom = null;

  const isOn = (e) => !activeCats || activeCats.includes(e.category);

  function render() {
    if (!width) return;
    const sideBySide = width >= 980;
    grid.classed('is-side', sideBySide);
    const w = sideBySide ? width - 300 : width;
    wide = w >= 540;
    root.classed('is-wide', wide);
    const lw = wide ? Math.max(130, Math.min(200, w * 0.24)) : 0;
    const rw = wide ? (w - 2 * lw - 64) / 2 : w / 2 - 22;
    const h = wide
      ? chartHeight(2 * rw + 90, { aspect: 1, min: 380, max: 540 })
      : Math.round(Math.min(w, 420));
    svg.attr('viewBox', `0 0 ${w} ${h}`).attr('width', w).attr('height', h);
    const R = Math.min(rw, h / 2 - (wide ? 30 : 22));
    const cx = w / 2;
    const cy = h / 2 + (wide ? 4 : 0);
    g.attr('transform', `translate(${cx},${cy})`);
    geom = { w, h, R, lw, cx, cy };
    const animate = !drawn && !theme.reducedMotion;
    drawn = true;

    drawDecor(R);
    drawYears(R);
    drawTrack(R, animate);
    events.forEach((e) => {
      e.a = angle(e.d);
      [e.x, e.y] = polar(e.a, R);
    });
    drawNodes(R, animate);
    if (wide) drawLabels(R, animate);
    else {
      gLabels.selectAll('*').remove();
      gLeaders.selectAll('*').remove();
    }
    drawList();
    drawCenter();
    drawCard();
    applyState();
  }

  function drawDecor(R) {
    gDecor
      .selectAll('circle.rt__ring')
      .data([0.78, 0.56, 0.34])
      .join('circle')
      .attr('class', 'rt__ring')
      .attr('r', (k) => R * k);
    const spokes = d3.range(0, 360, 30).map((deg) => (deg / 180) * Math.PI);
    gDecor
      .selectAll('line.rt__spoke')
      .data(spokes)
      .join('line')
      .attr('class', 'rt__spoke')
      .attr('x1', (a) => polar(a, R * 0.34)[0])
      .attr('y1', (a) => polar(a, R * 0.34)[1])
      .attr('x2', (a) => polar(a, R * 0.78)[0])
      .attr('y2', (a) => polar(a, R * 0.78)[1]);
  }

  function drawYears(R) {
    const band = d3
      .arc()
      .innerRadius(R - (wide ? 26 : 20))
      .outerRadius(R - 6)
      .padAngle(0.012);
    const yrs = years.map((y, i) => ({
      y,
      i,
      a0: angle(y),
      a1: angle(d3.timeYear.offset(y, 1)),
    }));
    gYears
      .selectAll('path.rt__band')
      .data(yrs)
      .join('path')
      .attr('class', (d) => `rt__band ${d.i % 2 ? 'rt__band--odd' : ''}`)
      .attr('d', (d) => band({ startAngle: d.a0, endAngle: d.a1 }));
    const lr = R - (wide ? 44 : 34);
    gYears
      .selectAll('text.rt__year')
      .data(yrs)
      .join('text')
      .attr('class', 'rt__year')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('x', (d) => polar((d.a0 + d.a1) / 2, lr)[0])
      .attr('y', (d) => polar((d.a0 + d.a1) / 2, lr)[1])
      .text((d) => d.y.getFullYear());
    // 季度刻度
    const quarters = d3.timeMonth.every(3).range(t0, t1);
    gYears
      .selectAll('line.rt__tick')
      .data(quarters)
      .join('line')
      .attr('class', (d) => `rt__tick ${d.getMonth() === 0 ? 'rt__tick--year' : ''}`)
      .each(function (d) {
        const a = angle(d);
        const major = d.getMonth() === 0;
        const [x1, y1] = polar(a, R + (major ? 10 : 4));
        const [x2, y2] = polar(a, R - (major ? (wide ? 28 : 22) : 4));
        d3.select(this).attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2);
      });
  }

  function drawTrack(R, animate) {
    const arc = d3
      .arc()
      .innerRadius(R - 1.5)
      .outerRadius(R + 1.5)
      .cornerRadius(2);
    const track = gTrack
      .selectAll('path.rt__line')
      .data([0])
      .join('path')
      .attr('class', 'rt__line')
      .style('filter', `url(#${glowId})`);
    if (animate) {
      track
        .transition()
        .duration(1600)
        .ease(d3.easeCubicInOut)
        .attrTween('d', () => (t) => arc({ startAngle: A0, endAngle: A0 + (A1 - A0) * t }));
    } else track.interrupt().attr('d', arc({ startAngle: A0, endAngle: A1 }));
    // 起点圆点 + 终点箭头（顺时针为时间方向）
    const [sx, sy] = polar(A0, R);
    gTrack
      .selectAll('circle.rt__end')
      .data([0])
      .join('circle')
      .attr('class', 'rt__end')
      .attr('r', 3.5)
      .attr('cx', sx)
      .attr('cy', sy);
    const [ex, ey] = polar(A1, R);
    const deg = (A1 * 180) / Math.PI;
    gTrack
      .selectAll('path.rt__arrow')
      .data([0])
      .join('path')
      .attr('class', 'rt__arrow')
      .attr('d', 'M-5,4L0,-6L5,4Z')
      .attr('transform', `translate(${ex},${ey}) rotate(${deg + 90})`)
      .attr('opacity', animate ? 0 : 1)
      .call((s) => (animate ? s.transition().delay(1500).duration(300).attr('opacity', 1) : s));
  }

  function drawNodes(R, animate) {
    const nodeR = wide ? 7 : 10;
    const nodes = gNodes
      .selectAll('g.rt__node')
      .data(events, (d) => d.key)
      .join((enter) => {
        const n = enter.append('g').attr('class', 'rt__node').attr('role', 'button');
        n.append('circle').attr('class', 'rt__halo');
        n.append('circle').attr('class', 'rt__dot');
        n.append('text').attr('class', 'rt__num').attr('text-anchor', 'middle').attr('dy', '0.35em');
        return n;
      });
    nodes
      .attr(
        'aria-label',
        (d) => `${formatEventDate(d)}${t('，', ', ')}${catName(d.category)}${sep}${tf(d, 'title')}`,
      )
      .attr('transform', (d) => `translate(${d.x},${d.y})`)
      .call(
        bindTooltip,
        (d) =>
          `<strong>${tf(d, 'title')}</strong><br><em>${formatEventDate(d)} · ${catName(d.category)}</em>`,
      )
      .on('click.sel', (_, d) => select(d))
      .on('keydown.sel', (event, d) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          select(d);
        }
      })
      .on('pointerenter.hl focus.hl', (_, d) => {
        hovered = d;
        drawCenter();
      })
      .on('pointerleave.hl blur.hl', () => {
        hovered = null;
        drawCenter();
      });
    nodes
      .select('.rt__halo')
      .attr('r', nodeR + 7)
      .style('fill', (d) => CAT_COLOR[d.category]);
    nodes
      .select('.rt__dot')
      .attr('r', nodeR)
      .style('fill', (d) => CAT_COLOR[d.category]);
    nodes.select('.rt__num').text((d) => (wide ? '' : d.n));
    if (animate) {
      nodes
        .attr('opacity', 0)
        .transition()
        .delay((d) => 200 + ((d.a - A0) / (A1 - A0)) * 1400)
        .duration(400)
        .attr('opacity', null);
      nodes
        .select('.rt__dot')
        .attr('r', 0)
        .transition()
        .delay((d) => 200 + ((d.a - A0) / (A1 - A0)) * 1400)
        .duration(500)
        .ease(d3.easeBackOut.overshoot(2.4))
        .attr('r', nodeR);
    }
  }

  function drawLabels(R, animate) {
    const { w, h, lw } = geom;
    const fs = w < 700 ? 12 : 13;
    const lineH = fs + 4;
    const gutter = 26;
    const right = [];
    const left = [];
    events.forEach((e) => {
      const side = Math.sin(e.a) >= 0 ? 'r' : 'l';
      const lx = side === 'r' ? R + gutter : -(R + gutter);
      const maxW = w / 2 - Math.abs(lx) - 14;
      const lines = wrapText(tf(e, 'title'), Math.min(maxW, lw + 20), fs, isEn() ? 4 : 3);
      const it = { e, side, lx, lines, want: e.y, h: 16 + lines.length * lineH + 8 };
      (side === 'r' ? right : left).push(it);
    });
    relax(right, -h / 2 + 8, h / 2 - 8);
    relax(left, -h / 2 + 8, h / 2 - 8);
    const all = [...right, ...left];
    all.forEach((it) => (it.e.label = it));

    const labels = gLabels
      .selectAll('g.rt__label')
      .data(all, (d) => d.e.key)
      .join((enter) => {
        const lg = enter.append('g').attr('class', 'rt__label');
        lg.append('text').attr('class', 'rt__label-date');
        lg.append('text').attr('class', 'rt__label-title');
        return lg;
      });
    labels
      .attr('transform', (d) => `translate(${d.lx},${d.y})`)
      .attr('text-anchor', (d) => (d.side === 'r' ? 'start' : 'end'))
      .on('click', (_, d) => select(d.e));
    labels
      .select('.rt__label-date')
      .attr('y', 12)
      .style('fill', (d) => CAT_COLOR[d.e.category])
      .text((d) => `${shortDate(d.e)} · ${catName(d.e.category)}`);
    labels
      .select('.rt__label-title')
      .style('font-size', `${fs}px`)
      .selectAll('tspan')
      .data((d) => d.lines.map((l) => ({ l, x: 0 })))
      .join('tspan')
      .attr('x', 0)
      .attr('y', (_, i) => 16 + fs + i * lineH)
      .text((d) => d.l);

    const leader = (it) => {
      const e = it.e;
      const [x1, y1] = polar(e.a, R + 11);
      const [x2, y2] = polar(e.a, R + 18);
      const yy = it.y + 8;
      const xEnd = it.lx + (it.side === 'r' ? -6 : 6);
      return `M${x1},${y1}L${x2},${y2}L${xEnd},${yy}`;
    };
    const leaders = gLeaders
      .selectAll('path.rt__leader')
      .data(all, (d) => d.e.key)
      .join('path')
      .attr('class', 'rt__leader')
      .style('stroke', (d) => CAT_COLOR[d.e.category])
      .attr('d', leader);
    if (animate) {
      [labels, leaders].forEach((s) =>
        s
          .attr('opacity', 0)
          .transition()
          .delay((d) => 500 + ((d.e.a - A0) / (A1 - A0)) * 1400)
          .duration(500)
          .attr('opacity', null),
      );
    }
  }

  function drawList() {
    const items = list
      .classed('is-hidden', wide)
      .selectAll('li')
      .data(events, (d) => d.key)
      .join((enter) => {
        const li = enter.append('li');
        const b = li.append('button').attr('type', 'button').attr('class', 'rt__item');
        b.append('span').attr('class', 'rt__item-num');
        b.append('span').attr('class', 'rt__item-date');
        b.append('span').attr('class', 'rt__item-title');
        return li;
      });
    const btn = items.select('button');
    btn.attr('tabindex', wide ? -1 : null).on('click', (_, d) => select(d));
    btn
      .select('.rt__item-num')
      .style('background', (d) => CAT_COLOR[d.category])
      .text((d) => d.n);
    btn.select('.rt__item-date').text((d) => shortDate(d));
    btn.select('.rt__item-title').text((d) => tf(d, 'title'));
  }

  function drawCenter() {
    if (!geom) return;
    const { R } = geom;
    const d = hovered || selected;
    const fsBig = Math.max(16, Math.min(26, R * 0.16));
    const rows = d
      ? [
          { cls: 'rt__c-cat', text: catName(d.category), color: CAT_COLOR[d.category] },
          { cls: 'rt__c-big', text: shortDate(d) },
          ...wrapText(tf(d, 'title'), R * 1.05, 12, 2).map((l) => ({ cls: 'rt__c-sub', text: l })),
        ]
      : [
          { cls: 'rt__c-cat', text: t('时间跨度', 'Time span') },
          { cls: 'rt__c-big', text: `${t0.getFullYear()}—${d3.timeYear.offset(t1, -1).getFullYear()}` },
          ...(isEn()
            ? wrapText(wide ? 'Click a node or label for details' : 'Tap a node for details', R * 1.05, 12, 2)
            : [wide ? '点击节点或标签查看详情' : '点击节点查看详情']
          ).map((l) => ({ cls: 'rt__c-sub', text: l })),
        ];
    const step = [16, fsBig + 8, 16, 16];
    const total = rows.reduce((s, _, i) => s + (step[i] || 16), 0);
    let y = -total / 2 + 8;
    const ys = rows.map((_, i) => {
      const cur = y + (i === 1 ? fsBig * 0.35 : 0);
      y += step[i] || 16;
      return cur;
    });
    gCenter
      .selectAll('text')
      .data(rows)
      .join('text')
      .attr('class', (r) => r.cls)
      .attr('text-anchor', 'middle')
      .attr('y', (_, i) => ys[i] + (i === 1 ? fsBig * 0.3 : 0))
      .style('font-size', (r) => (r.cls === 'rt__c-big' ? `${fsBig}px` : null))
      .style('fill', (r) => r.color || null)
      .text((r) => r.text);
  }

  function drawCard() {
    card.selectAll('*').remove();
    card.classed('is-empty', !selected).style('--c', selected ? CAT_COLOR[selected.category] : null);
    if (!selected) {
      card.append('div').attr('class', 'rt__card-icon').attr('aria-hidden', 'true').text('◎');
      card
        .append('p')
        .attr('class', 'rt__card-hint')
        .text(
          t(
            '点击时间线上的节点（或按 Tab 聚焦后按 Enter），查看事件详情与原文摘录。',
            'Click a node on the timeline (or Tab to it and press Enter) to see event details and quoted excerpts.',
          ),
        );
      return;
    }
    const head = card.append('div').attr('class', 'rt__card-head');
    head
      .append('span')
      .attr('class', 'rt__card-cat')
      .text(catName(selected.category) || selected.category);
    head
      .append('time')
      .attr('class', 'rt__card-date')
      .attr('datetime', selected.date)
      .text(formatEventDate(selected));
    head
      .append('button')
      .attr('type', 'button')
      .attr('class', 'rt__card-close')
      .attr('aria-label', t('关闭详情', 'Close details'))
      .text('×')
      .on('click', () => select(null));
    card.append('h4').attr('class', 'rt__card-title').text(tf(selected, 'title'));
    card.append('p').attr('class', 'rt__card-detail').text(tf(selected, 'detail'));
    if (selected.date_precision) {
      card
        .append('p')
        .attr('class', 'rt__card-meta')
        .text(
          selected.date_precision === 'year'
            ? t('日期仅确定到年份', 'Date known only to the year')
            : t('日期仅确定到月份', 'Date known only to the month'),
        );
    }
  }

  function select(d) {
    selected = d;
    tooltip.hide();
    drawCard();
    drawCenter();
    applyState();
  }

  function applyState() {
    const dur = theme.duration;
    gNodes
      .selectAll('g.rt__node')
      .classed('is-on', (d) => !!activeCats && isOn(d))
      .classed('is-selected', (d) => d === selected)
      .attr('aria-pressed', (d) => d === selected)
      .transition()
      .duration(dur)
      .style('opacity', (d) => (isOn(d) ? 1 : 0.22));
    gLabels
      .selectAll('g.rt__label')
      .classed('is-selected', (d) => d.e === selected)
      .transition()
      .duration(dur)
      .style('opacity', (d) => (isOn(d.e) ? 1 : 0.2));
    gLeaders
      .selectAll('path.rt__leader')
      .transition()
      .duration(dur)
      .style('opacity', (d) => (isOn(d.e) ? 0.7 : 0.12));
    list
      .selectAll('li')
      .classed('is-dim', (d) => !isOn(d))
      .classed('is-selected', (d) => d === selected);
  }

  const pickFor = (step) => {
    if (step === 1)
      return (
        events.find((e) => e.date === '2024-01-31') || events.filter((e) => e.category === 'concept').pop()
      );
    if (step === 2) {
      const pol = events.filter((e) => e.category === 'policy');
      return pol.filter((e) => e.title.includes('人工智能+')).pop() || pol.pop();
    }
    if (step === 3) return events.find((e) => e.category === 'jobs');
    return null;
  };

  const stop = observeSize(container, ({ width: w }) => {
    width = w;
    render();
  });

  return {
    update(step) {
      const s = Math.max(0, Math.min(3, step | 0));
      activeCats = STEP_CATS[s];
      selected = pickFor(s) || null;
      drawCard();
      drawCenter();
      applyState();
    },
    resize() {
      width = container.clientWidth;
      render();
    },
    destroy() {
      stop();
      tooltip.hide();
      svg.selectAll('*').interrupt();
      root.selectAll('*').remove();
      root.classed('rt is-wide', false);
    },
  };
}
