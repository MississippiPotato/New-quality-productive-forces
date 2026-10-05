// 全球灯塔网络规模：阶梯折线 + 柱，首个时点堆叠显示中国部分；标注 2025-09 新批次
// 附：2025 年新增数的口径分歧（WEF vs 麦肯锡）、生产制造环节大模型案例占比变化
// update(step)：0 全部；1 突出首个时点的中国部分；2 突出 2025-09 新批次
import * as d3 from 'd3';
import {
  observeSize,
  createSvg,
  chartHeight,
  tr,
  fmt,
  legend,
  note,
  srTable,
  styleAxis,
  toDate,
} from '../core/chartUtils.js';
import { bindTooltip } from '../core/tooltip.js';
import { t, tf, isEn } from '../core/i18n.js';
import '../styles/charts/lighthouse.css';

let uid = 0;
const dateLabel = (s) => {
  const [y, m] = String(s).split('-');
  return m ? `${y}.${m}` : `${y}`;
};

export function createLighthouse(container, data, options = {}) {
  const root = d3.select(container).classed('lighthouse', true);
  const gid = `lh-grad-${(uid += 1)}`;
  const net = data.network.map((d) => ({ ...d, d: toDate(d.date) }));
  const firstCn = net.find((d) => d.china != null);
  const batch = net.find((d) => d.new_batch != null);
  const yearOnly = net.filter((d) => /^\d{4}$/.test(d.date));

  const svg = createSvg(container);
  const sep = t('：', ': ');
  legend(root.node(), [
    { label: t('灯塔工厂总数（家）', 'Total Lighthouse factories'), color: 'var(--tool)', shape: 'line' },
    ...(firstCn
      ? [
          {
            label: t(`其中中国（${dateLabel(firstCn.date)}）`, `Of which China (${dateLabel(firstCn.date)})`),
            color: 'var(--cn)',
            shape: 'square',
          },
        ]
      : []),
    ...(batch
      ? [{ label: t('新入选批次', 'Newly added batch'), color: 'var(--green)', shape: 'square' }]
      : []),
  ]);

  const insets = root.append('div').attr('class', 'lighthouse__insets');
  const notes = [];
  // 只有中国占比、没有中国数量的时点（不画柱，只在点旁标注占比）
  const shareOnly = net.filter((d) => d.china == null && d.china_share != null);
  const shareList = shareOnly.map((d) => `${dateLabel(d.date)}${t('：', ': ')}${d.china_share}%`);
  const rest = shareOnly.length
    ? t(
        `其余时点仅有中国占比（${shareList.join('、')}），未给出中国数量。`,
        `For other dates only China's share is available (${shareList.join(', ')}), not the number of factories. `,
      )
    : t('其余时点未摘录分国别数据。', 'country breakdowns were not extracted for other dates. ');
  // 数据中有 network_notes（中国数据来源说明）时直接采用，否则按字段拼出说明
  if (data.network_notes) {
    const nn = String(tf(data, 'network_notes')).trim();
    notes.push(/[。.]$/.test(nn) ? `${nn}${/。$/.test(nn) ? '' : ' '}` : `${nn}${t('。', '. ')}`);
  } else if (firstCn)
    notes.push(
      t(
        `${dateLabel(firstCn.date)} 的中国数量（${firstCn.china} 家，占 ${firstCn.china_share}%）据环球时报报道；${rest}`,
        `The China figure for ${dateLabel(firstCn.date)} (${firstCn.china} factories, ${firstCn.china_share}% of the total) is as reported by Global Times${shareOnly.length ? '. ' : '; '}${rest}`,
      ),
    );
  else if (shareOnly.length) notes.push(rest);
  if (yearOnly.length)
    notes.push(
      t(
        `${yearOnly.map((d) => d.date).join('、')} 仅注明年份，按年中位置绘制。`,
        `${yearOnly.map((d) => d.date).join(', ')}: only the year is given, so ${yearOnly.length > 1 ? 'they are' : 'it is'} plotted at mid-year.`,
      ),
    );
  note(container, `⚠ ${notes.join('')}`, 'warn');
  srTable(
    container,
    t('全球灯塔网络规模', 'Size of the Global Lighthouse Network'),
    [
      t('日期', 'Date'),
      t('总数', 'Total'),
      t('中国', 'China'),
      t('中国占比 %', 'China share %'),
      t('新批次', 'New batch'),
      t('新批次中国', 'New batch, China'),
    ],
    net.map((d) => [
      d.date,
      d.total,
      d.china ?? '—',
      d.china_share ?? '—',
      d.new_batch ?? '—',
      d.new_batch_china ?? '—',
    ]),
  );

  // ---- 附图 1：2025 年新增数口径分歧 ----
  const dis = data.new_2025_disagreement || [];
  if (dis.length) {
    // 本站采用值：显式 used 字段优先，否则取 WEF 开头的机构
    const used = dis.find((d) => d.used) || dis.find((d) => /^WEF/.test(d.org));
    const card = insets.append('div').attr('class', 'lighthouse__card');
    card.append('h4').text(t('2025 年新增灯塔数量：两种说法', 'New Lighthouses in 2025: two figures'));
    card
      .append('div')
      .attr('class', 'lighthouse__dis')
      .selectAll('div')
      .data(dis)
      .join('div')
      .classed('is-used', (d) => d === used)
      .html(
        (d) =>
          `<strong>${fmt.int(d.value)}</strong>${tf(d, 'org')}${d === used ? t(' · 本站采用', ' · used here') : ''}`,
      );
    const usedOrg = tf(used || dis[0], 'org');
    card
      .append('p')
      .style('margin', '6px 0 0')
      .style('font-size', '12px')
      .text(
        t(
          `两者口径不一致；本站以“${usedOrg}”的数值为准。`,
          `The two use different definitions; this site follows the ${usedOrg} figure.`,
        ),
      );
  }

  // ---- 附图 2：生产制造环节大模型应用案例占比 ----
  const share = data.manufacturing_case_share || [];
  if (share.length >= 2) {
    const card = insets.append('div').attr('class', 'lighthouse__card');
    card
      .append('h4')
      .text(
        t(
          '生产制造环节的大模型应用案例占比',
          'Share of large-model use cases in production and manufacturing',
        ),
      );
    const [a, b] = [share[0], share[share.length - 1]];
    const w = 260;
    const h = 64;
    const s = card
      .append('svg')
      .attr('viewBox', `0 0 ${w} ${h}`)
      .attr('width', '100%')
      .style('max-width', `${w}px`)
      .style('height', 'auto');
    s.append('text').attr('class', 'v').attr('x', 0).attr('y', 26).text(`${a.value}${a.unit}`);
    s.append('text').attr('x', 0).attr('y', 48).text(tf(a, 'label'));
    s.append('text')
      .attr('class', 'v v--to')
      .attr('x', w)
      .attr('y', 26)
      .attr('text-anchor', 'end')
      .text(`${b.value}${b.unit}`);
    s.append('text').attr('x', w).attr('y', 48).attr('text-anchor', 'end').text(tf(b, 'label'));
    s.append('path')
      .attr('class', 'arrow')
      .attr('d', `M64,20 L${w - 78},20`);
    s.append('path')
      .attr('class', 'arrow-head')
      .attr('d', `M${w - 78},14 L${w - 68},20 L${w - 78},26 Z`);
    card
      .append('p')
      .style('margin', '4px 0 0')
      .style('font-size', '12px')
      .text(
        t(
          '来源：中国信通院（人民日报报道），B 级来源',
          "Source: CAICT (as reported by People's Daily), grade-B source",
        ),
      );
  }

  const defs = svg.append('defs');
  const grad = defs
    .append('linearGradient')
    .attr('id', gid)
    .attr('x1', 0)
    .attr('x2', 0)
    .attr('y1', 0)
    .attr('y2', 1);
  grad.append('stop').attr('offset', '0%').style('stop-color', 'var(--tool)').style('stop-opacity', 0.32);
  grad.append('stop').attr('offset', '100%').style('stop-color', 'var(--tool)').style('stop-opacity', 0.02);

  const gx = svg.append('g').attr('class', 'x-axis');
  const gy = svg.append('g').attr('class', 'y-axis');
  const plot = svg.append('g');
  const area = plot.append('path').attr('class', 'step-area').style('fill', `url(#${gid})`);
  const colsG = plot.append('g');
  const line = plot.append('path').attr('class', 'step-line');
  const ptsG = plot.append('g');
  const annotG = plot.append('g').attr('class', 'annot-g');
  const yLabel = svg.append('text').attr('class', 'axis-label').attr('y', 14);

  let width = 0;
  let step = options.step != null ? +options.step : 0;
  let first = true;

  function render(animate) {
    if (!width) return;
    const narrow = width < 520;
    const height = chartHeight(width, { aspect: 0.5, min: 300, max: 420 });
    const margin = { top: 34, right: narrow ? 30 : 48, bottom: 34, left: narrow ? 36 : 46 };
    const iw = width - margin.left - margin.right;
    const ih = height - margin.top - margin.bottom;
    svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);
    plot.attr('transform', `translate(${margin.left},${margin.top})`);
    gx.attr('transform', `translate(${margin.left},${margin.top + ih})`);
    gy.attr('transform', `translate(${margin.left},${margin.top})`);
    yLabel.attr('x', margin.left - (narrow ? 30 : 40)).text(t('单位：家', 'Unit: factories'));

    const [d0, d1] = d3.extent(net, (d) => d.d);
    const x = d3
      .scaleTime()
      .domain([d3.timeMonth.offset(d0, -2), d3.timeMonth.offset(d1, 2)])
      .range([0, iw]);
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(net, (d) => d.total) * 1.18])
      .nice()
      .range([ih, 0]);
    gx.call(
      d3
        .axisBottom(x)
        .tickValues(net.map((d) => d.d))
        .tickFormat((_, i) =>
          narrow ? dateLabel(net[i].date).replace(/^20(\d\d)\./, '$1.') : dateLabel(net[i].date),
        )
        .tickSize(0)
        .tickPadding(10),
    );
    styleAxis(gx);
    gy.call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat(d3.format(',')));
    styleAxis(gy);
    gy.selectAll('.tick line').attr('class', 'grid-line');

    const tt = (sel, delay) => (animate || first ? tr(sel, delay) : sel);
    const stepGen = d3
      .line()
      .x((d) => x(d.d))
      .y((d) => y(d.total))
      .curve(d3.curveStepAfter);
    const ext = [...net, { ...net[net.length - 1], d: x.domain()[1] }];
    line.attr('d', stepGen(ext));
    area.attr(
      'd',
      d3
        .area()
        .x((d) => x(d.d))
        .y0(ih)
        .y1((d) => y(d.total))
        .curve(d3.curveStepAfter)(ext),
    );
    if (first) {
      const len = line.node().getTotalLength();
      line.attr('stroke-dasharray', `${len} ${len}`).attr('stroke-dashoffset', len);
      tr(line, 200)
        .attr('stroke-dashoffset', 0)
        .on('end', () => line.attr('stroke-dasharray', null));
    }

    // 柱：首个时点堆叠中国部分
    const cw = Math.max(10, Math.min(30, iw / 18));
    const cols = colsG
      .selectAll('g.col')
      .data(
        net.filter((d) => d.china != null),
        (d) => d.date,
      )
      .join((enter) => {
        const g = enter.append('g').attr('class', 'col');
        g.append('rect').attr('class', 'col-total');
        g.append('rect').attr('class', 'col-cn');
        return g;
      });
    cols.attr('transform', (d) => `translate(${x(d.d) - cw / 2},0)`);
    cols
      .select('.col-total')
      .attr('width', cw)
      .attr('rx', 3)
      .style('fill', 'var(--tool)')
      .style('fill-opacity', 0.35)
      .call((s) => (first ? s.attr('y', ih).attr('height', 0) : s))
      .call((s) =>
        tt(s, 100)
          .attr('y', (d) => y(d.total))
          .attr('height', (d) => ih - y(d.total)),
      );
    cols
      .select('.col-cn')
      .attr('width', cw)
      .attr('rx', 3)
      .style('fill', 'var(--cn)')
      .style('display', (d) => (d.china != null ? null : 'none'))
      .call((s) => (first ? s.attr('y', ih).attr('height', 0) : s))
      .call((s) =>
        tt(s, 400)
          .attr('y', (d) => (d.china != null ? y(d.china) : ih))
          .attr('height', (d) => (d.china != null ? ih - y(d.china) : 0)),
      );
    cols.call(bindTooltip, (d) =>
      t(
        `<strong>${dateLabel(d.date)}</strong><br>灯塔工厂总数：${fmt.int(d.total)} 家${d.china != null ? `<br>其中中国：${d.china} 家（${d.china_share}%）<br><em>中国数据：据环球时报报道</em>` : ''}${d.new_batch != null ? `<br>本批新增：${d.new_batch} 家${d.new_batch_china != null ? `，其中中国 ${d.new_batch_china} 家` : ''}` : ''}`,
        `<strong>${dateLabel(d.date)}</strong><br>Total Lighthouse factories${sep}${fmt.int(d.total)}${d.china != null ? `<br>Of which China${sep}${d.china} (${d.china_share}%)<br><em>China figure: as reported by Global Times</em>` : ''}${d.new_batch != null ? `<br>Newly added in this batch${sep}${d.new_batch}${d.new_batch_china != null ? `, of which China ${d.new_batch_china}` : ''}` : ''}`,
      ),
    );

    // 点与数值
    const pts = ptsG
      .selectAll('g.p')
      .data(net, (d) => d.date)
      .join((enter) => {
        const g = enter.append('g').attr('class', 'p');
        g.append('circle').attr('class', 'pt').attr('r', 5.5);
        g.append('text').attr('class', 'pt-label').attr('text-anchor', 'middle').attr('dy', -12);
        return g;
      });
    pts.attr('transform', (d) => `translate(${x(d.d)},${y(d.total)})`);
    pts.select('.pt-label').text((d) => fmt.int(d.total));
    // 只有中国占比（无数量）的时点：在数值标签上方标注占比
    pts
      .selectAll('text.pt-share')
      .data((d) => (d.china == null && d.china_share != null ? [d] : []))
      .join('text')
      .attr('class', 'pt-share cn-label')
      .attr('text-anchor', 'middle')
      .attr('dy', -30)
      .text((d) => t(`中国占 ${d.china_share}%`, `China ${d.china_share}%`));
    pts.call(bindTooltip, (d) => {
      const sep2 = t('：', ': ');
      const share =
        d.china_share != null
          ? `<br>${t('中国占比', 'China share')}${sep2}${d.china_share}%${d.china != null ? t(`（${d.china} 家）`, ` (${d.china})`) : ''}`
          : '';
      return `<strong>${dateLabel(d.date)}</strong><br>${t('灯塔工厂总数', 'Total Lighthouse factories')}${sep2}${fmt.int(d.total)}${share}`;
    });
    (first ? pts.attr('opacity', 0) : pts).call((s) => tt(s, 500).attr('opacity', 1));

    // 注释：中国部分 / 新批次
    annotG.selectAll('*').remove();
    if (firstCn) {
      const g = annotG.append('g').attr('class', 'ann-cn');
      const ax = x(firstCn.d) + cw / 2 + 8;
      const ay = y(firstCn.china / 2);
      g.append('text')
        .attr('class', 'cn-label')
        .attr('x', ax)
        .attr('y', ay - 2)
        .text(t(`中国 ${firstCn.china} 家`, `China: ${firstCn.china}`));
      g.append('text')
        .attr('class', 'cn-label')
        .attr('x', ax)
        .attr('y', ay + 14)
        .text(t(`占 ${firstCn.china_share}%`, `${firstCn.china_share}% of total`));
    }
    if (batch) {
      const g = annotG.append('g').attr('class', 'batch');
      const bx = x(batch.d);
      const by0 = y(batch.total);
      const by1 = y(batch.total - batch.new_batch);
      // 新批次段：总数顶部的 new_batch 段（绿），其中中国部分（橙）
      const seg = g.append('g').attr('class', 'batch-seg');
      const segY = (v) => y(v);
      seg
        .append('rect')
        .attr('x', bx - cw / 2)
        .attr('width', cw)
        .attr('y', segY(batch.total))
        .attr('height', segY(batch.total - batch.new_batch) - segY(batch.total))
        .attr('rx', 2)
        .style('fill', 'var(--green)');
      if (batch.new_batch_china != null)
        seg
          .append('rect')
          .attr('x', bx - cw / 2)
          .attr('width', cw)
          .attr('y', segY(batch.total - batch.new_batch + batch.new_batch_china))
          .attr(
            'height',
            segY(batch.total - batch.new_batch) - segY(batch.total - batch.new_batch + batch.new_batch_china),
          )
          .style('fill', 'var(--cn)');
      // 括号标出新增段
      const bxx = bx + cw / 2 + 6;
      g.append('path').attr('d', `M${bxx - 4},${by0}H${bxx}V${by1}H${bxx - 4}`);
      const tx = bxx + 6;
      const right = tx + (isEn() ? 130 : 120) < iw;
      const lx = right ? tx : bx - cw / 2 - 10;
      const anchor = right ? 'start' : 'end';
      const my = (by0 + by1) / 2 + Math.max(24, ih * 0.12);
      g.append('text')
        .attr('x', lx)
        .attr('y', my)
        .attr('text-anchor', anchor)
        .text(
          t(
            `新入选 ${batch.new_batch} 家`,
            narrow ? `+${batch.new_batch} new` : `${batch.new_batch} newly added`,
          ),
        );
      g.append('text')
        .attr('class', 'sub')
        .attr('x', lx)
        .attr('y', my + 16)
        .attr('text-anchor', anchor)
        .text(
          t(
            `其中中国 ${batch.new_batch_china} 家`,
            narrow ? `China ${batch.new_batch_china}` : `of which China ${batch.new_batch_china}`,
          ),
        );
    }
    applyStep();
    first = false;
  }

  function applyStep() {
    const cnOn = step === 1;
    const batchOn = step === 2;
    colsG
      .selectAll('g.col')
      .classed('is-dim', (d) => (cnOn ? d.china == null : batchOn ? d.new_batch == null : false));
    annotG.select('.ann-cn').classed('is-dim', batchOn);
    annotG.select('.batch').classed('is-dim', cnOn);
  }

  const stop = observeSize(container, ({ width: w }) => {
    width = w;
    render(false);
  });

  return {
    update(s) {
      step = s;
      applyStep();
    },
    resize() {
      width = container.clientWidth;
      render(false);
    },
    destroy() {
      stop();
      root.selectAll('*').interrupt().remove();
      root.classed('lighthouse', false);
    },
  };
}
