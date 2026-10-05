// 中美镜像条形：各指标按“两国中较大值 = 100%”标准化，美国向左、中国向右
// update(step)：0 全部（条形从中轴生长）；n ≥ 1 突出第 n 项指标
import * as d3 from 'd3';
import {
  observeSize,
  observeVisible,
  createSvg,
  tr,
  fmt,
  legend,
  note,
  srTable,
} from '../core/chartUtils.js';
import { theme } from '../core/theme.js';
import { bindTooltip, tooltip } from '../core/tooltip.js';
import { t, tf, isEn } from '../core/i18n.js';
import '../styles/charts/mirrorBars.css';

// 语言在图表创建时读取；切换语言时 figure.js 会重建图表
const sides = () => [
  { key: 'us', label: t('美国', 'US'), color: 'var(--us)', dir: -1 },
  { key: 'cn', label: t('中国', 'China'), color: 'var(--cn)', dir: 1 },
];

/** 数值 + 单位：英文下把中文计量单位换算为等值表述（亿美元 → billion USD；个/项 → 不带单位） */
function valueParts(v, unit) {
  if (v == null) return { v: '—', u: '' };
  if (!isEn()) return { v: fmt.int(v), u: unit };
  if (unit === '亿美元') return { v: `$${fmt.num(v / 10, 2)}`, u: 'bn' };
  if (unit === '个' || unit === '项') return { v: fmt.int(v), u: '' };
  if (unit === '台') return { v: fmt.int(v), u: 'units' };
  return { v: fmt.int(v), u: unit };
}

function textWidth(s, size) {
  let w = 0;
  for (const ch of String(s)) w += /[⺀-￿]/.test(ch) ? size : size * 0.6;
  return w;
}

/** 按像素宽度把中文标签折行（英文按单词折行） */
function wrap(s, maxW, size) {
  if (isEn()) return wrapWords(s, maxW, size);
  const lines = [];
  let cur = '';
  for (const ch of s) {
    if (cur && textWidth(cur + ch, size) > maxW) {
      lines.push(cur);
      cur = ch.trim() ? ch : '';
    } else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}

function wrapWords(s, maxW, size) {
  const lines = [];
  let cur = '';
  for (const word of String(s).split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && textWidth(next, size) > maxW) {
      lines.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

const unitLabel = (unit) =>
  isEn() ? ({ 亿美元: '100 million USD', 个: '', 项: '', 台: 'units' }[unit] ?? unit) : unit;

export function createMirrorBars(container, data) {
  const SIDES = sides();
  const { mirror, investment } = data.competition;
  const owidAt = (entity, year) =>
    data.owid.find((r) => r.entity === entity && +r.year === +year)?.count ?? null;
  const records = mirror.records.map((r) => {
    if (r.from_owid == null) return { ...r };
    return { ...r, us: owidAt('United States', r.from_owid), cn: owidAt('China', r.from_owid) };
  });
  records.forEach((r) => {
    r.max = Math.max(r.us ?? 0, r.cn ?? 0) || 1;
    const hi = (r.us ?? 0) >= (r.cn ?? 0) ? 'us' : 'cn';
    const lo = hi === 'us' ? 'cn' : 'us';
    r.ratio = r.us && r.cn ? { hi, lo, v: r[hi] / r[lo] } : null;
  });
  const owidRec = records.find((r) => r.from_owid != null);
  const hk = owidRec ? owidAt('Hong Kong', owidRec.from_owid) : null;

  const root = d3.select(container).classed('mirror-bars', true);
  const svg = createSvg(container, 'mb').attr(
    'aria-label',
    t('中美关键指标镜像对照', 'Mirror comparison of key US and China indicators'),
  );
  const legendWrap = root.append('div');
  legend(legendWrap.node(), [
    { label: t('美国（向左）', 'US (left)'), color: 'var(--us)', shape: 'square' },
    { label: t('中国（向右）', 'China (right)'), color: 'var(--cn)', shape: 'square' },
    { label: t('较大一方 = 100%', 'Larger side = 100%'), color: 'var(--grid)', shape: 'square' },
  ]);
  note(
    container,
    `${tf(mirror, 'notes')} ${t(
      '中间的倍数由两国原始值相除推算（较大值 ÷ 较小值）。',
      'The multiple in the middle is derived by dividing the two raw values (larger ÷ smaller).',
    )}`,
    'info',
  );
  if (owidRec) {
    note(
      container,
      t(
        `“${owidRec.metric}”取自 OWID / Epoch AI 的 ${owidRec.from_owid} 年累计数，“中国”为 OWID 的 China 序列；中国香港由 OWID 单列${hk != null ? `（${fmt.int(hk)} 个）` : ''}，未计入。`,
        `“${tf(owidRec, 'metric')}” uses the cumulative ${owidRec.from_owid} count from OWID / Epoch AI; “China” is OWID’s China series. Hong Kong, China is listed separately by OWID${hk != null ? ` (${fmt.int(hk)})` : ''} and is not included.`,
      ),
      'info',
    );
  }
  note(container, `${t('⚠ 投资口径提示：', '⚠ Investment basis: ')}${tf(investment, 'caveat')}`, 'warn');
  srTable(
    container,
    t('中美关键指标对照', 'Key indicators: US vs China'),
    [t('指标', 'Indicator'), t('美国', 'US'), t('中国', 'China'), t('单位', 'Unit')],
    records.map((r) => [tf(r, 'metric'), r.us ?? '—', r.cn ?? '—', unitLabel(r.unit)]),
  );

  const gHead = svg.append('g');
  const gRows = svg.append('g');

  let width = 0;
  let step = 0;
  let grown = theme.reducedMotion;

  function render(animate) {
    if (!width) return;
    const narrow = width < 560;
    const pad = 4;
    const cw = narrow ? 14 : Math.max(120, Math.min(220, width * 0.24));
    const half = (width - cw) / 2 - pad;
    const cx = width / 2;
    const fs = narrow ? 12 : 13;
    const barH = narrow ? 22 : 26;
    const headH = 30;

    // 每行布局
    let yCur = headH + 6;
    const rows = records.map((r) => {
      const ratioTxt = r.ratio
        ? `${r.ratio.hi === 'us' ? t('美/中', 'US/CN') : t('中/美', 'CN/US')} ≈ ${fmt.num(r.ratio.v, 1)}×`
        : '';
      let lines;
      let row;
      if (narrow) {
        lines = wrap(`${tf(r, 'metric')}${ratioTxt ? `  ·  ${ratioTxt}` : ''}`, width - 8, fs);
        if (lines.length > 1 && ratioTxt) lines = [...wrap(tf(r, 'metric'), width - 8, fs), ratioTxt];
        const labelH = lines.length * (fs + 4);
        row = { r, lines, ratioTxt, y: yCur, labelY: yCur + fs, barY: yCur + labelH + 4 };
        yCur += labelH + 4 + barH + 18;
      } else {
        lines = wrap(tf(r, 'metric'), cw - 12, fs);
        const blockH = lines.length * (fs + 4) + (ratioTxt ? 16 : 0);
        const rowH = Math.max(barH + 22, blockH + 14);
        row = {
          r,
          lines,
          ratioTxt,
          y: yCur,
          labelY: yCur + (rowH - blockH) / 2 + fs - 1,
          barY: yCur + (rowH - barH) / 2,
        };
        yCur += rowH;
      }
      return row;
    });
    const height = yCur + 4;
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);

    // 表头
    gHead
      .selectAll('text.mb__head')
      .data(SIDES)
      .join('text')
      .attr('class', 'mb__head')
      .attr('x', (d) => (d.dir < 0 ? cx - cw / 2 - pad : cx + cw / 2 + pad))
      .attr('y', 18)
      .attr('text-anchor', (d) => (d.dir < 0 ? 'end' : 'start'))
      .style('fill', (d) => d.color)
      .text((d) => (d.dir < 0 ? `← ${d.label}` : `${d.label} →`));

    const rowSel = gRows
      .selectAll('g.mb__row')
      .data(rows, (d) => d.r.metric)
      .join((enter) => {
        const g = enter.append('g').attr('class', 'mb__row');
        g.append('text').attr('class', 'mb__metric').attr('text-anchor', 'middle');
        SIDES.forEach((s) => {
          g.append('rect').attr('class', `mb__track mb__track--${s.key}`).attr('rx', 3);
          g.append('rect').attr('class', `mb__bar mb__bar--${s.key}`).attr('rx', 3).style('fill', s.color);
          const txt = g.append('text').attr('class', `mb__val mb__val--${s.key}`).attr('dy', '0.35em');
          txt.append('tspan').attr('class', 'v');
          txt.append('tspan').attr('class', 'u');
        });
        return g;
      })
      .style('opacity', (d, i) => (step >= 1 && i !== step - 1 ? 0.3 : 1));

    // 指标名（+ 倍数）
    rowSel.select('text.mb__metric').each(function (d) {
      const txt = d3.select(this);
      txt.selectAll('tspan').remove();
      const lines = d.lines;
      lines.forEach((ln, i) => {
        const isRatio = narrow && d.ratioTxt && ln === d.ratioTxt && i > 0;
        txt
          .append('tspan')
          .attr('x', cx)
          .attr('y', d.labelY + i * (fs + 4))
          .attr('class', isRatio ? 'mb__ratio' : null)
          .style('font-size', `${fs}px`)
          .text(ln);
      });
      if (!narrow && d.ratioTxt) {
        txt
          .append('tspan')
          .attr('class', 'mb__ratio')
          .attr('x', cx)
          .attr('y', d.labelY + lines.length * (fs + 4) + 2)
          .text(d.ratioTxt);
      }
    });

    const doGrow = animate && !grown;
    SIDES.forEach((s) => {
      const x0 = s.dir < 0 ? cx - cw / 2 : cx + cw / 2;
      const len = (d) => (d.r[s.key] == null ? 0 : (half * d.r[s.key]) / d.r.max);
      rowSel
        .select(`rect.mb__track--${s.key}`)
        .attr('x', s.dir < 0 ? x0 - half : x0)
        .attr('y', (d) => d.barY)
        .attr('width', half)
        .attr('height', barH);
      const bars = rowSel
        .select(`rect.mb__bar--${s.key}`)
        .attr('y', (d) => d.barY)
        .attr('height', barH)
        .call(bindTooltip, (d) => tipHtml(d.r, s));
      const vals = rowSel.select(`text.mb__val--${s.key}`);
      const parts = (d) => valueParts(d.r[s.key], d.r.unit);
      vals.select('tspan.v').text((d) => parts(d).v);
      vals.select('tspan.u').text((d) => (parts(d).u ? ` ${parts(d).u}` : ''));
      const inside = (d) => len(d) > textWidth(`${parts(d).v} ${parts(d).u}`, 12) + 16;
      const labelX = (d) => {
        const L = len(d);
        if (inside(d)) return s.dir < 0 ? x0 - L + 8 : x0 + L - 8;
        return s.dir < 0 ? x0 - L - 6 : x0 + L + 6;
      };
      vals
        .attr('class', (d) => `mb__val mb__val--${s.key} ${inside(d) ? 'mb__val--in' : 'mb__val--out'}`)
        .attr('text-anchor', (d) => (s.dir < 0 === inside(d) ? 'start' : 'end'))
        .attr('y', (d) => d.barY + barH / 2);

      if (doGrow) {
        bars.attr('x', x0).attr('width', 0);
        vals.attr('x', x0).style('opacity', 0);
      }
      const tb = animate ? (sel) => tr(sel) : (sel) => sel;
      (doGrow
        ? bars
            .transition()
            .duration(theme.duration * 1.3)
            .delay((_, i) => 150 + i * 140)
            .ease(d3.easeCubicOut)
        : tb(bars)
      )
        .attr('x', (d) => (s.dir < 0 ? x0 - len(d) : x0))
        .attr('width', len);
      (doGrow
        ? vals
            .transition()
            .duration(theme.duration)
            .delay((_, i) => 150 + i * 140 + theme.duration * 0.6)
        : tb(vals)
      )
        .attr('x', labelX)
        .style('opacity', 1);
    });
    if (doGrow) grown = true;
  }

  function tipHtml(r, s) {
    const other = SIDES.find((x) => x.key !== s.key);
    const v = r[s.key];
    const pct = v == null ? '—' : fmt.pct((v / r.max) * 100, 1);
    const sep = t('：', ': ');
    const val = (x) => {
      const p = valueParts(x, r.unit);
      return { v: p.v, u: p.u ? ` ${p.u}` : '' };
    };
    const a = val(v);
    const b = val(r[other.key]);
    return `<strong>${s.label} · ${tf(r, 'metric')}</strong><br>${t('原始值', 'Raw value')}${sep}<b>${a.v}</b>${a.u}<br>${t('标准化', 'Normalised')}${sep}${pct}${t('（较大一方 = 100%）', ' (larger side = 100%)')}<br><em>${other.label}${sep}${b.v}${b.u}</em>`;
  }

  const stopSize = observeSize(container, ({ width: w }) => {
    width = w;
    render(false);
  });
  const stopVis = observeVisible(container, (v) => {
    if (v && !grown) render(true);
  });
  // 首次渲染时若尚未生长，先把条形归零，等进入视口再生长
  if (!grown) {
    svg
      .selectAll('rect.mb__bar')
      .attr('width', 0)
      .attr('x', width / 2);
    svg.selectAll('text.mb__val').style('opacity', 0);
  }

  return {
    update(s) {
      const next = Math.max(0, Math.min(records.length, +s || 0));
      step = next;
      render(true);
    },
    resize() {
      width = container.clientWidth;
      render(false);
    },
    destroy() {
      tooltip.hide();
      stopSize();
      stopVis();
      svg.selectAll('*').interrupt();
      root.selectAll('*').remove();
    },
  };
}
