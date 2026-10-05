// “人工智能+”目标仪表：2027 / 2030 应用普及率目标（半圆弧，进入视口时填充到目标值）
// 现状值为 null 时只显示目标并注明“暂无官方口径数据”；下方为 2035 里程碑与重点行动。
// update(step)：0 两个目标；1 突出 2027；2 突出 2030；3 突出 2035 里程碑与重点行动
import * as d3 from 'd3';
import { observeSize, observeVisible, hatch, note, srTable } from '../core/chartUtils.js';
import { theme } from '../core/theme.js';
import { bindTooltip } from '../core/tooltip.js';
import { t, tf, isEn } from '../core/i18n.js';
import '../styles/charts/gauge.css';

const A0 = -Math.PI / 2;
const A1 = Math.PI / 2;

// 限定词 + 数值 + 单位：中文“超70%”，英文“over 70%”（qualifier_en 由数据提供）
function qvu(d) {
  const q = tf(d, 'qualifier') || '';
  return `${isEn() && q ? `${q} ` : q}${d.value}${tf(d, 'unit')}`;
}

export function createGauge(container, data) {
  const root = d3.select(container).classed('gg', true);
  const recs = (data.records || []).slice().sort((a, b) => a.year - b.year);
  const uid = Math.random().toString(36).slice(2, 8);
  const sep = t('：', ': ');
  const noData = t('暂无官方口径数据', 'no official data on this basis yet');
  const nowLabel = t('现状', 'Current');
  const metric = tf(data, 'metric') || '';
  const yearTarget = (y) => t(`${y} 年目标`, `${y} target`);

  root
    .append('p')
    .attr('class', 'gg__metric')
    .html(`<span class="gg__metric-k">${t('指标', 'Indicator')}</span>${metric}`);
  const row = root.append('div').attr('class', 'gg__row');
  const cards = row
    .selectAll('div.gg__card')
    .data(recs, (d) => d.year)
    .join('div')
    .attr('class', 'gg__card');
  const svgs = cards.append('svg').attr('class', 'chart gg__svg').attr('role', 'img');
  svgs.attr('aria-label', (d) => `${yearTarget(d.year)}${sep}${qvu(d)}`);
  const cap = cards.append('div').attr('class', 'gg__cap');
  cap
    .append('span')
    .attr('class', 'gg__year')
    .text((d) => t(`${d.year} 年`, `${d.year}`));
  cap.append('span').attr('class', 'tag tag--target').text(t('目标', 'Target'));
  cards
    .append('p')
    .attr('class', (d) => `gg__now ${d.current == null ? 'is-missing' : ''}`)
    .text((d) => `${nowLabel}${sep}${d.current == null ? noData : `${d.current}${tf(d, 'unit')}`}`);

  const lower = root.append('div').attr('class', 'gg__lower');
  const ms = data.milestone_2035;
  const mile = lower.append('div').attr('class', 'gg__mile');
  if (ms) {
    const mh = mile.append('div').attr('class', 'gg__mile-head');
    mh.append('span').attr('class', 'gg__mile-year').text(ms.year);
    mh.append('span').attr('class', 'tag tag--target').text(t('目标', 'Target'));
    mile.append('p').attr('class', 'gg__mile-text').text(tf(ms, 'text'));
  }
  const act = lower.append('div').attr('class', 'gg__actions');
  act.append('h4').attr('class', 'gg__ah').text(t('“人工智能+”重点行动', 'Key “AI Plus” actions'));
  act
    .append('ul')
    .attr('class', 'gg__chips')
    .selectAll('li')
    .data(data.actions || [])
    .join('li')
    .attr('class', 'gg__chip')
    .style('--i', (_, i) => i)
    .text((d) => tf(d, 'name'));

  note(
    container,
    t(
      '斜纹弧形与橙色刻针为政策目标值，不是实际达成情况；官方尚未发布同口径的现状数据，故不显示进度。',
      'The hatched arc and orange needle show policy targets, not actual attainment. No official current figures on the same basis have been published, so no progress is shown.',
    ),
    'forecast',
  );
  srTable(
    container,
    tf(data, 'title') || t('“人工智能+”行动目标', '“AI Plus” action targets'),
    [t('年份', 'Year'), t('目标', 'Target'), nowLabel],
    [
      ...recs.map((r) => [r.year, qvu(r), r.current == null ? noData : r.current]),
      ...(ms ? [[ms.year, tf(ms, 'text'), '—']] : []),
    ],
  );

  let width = 0;
  let played = false;
  let step = null;

  function render(animate) {
    if (!width) return;
    const cw = Math.max(140, Math.min(360, (width - 16) / Math.max(1, recs.length)));
    const R = Math.max(56, Math.min(130, cw / 2 - 14));
    const h = R + 44;
    const thick = Math.max(14, R * 0.2);
    svgs
      .attr('viewBox', `${-cw / 2} ${-R - 26} ${cw} ${h + 4}`)
      .attr('width', cw)
      .attr('height', h + 4);
    const pct = d3.scaleLinear().domain([0, 100]).range([A0, A1]).clamp(true);
    const arc = d3
      .arc()
      .innerRadius(R - thick)
      .outerRadius(R)
      .cornerRadius(3);

    svgs.each(function (d) {
      const s = d3.select(this);
      const pat = hatch(s, `gg-hatch-${d.year}-${uid}`, 'var(--orange)');
      s.selectAll('path.gg__track')
        .data([0])
        .join('path')
        .attr('class', 'gg__track')
        .attr('d', arc({ startAngle: A0, endAngle: A1 }));
      // 刻度
      const ticks = [0, 25, 50, 75, 100];
      s.selectAll('line.gg__tick')
        .data(ticks)
        .join('line')
        .attr('class', 'gg__tick')
        .each(function (v) {
          const a = pct(v);
          d3.select(this)
            .attr('x1', Math.sin(a) * (R + 3))
            .attr('y1', -Math.cos(a) * (R + 3))
            .attr('x2', Math.sin(a) * (R + 8))
            .attr('y2', -Math.cos(a) * (R + 8));
        });
      s.selectAll('text.gg__tick-label')
        .data([0, 50, 100])
        .join('text')
        .attr('class', 'gg__tick-label')
        .attr('text-anchor', 'middle')
        .attr('x', (v) => (v === 50 ? 0 : Math.sin(pct(v)) * (R - thick / 2)))
        .attr('y', (v) => (v === 50 ? -R - 12 : 16))
        .text((v) => `${v}%`);

      const fill = s
        .selectAll('path.gg__fill')
        .data([d])
        .join('path')
        .attr('class', 'gg__fill')
        .style('fill', pat);
      const edge = s.selectAll('path.gg__edge').data([d]).join('path').attr('class', 'gg__edge');
      const needle = s
        .selectAll('g.gg__needle')
        .data([d])
        .join((enter) => {
          const g = enter.append('g').attr('class', 'gg__needle');
          g.append('line');
          g.append('circle').attr('r', 3.5);
          return g;
        });
      needle
        .select('line')
        .attr('x1', 0)
        .attr('y1', -(R - thick - 8))
        .attr('x2', 0)
        .attr('y2', -(R + 10));
      needle.select('circle').attr('cy', -(R + 10));
      const big = s
        .selectAll('text.gg__big')
        .data([d])
        .join('text')
        .attr('class', 'gg__big')
        .attr('text-anchor', 'middle')
        .attr('y', -Math.round(R * 0.2))
        .style('font-size', `${Math.round(R * 0.32)}px`);
      s.selectAll('text.gg__sub')
        .data([d])
        .join('text')
        .attr('class', 'gg__sub')
        .attr('text-anchor', 'middle')
        .attr('y', 0)
        .text(R < 80 ? '' : t('普及率目标', 'Adoption target'));
      s.call(
        bindTooltip,
        () =>
          `<strong>${yearTarget(d.year)}</strong><br>${metric}${sep}${qvu(d)}<br><em>${nowLabel}${sep}${d.current == null ? noData : d.current + tf(d, 'unit')}</em>`,
      );

      const draw = (k) => {
        const a = pct(d.value * k);
        fill.attr('d', arc({ startAngle: A0, endAngle: a }));
        edge.attr(
          'd',
          d3
            .arc()
            .innerRadius(R - 1.5)
            .outerRadius(R + 1.5)({ startAngle: A0, endAngle: a }),
        );
        needle.attr('transform', `rotate(${(a * 180) / Math.PI})`);
        const q = tf(d, 'qualifier') || '';
        const bigQ = isEn() && q ? `${q}\u00a0` : q; // 不换行空格：SVG 会折叠 tspan 末尾空格
        big
          .selectAll('tspan')
          .data([bigQ, `${Math.round(d.value * k)}`, tf(d, 'unit')])
          .join('tspan')
          .attr('class', (_, i) => (i === 1 ? 'gg__big-num' : 'gg__big-aux'))
          .text((v) => v);
      };
      if (animate && !theme.reducedMotion) {
        s.transition()
          .duration(1400)
          .delay(recs.indexOf(d) * 250)
          .ease(d3.easeCubicOut)
          .tween('fill', () => draw);
      } else {
        s.interrupt();
        draw(played || theme.reducedMotion ? 1 : 0);
      }
    });
  }

  function applyStep() {
    const s = step;
    cards.classed('is-dim', (d, i) => (s === 1 && i !== 0) || (s === 2 && i !== recs.length - 1) || s === 3);
    cards.classed('is-hot', (d, i) => (s === 1 && i === 0) || (s === 2 && i === recs.length - 1));
    lower.classed('is-hot', s === 3).classed('is-dim', s === 1 || s === 2);
  }

  const stopSize = observeSize(container, ({ width: w }) => {
    width = w;
    render(false);
  });
  const stopVis = observeVisible(container, (v) => {
    if (!v || played) return;
    played = true;
    render(true);
  });

  return {
    update(s) {
      step = Math.max(0, Math.min(3, s | 0));
      if (!played) {
        played = true;
        render(true);
      }
      applyStep();
    },
    resize() {
      width = container.clientWidth;
      render(false);
    },
    destroy() {
      stopSize();
      stopVis();
      svgs.interrupt();
      root.selectAll('*').remove();
      root.classed('gg', false);
    },
  };
}
