// 各国累计大规模 AI 系统条形竞赛（OWID / Epoch AI）
// update(step)：0 回到首年并播放；1 跳到最新年份（停止播放）
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
  styleAxis,
} from '../core/chartUtils.js';
import { theme } from '../core/theme.js';
import { bindTooltip, tooltip } from '../core/tooltip.js';
import { owidName } from './countryNames.js';
import { t, isEn } from '../core/i18n.js';
import '../styles/charts/barRace.css';

const TOTAL = 'All large-scale AI systems';
const TOP_N = 10;
const K = 10; // 每年插值帧数
const FRAME_MS = 120;

const barColor = (e) =>
  e === 'China' || e === 'Hong Kong' ? 'var(--cn)' : e === 'United States' ? 'var(--us)' : 'var(--other)';
// 英文条形标签用的简称（完整名称见 tooltip）
const SHORT_EN = { 'United States': 'US', 'United Kingdom': 'UK', 'United Arab Emirates': 'UAE' };
const barName = (e) => (isEn() && SHORT_EN[e]) || owidName(e);
const barOpacity = (e) => (e === 'China' || e === 'United States' ? 1 : e === 'Hong Kong' ? 0.55 : 0.5);

export function createBarRace(container, data) {
  const rows = data.filter((d) => d.year != null && d.count != null);
  const years = [...new Set(rows.map((d) => +d.year))].sort((a, b) => a - b);
  const entities = [...new Set(rows.filter((d) => d.entity !== TOTAL).map((d) => d.entity))];
  const val = d3.rollup(
    rows,
    (v) => +v[0].count,
    (d) => d.entity,
    (d) => +d.year,
  );
  const get = (e, y) => val.get(e)?.get(y);
  const totalAt = (y) => get(TOTAL, y);

  // 关键帧：相邻年份之间插值 K 帧（仅用于条形长度的动画过渡）
  const keyframes = [];
  d3.pairs(years).forEach(([ya, yb]) => {
    for (let k = 0; k < K; k += 1) {
      const f = k / K;
      keyframes.push({
        t: ya + f,
        year: f < 0.5 ? ya : yb,
        values: entities.map((e) => [e, d3.interpolateNumber(get(e, ya) || 0, get(e, yb) || 0)(f)]),
      });
    }
  });
  const yLast = years[years.length - 1];
  keyframes.push({ t: yLast, year: yLast, values: entities.map((e) => [e, get(e, yLast) || 0]) });
  keyframes.forEach((kf) => {
    const sorted = kf.values
      .filter(([, v]) => v > 0)
      .sort((a, b) => d3.descending(a[1], b[1]) || d3.ascending(a[0], b[0]));
    kf.ranked = sorted.slice(0, TOP_N).map(([e, v], rank) => ({ entity: e, value: v, rank }));
    kf.max = d3.max(kf.ranked, (d) => d.value) || 1;
  });

  const root = d3.select(container).classed('bar-race', true);
  const controls = root.append('div').attr('class', 'br__controls');
  const playBtn = controls.append('button').attr('type', 'button').attr('class', 'btn btn--primary');
  const replayBtn = controls
    .append('button')
    .attr('type', 'button')
    .attr('class', 'btn')
    .text(t('↺ 重播', '↺ Replay'));
  const sliderWrap = controls.append('label').attr('class', 'br__slider');
  sliderWrap.append('span').text(years[0]);
  const slider = sliderWrap
    .append('input')
    .attr('type', 'range')
    .attr('min', 0)
    .attr('max', keyframes.length - 1)
    .attr('step', 1)
    .attr('aria-label', t('选择年份', 'Select year'));
  sliderWrap.append('span').text(yLast);

  const svg = createSvg(container, 'br').attr(
    'aria-label',
    t('各国累计大规模 AI 系统数量条形竞赛', 'Bar chart race: cumulative large-scale AI systems by country'),
  );
  const legendWrap = root.append('div');
  legend(legendWrap.node(), [
    { label: t('中国', 'China'), color: 'var(--cn)', shape: 'square' },
    { label: t('美国', 'United States'), color: 'var(--us)', shape: 'square' },
    {
      label: t('中国香港（OWID 单列）', 'Hong Kong, China (listed separately by OWID)'),
      color: 'color-mix(in srgb, var(--cn) 55%, transparent)',
      shape: 'square',
    },
    {
      label: t('其他国家 / 多国合作', 'Other countries / multinational'),
      color: 'color-mix(in srgb, var(--other) 50%, transparent)',
      shape: 'square',
    },
  ]);
  note(
    container,
    t(
      `统计对象为“大规模 AI 系统”（OWID / Epoch AI 定义），数值为截至当年的累计数；中国香港由 OWID 单列，未计入中国；“全球合计”为 OWID 的 ${TOTAL} 序列。年份之间的条形长度为动画过渡，数值标签只显示整年的实际值。`,
      `Counts “large-scale AI systems” as defined by OWID / Epoch AI; values are cumulative to the end of each year. Hong Kong, China is listed separately by OWID and is not included in China. “World total” is OWID’s “${TOTAL}” series. Bar lengths between years are animated transitions; value labels show only actual whole-year values.`,
    ),
    'info',
  );
  srTable(
    container,
    t(`累计大规模 AI 系统数（${yLast} 年）`, `Cumulative large-scale AI systems (${yLast})`),
    [t('国家/地区', 'Country/region'), t('累计数', 'Cumulative count')],
    keyframes[keyframes.length - 1].ranked.map((d) => [owidName(d.entity), get(d.entity, yLast)]),
  );

  const gx = svg.append('g').attr('class', 'x-axis');
  const plot = svg.append('g');
  const gBars = plot.append('g');
  const gNames = plot.append('g');
  const gVals = plot.append('g');
  // 英文名称较长：按实际文字宽度确定左边距
  const ranked = [...new Set(keyframes.flatMap((kf) => kf.ranked.map((d) => d.entity)))];
  const measure = svg.append('text').attr('class', 'br__name').style('visibility', 'hidden');
  const nameWidth = (fs) => {
    measure.style('font-size', `${fs}px`);
    const w = d3.max(ranked, (e) => measure.text(barName(e)).node().getComputedTextLength()) || 0;
    measure.text('');
    return w;
  };
  const yearText = svg.append('text').attr('class', 'br__year').attr('text-anchor', 'end');
  const totalText = svg.append('text').attr('class', 'br__total').attr('text-anchor', 'end');
  totalText.append('tspan').attr('class', 'n').text(t('全球合计 ', 'World total '));
  const totalV = totalText.append('tspan').attr('class', 'v');
  totalText.append('tspan').text(t(' 个', ' systems'));
  const unitText = svg
    .append('text')
    .attr('class', 'axis-label')
    .attr('y', 12)
    .text(t('单位：个（累计）', 'Unit: systems (cumulative)'));

  let width = 0;
  let height = 0;
  let iw = 0;
  let ih = 0;
  const margin = { top: 40, right: 48, bottom: 12, left: 74 };
  let frame = theme.reducedMotion ? keyframes.length - 1 : 0;
  let playing = false;
  let timer = null;
  let visible = false;
  let autoplayed = false;
  let resumeOnVisible = false;
  const x = d3.scaleLinear();
  const y = d3
    .scaleBand()
    .domain(d3.range(TOP_N + 1))
    .paddingInner(0.18);

  function layout() {
    if (!width) return;
    height = chartHeight(width, { aspect: 0.58, min: 360, max: 500 });
    margin.left = width < 480 ? 64 : 80;
    if (isEn()) margin.left = Math.max(margin.left, Math.ceil(nameWidth(12)) + 14);
    margin.right = width < 480 ? 36 : 48;
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
    iw = width - margin.left - margin.right;
    ih = height - margin.top - margin.bottom;
    x.range([0, iw]);
    y.range([0, (ih / TOP_N) * (TOP_N + 1)]);
    plot.attr('transform', `translate(${margin.left},${margin.top})`);
    gx.attr('transform', `translate(${margin.left},${margin.top - 6})`);
    const ys = Math.max(40, Math.min(84, width / 8));
    yearText
      .attr('x', width - margin.right)
      .attr('y', height - margin.bottom - 30)
      .style('font-size', `${ys}px`);
    totalText.attr('x', width - margin.right).attr('y', height - margin.bottom - 6);
    unitText.attr('x', 0);
    draw(frame, 0);
  }

  function draw(i, duration) {
    if (!width) return;
    const kf = keyframes[i];
    const prev = keyframes[Math.max(0, i - 1)];
    const trn = svg.transition().duration(duration).ease(d3.easeLinear);
    x.domain([0, kf.max * 1.04]);

    gx.transition(trn).call(
      d3
        .axisTop(x)
        .ticks(width < 480 ? 3 : 6)
        .tickSize(-ih - 6)
        .tickFormat(d3.format(',d')),
    );
    styleAxis(gx);
    gx.selectAll('.tick line').attr('class', 'grid-line');
    gx.selectAll('.tick')
      .filter((d) => !Number.isInteger(d))
      .remove();

    const prevRank = new Map(prev.ranked.map((d) => [d.entity, d]));
    const bh = y.bandwidth();
    const enterY = y(TOP_N);

    gBars
      .selectAll('rect.br__bar')
      .data(kf.ranked, (d) => d.entity)
      .join(
        (enter) =>
          enter
            .append('rect')
            .attr('class', 'br__bar')
            .attr('rx', 3)
            .attr('x', 0)
            .attr('y', enterY)
            .attr('height', bh)
            .attr('width', (d) => x(prevRank.get(d.entity)?.value || 0))
            .style('fill', (d) => barColor(d.entity))
            .style('fill-opacity', (d) => barOpacity(d.entity))
            .call(bindTooltip, (d) => tip(d.entity)),
        (update) => update,
        (exit) => exit.transition(trn).attr('y', enterY).attr('width', 0).remove(),
      )
      .transition(trn)
      .attr('y', (d) => y(d.rank))
      .attr('height', bh)
      .attr('width', (d) => Math.max(1, x(d.value)));

    gNames
      .selectAll('text.br__name')
      .data(kf.ranked, (d) => d.entity)
      .join(
        (enter) =>
          enter
            .append('text')
            .attr('class', 'br__name')
            .attr('text-anchor', 'end')
            .attr('x', -8)
            .attr('dy', '0.35em')
            .attr('y', enterY + bh / 2)
            .style('opacity', 0)
            .text((d) => barName(d.entity)),
        (update) => update,
        (exit) =>
          exit
            .transition(trn)
            .attr('y', enterY + bh / 2)
            .style('opacity', 0)
            .remove(),
      )
      .style('fill', (d) =>
        d.entity === 'China' || d.entity === 'United States' ? barColor(d.entity) : null,
      )
      .style('font-size', `${bh < 18 ? 11 : 12}px`)
      .transition(trn)
      .attr('y', (d) => y(d.rank) + bh / 2)
      .style('opacity', 1);

    gVals
      .selectAll('text.br__val')
      .data(kf.ranked, (d) => d.entity)
      .join(
        (enter) =>
          enter
            .append('text')
            .attr('class', 'br__val')
            .attr('dy', '0.35em')
            .attr('y', enterY + bh / 2)
            .attr('x', (d) => x(prevRank.get(d.entity)?.value || 0) + 6)
            .style('opacity', 0),
        (update) => update,
        (exit) =>
          exit
            .transition(trn)
            .attr('y', enterY + bh / 2)
            .style('opacity', 0)
            .remove(),
      )
      .text((d) => fmt.int(get(d.entity, kf.year)))
      .style('font-size', `${bh < 18 ? 11 : 12}px`)
      .transition(trn)
      .attr('y', (d) => y(d.rank) + bh / 2)
      .attr('x', (d) => Math.max(1, x(d.value)) + 6)
      .style('opacity', 1);

    yearText.text(kf.year);
    totalV.text(fmt.int(totalAt(kf.year)));
    slider.property('value', i);
    playBtn.text(playing ? t('❚❚ 暂停', '❚❚ Pause') : t('▶ 播放', '▶ Play')).attr('aria-pressed', playing);
  }

  function tip(e) {
    const kf = keyframes[frame];
    const v = get(e, kf.year);
    const hk =
      e === 'Hong Kong'
        ? `<br><em>${t('OWID 单列，未计入中国', 'Listed separately by OWID; not included in China')}</em>`
        : '';
    return t(
      `<strong>${owidName(e)}</strong><br>${kf.year} 年累计大规模 AI 系统：<b>${fmt.int(v)}</b> 个${hk}`,
      `<strong>${owidName(e)}</strong><br>Cumulative large-scale AI systems, ${kf.year}: <b>${fmt.int(v)}</b>${hk}`,
    );
  }

  // ---------- 播放控制 ----------
  function nextIndex(i) {
    if (!theme.reducedMotion) return i + 1;
    // 减少动效：逐年跳转、无插值
    let j = i + 1;
    while (j < keyframes.length - 1 && keyframes[j].t % 1 !== 0) j += 1;
    return j;
  }
  function tick() {
    timer = null;
    if (!playing) return;
    if (frame >= keyframes.length - 1) {
      playing = false;
      draw(frame, 0);
      return;
    }
    frame = nextIndex(frame);
    const dur = theme.reducedMotion ? 0 : FRAME_MS;
    draw(frame, dur);
    timer = d3.timeout(tick, theme.reducedMotion ? 700 : FRAME_MS);
  }
  function play(fromStart = false) {
    if (fromStart || frame >= keyframes.length - 1) {
      frame = 0;
      draw(frame, 0);
    }
    playing = true;
    autoplayed = true;
    timer?.stop();
    timer = d3.timeout(tick, theme.reducedMotion ? 400 : 250);
    draw(frame, 0);
  }
  function pause() {
    playing = false;
    timer?.stop();
    timer = null;
    draw(frame, 0);
  }
  function jump(i, duration = 300) {
    timer?.stop();
    timer = null;
    playing = false;
    frame = Math.max(0, Math.min(keyframes.length - 1, i));
    draw(frame, theme.reducedMotion ? 0 : duration);
  }

  playBtn.on('click', () => (playing ? pause() : play()));
  replayBtn.on('click', () => play(true));
  slider.on('input', function () {
    jump(+this.value, 120);
  });

  const stopSize = observeSize(container, ({ width: w }) => {
    width = w;
    layout();
  });
  const stopVis = observeVisible(container, (v) => {
    visible = v;
    if (v) {
      if (!autoplayed && !theme.reducedMotion) play(true);
      else if (resumeOnVisible) {
        resumeOnVisible = false;
        play();
      }
    } else if (playing) {
      resumeOnVisible = true;
      pause();
    }
  });

  return {
    update(step) {
      if (step >= 1) {
        autoplayed = true;
        resumeOnVisible = false;
        jump(keyframes.length - 1, 600);
      } else if (!playing) {
        if (theme.reducedMotion)
          jump(keyframes.length - 1, 0); // 减少动效：直接给出完整的最新年份，可用滑块逐年查看
        else if (visible || !autoplayed) play(true);
      }
    },
    resize() {
      width = container.clientWidth;
      layout();
    },
    destroy() {
      tooltip.hide();
      timer?.stop();
      playing = false;
      stopSize();
      stopVis();
      svg.selectAll('*').interrupt();
      root.selectAll('*').remove();
    },
  };
}
