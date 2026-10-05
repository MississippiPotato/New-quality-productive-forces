// 人社部新职业 / 新工种象形图：1 圆 = 1 个新职业，1 方块 = 1 个新工种，逐个点亮
// update(step)：0 全部；1 突出新职业；2 突出新工种；≥3 突出示例名单
import * as d3 from 'd3';
import { observeSize, observeVisible, createSvg, fmt, legend, srTable } from '../core/chartUtils.js';
import { theme } from '../core/theme.js';
import { t, tf, isEn } from '../core/i18n.js';
import '../styles/charts/newOccupations.css';

function dateCn(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  if (isEn()) {
    // 英文：31 July 2024 / July 2024 / 2024
    if (!m) return `${y}`;
    const month = d3.timeFormat('%B')(new Date(y, m - 1, 1));
    return d ? `${d} ${month} ${y}` : `${month} ${y}`;
  }
  return d ? `${y} 年 ${m} 月 ${d} 日` : m ? `${y} 年 ${m} 月` : `${y} 年`;
}

export function createNewOccupations(container, data, options = {}) {
  const root = d3.select(container).classed('new-occ', true);
  const blocks = [
    {
      key: 'occupations',
      n: data.occupations.value,
      label: t('个新职业', 'new occupations'),
      sub: t('1 个圆点 = 1 个新职业', '1 dot = 1 new occupation'),
      shape: 'circle',
    },
    {
      key: 'work_types',
      n: data.work_types.value,
      label: t('个新工种', 'new job types'),
      sub: t('1 个方块 = 1 个新工种', '1 square = 1 new job type'),
      shape: 'square',
    },
  ];
  const svg = createSvg(container);
  legend(root.node(), [
    { label: t('新职业', 'New occupations'), color: 'var(--worker)', shape: 'dot' },
    { label: t('新工种', 'New job types'), color: 'var(--worker)', shape: 'square' },
  ]);
  const ex = root.append('div').attr('class', 'new-occ__examples');
  ex.append('h4').text(
    t(
      `部分新职业 / 新工种示例（${dateCn(data.date)} 发布）`,
      `Examples of new occupations / job types (published ${dateCn(data.date)})`,
    ),
  );
  ex.append('ul')
    .attr('class', 'new-occ__chips')
    .selectAll('li')
    .data(data.examples)
    .join('li')
    .attr('class', 'new-occ__chip')
    .style('transition-delay', (_, i) => `${theme.reducedMotion ? 0 : 1.6 + i * 0.12}s`)
    .text((d) => tf(d, 'name'));

  const sg = data.suggestions_2023_10;
  const enQ = (o, k) => (tf(o, k) ? `${tf(o, k)} ` : '');
  // 英文：qualifier_en / ratio_qualifier_en 前置（“more than 430”“more than 2 times”）
  const ratioText = isEn()
    ? `${tf(sg, 'ratio_qualifier') ? `${tf(sg, 'ratio_qualifier')} ` : ''}${sg.ratio_vs_2021} times`
    : sg.ratio_qualifier === '多倍'
      ? `${sg.ratio_vs_2021} 倍多`
      : `${sg.ratio_vs_2021} ${sg.ratio_qualifier}`;
  const countText = isEn()
    ? `${tf(sg, 'qualifier') ? `${tf(sg, 'qualifier')} ` : ''}${fmt.int(sg.value)}`
    : `${sg.value}${sg.qualifier}`;
  root
    .append('p')
    .attr('class', 'new-occ__caption')
    .html(
      t(
        `2023 年 10 月征集到新职业建议书 <b>${fmt.int(sg.value)}</b> ${sg.qualifier}，是 2021 年申报量的 <b>${ratioText}</b>，新职业申报热度明显上升。`,
        `In October 2023, ${enQ(sg, 'qualifier')}<b>${fmt.int(sg.value)}</b> proposals for new occupations were received — ${enQ(sg, 'ratio_qualifier')}<b>${sg.ratio_vs_2021}×</b> the number submitted in 2021, a clear rise in interest.`,
      ),
    );
  srTable(
    container,
    t(
      '人社部新职业与新工种',
      'New occupations and job types (Ministry of Human Resources and Social Security)',
    ),
    [t('项目', 'Item'), t('数值', 'Value')],
    [
      [t('新职业（个）', 'New occupations'), data.occupations.value],
      [t('新工种（个）', 'New job types'), data.work_types.value],
      [t('2023 年 10 月新职业建议书（份）', 'New-occupation proposals, Oct 2023'), countText],
      [t('相对 2021 年', 'Relative to 2021'), ratioText],
      ...data.examples.map((e) => [t('示例', 'Example'), tf(e, 'name')]),
    ],
  );

  const blockG = svg.selectAll('g.block').data(blocks).join('g').attr('class', 'block');
  blockG
    .append('text')
    .attr('class', 'big-num')
    .text((d) => (theme.reducedMotion ? d.n : 0));
  blockG
    .append('text')
    .attr('class', 'big-label')
    .text((d) => d.label);
  blockG
    .append('text')
    .attr('class', 'big-sub')
    .text((d) => d.sub);
  const cellsG = blockG.append('g').attr('class', 'cells');
  const divider = svg.append('line').attr('class', 'divider');

  let width = 0;
  let played = theme.reducedMotion;
  let step = options.step != null ? +options.step : 0;

  function render() {
    if (!width) return;
    const wide = width >= 560;
    const colW = wide ? (width - 32) / 2 : width;
    const cell = wide ? Math.min(34, colW / 7) : Math.min(30, (colW - 4) / 10);
    const cols = Math.max(4, Math.floor(colW / cell));
    const headH = 70;
    const rowsOf = (n) => Math.ceil(n / cols);
    const blockH = (b) => headH + rowsOf(b.n) * cell;
    const pos = blocks.map((b, i) =>
      wide ? { x: i * (colW + 32), y: 0 } : { x: 0, y: i === 0 ? 0 : blockH(blocks[0]) + 24 },
    );
    const height = wide ? d3.max(blocks, blockH) + 6 : blockH(blocks[0]) + 24 + blockH(blocks[1]) + 6;
    svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);

    if (wide)
      divider
        .attr('x1', colW + 16)
        .attr('x2', colW + 16)
        .attr('y1', 6)
        .attr('y2', height - 6)
        .style('display', null);
    else divider.style('display', 'none');

    blockG.attr('transform', (_, i) => `translate(${pos[i].x},${pos[i].y})`);
    blockG.select('.big-num').attr('x', 0).attr('y', 44);
    blockG.each(function () {
      const g = d3.select(this);
      const numW = g.select('.big-num').node().getBBox().width || 50;
      const nx = Math.max(numW, 56) + 10;
      g.select('.big-label').attr('x', nx).attr('y', 26);
      g.select('.big-sub').attr('x', nx).attr('y', 44);
    });
    cellsG.attr('transform', `translate(0,${headH})`);

    cellsG.each(function (b) {
      const items = d3.range(b.n);
      const sel = d3
        .select(this)
        .selectAll('.cell')
        .data(items)
        .join((enter) => enter.append(b.shape === 'circle' ? 'circle' : 'rect').attr('class', 'cell'));
      const cx = (i) => (i % cols) * cell + cell / 2;
      const cy = (i) => Math.floor(i / cols) * cell + cell / 2;
      if (b.shape === 'circle')
        sel
          .attr('cx', cx)
          .attr('cy', cy)
          .attr('r', played ? cell * 0.36 : 0);
      else {
        const s = cell * 0.68;
        sel
          .attr('x', (i) => cx(i) - s / 2)
          .attr('y', (i) => cy(i) - s / 2)
          .attr('rx', 3)
          .attr('width', played ? s : 0)
          .attr('height', played ? s : 0)
          .attr('transform', null);
        b.size = s;
      }
      b.cell = cell;
    });
    applyStep();
  }

  function applyStep() {
    blockG.classed('is-dim', (b) =>
      step === 1 ? b.key !== 'occupations' : step === 2 ? b.key !== 'work_types' : false,
    );
    root.classed('is-chips', step >= 3);
  }

  function play() {
    if (played) return;
    played = true;
    root.classed('is-played', true);
    const per = 45;
    cellsG.each(function (b, bi) {
      const base = bi * (blocks[0].n * per * 0.6);
      const sel = d3.select(this).selectAll('.cell');
      if (b.shape === 'circle')
        sel
          .transition()
          .delay((i) => base + i * per)
          .duration(420)
          .ease(d3.easeBackOut.overshoot(2))
          .attr('r', b.cell * 0.36);
      else
        sel
          .attr('width', 0)
          .attr('height', 0)
          .transition()
          .delay((i) => base + i * per)
          .duration(420)
          .ease(d3.easeBackOut.overshoot(2))
          .attr('width', b.size)
          .attr('height', b.size)
          .attrTween('x', function () {
            const cx = +this.getAttribute('x') + +this.getAttribute('width') / 2;
            return (t) => cx - (b.size * Math.min(1, t)) / 2;
          })
          .attrTween('y', function () {
            const cy = +this.getAttribute('y') + +this.getAttribute('height') / 2;
            return (t) => cy - (b.size * Math.min(1, t)) / 2;
          });
      d3.select(this.parentNode)
        .select('.big-num')
        .transition()
        .delay(base)
        .duration(Math.max(theme.countDuration, b.n * per))
        .ease(d3.easeCubicOut)
        .tween('text', function () {
          const i = d3.interpolateRound(0, b.n);
          return (t) => {
            this.textContent = i(t);
          };
        });
    });
  }

  const stopSize = observeSize(container, ({ width: w }) => {
    width = w;
    render();
  });
  if (played) root.classed('is-played', true);
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
      root.classed('new-occ is-played is-chips', false);
    },
  };
}
