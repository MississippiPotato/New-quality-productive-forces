// 生成式 AI 用户规模象形图：1 个人形 = 1000 万人（0.1 亿人），末位按小数裁切
// update(step)：0 三类用途；1 突出网民规模与年龄结构（用途行淡化）
import * as d3 from 'd3';
import { observeSize, observeVisible, createSvg, fmt, legend, note, srTable } from '../core/chartUtils.js';
import { theme } from '../core/theme.js';
import { bindTooltip } from '../core/tooltip.js';
import { t, tf, isEn } from '../core/i18n.js';
import '../styles/charts/pictogram.css';

const PER_ICON = 0.1; // 亿人 / 图标
const PERSON = 'M3.6,20 V13.4 a6.4,5.6 0 0 1 12.8,0 V20 Z';

export function createPictogram(container, data) {
  const u = data.users || data;
  const unit = u.unit || '亿人';
  const recs = u.records || [];
  const uid = Math.random().toString(36).slice(2, 8);
  // 数值单位为“亿人”：英文换算为等值的 million / billion（4.57 亿 → 457 million）
  const amount = (v) => (isEn() ? fmt.cn(v * 1e8) : `${fmt.num(v, 2)} ${unit}`);
  const millions = (v) => +(v * 100).toFixed(4);
  // 生成式 AI 用户总数与普及率（辅助注记；普及率以总人口为基数，故不画在网民条上）
  const gen = u.genai_users;
  const genText = () =>
    gen
      ? t(
          `生成式 AI 用户 ${amount(gen.value)}${gen.penetration != null ? `，普及率 ${fmt.num(gen.penetration, 1)}%` : ''}${gen.date ? `（${fmt.period(gen.date)}）` : ''}`,
          `Generative AI users: ${amount(gen.value)}${gen.penetration != null ? `, penetration ${fmt.num(gen.penetration, 1)}%` : ''}${gen.date ? ` (${fmt.period(gen.date)})` : ''}`,
        )
      : '';
  const people = (v) => (isEn() ? `${fmt.cn(v * 1e8)} people` : `${fmt.num(v, 2)} ${unit}`);

  const root = d3.select(container).classed('pictogram', true);
  const svg = createSvg(container).attr(
    'aria-label',
    t('生成式 AI 用户规模象形图', 'Pictogram of generative AI user numbers'),
  );
  legend(root.append('div').node(), [
    {
      label: t(`1 个人形 = 1000 万人（${PER_ICON} ${unit}）`, '1 icon = 10 million users'),
      color: 'var(--object)',
      shape: 'dot',
    },
    {
      label: t('末位人形按小数部分裁切', 'Last icon clipped to the fractional part'),
      color: 'var(--faint)',
      shape: 'ring',
    },
  ]);
  note(
    container,
    t(
      `换算：1 个人形代表 0.1 ${unit}（即 1000 万人），人形数 = 人数 ÷ 0.1，末位不足一个按比例裁切显示。${u.date ? `数据截至 ${u.date}。` : ''}同一用户可能有多种用途，各行不可相加。`,
      `Conversion: each icon represents 10 million people; icons = people ÷ 10 million, and a final partial icon is clipped proportionally.${u.date ? ` Data as of ${u.date}.` : ''} One user may use AI in several ways, so the rows cannot be added up.`,
    ),
    'info',
  );
  srTable(
    container,
    t('生成式 AI 用户规模', 'Generative AI user numbers'),
    [t('项目', 'Item'), t('数值', 'Value'), t('单位', 'Unit')],
    [
      ...recs.map((r) =>
        isEn() ? [tf(r, 'use'), millions(r.value), 'million people'] : [r.use, r.value, unit],
      ),
      ...(u.netizens
        ? [
            isEn()
              ? ['Internet users', millions(u.netizens.value), 'million people']
              : ['网民规模', u.netizens.value, unit],
          ]
        : []),
      ...(u.under40_share
        ? [[t('40 岁以下占比', 'Share under 40'), u.under40_share.value, tf(u.under40_share, 'unit')]]
        : []),
      ...(gen
        ? [
            isEn()
              ? ['Generative AI users', millions(gen.value), 'million people']
              : ['生成式 AI 用户', gen.value, gen.unit || unit],
            ...(gen.penetration != null ? [[t('普及率', 'Penetration'), gen.penetration, '%']] : []),
          ]
        : []),
    ],
  );

  const defs = svg.append('defs');
  const body = svg.append('g');
  const ctx = svg.append('g').attr('class', 'pg-ctx');

  let width = 0;
  let step = 0;
  let shown = theme.reducedMotion;

  function personGlyph(g, s) {
    g.append('circle')
      .attr('cx', 10 * s)
      .attr('cy', 6 * s)
      .attr('r', 3.8 * s);
    g.append('path').attr('d', PERSON).attr('transform', `scale(${s})`);
  }

  const measureCtx = document.createElement('canvas').getContext('2d');
  function textW(str, font) {
    measureCtx.font = `${font} ${getComputedStyle(container).fontFamily || 'sans-serif'}`;
    return measureCtx.measureText(str).width;
  }

  function render() {
    if (!width) return;
    // 每行人形数取 10 的倍数，每 10 个之间留空隙，便于按“1 亿”计数
    const cols = width >= 700 ? 50 : width >= 420 ? 30 : 20;
    const GAP = 5;
    const cell = Math.min(22, (width - (cols / 10 - 1) * GAP) / cols);
    const s = cell / 21;
    const gridW = cols * cell + (cols / 10 - 1) * GAP;
    const colX = (c) => c * cell + Math.floor(c / 10) * GAP;
    let yy = 0;
    const rowsLayout = recs.map((r) => {
      const n = r.value / PER_ICON;
      const full = Math.floor(n + 1e-9);
      const frac = n - full;
      const count = full + (frac > 1e-6 ? 1 : 0);
      const lines = Math.ceil(count / cols);
      // 用途名与数值放不下一行时（英文窄屏），用途名单独占一行
      const twoLine = textW(tf(r, 'use'), '600 14px') + textW(amount(r.value), '800 18px') + 12 > gridW;
      const top = yy + 26 + (twoLine ? 20 : 0);
      yy = top + lines * cell + 22;
      return { r, n, full, frac, count, top, twoLine };
    });
    const ctxTop = yy + 6;
    // 生成式 AI 用户注记：与年龄条同一行放得下则放左侧，否则另起一行
    const ageX = u.under40_share && width >= 480 ? gridW - Math.min(260, gridW * 0.42) : 0;
    const ageY = width >= 480 ? 84 : 76;
    const genSameRow = gen && u.under40_share && width >= 480 && textW(genText(), '600 12px') + 20 <= ageX;
    const genY = !gen ? 0 : genSameRow ? ageY : u.under40_share ? ageY + 44 : ageY;
    // 窄屏放不下一行时在逗号处断成两行
    const genSplit = gen && textW(genText(), '600 12px') > gridW;
    const ctxH = Math.max(120, genY + 16 + (genSplit ? 16 : 0));
    const height = ctxTop + ctxH;
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);

    const rowG = body
      .selectAll('g.pg-row')
      .data(rowsLayout, (d) => d.r.use)
      .join((enter) => {
        const g = enter.append('g').attr('class', 'pg-row');
        g.append('text').attr('class', 'pg-label');
        g.append('text').attr('class', 'pg-value');
        g.append('g').attr('class', 'pg-icons');
        return g;
      });
    rowG.call(
      bindTooltip,
      (d) =>
        `<strong>${tf(d.r, 'use')}</strong><br>${people(d.r.value)}<br><em>${t(
          `≈ ${fmt.num(d.n, 1)} 个人形（每个 1000 万人）`,
          `≈ ${fmt.num(d.n, 1)} icons (10 million each)`,
        )}</em>`,
    );
    rowG.classed('is-dim', step >= 1);
    rowG
      .select('.pg-label')
      .attr('x', 0)
      .attr('y', (d) => d.top - 9 - (d.twoLine ? 22 : 0))
      .text((d) => tf(d.r, 'use'));
    rowG
      .select('.pg-value')
      .attr('x', gridW)
      .attr('y', (d) => d.top - 8)
      .attr('text-anchor', 'end')
      .text((d) => amount(d.r.value));

    rowG.each(function (d, ri) {
      const icons = d3.range(d.count).map((i) => ({ i, frac: i === d.full ? d.frac : 1, ri }));
      const g = d3.select(this).select('.pg-icons');
      const ic = g
        .selectAll('g.pg-icon')
        .data(icons, (k) => k.i)
        .join((enter) => {
          const e = enter.append('g').attr('class', 'pg-icon');
          e.append('g').attr('class', 'pg-ghost');
          e.append('g').attr('class', 'pg-fill');
          return e;
        });
      ic.attr('transform', (k) => `translate(${colX(k.i % cols)},${d.top + Math.floor(k.i / cols) * cell})`);
      ic.each(function (k) {
        const el = d3.select(this);
        el.selectAll('.pg-ghost > *, .pg-fill > *').remove();
        const fill = el.select('.pg-fill');
        if (k.frac < 1) {
          const cid = `pg-clip-${uid}-${ri}`;
          defs.select(`#${cid}`).remove();
          defs
            .append('clipPath')
            .attr('id', cid)
            .append('rect')
            .attr('width', 20 * s * k.frac)
            .attr('height', 21 * s);
          fill.attr('clip-path', `url(#${cid})`);
          personGlyph(el.select('.pg-ghost'), s);
        } else fill.attr('clip-path', null);
        personGlyph(fill, s);
      });
      ic.classed('is-in', shown).style('transition-delay', (k) =>
        shown ? `${(ri * 12 + k.i) * 14}ms` : null,
      );
    });

    // ---------- 背景：网民规模（同一刻度的参照条）+ 年龄结构 ----------
    ctx.selectAll('*').remove();
    ctx.attr('transform', `translate(0,${ctxTop})`).classed('is-hot', step >= 1);
    ctx.append('line').attr('class', 'pg-sep').attr('x1', 0).attr('x2', gridW).attr('y1', 0).attr('y2', 0);
    if (u.netizens) {
      const max = u.netizens.value;
      const x = d3.scaleLinear().domain([0, max]).range([0, gridW]);
      ctx
        .append('text')
        .attr('class', 'pg-ctx-title')
        .attr('y', 24)
        .text(
          t(
            `网民规模 ${fmt.num(max, 2)} ${unit}（同一刻度参照）`,
            `Internet users: ${amount(max)} (reference on the same scale)`,
          ),
        );
      ctx
        .append('rect')
        .attr('class', 'pg-net')
        .attr('y', 34)
        .attr('width', gridW)
        .attr('height', 12)
        .attr('rx', 6);
      const tk = ctx
        .selectAll('g.pg-tick')
        .data(recs)
        .join('g')
        .attr('class', 'pg-tick')
        .attr('transform', (r) => `translate(${x(r.value)},34)`);
      tk.append('rect').attr('x', -1.5).attr('y', -3).attr('width', 3).attr('height', 18).attr('rx', 1.5);
      tk.call(
        bindTooltip,
        (r) =>
          `<strong>${tf(r, 'use')}</strong>${t('：', ': ')}${people(r.value)}<br>${t('网民规模', 'Internet users')}${t('：', ': ')}${people(max)}`,
      );
      // 仅最大一项给出文字，避免拥挤
      const top = d3.greatest(recs, (r) => r.value);
      if (top && width >= 480)
        ctx
          .append('text')
          .attr('class', 'pg-tick-label')
          .attr('x', x(top.value))
          .attr('y', 64)
          .attr('text-anchor', 'middle')
          .text(`${tf(top, 'use')} ${isEn() ? amount(top.value) : fmt.num(top.value, 2)}`);
    }
    if (gen) {
      const gt = ctx.append('text').attr('class', 'pg-ctx-title').attr('x', 0).attr('y', genY);
      if (genSplit) {
        const parts = genText().split(/(?<=[，,])\s*/);
        gt.append('tspan').attr('x', 0).text(parts[0]);
        gt.append('tspan').attr('x', 0).attr('dy', 16).text(parts.slice(1).join(''));
      } else gt.text(genText());
    }
    if (u.under40_share) {
      const v = u.under40_share.value;
      const bw = Math.min(260, gridW * (width >= 480 ? 0.42 : 1));
      const gx = width >= 480 ? gridW - bw : 0;
      const gy = width >= 480 ? 84 : 76;
      const g = ctx.append('g').attr('transform', `translate(${gx},${gy})`);
      g.append('text')
        .attr('class', 'pg-ctx-title')
        .attr('y', 0)
        .text(
          t(
            `用户中 40 岁以下占 ${fmt.num(v, 1)}${u.under40_share.unit || '%'}`,
            `Users under 40: ${fmt.num(v, 1)}${u.under40_share.unit || '%'}`,
          ),
        );
      g.append('rect')
        .attr('class', 'pg-age-bg')
        .attr('y', 10)
        .attr('width', bw)
        .attr('height', 10)
        .attr('rx', 5);
      g.append('rect')
        .attr('class', 'pg-age')
        .attr('y', 10)
        .attr('width', (bw * v) / 100)
        .attr('height', 10)
        .attr('rx', 5);
    }
  }

  const stopVis = shown
    ? () => {}
    : observeVisible(container, (vis) => {
        if (!vis || shown) return;
        shown = true;
        stopVis();
        // 下一帧再加类名，保证过渡生效
        requestAnimationFrame(() => render());
      });

  const stop = observeSize(container, ({ width: w }) => {
    width = w;
    render();
  });

  return {
    update(st) {
      step = st;
      render();
    },
    resize() {
      width = container.clientWidth;
      render();
    },
    destroy() {
      stop();
      stopVis();
      root.selectAll('*').remove();
    },
  };
}
