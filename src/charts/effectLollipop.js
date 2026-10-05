// 生成式 AI 生产率实证：分领域横向棒棒糖图
// 有利效应向右（绿），不利效应向左（玫红）；点击 / Enter 展开研究详情
// update(step)：0 主要研究（不含新手子样本与反例）；1 高亮客服新手 vs 全体；2 揭示 METR 反例
import * as d3 from 'd3';
import { observeSize, createSvg, tr, fmt, legend, note, styleAxis, srTable } from '../core/chartUtils.js';
import { t, tf, isEn } from '../core/i18n.js';
import '../styles/charts/effectLollipop.css';

// 语言在图表创建时读取；切换语言时 figure.js 会重建图表
const domainLabel = () => ({
  customer_service: t('客服', 'Customer service'),
  coding: t('编程', 'Coding'),
  writing: t('写作', 'Writing'),
});
const stages = () => [
  { step: 0, label: t('主要研究', 'Main studies') },
  { step: 1, label: t('新手 vs 全体', 'Novices vs all') },
  { step: 2, label: t('反例', 'Counter-example') },
];
const isNovice = (d) => /_novice$/.test(d.id);
const isHarm = (d) => d.direction === 'harm';
const colorOf = (d) => (isHarm(d) ? 'var(--rose)' : 'var(--green)');

/** 数值标签：由 metric 与 effect 拼出，不引入新数字（据中文 metric 字段判断是否为时间指标） */
function valueText(d) {
  const v = fmt.num(d.effect, 1);
  const timeMetric = /时间/.test(d.metric);
  if (isHarm(d)) return timeMetric ? t(`耗时 +${v}%`, `time +${v}%`) : `−${v}%`;
  if (/缩短/.test(d.metric)) return t(`耗时 −${v}%`, `time −${v}%`);
  return `+${v}%`;
}

/** 95% 置信区间（与 effect 同号约定；不利方向画在左侧） */
const hasCi = (d) => d.ci_low != null && d.ci_high != null;
const ciSigned = (d) => {
  const s = isHarm(d) ? -1 : 1;
  return [s * d.ci_low, s * d.ci_high].sort((a, b) => a - b);
};
/** 原文区间不是百分比单位（标准差、次/小时）时只以文字给出，不画须线 */
function ciText(d) {
  if (!hasCi(d)) return d.ci_native ? tf(d, 'ci_native') : '';
  const range = `${fmt.num(d.ci_low, 1)}%–${fmt.num(d.ci_high, 1)}%`;
  const derived = d.ci_derived ? t('（本站推算）', ' (derived by this site)') : '';
  return `${range}${derived}`;
}

/** 样本量：中文“5179名客服”；英文“5,179 agents” */
const sampleText = (d) =>
  isEn() ? `${fmt.int(d.sample)} ${tf(d, 'sample_unit')}` : `${d.sample}${d.sample_unit}`;

/** 英文标签超出 maxW 时截断加省略号（中文不处理，保持原样） */
function ellipsize(el, maxW) {
  if (!isEn() || !el || maxW <= 0) return;
  const full = el.textContent;
  if (el.getComputedTextLength() <= maxW) return;
  let lo = 0;
  let hi = full.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    el.textContent = `${full.slice(0, mid).trimEnd()}…`;
    if (el.getComputedTextLength() <= maxW) lo = mid;
    else hi = mid - 1;
  }
  el.textContent = `${full.slice(0, lo).trimEnd()}…`;
}

export function createEffectLollipop(container, data, options = {}) {
  const root = d3.select(container).classed('effect-lollipop', true);
  const DOMAIN_LABEL = domainLabel();
  const STAGES = stages();
  const sep = t('：', ': ');
  const records = data.records.map((d) => ({ ...d, signed: isHarm(d) ? -d.effect : d.effect }));
  const domains = [...new Set(records.map((d) => d.domain))];

  const controls = root
    .append('div')
    .attr('class', 'seg')
    .attr('role', 'tablist')
    .attr('aria-label', t('叙事阶段', 'Story stage'));
  root
    .append('p')
    .attr('class', 'effect-lollipop__hint')
    .text(
      t(
        '点击或按 Enter 展开每项研究的样本与设计',
        'Click a row (or press Enter) to see the sample and design of each study',
      ),
    );
  const svg = createSvg(container);
  const detail = root
    .append('div')
    .attr('class', 'effect-lollipop__detail')
    .attr('role', 'region')
    .attr('aria-live', 'polite');
  const legendWrap = root.append('div');
  const hasCI = records.some(hasCi);
  legend(legendWrap.node(), [
    { label: t('对生产率有利', 'Raises productivity'), color: 'var(--green)', shape: 'dot' },
    {
      label: t('对生产率不利（反例）', 'Lowers productivity (counter-example)'),
      color: 'var(--rose)',
      shape: 'dot',
    },
    ...(hasCI ? [{ label: t('95% 置信区间', '95% CI'), color: 'var(--muted)', shape: 'line' }] : []),
  ]);
  // 脚注取自数据 notes，去掉字段名解释句（英文缺 notes_en 时回退的中文仍按“。”切分）
  const notesText = String(tf(data, 'notes') || '');
  const keep = (x) => x && !x.includes('=') && !/^effect/.test(x);
  const cnNotes = /。/.test(notesText);
  const caveat = cnNotes
    ? `${notesText.split('。').filter(keep).join('。')}。`
    : notesText
        .split(/(?<=\.)\s+/)
        .filter(keep)
        .join(' ');
  // 数据说明未提及置信区间时补一句
  const ciNote =
    hasCI && !/置信区间|confidence interval/i.test(notesText)
      ? t(
          '细线为 95% 置信区间，仅在原文报告（或可由原文推算）时显示。',
          ' Whiskers show 95% confidence intervals, only where the original study reports them (or they can be derived from it).',
        )
      : '';
  note(container, `${t('⚠ 不可直接比较：', '⚠ Not directly comparable: ')}${caveat}${ciNote}`, 'warn');
  srTable(
    container,
    tf(data, 'title'),
    [
      t('研究', 'Study'),
      t('对象', 'Subjects'),
      t('指标', 'Metric'),
      t('效应（%）', 'Effect (%)'),
      t('方向', 'Direction'),
      t('样本', 'Sample'),
      t('95% 置信区间', '95% CI'),
    ],
    records.map((r) => [
      tf(r, 'study'),
      tf(r, 'short'),
      tf(r, 'metric'),
      r.effect,
      r.direction === 'harm' ? t('不利', 'Unfavourable') : t('有利', 'Favourable'),
      r.sample ? sampleText(r) : '—',
      ciText(r) || '—',
    ]),
  );

  const gx = svg.append('g').attr('class', 'x-axis');
  const plot = svg.append('g');
  const gridG = plot.append('g');
  const zero = plot.append('line').attr('class', 'zero-line');
  const dirL = plot.append('text').attr('class', 'dir-label').attr('text-anchor', 'end');
  const dirR = plot.append('text').attr('class', 'dir-label');
  const groupsG = plot.append('g');
  const rowsG = plot.append('g');
  const annotG = plot.append('g');

  let width = 0;
  let step = options.step != null ? +options.step : 0;
  let openId = null;
  let detailH = 0;

  controls
    .selectAll('button')
    .data(STAGES)
    .join('button')
    .attr('type', 'button')
    .attr('role', 'tab')
    .text((d) => d.label)
    .on('click', (_, d) => {
      step = d.step;
      render(true);
    });

  const visibleRows = () =>
    records.filter((d) => (step >= 2 ? true : step === 1 ? !isHarm(d) : !isHarm(d) && !isNovice(d)));
  const emphasis = (d) => {
    if (step === 1) return d.domain === 'customer_service' ? 1 : 0.28;
    if (step >= 2) return isHarm(d) ? 1 : 0.4;
    return 1;
  };

  function layout(rows, wide) {
    const rowH = wide ? 40 : 52;
    const headH = 30;
    const out = [];
    const heads = [];
    let y = 0;
    domains.forEach((dom) => {
      const rs = rows.filter((r) => r.domain === dom);
      if (!rs.length) return;
      heads.push({ domain: dom, y });
      y += headH;
      rs.forEach((r) => {
        out.push({ d: r, y, h: rowH });
        y += rowH;
        if (r.id === openId) y += detailH + 8;
      });
      y += 6;
    });
    return { rows: out, heads, total: y };
  }

  function render(animate) {
    if (!width) return;
    const tt = (sel, delay) => (animate ? tr(sel, delay) : sel);
    controls
      .selectAll('button')
      .classed('is-active', (d) => d.step === Math.min(step, 2))
      .attr('aria-selected', (d) => d.step === Math.min(step, 2));

    const wide = width >= 600;
    // 英文标签更长：标签列略加宽
    const labelW = wide ? (isEn() ? Math.min(280, width * 0.31) : Math.min(230, width * 0.27)) : 0;
    const margin = { top: 22, right: wide ? 70 : 64, bottom: 34, left: labelW + 8 };
    const iw = width - margin.left - margin.right;
    const rows = visibleRows();
    if (openId && !rows.some((r) => r.id === openId)) closeDetail(false);
    const L = layout(rows, wide);
    const ih = L.total;
    const height = margin.top + ih + margin.bottom;

    if (animate && svg.attr('height')) tt(svg).attr('height', height);
    else svg.attr('height', height);
    svg.attr('width', width);
    plot.attr('transform', `translate(${margin.left},${margin.top})`);

    // 比例尺范围同时容纳点值与置信区间端点
    const minV = d3.min(records, (d) => Math.min(d.signed, hasCi(d) ? ciSigned(d)[0] : d.signed));
    const maxV = d3.max(records, (d) => Math.max(d.signed, hasCi(d) ? ciSigned(d)[1] : d.signed));
    const x = d3
      .scaleLinear()
      .domain([Math.min(minV * 1.25, -maxV * 0.2), maxV * 1.1])
      .range([0, iw]);

    gx.attr('transform', `translate(${margin.left},${margin.top + ih + 6})`);
    tt(gx).call(
      d3
        .axisBottom(x)
        .ticks(wide ? 8 : 5)
        .tickSize(0)
        .tickPadding(8)
        .tickFormat((v) => `${v > 0 ? '+' : ''}${v}%`),
    );
    styleAxis(gx);

    tt(
      gridG
        .selectAll('line')
        .data(x.ticks(wide ? 8 : 5))
        .join('line')
        .attr('class', 'grid-line'),
    )
      .attr('x1', (v) => x(v))
      .attr('x2', (v) => x(v))
      .attr('y1', -6)
      .attr('y2', ih + 6);
    tt(zero)
      .attr('x1', x(0))
      .attr('x2', x(0))
      .attr('y1', -14)
      .attr('y2', ih + 6);
    dirL
      .attr('x', x(0) - 8)
      .attr('y', -6)
      .text(t('← 不利', '← Worse'));
    dirR
      .attr('x', x(0) + 8)
      .attr('y', -6)
      .text(t('有利 →', 'Better →'));

    // 分组标题
    const heads = groupsG
      .selectAll('g.group')
      .data(L.heads, (d) => d.domain)
      .join((enter) => {
        const g = enter.append('g').attr('class', 'group').attr('opacity', 0);
        g.append('text').attr('class', 'group__label').attr('dy', 15);
        g.append('line').attr('class', 'group__rule');
        return g;
      });
    heads
      .select('text')
      .attr('x', -labelW)
      .text((d) => DOMAIN_LABEL[d.domain] || d.domain);
    heads
      .select('line')
      // 规则线接在分组标题之后（中文两字时为 34px）
      .attr('x1', function () {
        const len = this.parentNode.querySelector('.group__label').getComputedTextLength();
        return -labelW + Math.max(34, len + 12);
      })
      .attr('x2', iw)
      .attr('y1', 10)
      .attr('y2', 10);
    tt(heads)
      .attr('opacity', 1)
      .attr('transform', (d) => `translate(0,${d.y})`);

    // 行
    const rowSel = rowsG
      .selectAll('g.row')
      .data(L.rows, (r) => r.d.id)
      .join(
        (enter) => {
          const g = enter
            .append('g')
            .attr('class', 'row')
            .attr('role', 'button')
            .attr('tabindex', 0)
            .attr('opacity', 0)
            .attr('transform', (r) => `translate(0,${r.y})`);
          g.append('rect').attr('class', 'row__hit');
          g.append('text').attr('class', 'row__name');
          g.append('text').attr('class', 'row__metric');
          g.append('text').attr('class', 'row__caret').text('▸');
          g.append('path')
            .attr('class', 'row__ci')
            .attr('opacity', 0)
            .style('fill', 'none')
            .style('stroke-width', 1.4);
          g.append('line')
            .attr('class', 'row__stem')
            .attr('x1', x(0))
            .attr('x2', x(0))
            .style('stroke-width', 2.5)
            .style('stroke-linecap', 'round');
          g.append('circle').attr('class', 'row__dot').attr('cx', x(0)).attr('r', 0);
          g.append('text').attr('class', 'row__value').attr('opacity', 0);
          return g;
        },
        (update) => update,
        (exit) =>
          exit.call((s) => {
            s.select('.row__stem').call((l) => tt(l).attr('x2', x(0)));
            s.select('.row__dot').call((c) => tt(c).attr('cx', x(0)).attr('r', 0));
            tt(s).attr('opacity', 0).remove();
          }),
      );

    rowSel
      .attr('aria-expanded', (r) => r.d.id === openId)
      .attr('aria-label', (r) =>
        t(
          `${r.d.short}，${r.d.metric}，${valueText(r.d)}，展开研究详情`,
          `${tf(r.d, 'short')}, ${tf(r.d, 'metric')}, ${valueText(r.d)}. Show study details`,
        ),
      )
      .classed('is-open', (r) => r.d.id === openId)
      .on('click', (_, r) => toggle(r.d))
      .on('keydown', (event, r) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggle(r.d);
        }
      });

    const stemY = (r) => (wide ? r.h / 2 : r.h - 14);
    // 数值标签位置：有利方向放在点（或置信区间右端）之后；不利方向放在零线右侧
    const valueX = (d) =>
      isHarm(d) ? x(0) + 10 : Math.max(x(d.signed), hasCi(d) ? x(ciSigned(d)[1]) : -Infinity) + 12;
    rowSel
      .select('.row__hit')
      .attr('x', -labelW - 4)
      .attr('y', 2)
      .attr('width', labelW + iw + margin.right)
      .attr('height', (r) => r.h - 4);
    rowSel
      .select('.row__name')
      .attr('x', -labelW + 16)
      .attr('y', (r) => (wide ? r.h / 2 - 3 : 16))
      .text((r) => tf(r.d, 'short'))
      .each(function () {
        ellipsize(this, wide ? labelW - 22 : iw + margin.right - 20);
      });
    rowSel
      .select('.row__metric')
      .attr('x', wide ? -labelW + 16 : null)
      .attr('y', (r) => (wide ? r.h / 2 + 13 : 16))
      .text((r) => tf(r.d, 'metric'))
      .each(function () {
        if (wide) ellipsize(this, labelW - 22);
      });
    if (!wide) {
      // 窄屏：名称与指标同一行，指标紧随名称
      rowSel.select('.row__metric').attr('x', function () {
        const nameEl = this.parentNode.querySelector('.row__name');
        return 16 + nameEl.getComputedTextLength() + 8;
      });
      rowSel.select('.row__metric').attr('display', function () {
        return +this.getAttribute('x') + this.getComputedTextLength() > iw + margin.right ? 'none' : null;
      });
    } else rowSel.select('.row__metric').attr('display', null);
    rowSel
      .select('.row__caret')
      .attr('x', -labelW + 2)
      .attr('y', (r) => (wide ? r.h / 2 + 2 : 15))
      .text((r) => (r.d.id === openId ? '▾' : '▸'));

    rowSel.each(function (r) {
      const g = d3.select(this);
      const delay = animate ? 120 : 0;
      tt(g, 0).attr('transform', `translate(0,${r.y})`).attr('opacity', emphasis(r.d));
      const sy = stemY(r);
      const ci = hasCi(r.d) ? ciSigned(r.d).map(x) : null;
      g.select('.row__ci')
        .style('stroke', colorOf(r.d))
        .attr(
          'd',
          ci ? `M${ci[0]},${sy}H${ci[1]}M${ci[0]},${sy - 4}V${sy + 4}M${ci[1]},${sy - 4}V${sy + 4}` : null,
        )
        .call((p) => tt(p, delay + (animate ? 200 : 0)).attr('opacity', ci ? 0.75 : 0));
      g.select('.row__stem')
        .style('stroke', colorOf(r.d))
        .attr('y1', sy)
        .attr('y2', sy)
        .call((l) => tt(l, delay).attr('x1', x(0)).attr('x2', x(r.d.signed)));
      g.select('.row__dot')
        .style('fill', colorOf(r.d))
        .style('stroke', 'var(--panel)')
        .style('stroke-width', 2)
        .attr('cy', sy)
        .call((c) =>
          tt(c, delay)
            .attr('cx', x(r.d.signed))
            .attr('r', isHarm(r.d) ? 8 : 6.5),
        );
      g.select('.row__value')
        .style('fill', colorOf(r.d))
        .attr('text-anchor', 'start')
        .attr('y', sy + 4.5)
        .text(valueText(r.d))
        .call((s) =>
          tt(s, delay + (animate ? 200 : 0))
            .attr('opacity', 1)
            .attr('x', valueX(r.d)),
        );
    });

    // 注释：新手 vs 全体（括号）与 METR 反例（脉冲 + 标签）
    annotG.selectAll('*').remove();
    const byId = new Map(L.rows.map((r) => [r.d.id, r]));
    if (step === 1) {
      const cs = L.rows.filter((r) => r.d.domain === 'customer_service');
      const nov = cs.find((r) => isNovice(r.d));
      if (wide && nov && cs.length > 1) {
        const y0 = d3.min(cs, (r) => r.y + stemY(r));
        const y1 = d3.max(cs, (r) => r.y + stemY(r));
        // 括号放在数值标签之后（标签位置随置信区间右移）
        const bx = d3.max(cs, (r) => valueX(r.d)) + (wide ? 48 : 38);
        const bx2 = Math.min(bx, iw + margin.right - 6);
        const b = annotG.append('g').attr('class', 'bracket').attr('opacity', 0);
        b.append('path').attr('d', `M${bx2 - 6},${y0}H${bx2}V${y1}H${bx2 - 6}`);
        if (wide && bx2 + 8 + (isEn() ? 116 : 110) < iw + margin.right) {
          b.append('text')
            .attr('x', bx2 + 8)
            .attr('y', (y0 + y1) / 2 - 4)
            .text(t('同一研究', 'Same study:'));
          b.append('text')
            .attr('x', bx2 + 8)
            .attr('y', (y0 + y1) / 2 + 12)
            .text(t('新手提升更大', 'novices gain more'));
        }
        tt(b, 300).attr('opacity', 1);
      }
    }
    const metr = L.rows.find((r) => isHarm(r.d));
    if (metr && step >= 2) {
      const cy = metr.y + stemY(metr);
      const cx = x(metr.d.signed);
      annotG.append('circle').attr('class', 'pulse').attr('cx', cx).attr('cy', cy).attr('r', 9);
      const tag = annotG.append('g').attr('class', 'counter-tag').attr('opacity', 0);
      const valueEl = rowsG
        .selectAll('g.row')
        .filter((r) => r.d.id === metr.d.id)
        .select('.row__value')
        .node();
      const tagX = x(0) + 10 + (valueEl ? valueEl.getComputedTextLength() : 60) + 8;
      tag.attr('transform', `translate(${tagX},${cy - 9})`);
      const tagRect = tag.append('rect').attr('height', 18).attr('rx', 9);
      const tagText = tag
        .append('text')
        .attr('y', 13)
        .attr('text-anchor', 'middle')
        .text(t('反例', 'Counter-example'));
      // 中文两字固定 36px；英文按文字宽度
      const tw = isEn() ? Math.max(36, tagText.node().getComputedTextLength() + 16) : 36;
      tagRect.attr('width', tw);
      tagText.attr('x', tw / 2);
      tt(tag, 600).attr('opacity', 1);
    }
    if (openId && byId.has(openId)) placeDetail(byId.get(openId), margin, false);
  }

  function placeDetail(r, margin) {
    const svgTop = svg.node().getBoundingClientRect().top - container.getBoundingClientRect().top;
    const top = svgTop + margin.top + r.y + r.h + 2;
    detail.style('top', `${top}px`).style('--detail-c', colorOf(r.d));
  }

  function fillDetail(d) {
    detail.html('');
    detail
      .append('button')
      .attr('type', 'button')
      .attr('class', 'effect-lollipop__close')
      .attr('aria-label', t('关闭详情', 'Close details'))
      .text('✕')
      .on('click', () => {
        closeDetail(true);
      });
    detail.append('h4').text(tf(d, 'study'));
    const dl = detail.append('dl');
    const add = (k, v, cls) => {
      if (!v) return;
      dl.append('dt').text(k);
      dl.append('dd')
        .attr('class', cls || null)
        .text(v);
    };
    add(t('对象', 'Subjects'), tf(d, 'short'));
    add(t('指标', 'Metric'), `${tf(d, 'metric')}${sep}${valueText(d)}`);
    add(
      t('样本', 'Sample'),
      d.sample != null
        ? `${fmt.int(d.sample)} ${tf(d, 'sample_unit')}`
        : t('原文未单列（子样本）', 'Not reported separately (subsample)'),
    );
    if (hasCi(d) || d.ci_native) {
      add(t('95% 置信区间', '95% CI'), ciText(d));
      add(t('区间说明', 'CI note'), tf(d, 'ci_note'), 'version');
    }
    add(t('设计', 'Design'), tf(d, 'design'));
    add(t('版本说明', 'Version note'), tf(d, 'version_note'), 'version');
  }

  function toggle(d) {
    if (openId === d.id) return closeDetail(true);
    openId = d.id;
    fillDetail(d);
    detail.classed('is-open', true);
    detailH = detail.node().offsetHeight;
    render(true);
  }

  function closeDetail(rerender) {
    openId = null;
    detailH = 0;
    detail.classed('is-open', false);
    if (rerender) render(true);
  }

  const stop = observeSize(container, ({ width: w }) => {
    width = w;
    if (openId) detailH = detail.node().offsetHeight;
    render(false);
  });
  // 网页字体加载完成后重新测量文字宽度（截断与窄屏隐藏指标依赖 getComputedTextLength）
  let alive = true;
  document.fonts?.ready.then(() => alive && width && render(false));

  return {
    update(s) {
      step = Math.max(0, Math.min(2, s));
      render(true);
    },
    resize() {
      width = container.clientWidth;
      render(false);
    },
    destroy() {
      alive = false;
      stop();
      root.selectAll('*').interrupt().remove();
      root.classed('effect-lollipop', false);
    },
  };
}
