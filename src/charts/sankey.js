// WIPO 生成式 AI 专利桑基图：国家（左）→ 专利池（中）→ 应用行业（右）
// 连线宽度仅取 WIPO 数值；“超过 2,000 项”的行业按下限 2,000 绘制并加斜线纹理
// update(step)：0 全部；1 高亮中国；2 高亮右侧行业（含下限说明）
import * as d3 from 'd3';
import { sankey } from 'd3-sankey';
import {
  observeSize,
  createSvg,
  chartHeight,
  tr,
  fmt,
  legend,
  note,
  srTable,
  hatch,
} from '../core/chartUtils.js';
import { bindTooltip } from '../core/tooltip.js';
import { GROUP_COLOR } from '../core/theme.js';
import { t, tf, isEn } from '../core/i18n.js';
import '../styles/charts/sankey.css';

const CENTER = '__pool__';
const LINE_H = 15;

/** 英文按单词折行，每行不超过 maxW（measure 返回文字宽度） */
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

export function createSankey(container, data, options = {}) {
  const root = d3.select(container).classed('sankey-chart', true);
  const en = isEn();
  const unit = tf(data, 'unit');
  const sep = t('：', ': ');
  const centerName = t(
    `生成式 AI 专利（${data.period_label}）`,
    `Generative AI patents (${data.period_label})`,
  );
  const svg = createSvg(container);
  const hatchUrl = hatch(svg, 'sankey-lb', 'var(--object)');
  const lbList = data.by_industry.filter((d) => d.lower_bound);
  const lbV = lbList.length ? fmt.int(lbList[0].value) : '';
  legend(root.node(), [
    { label: t('中国', 'China'), color: 'var(--cn)', shape: 'square' },
    { label: t('美国', 'United States'), color: 'var(--us)', shape: 'square' },
    { label: t('其他国家', 'Other countries'), color: 'var(--other)', shape: 'square' },
    { label: t('应用行业', 'Application areas'), color: 'var(--object)', shape: 'square' },
    // 仅当存在“只知下限”的行业时显示纹理图例
    ...(lbList.length
      ? [
          {
            label: t(`仅知下限（按 ${lbV} 绘制）`, `Lower bound only (drawn at ${lbV})`),
            color: 'var(--object)',
            shape: 'hatch',
          },
        ]
      : []),
  ]);
  const lbNote = lbList.length
    ? t(
        `报告对 ${lbList.length} 个行业只给出“超过 ${lbV} 项”，图中按下限 ${lbV} 绘制（斜线纹理、虚线描边），实际值更大。`,
        `For ${lbList.length} areas the report only says "more than ${lbV}"; they are drawn at the lower bound of ${lbV} (hatched, dashed outline) and the actual values are larger. `,
      )
    : '';
  note(
    container,
    t(
      `⚠ 左右两侧是对同一专利池的<strong>两种独立分类</strong>（左：国家，仅前 ${data.by_country.length} 名；右：应用行业，仅报告列出的 ${data.by_industry.length} 个），并非“国家流向行业”。一件专利可同时属于多个行业，两侧之和不相等，也都不等于专利总量。${lbNote}中间节点高度取左侧之和，仅用于布局。`,
      `⚠ The two sides are <strong>two independent classifications</strong> of the same patent pool (left: countries, top ${data.by_country.length} only; right: application areas, only the ${data.by_industry.length} listed in the report) — not flows from countries to industries. A patent can belong to several areas, so the two sides do not sum to the same total, and neither equals the total number of patents. ${lbNote}The height of the middle node is the sum of the left side and is used for layout only.`,
    ),
    'warn',
  );
  srTable(
    container,
    t(
      `WIPO 生成式 AI 专利（${data.period_label}，单位：${unit}）`,
      `WIPO generative AI patents (${data.period_label}, unit: ${unit})`,
    ),
    [t('分类', 'Classification'), t('名称', 'Name'), t('数值', 'Value'), t('是否下限', 'Lower bound?')],
    [
      ...data.by_country.map((c) => [t('国家', 'Country'), tf(c, 'name'), c.value, t('否', 'No')]),
      ...data.by_industry.map((c) => [
        t('行业', 'Application area'),
        tf(c, 'name'),
        c.value,
        c.lower_bound ? t('是（超过该值）', 'Yes (more than this value)') : t('否', 'No'),
      ]),
    ],
  );

  const linksG = svg.append('g');
  const nodesG = svg.append('g');
  const colG = svg.append('g');

  const countryColor = (code) =>
    code === 'CN' ? GROUP_COLOR.CN : code === 'US' ? GROUP_COLOR.US : 'var(--other)';
  // 节点标签中的数值：英文标签只写 “≥2,000”，“lower bound” 见图例与提示框
  const valText = (d) =>
    d.lower_bound ? t(`≥${fmt.int(d.value)}（下限）`, `≥${fmt.int(d.value)}`) : fmt.int(d.value);
  const valTextFull = (d) =>
    d.lower_bound
      ? t(`≥${fmt.int(d.value)}（下限）`, `≥${fmt.int(d.value)} (lower bound)`)
      : fmt.int(d.value);

  let width = 0;
  let step = options.step != null ? +options.step : 0;
  let hoverId = null;

  function build() {
    const nodes = [
      ...data.by_country.map((c) => ({
        id: `c-${c.code}`,
        side: 'left',
        name: tf(c, 'name'),
        value0: c.value,
        src: c,
        color: countryColor(c.code),
        cn: c.code === 'CN',
      })),
      { id: CENTER, side: 'center', name: centerName, color: 'var(--object)' },
      ...data.by_industry.map((c, i) => ({
        id: `i-${i}`,
        side: 'right',
        name: tf(c, 'name'),
        value0: c.value,
        src: c,
        color: 'var(--object)',
        lb: c.lower_bound,
      })),
    ];
    const links = [
      ...data.by_country.map((c) => ({
        source: `c-${c.code}`,
        target: CENTER,
        value: c.value,
        src: c,
        color: countryColor(c.code),
        cn: c.code === 'CN',
      })),
      ...data.by_industry.map((c, i) => ({
        source: CENTER,
        target: `i-${i}`,
        value: c.value,
        src: c,
        color: 'var(--object)',
        lb: c.lower_bound,
      })),
    ];
    return { nodes, links };
  }

  function linkArea(l) {
    const w = l.width;
    const x0 = l.source.x1;
    const x1 = l.target.x0;
    const mx = (x0 + x1) / 2;
    const a = l.y0;
    const b = l.y1;
    return `M${x0},${a - w / 2}C${mx},${a - w / 2} ${mx},${b - w / 2} ${x1},${b - w / 2}L${x1},${b + w / 2}C${mx},${b + w / 2} ${mx},${a + w / 2} ${x0},${a + w / 2}Z`;
  }

  /** 英文：按标签实际宽度加宽左右边距（中文保持固定边距） */
  function sideMargins(narrow, base) {
    if (!en) return base;
    const probe = nodesG.append('text').attr('class', 'node__name');
    const probeV = nodesG.append('text').attr('class', 'node__value');
    const mName = (s) => probe.text(s).node().getComputedTextLength();
    const mVal = (s) => probeV.text(s).node().getComputedTextLength();
    const need = (list) =>
      d3.max(list, (c) =>
        narrow
          ? Math.max(mName(tf(c, 'name')), mVal(valText(c)))
          : mName(tf(c, 'name')) + 6 + mVal(valText(c)),
      ) + 14;
    const left = Math.min(Math.max(base.left, need(data.by_country)), width * (narrow ? 0.26 : 0.24));
    const right = Math.min(Math.max(base.right, need(data.by_industry)), width * (narrow ? 0.38 : 0.32));
    probe.remove();
    probeV.remove();
    return { ...base, left, right };
  }

  function render(animate) {
    if (!width) return;
    const narrow = width < 560;
    const height = chartHeight(width, {
      aspect: 0.56,
      min: narrow ? (en ? 540 : 460) : 380,
      max: narrow && en ? 560 : 520,
    });
    const margin = sideMargins(narrow, {
      top: 46,
      right: narrow ? 104 : 196,
      bottom: narrow ? 18 : 10,
      left: narrow ? 64 : 120,
    });
    const iw = width - margin.left - margin.right;
    const ih = height - margin.top - margin.bottom;
    svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);

    const graph = build();
    const layout = sankey()
      .nodeId((d) => d.id)
      .nodeWidth(narrow ? 10 : 14)
      .nodePadding(narrow ? 10 : 14)
      .nodeSort(null)
      .linkSort(null)
      .extent([
        [margin.left, margin.top],
        [margin.left + iw, margin.top + ih],
      ]);
    const g = layout(graph);

    // 右列：保持数据顺序，按需加大间距以容纳标签，并垂直居中
    const right = g.nodes.filter((n) => n.side === 'right');
    const minRow = narrow ? 30 : 22;
    const rooms = right.map((n) => Math.max(n.y1 - n.y0, minRow));
    const sumRoom = d3.sum(rooms);
    const gap = Math.max(4, Math.min(40, (ih - sumRoom) / Math.max(1, right.length - 1)));
    let y = margin.top + Math.max(0, (ih - sumRoom - gap * (right.length - 1)) / 2);
    right.forEach((n, i) => {
      const h = n.y1 - n.y0;
      n.y0 = y + (rooms[i] - h) / 2;
      n.y1 = n.y0 + h;
      y += rooms[i] + gap;
    });
    // 左列与中心节点保持 d3-sankey 计算结果；重算连线端点
    layout.update(g);

    const tt = (sel, delay) => (animate ? tr(sel, delay) : sel);

    // 连线
    const linkSel = linksG
      .selectAll('path.link')
      .data(g.links, (l) => `${l.source.id}>${l.target.id}`)
      .join('path')
      .attr('class', (l) => `link${l.lb ? ' link--lb' : ''}`)
      .style('fill', (l) => (l.lb ? hatchUrl : l.color))
      .style('stroke', (l) => (l.lb ? 'var(--object)' : 'none'));
    tt(linkSel).attr('d', linkArea);
    linkSel.call(bindTooltip, (l) => {
      const leftSide = l.source.side === 'left';
      return `<strong>${leftSide ? l.source.name : l.target.name}</strong><br>${leftSide ? t('国家分类', 'By country') : t('行业分类', 'By application area')}${sep}${valTextFull(l.src)} ${unit}<br><em>${t(`WIPO 专利态势报告（${data.period_label}）`, `WIPO Patent Landscape Report (${data.period_label})`)}</em>`;
    });

    // 节点
    const nodeSel = nodesG
      .selectAll('g.node')
      .data(g.nodes, (n) => n.id)
      .join((enter) => {
        const ng = enter.append('g');
        ng.append('rect');
        ng.append('text').attr('class', 'node__name');
        ng.append('text').attr('class', 'node__value');
        return ng;
      })
      .attr('class', (n) => `node node--${n.side}${n.lb ? ' node--lb' : ''}${n.cn ? ' node--cn' : ''}`);
    nodeSel
      .select('rect')
      .attr('rx', 2)
      .style('fill', (n) => (n.lb ? hatchUrl : n.color))
      .style('stroke', (n) => (n.lb ? 'var(--object)' : 'none'));
    tt(nodeSel.select('rect'))
      .attr('x', (n) => n.x0)
      .attr('y', (n) => n.y0)
      .attr('width', (n) => n.x1 - n.x0)
      .attr('height', (n) => Math.max(1, n.y1 - n.y0));

    // 名称折行（仅英文）：可用宽度为该侧边距
    const twoLine = narrow;
    nodeSel.each(function (n) {
      n.lines = [n.name];
      if (!en || n.side === 'center') return;
      const nameEl = d3.select(this).select('.node__name');
      const valEl = d3.select(this).select('.node__value');
      const measure = (s) => nameEl.text(s).node().getComputedTextLength();
      const room = (n.side === 'left' ? margin.left : margin.right) - 12;
      const maxW = twoLine ? room : room - 6 - valEl.text(valText(n.src)).node().getComputedTextLength();
      // 宽屏单行放不下时改为“名称（可折行）+ 下一行数值”
      if (!twoLine && measure(n.name) > maxW) n.stack = true;
      n.lines = wrapWords(n.name, n.stack ? room : maxW, measure);
    });
    // 标签块高度：中文单行 15 / 两行 30，与原固定间距（17 / 32）一致
    const blockH = (n) => LINE_H * (n.lines.length + (twoLine || n.stack ? 1 : 0));

    // 标签纵向避让：同侧按中心排序，保证相邻标签块不重叠
    ['left', 'right'].forEach((side) => {
      const ns = g.nodes.filter((n) => n.side === side).sort((p, q) => p.y0 - q.y0);
      const gapOf = (a, b) => (blockH(a) + blockH(b)) / 2 + 2;
      ns.forEach((n, i) => {
        n.ly = (n.y0 + n.y1) / 2;
        if (i > 0) n.ly = Math.max(n.ly, ns[i - 1].ly + gapOf(ns[i - 1], n));
      });
      for (let i = ns.length - 1; i >= 0; i -= 1) {
        const n = ns[i];
        const base = LINE_H * (twoLine ? 2 : 1);
        const bottom = margin.top + ih - (twoLine ? 14 : 4) - (blockH(n) - base) / 2;
        const lim = i === ns.length - 1 ? bottom : ns[i + 1].ly - gapOf(n, ns[i + 1]);
        if (n.ly > lim) n.ly = lim;
      }
    });

    nodeSel.each(function (n) {
      const ng = d3.select(this);
      const name = ng.select('.node__name');
      const val = ng.select('.node__value');
      if (n.side === 'center') {
        name.text('');
        val.text('');
        return;
      }
      const cy = n.ly;
      const left = n.side === 'left';
      const x = left ? n.x0 - 8 : n.x1 + 8;
      const anchor = left ? 'end' : 'start';
      name.attr('text-anchor', anchor).text(null);
      name
        .selectAll('tspan')
        .data(n.lines)
        .join('tspan')
        .attr('x', x)
        .attr('dy', (_, j) => (j ? LINE_H : null))
        .text((s) => s);
      val.attr('text-anchor', anchor).classed('is-lb', !!n.lb).text(valText(n.src));
      const k = n.lines.length;
      if (twoLine || n.stack) {
        const y0 = cy - 2 - ((k - 1) * LINE_H) / 2;
        name.attr('x', x).attr('y', y0);
        val.attr('x', x).attr('y', y0 + k * LINE_H);
      } else if (left) {
        val.attr('x', x).attr('y', cy + 4);
        const nx = x - val.node().getComputedTextLength() - 6;
        name.attr('x', nx).attr('y', cy + 4);
        name.selectAll('tspan').attr('x', nx);
      } else {
        name.attr('x', x).attr('y', cy + 4);
        val.attr('x', x + name.node().getComputedTextLength() + 8).attr('y', cy + 4);
      }
    });
    nodeSel
      .on('pointerenter.hl focus.hl', (_, n) => setHover(n.id))
      .on('pointerleave.hl blur.hl', () => setHover(null))
      .attr('tabindex', 0)
      .attr('aria-label', (n) =>
        n.side === 'center' ? centerName : `${n.name}${sep}${valTextFull(n.src)} ${unit}`,
      );

    // 中心标签与列标题
    const c = g.nodes.find((n) => n.id === CENTER);
    const cx = (c.x0 + c.x1) / 2;
    const colData = [
      {
        x: d3.min(
          g.nodes.filter((n) => n.side === 'left'),
          (n) => n.x0,
        ),
        text: t('按国家', 'By country'),
        anchor: 'end',
      },
      {
        x: cx,
        text: narrow ? t('生成式 AI 专利', 'GenAI patents') : centerName,
        anchor: 'middle',
        center: true,
      },
      { x: d3.max(right, (n) => n.x1), text: t('按应用行业', 'By application area'), anchor: 'start' },
    ];
    colG
      .selectAll('text')
      .data(colData)
      .join('text')
      .attr('class', (d) => (d.center ? 'center-label' : 'col-label'))
      .attr('x', (d) => (d.anchor === 'end' ? d.x + 10 + 4 : d.anchor === 'start' ? d.x - 10 - 4 : d.x))
      // 英文窄屏：左右列标题下移一行，避免与中间标题重叠
      .attr('y', (d) => (d.center || !(narrow && en) ? margin.top - 26 : margin.top - 10))
      .attr('text-anchor', (d) => (d.anchor === 'middle' ? 'middle' : d.anchor === 'end' ? 'end' : 'start'))
      .text((d) => d.text);
    if (narrow)
      colG
        .selectAll('text.center-sub')
        .data([data.period_label])
        .join('text')
        .attr('class', 'col-label center-sub')
        .attr('x', cx)
        .attr('y', margin.top - 10)
        .attr('text-anchor', 'middle')
        .text((d) => t(`（${d}）`, `(${d})`));
    else colG.selectAll('text.center-sub').remove();

    applyHighlight();
  }

  function setHover(id) {
    hoverId = id;
    applyHighlight();
  }

  function applyHighlight() {
    const links = linksG.selectAll('path.link');
    const nodes = nodesG.selectAll('g.node');
    let on = null;
    if (hoverId) {
      on = (l) => hoverId === CENTER || l.source.id === hoverId || l.target.id === hoverId;
    } else if (step === 1) on = (l) => l.cn;
    else if (step >= 2) on = (l) => l.source.id === CENTER;
    root.classed('is-hover', !!on);
    if (!on) {
      links.classed('is-on', false);
      nodes.classed('is-on', false);
      return;
    }
    links.classed('is-on', on);
    const ids = new Set();
    links.filter(on).each((l) => {
      ids.add(l.source.id);
      ids.add(l.target.id);
    });
    nodes.classed('is-on', (n) => ids.has(n.id));
  }

  const stop = observeSize(container, ({ width: w }) => {
    width = w;
    render(false);
  });

  return {
    update(s) {
      step = s;
      applyHighlight();
    },
    resize() {
      width = container.clientWidth;
      render(false);
    },
    destroy() {
      stop();
      root.selectAll('*').interrupt().remove();
      root.classed('sankey-chart is-hover', false);
    },
  };
}
