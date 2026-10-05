// 世界地图：天地图在线底图（审图号 GS（2026）4921号）+ D3 数据气泡，可拖拽缩放
// 合规：本图不绘制任何国界——国界与注记全部来自天地图瓦片；未配置 Key 时只画经纬网、数据点
//       与天地图中国行政区划轮廓（同一审图号），不显示其他国家边界。
// update(step)：0 累计大规模 AI 系统（OWID，最新年份）；1 AI 活力总分（Stanford HAI 2025 版，36 国）
import * as d3 from 'd3';
import { tile as d3tile, tileWrap } from 'd3-tile';
import { observeSize, chartHeight, note, legend, srTable, fmt } from '../core/chartUtils.js';
import { bindTooltip } from '../core/tooltip.js';
import { theme, onThemeChange } from '../core/theme.js';
import { t, tf, isEn } from '../core/i18n.js';
import { rewind, isNineDash, SHEET_NUMBER } from './geoUtils.js';
import { tdtKey, tdtTileUrl } from './tianditu.js';
import '../styles/charts/worldMap.css';

const TAU = 2 * Math.PI;

export function createWorldMap(container, data) {
  const key = tdtKey();
  const root = d3.select(container).classed('wm', true);
  const head = root.append('div').attr('class', 'wm__head');
  const seg = head.append('div').attr('class', 'seg').attr('role', 'tablist');
  const yearBox = head.append('label').attr('class', 'wm__year');
  yearBox.append('span').text(t('年份', 'Year'));
  const slider = yearBox.append('input').attr('type', 'range');
  const yearOut = yearBox.append('output').attr('class', 'wm__year-val');

  const stage = root.append('div').attr('class', 'wm__stage');
  const svg = stage.append('svg').attr('class', 'chart wm__svg').attr('role', 'img');
  const gTiles = svg.append('g').attr('class', `wm__tiles wm__tiles--${theme.mode}`);
  const gLabels = svg.append('g').attr('class', `wm__tiles wm__tiles--${theme.mode}`);
  const gGrat = svg.append('g').attr('class', 'wm__grat');
  const gChina = svg.append('g').attr('class', 'wm__china');
  const gBubbles = svg.append('g').attr('class', 'wm__bubbles');
  const gText = svg.append('g').attr('class', 'wm__text');
  stage
    .append('div')
    .attr('class', 'wm__credit')
    .text(
      `${t('底图', 'Base map')} © ${t('天地图', 'Tianditu')} · ${t('审图号', 'Map approval No.')} ${SHEET_NUMBER}`,
    );
  const zoomBtns = stage.append('div').attr('class', 'wm__zoom');
  if (!key) {
    stage
      .append('div')
      .attr('class', 'wm__nokey')
      .html(
        t(
          '未配置天地图 Key：仅显示经纬网、数据点与天地图中国行政区划；配置后显示完整审图底图（见 README）。',
          'No Tianditu key configured: showing graticule, data points and the Tianditu China outline only; configure a key to load the approved base map (see README).',
        ),
      );
  }
  const legendWrap = root.append('div');
  const caveat = note(container, '', 'info');
  note(
    container,
    t(
      `本图不绘制任何国界：底图与国界、注记均来自天地图在线服务（${SHEET_NUMBER}），数据气泡位置为国家代表点（近似坐标），不表示边界。`,
      `No borders are drawn by this site: the base map, borders and labels come from the Tianditu online service (${SHEET_NUMBER}); bubbles sit at approximate representative points and imply no boundaries.`,
    ),
    'info',
  );

  // ---------- 数据 ----------
  const pointBy = new Map(data.points.records.map((p) => [p.entity, p]));
  const owid = data.owid.filter((r) => pointBy.has(r.entity));
  const years = [...new Set(owid.map((r) => r.year))].sort(d3.ascending);
  let year = years[years.length - 1];
  const vibData = data.competition.vibrancy_2025;
  const vib = vibData.records;
  const pillars = vibData.pillars || [];
  const pointByIso = new Map(data.points.records.map((p) => [p.iso3, p]));
  let mode = 'owid';

  srTable(
    container,
    t('各国累计大规模 AI 系统数（OWID）', 'Cumulative large-scale AI systems by country (OWID)'),
    [t('国家/地区', 'Country/area'), t('年份', 'Year'), t('累计数', 'Cumulative count')],
    owid.filter((r) => r.year === year).map((r) => [tf(pointBy.get(r.entity), 'name'), r.year, r.count]),
  );

  const MODES = [
    { key: 'owid', label: t('累计大规模 AI 系统', 'Large-scale AI systems') },
    { key: 'vib', label: t('AI 活力 2025', 'AI Vibrancy 2025') },
  ];
  seg
    .selectAll('button')
    .data(MODES)
    .join('button')
    .attr('type', 'button')
    .attr('role', 'tab')
    .text((d) => d.label)
    .on('click', (_, d) => setMode(d.key));

  slider
    .attr('min', 0)
    .attr('max', years.length - 1)
    .attr('step', 1)
    .property('value', years.length - 1)
    .attr('aria-label', t('选择年份', 'Select year'))
    .on('input', function () {
      year = years[+this.value];
      drawData(true);
    });

  // ---------- 投影与缩放 ----------
  const projection = d3
    .geoMercator()
    .scale(1 / TAU)
    .translate([0, 0]);
  const path = d3.geoPath(projection);
  const tiler = d3tile().tileSize(256).clampX(false);
  const zoom = d3.zoom().on('zoom', (e) => {
    transform = e.transform;
    drawMap();
  });
  let transform = d3.zoomIdentity;
  let width = 0;
  let height = 0;

  const chinaGeo = rewind(data.china);
  const chinaProv = chinaGeo.features.filter((f) => f.geometry && !isNineDash(f));
  const chinaLines = chinaGeo.features.filter((f) => f.geometry && isNineDash(f));
  const graticule = d3.geoGraticule10();

  zoomBtns
    .selectAll('button')
    .data([
      { k: 1.6, label: '+', aria: t('放大', 'Zoom in') },
      { k: 1 / 1.6, label: '−', aria: t('缩小', 'Zoom out') },
      { k: 0, label: '⟲', aria: t('复位', 'Reset') },
    ])
    .join('button')
    .attr('type', 'button')
    .attr('class', 'icon-btn')
    .attr('aria-label', (d) => d.aria)
    .text((d) => d.label)
    .on('click', (_, d) => {
      const sel = svg.transition().duration(theme.duration);
      if (d.k) sel.call(zoom.scaleBy, d.k);
      else sel.call(zoom.transform, initial());
    });

  function initial() {
    // 世界宽度 = 容器宽度，纬度方向居中略偏北（人口与 AI 活动集中在北半球）
    return d3.zoomIdentity.translate(width / 2, height / 2 + height * 0.12).scale(width);
  }

  function resize(w) {
    width = w;
    height = chartHeight(w, { aspect: 0.56, min: 260, max: 620 });
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
    zoom
      .scaleExtent([width, width * 12])
      .translateExtent([
        [-width / 2, -width / 2],
        [width / 2, width / 2],
      ])
      .extent([
        [0, 0],
        [width, height],
      ]);
    svg.call(zoom).on('wheel.zoom', null); // 页面滚动优先；用按钮或拖拽/双指缩放
    svg.call(zoom.transform, initial());
  }

  function drawTiles(g, layer) {
    const tiles = tiler.size([width, height]).scale(transform.k).translate([transform.x, transform.y])();
    const [tx, ty] = tiles.translate;
    const k = tiles.scale;
    g.selectAll('image')
      .data(tiles, (d) => d)
      .join('image')
      .attr('xlink:href', (d) => {
        const [x, y, z] = tileWrap(d);
        return tdtTileUrl(layer, x, y, z, key);
      })
      .attr('x', ([x]) => Math.round((x + tx) * k))
      .attr('y', ([, y]) => Math.round((y + ty) * k))
      .attr('width', Math.ceil(k) + 1)
      .attr('height', Math.ceil(k) + 1);
  }

  function drawMap() {
    if (!width) return;
    projection.scale(transform.k / TAU).translate([transform.x, transform.y]);
    if (key) {
      drawTiles(gTiles, 'vec');
      // 英文注记图层（eva）对浏览器端 Key 返回 418，英文模式不叠加注记，地名由本站气泡标签给出
      if (!isEn()) drawTiles(gLabels, 'cva');
    } else {
      gGrat
        .selectAll('path.wm__sphere')
        .data([{ type: 'Sphere' }])
        .join('path')
        .attr('class', 'wm__sphere')
        .attr('d', path);
      gGrat.selectAll('path.wm__gl').data([graticule]).join('path').attr('class', 'wm__gl').attr('d', path);
      gChina
        .selectAll('path.wm__prov')
        .data(chinaProv)
        .join('path')
        .attr('class', 'wm__prov')
        .attr('d', path);
      gChina
        .selectAll('path.wm__line')
        .data(chinaLines)
        .join('path')
        .attr('class', 'wm__line')
        .attr('d', path);
    }
    placeData();
  }

  // ---------- 数据气泡 ----------
  let bubbles = [];
  function computeBubbles() {
    if (mode === 'owid') {
      const rows = owid.filter((r) => r.year === year && r.count > 0);
      const max = d3.max(owid, (r) => r.count) || 1;
      const r = d3
        .scaleSqrt()
        .domain([0, max])
        .range([0, Math.max(18, width / 26)]);
      return rows
        .map((row) => ({ p: pointBy.get(row.entity), v: row.count, r: Math.max(3, r(row.count)), row }))
        .sort((a, b) => b.v - a.v);
    }
    const max = d3.max(vib, (d) => d.score);
    const r = d3
      .scaleSqrt()
      .domain([0, max])
      .range([0, Math.max(20, width / 22)]);
    return vib
      .map((d) => ({ p: pointByIso.get(d.iso3), v: d.score, r: Math.max(3, r(d.score)), row: d }))
      .filter((d) => d.p);
  }
  const colorOf = (d) =>
    ['CHN', 'HKG'].includes(d.p.iso3) ? 'var(--cn)' : d.p.iso3 === 'USA' ? 'var(--us)' : 'var(--cyan)';
  const nameOf = (d) => tf(d.p, 'name');

  function drawData(animate) {
    bubbles = computeBubbles();
    yearOut.text(mode === 'owid' ? year : '2025');
    yearBox.classed('is-hidden', mode !== 'owid');
    const sel = gBubbles
      .selectAll('circle')
      .data(bubbles, (d) => d.p.iso3)
      .join((enter) => enter.append('circle').attr('r', 0));
    sel
      .style('fill', colorOf)
      .call(bindTooltip, (d) =>
        mode === 'owid'
          ? `<strong>${nameOf(d)}</strong><br>${t('累计大规模 AI 系统', 'Cumulative large-scale AI systems')}${t('：', ': ')}${fmt.int(d.v)}<br><em>${year}${t(' 年 · OWID / Epoch AI', ' · OWID / Epoch AI')}</em>${
              d.p.iso3 === 'HKG'
                ? `<br><em>${t('OWID 将中国香港单列', 'OWID lists Hong Kong, China separately')}</em>`
                : ''
            }`
          : `<strong>${nameOf(d)}</strong> · ${t('第', '#')}${d.row.rank}${t(' 名', '')}<br>${t('AI 活力总分', 'AI Vibrancy score')}${t('：', ': ')}${d.v}${
              d.row.pillars
                ? `<br>${pillars
                    .map(
                      (p) =>
                        `${tf(p, 'name')} ${d3.format('.1f')(d.row.pillars[p.key])}${(d.row.imputed || []).includes(p.key) ? t('（插补）', ' (imputed)') : ''}`,
                    )
                    .join(' · ')}`
                : ''
            }<br><em>Stanford HAI Global AI Vibrancy 2025</em>`,
      );
    const tr =
      animate && !theme.reducedMotion ? sel.transition().duration(theme.duration).ease(theme.ease) : sel;
    tr.attr('r', (d) => d.r);
    gText
      .selectAll('text')
      .data(bubbles.slice(0, width < 520 ? 3 : 6), (d) => d.p.iso3)
      .join('text')
      .attr('class', 'wm__label')
      .text((d) => `${nameOf(d)} ${mode === 'owid' ? fmt.int(d.v) : d.v}`);
    placeData();
    legend(legendWrap.html('').node(), [
      { label: t('中国（含中国香港）', 'China (incl. Hong Kong, China)'), color: 'var(--cn)', shape: 'dot' },
      { label: t('美国', 'United States'), color: 'var(--us)', shape: 'dot' },
      { label: t('其他国家', 'Other countries'), color: 'var(--cyan)', shape: 'dot' },
    ]);
    caveat.html(
      mode === 'owid'
        ? t(
            `气泡面积 ∝ 累计大规模 AI 系统数（OWID / Epoch AI，训练算力超过 10²³ FLOP）；多国合作模型分别计入各国，“多国”条目未在图上标出。${year} 年全球合计见条形图竞赛。`,
            `Bubble area ∝ cumulative large-scale AI systems (OWID / Epoch AI, training compute above 10²³ FLOP); multinational models count for each country, and the “Multinational” entry is not mapped.`,
          )
        : t(
            `Stanford HAI Global AI Vibrancy Tool 2025 版（数据年份 2024）共 ${vib.length} 国；气泡面积 ∝ 总分（0–100，按官方默认权重计算）。悬停查看 7 大支柱分；中国等国的“人才”支柱为官方插补值。`,
            `Stanford HAI Global AI Vibrancy Tool 2025 (2024 data), ${vib.length} countries; bubble area ∝ total score (0–100, official default weights). Hover for the seven pillar scores; the Talent pillar for China and a few others is imputed by the source.`,
          ),
    );
  }

  function placeData() {
    const xy = (d) => projection([d.p.lon, d.p.lat]);
    gBubbles
      .selectAll('circle')
      .attr('cx', (d) => xy(d)[0])
      .attr('cy', (d) => xy(d)[1]);
    // 贪心避让：依次尝试右、左、上、下四个位置，与已放置标签及较大气泡不重叠才显示
    const placed = [];
    const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    gText.selectAll('text').each(function (d) {
      const el = d3.select(this);
      const [cx, cy] = xy(d);
      const w = this.getComputedTextLength?.() || 60;
      const h = 14;
      const cands = [
        { x: cx + d.r + 4, y: cy - h / 2, anchor: 'start' },
        { x: cx - d.r - 4 - w, y: cy - h / 2, anchor: 'start' },
        { x: cx - w / 2, y: cy - d.r - 4 - h, anchor: 'start' },
        { x: cx - w / 2, y: cy + d.r + 4, anchor: 'start' },
      ];
      const ok = cands.find(
        (c) =>
          c.x >= 2 &&
          c.x + w <= width - 40 &&
          c.y >= 2 &&
          c.y + h <= height - 22 &&
          !placed.some((p) => hit({ ...c, w, h }, p)) &&
          !bubbles.some(
            (b) =>
              b !== d &&
              b.r > 6 &&
              hit({ ...c, w, h }, { x: xy(b)[0] - b.r, y: xy(b)[1] - b.r, w: 2 * b.r, h: 2 * b.r }),
          ),
      );
      el.attr('display', ok ? null : 'none');
      if (ok) {
        placed.push({ ...ok, w, h });
        el.attr('x', ok.x).attr('y', ok.y + h - 3);
      }
    });
  }

  function setMode(m) {
    mode = m;
    seg
      .selectAll('button')
      .classed('is-active', (d) => d.key === mode)
      .attr('aria-selected', (d) => d.key === mode);
    drawData(true);
  }

  const offTheme = onThemeChange(() => {
    root.selectAll('.wm__tiles').attr('class', `wm__tiles wm__tiles--${theme.mode}`);
  });
  const stop = observeSize(container, ({ width: w }) => {
    resize(w);
    drawData(false);
  });
  setMode('owid');

  return {
    update(step) {
      setMode(step >= 1 ? 'vib' : 'owid');
      if (step === 0) {
        year = years[years.length - 1];
        slider.property('value', years.length - 1);
        drawData(true);
      }
    },
    resize() {
      resize(container.clientWidth);
      drawData(false);
    },
    destroy() {
      stop();
      offTheme();
      svg.on('.zoom', null);
      root.selectAll('*').remove();
      root.classed('wm', false);
    },
  };
}
