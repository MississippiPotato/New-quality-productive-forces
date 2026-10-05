// 图表公共工具：尺寸监听、格式化、图例、纹理、离屏检测
import * as d3 from 'd3';
import { theme } from './theme.js';
import { isEn } from './i18n.js';

/** 监听容器宽度变化（去抖），立即以当前尺寸调用一次。返回取消函数。 */
export function observeSize(container, cb) {
  let last = -1;
  let raf = 0;
  const fire = () => {
    const w = Math.floor(container.clientWidth);
    if (w > 0 && w !== last) {
      last = w;
      cb({ width: w, height: container.clientHeight });
    }
  };
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(fire);
  });
  ro.observe(container);
  fire();
  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
  };
}

/** 监听元素是否在视口内（用于暂停 rAF 动画） */
export function observeVisible(el, cb, rootMargin = '0px') {
  const io = new IntersectionObserver(([entry]) => cb(entry.isIntersecting), { rootMargin });
  io.observe(el);
  return () => io.disconnect();
}

/** 创建响应式 svg：宽度跟随容器，高度 = clamp(width * aspect, min, max) */
export function createSvg(container, className = '') {
  return d3
    .select(container)
    .append('svg')
    .attr('class', `chart ${className}`.trim())
    .attr('role', 'img');
}

export function chartHeight(width, { aspect = 0.6, min = 280, max = 560 } = {}) {
  return Math.round(Math.max(min, Math.min(max, width * aspect)));
}

/** 统一过渡 */
export function tr(selection, delay = 0) {
  return selection.transition().duration(theme.duration).delay(theme.reducedMotion ? 0 : delay).ease(theme.ease);
}

// ---------- 数字格式化（中文） ----------
const nf = d3.format(',');
export const fmt = {
  int: (v) => (v == null ? '—' : nf(Math.round(v))),
  num: (v, digits = 1) => (v == null ? '—' : d3.format(`,.${digits}~f`)(v)),
  pct: (v, digits = 1) => (v == null ? '—' : `${d3.format(`.${digits}~f`)(v)}%`),
  /** 1.2e25 → “1.2×10²⁵” */
  sci(v) {
    if (v == null) return '—';
    const e = Math.floor(Math.log10(v));
    const m = v / 10 ** e;
    const sup = String(e)
      .split('')
      .map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'['0123456789'.indexOf(c)] ?? (c === '-' ? '⁻' : c))
      .join('');
    return `${d3.format('.2~f')(m)}×10${sup}`;
  },
  /** 中文大数：12000 亿 → “1.2 万亿”；参数单位为“个” */
  cn(v) {
    if (v == null) return '—';
    const a = Math.abs(v);
    if (isEn()) {
      if (a >= 1e12) return `${d3.format('.3~f')(v / 1e12)} trillion`;
      if (a >= 1e9) return `${d3.format('.3~f')(v / 1e9)} billion`;
      if (a >= 1e6) return `${d3.format('.3~f')(v / 1e6)} million`;
      return nf(v);
    }
    if (a >= 1e12) return `${d3.format('.3~f')(v / 1e12)} 万亿`;
    if (a >= 1e8) return `${d3.format('.3~f')(v / 1e8)} 亿`;
    if (a >= 1e4) return `${d3.format('.3~f')(v / 1e4)} 万`;
    return nf(v);
  },
  date: (d) => d3.timeFormat('%Y-%m-%d')(d),
  month: (d) => d3.timeFormat(isEn() ? '%b %Y' : '%Y 年 %-m 月')(d),
  /** 按原始字符串的精度显示：'2025' → 2025 年；'2025-06' / '2025-06-30' → 2025 年 6 月 */
  period(s) {
    const m = String(s).match(/^(\d{4})(?:-(\d{2}))?/);
    if (!m) return String(s);
    if (isEn()) return m[2] ? d3.timeFormat('%b %Y')(new Date(+m[1], +m[2] - 1, 1)) : m[1];
    return m[2] ? `${m[1]} 年 ${+m[2]} 月` : `${m[1]} 年`;
  },
};

/** HTML 图例：items = [{label, color, shape: 'dot'|'line'|'dash'|'hatch'|'square'}] */
export function legend(container, items, className = '') {
  const wrap = d3
    .select(container)
    .append('div')
    .attr('class', `legend ${className}`.trim());
  const item = wrap
    .selectAll('span.legend__item')
    .data(items)
    .join('span')
    .attr('class', (d) => `legend__item legend__item--${d.shape || 'dot'}`);
  item
    .append('i')
    .attr('class', 'legend__swatch')
    .style('--c', (d) => d.color);
  item.append('span').text((d) => d.label);
  return wrap;
}

/** 斜线纹理（预测/初步测算），返回 url(#id) */
export function hatch(svg, id, c = 'var(--hatch)') {
  let defs = svg.select('defs');
  if (defs.empty()) defs = svg.append('defs');
  if (defs.select(`#${id}`).empty()) {
    const p = defs
      .append('pattern')
      .attr('id', id)
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('width', 6)
      .attr('height', 6)
      .attr('patternTransform', 'rotate(45)');
    p.append('rect').attr('width', 6).attr('height', 6).style('fill', 'var(--panel)');
    p.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 6).style('stroke', c).style('stroke-width', 3);
  }
  return `url(#${id})`;
}

/** 图下方的口径提示条 */
export function note(container, html, kind = 'info') {
  return d3.select(container).append('p').attr('class', `chart-note chart-note--${kind}`).html(html);
}

/** 屏幕阅读器用的数据表摘要 */
export function srTable(container, caption, columns, rows) {
  // 表格元素上的 overflow:hidden 不可靠，外包一层 div 才能真正隐藏
  const t = d3.select(container).append('div').attr('class', 'sr-only').append('table');
  t.append('caption').text(caption);
  t.append('tr')
    .selectAll('th')
    .data(columns)
    .join('th')
    .text((d) => d);
  t.selectAll('tr.r')
    .data(rows)
    .join('tr')
    .attr('class', 'r')
    .selectAll('td')
    .data((r) => r)
    .join('td')
    .text((d) => d);
  return t;
}

/** 坐标轴美化：去掉 domain 线、网格线淡化 */
export function styleAxis(g, { grid = false, size = 0 } = {}) {
  g.attr('class', `${g.attr('class') || ''} axis`.trim());
  g.select('.domain').remove();
  if (grid) g.selectAll('.tick line').attr('class', 'grid-line').attr(size < 0 ? 'x2' : 'y2', size);
  return g;
}

export const parseDate = d3.timeParse('%Y-%m-%d');
export function toDate(s) {
  if (s instanceof Date) return s;
  const str = String(s);
  if (/^\d{4}$/.test(str)) return new Date(+str, 6, 1);
  if (/^\d{4}-\d{2}$/.test(str)) return new Date(+str.slice(0, 4), +str.slice(5, 7) - 1, 15);
  return parseDate(str);
}
