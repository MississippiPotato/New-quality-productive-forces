// 数字卡片组：data = [{label, value, unit, qualifier, source_id}]，进入视口后计数动画
import * as d3 from 'd3';
import { observeVisible } from '../core/chartUtils.js';
import { theme } from '../core/theme.js';
import { tf, isEn } from '../core/i18n.js';

const val = (d) => (isEn() && d.value_en != null ? d.value_en : d.value);

export function createStatTiles(container, data, options = {}) {
  const root = d3.select(container).classed('stat-tiles', true);
  const accent = options.accent || 'var(--accent, var(--cyan))';
  const tiles = root
    .selectAll('div.stat-tile')
    .data(data)
    .join('div')
    .attr('class', 'stat-tile')
    .style('--tile-accent', accent);
  const valueEl = tiles.append('div').attr('class', 'stat-tile__value');
  valueEl.append('span').attr('class', 'stat-tile__q').text((d) => tf(d, 'qualifier') || '');
  const num = valueEl.append('span').attr('class', 'stat-tile__num');
  valueEl.append('span').attr('class', 'stat-tile__unit').text((d) => tf(d, 'unit') || '');
  tiles
    .append('div')
    .attr('class', 'stat-tile__label')
    .text((d) => tf(d, 'label'));

  const digits = (v) => (Number.isInteger(v) ? 0 : String(v).split('.')[1].length);
  const show = (sel, t) =>
    sel.text((d) => (typeof val(d) === 'number' ? d3.format(`,.${digits(val(d))}f`)(val(d) * t) : (val(d) ?? '—')));

  let played = false;
  show(num, theme.reducedMotion ? 1 : 0);
  const stop = observeVisible(container, (vis) => {
    if (!vis || played) return;
    played = true;
    num
      .transition()
      .duration(theme.countDuration)
      .ease(d3.easeCubicOut)
      .tween('count', function (d) {
        const el = d3.select(this);
        return (t) => show(el.datum(d), t);
      });
  });

  return {
    update() {},
    resize() {},
    destroy() {
      stop();
      root.selectAll('*').remove();
    },
  };
}
