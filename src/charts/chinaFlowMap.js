// “东数西算”枢纽流向地图
// update(step)：0 省级底图；1 八大枢纽（脉冲）；2 东→西示意流向弧线 + 粒子；
//              3 十大集群 + 工程要点；4 人工智能骨干企业省份占比（分级设色）
import * as d3 from 'd3';
import {
  observeSize,
  observeVisible,
  createSvg,
  chartHeight,
  tr,
  fmt,
  legend,
  note,
  srTable,
} from '../core/chartUtils.js';
import { theme, onThemeChange } from '../core/theme.js';
import { bindTooltip, tooltip } from '../core/tooltip.js';
import { rewind, isNineDash, SHEET_NUMBER } from './geoUtils.js';
import { t, tf, isEn } from '../core/i18n.js';
import '../styles/charts/chinaFlowMap.css';

// 语言在图表创建时读取；切换语言时 figure.js 会重建图表
const roles = () => ({
  east_demand: { label: t('东部需求型', 'eastern, demand'), color: 'var(--tool)' },
  west_resource: { label: t('西部资源型', 'western, resource'), color: 'var(--object)' },
});
// 显示用简称（标识符缩写，完整名称见 tooltip）
const SHORT = { 长三角生态绿色一体化发展示范区集群: '长三角示范区集群' };
/** 地图标签：英文优先用数据中的简称 short_en，其次 name_en */
const siteLabel = (r) => (isEn() ? r.short_en || tf(r, 'name') : SHORT[r.name] || r.name);

/** 省级行政区英文名（天地图 name 标识符 → English） */
const PROV_EN = {
  北京市: 'Beijing',
  天津市: 'Tianjin',
  河北省: 'Hebei',
  山西省: 'Shanxi',
  内蒙古自治区: 'Inner Mongolia',
  辽宁省: 'Liaoning',
  吉林省: 'Jilin',
  黑龙江省: 'Heilongjiang',
  上海市: 'Shanghai',
  江苏省: 'Jiangsu',
  浙江省: 'Zhejiang',
  安徽省: 'Anhui',
  福建省: 'Fujian',
  江西省: 'Jiangxi',
  山东省: 'Shandong',
  河南省: 'Henan',
  湖北省: 'Hubei',
  湖南省: 'Hunan',
  广东省: 'Guangdong',
  广西壮族自治区: 'Guangxi',
  海南省: 'Hainan',
  重庆市: 'Chongqing',
  四川省: 'Sichuan',
  贵州省: 'Guizhou',
  云南省: 'Yunnan',
  西藏自治区: 'Xizang',
  陕西省: 'Shaanxi',
  甘肃省: 'Gansu',
  青海省: 'Qinghai',
  宁夏回族自治区: 'Ningxia',
  新疆维吾尔自治区: 'Xinjiang',
  台湾省: 'Taiwan Province',
  香港特别行政区: 'Hong Kong SAR',
  澳门特别行政区: 'Macao SAR',
};
/** 省份名（可含“/”分隔的多个省）：英文下逐个查表，查不到回退中文 */
const provName = (s) =>
  isEn()
    ? String(s)
        .split('/')
        .map((p) => PROV_EN[p] || p)
        .join(' / ')
    : s;
const siteProvince = (r) => (isEn() && r.province_en) || provName(r.province);
/** 英文下的计量单位（“个”在英文中不写出） */
const unitOf = (d) => (isEn() ? ({ '%': '%', 个: '' }[d.unit] ?? tf(d, 'unit')) : d.unit);
const SUFFIX_Q = new Set(['以上', '以下', '左右']);
const PARTICLES_PER_FLOW = 3;
const TRAIL = 3;
let uid = 0;

/** 估算文本宽度（中文按全角，其余按 0.6 em） */
function textWidth(s, size) {
  let w = 0;
  for (const ch of s) w += /[⺀-￿]/.test(ch) ? size : size * 0.6;
  return w;
}

/** 简单的矩形标签避让：标签之间互斥、远离标记点、向锚点回拉 */
function layoutLabels(items, obstacles, w, h) {
  const L = items.map((d) => ({ ...d, cx: d.x0, cy: d.y0 }));
  for (let it = 0; it < 240; it += 1) {
    for (let i = 0; i < L.length; i += 1) {
      const a = L[i];
      for (let j = i + 1; j < L.length; j += 1) {
        const b = L[j];
        const ox = (a.bw + b.bw) / 2 + 2 - Math.abs(a.cx - b.cx);
        const oy = (a.bh + b.bh) / 2 + 1 - Math.abs(a.cy - b.cy);
        if (ox > 0 && oy > 0) {
          if (oy < ox) {
            const s = (a.cy < b.cy ? -1 : 1) * oy * 0.5;
            a.cy += s;
            b.cy -= s;
          } else {
            const s = (a.cx < b.cx ? -1 : 1) * ox * 0.5;
            a.cx += s;
            b.cx -= s;
          }
        }
      }
      for (const p of obstacles) {
        if (p.id === a.id) continue;
        const ox = a.bw / 2 + p.r - Math.abs(a.cx - p.x);
        const oy = a.bh / 2 + p.r - Math.abs(a.cy - p.y);
        if (ox > 0 && oy > 0) {
          if (oy < ox) a.cy += (a.cy < p.y ? -1 : 1) * oy * 0.6;
          else a.cx += (a.cx < p.x ? -1 : 1) * ox * 0.6;
        }
      }
      a.cx += (a.x0 - a.cx) * 0.04;
      a.cy += (a.y0 - a.cy) * 0.04;
      a.cx = Math.max(a.bw / 2 + 2, Math.min(w - a.bw / 2 - 2, a.cx));
      a.cy = Math.max(a.bh / 2 + 2, Math.min(h - a.bh / 2 - 2, a.cy));
    }
  }
  return L;
}

export function createChinaFlowMap(container, data) {
  const id = `cfm${(uid += 1)}`;
  const geo = rewind(data.geo);
  const provinces = geo.features.filter((f) => !isNineDash(f) && f.properties.name);
  const jd = geo.features.filter((f) => !provinces.includes(f));
  const hubs = data.hubs.records.filter((r) => r.type === 'hub');
  const clusters = data.hubs.records.filter((r) => r.type === 'cluster');
  const hubByName = new Map(hubs.map((h) => [h.name, h]));
  const flows = data.hubs.flows.filter((f) => hubByName.has(f.from) && hubByName.has(f.to));
  const share = data.hubs.province_ai_share;
  const shareBy = new Map(share.records.map((r) => [r.province, r]));
  const shareMax = d3.max(share.records, (r) => r.value);

  const ROLE = roles();
  const sep = t('：', ': ');
  const hubName = (name) => (hubByName.has(name) ? tf(hubByName.get(name), 'name') : name);
  const root = d3.select(container).classed('china-flow', true);
  const stage = root.append('div').attr('class', 'cfm__stage');
  const svg = createSvg(stage.node(), 'cfm').attr(
    'aria-label',
    t(
      '“东数西算”八大枢纽与十大集群分布地图',
      'Map of the eight computing hubs and ten data-centre clusters of “East Data, West Computing”',
    ),
  );
  const badge = stage.append('div').attr('class', 'cfm__badge');
  // 审图号标注在图面上（左下角空白处）
  stage
    .append('div')
    .attr('class', 'cfm__credit')
    .text(
      `${t('底图', 'Base map')} © ${t('天地图', 'Tianditu')} · ${t('审图号', 'Map approval No.')} ${SHEET_NUMBER}`,
    );
  badge
    .append('span')
    .attr('class', 'tag tag--illustrative')
    .text(t('示意流向 · 非实测流量', 'Illustrative flows · not measured traffic'));

  const defs = svg.append('defs');
  const gMap = svg.append('g').attr('class', 'cfm__map');
  const gProv = gMap.append('g');
  const gJD = gMap.append('g');
  const seaLabel = svg
    .append('text')
    .attr('class', 'cfm__sea')
    .attr('text-anchor', 'middle')
    .text(t('南海诸岛', 'South China Sea Islands'));
  const gFlows = svg.append('g').attr('class', 'cfm__flows');
  const gParticles = svg.append('g').attr('class', 'cfm__particles').style('opacity', 0);
  const gLinks = svg.append('g');
  const gClusters = svg.append('g');
  const gHubs = svg.append('g');
  const gLeaders = svg.append('g');
  const gLabels = svg.append('g');
  const gInset = svg.append('g').attr('class', 'cfm__inset').style('opacity', 0);

  const legendWrap = root.append('div');
  const facts = root.append('div').attr('class', 'cfm__facts');
  facts
    .selectAll('span.cfm__chip')
    .data(data.hubs.facts)
    .join('span')
    .attr('class', 'cfm__chip')
    .html((d) => {
      const v = `${fmt.num(d.value, 1)}${unitOf(d)}`;
      const q = tf(d, 'qualifier') || '';
      // 英文的限定词一律前置（“80% 以上” → “over 80%”）
      if (isEn()) return `<b>${q ? `${q} ` : ''}${v}</b>${tf(d, 'label')}`;
      return `<b>${SUFFIX_Q.has(q) ? `${v}${q}` : `${q}${v}`}</b>${d.label}`;
    });
  const clusterList = facts.append('div').attr('class', 'cfm__clusters');
  note(container, t(
    `省份占比来自《中国新一代人工智能科技产业发展报告2023》，口径为该报告统计的 2200 家人工智能“骨干企业”；仅摘录前 ${share.records.length} 个省份，其余省份为“未摘录”，不代表数值为 0。`,
    `Provincial shares come from the China New-Generation AI Technology Industry Development Report 2023 using the report’s sample of 2,200 leading enterprises. Only the top ${share.records.length} provinces are excerpted; the others are not excerpted, which does not mean zero.`,
  ), 'warn');
  note(
    container,
    t(
      `${data.hubs.notes} 底图为天地图（国家地理信息公共服务平台）省级行政区划数据，审图号：${SHEET_NUMBER}，CGCS2000 坐标系，完整绘制南海诸岛与断续线，底图边界未作修改。`,
      `${tf(data.hubs, 'notes')} Base map: provincial administrative divisions from Tianditu (National Platform for Common GeoSpatial Information Services); map approval number: ${SHEET_NUMBER.replace('（', '(').replace('）', ')').replace(/号$/, '')}; CGCS2000 coordinate system. The South China Sea Islands and the dashed line are drawn in full; base-map boundaries are unmodified.`,
    ),
    'info',
  );
  srTable(
    container,
    t('“东数西算”枢纽与集群', '“East Data, West Computing” hubs and clusters'),
    [
      t('名称', 'Name'),
      t('类型', 'Type'),
      t('角色', 'Role'),
      t('所属枢纽', 'Parent hub'),
      t('省份', 'Province'),
    ],
    data.hubs.records.map((r) => [
      tf(r, 'name'),
      r.type === 'hub' ? t('枢纽', 'Hub') : t('集群', 'Cluster'),
      ROLE[r.role]?.label || r.role,
      r.parent_hub ? hubName(r.parent_hub) : '—',
      siteProvince(r),
    ]),
  );
  srTable(
    container,
    t('人工智能骨干企业省份占比（%）', 'Share of leading AI enterprises by province (%)'),
    [t('省份', 'Province'), t('占比', 'Share')],
    share.records.map((r) => [provName(r.province), r.value]),
  );

  const projection = d3.geoMercator();
  const path = d3.geoPath(projection);
  let width = 0;
  let height = 0;
  let step = 0;
  let pos = new Map(); // name → [x, y]
  let flowGeom = []; // {node, len, flow}
  let visible = false;
  let rafId = 0;
  let last = 0;
  let clock = 0;
  let narrow = false;

  // ---------- 静态几何 ----------
  const provPaths = gProv
    .selectAll('path')
    .data(provinces)
    .join('path')
    .attr('class', 'cfm__prov')
    .call(bindTooltip, provinceTip)
    .attr('tabindex', (d) => (shareBy.has(d.properties.name) ? 0 : -1));
  const jdPaths = gJD.selectAll('path').data(jd).join('path').attr('class', 'cfm__jd');

  const hubG = gHubs
    .selectAll('g.cfm__hub')
    .data(hubs, (d) => d.name)
    .join((enter) => {
      const g = enter.append('g').attr('class', 'cfm__hub').style('opacity', 0);
      g.append('circle').attr('class', 'cfm__pulse').attr('r', 6);
      g.append('circle').attr('class', 'cfm__halo').attr('r', 9).style('fill-opacity', 0.18);
      g.append('circle')
        .attr('class', 'cfm__dot')
        .attr('r', 5)
        .style('stroke', 'var(--bg)')
        .style('stroke-width', 1.5);
      return g;
    })
    .call(bindTooltip, siteTip);
  hubG.selectAll('circle.cfm__halo, circle.cfm__dot').style('fill', (d) => ROLE[d.role].color);
  hubG.select('circle.cfm__pulse').style('stroke', (d) => ROLE[d.role].color);
  hubG.select('circle.cfm__pulse').style('animation-delay', (_, i) => `${(i % 4) * 0.6}s`);

  const clusterG = gClusters
    .selectAll('g.cfm__cluster')
    .data(clusters, (d) => d.name)
    .join((enter) => {
      const g = enter.append('g').attr('class', 'cfm__cluster').style('opacity', 0);
      g.append('path').attr('d', d3.symbol(d3.symbolDiamond, 34)());
      return g;
    })
    .call(bindTooltip, siteTip);
  clusterG
    .select('path')
    .style('fill', 'var(--panel)')
    .style('stroke', (d) => ROLE[d.role].color)
    .style('stroke-width', 1.6);

  const links = gLinks
    .selectAll('line')
    .data(clusters.filter((c) => hubByName.has(c.parent_hub)))
    .join('line')
    .attr('class', 'cfm__link')
    .style('stroke', (d) => ROLE[d.role].color)
    .style('opacity', 0);

  function provinceTip(f) {
    const n = f.properties.name;
    const r = shareBy.get(n);
    if (step >= 4) {
      return `<strong>${provName(n)}</strong><br>${t('人工智能骨干企业占比', 'Share of leading AI enterprises')}${sep}${r ? `<b>${fmt.num(r.value, 2)}${share.unit}</b>` : t('未摘录', 'not excerpted')}<br><em>${t('口径：报告“骨干企业”，来源经媒体转引', 'Basis: “leading enterprises” as defined in the report; source quoted via media')}</em>`;
    }
    return `<strong>${provName(n)}</strong>`;
  }

  function siteTip(d) {
    const parent = d.parent_hub ? `<br>${t('所属枢纽', 'Parent hub')}${sep}${hubName(d.parent_hub)}` : '';
    return `<strong>${tf(d, 'name')}</strong><br>${d.type === 'hub' ? t('国家算力枢纽节点', 'National computing hub') : t('国家数据中心集群', 'National data-centre cluster')} · ${ROLE[d.role].label}${parent}
      <br>${t('所在地', 'Location')}${sep}${siteProvince(d)}<br><em>${t('坐标为城市中心近似点', 'Coordinates are approximate city centres')}</em>`;
  }

  // ---------- 尺寸相关的布局 ----------
  function layout() {
    if (!width) return;
    narrow = width < 560;
    height = chartHeight(width, { aspect: narrow ? 1.06 : 0.84, min: 320, max: 660 });
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
    const pad = width < 480 ? 6 : 14;
    projection.fitExtent(
      [
        [pad, pad + (narrow ? 22 : 8)],
        [width - pad, height - pad],
      ],
      geo,
    );
    provPaths.attr('d', path);
    jdPaths.attr('d', path);
    const sea = projection([115, 13.5]);
    seaLabel
      .attr('x', sea[0])
      .attr('y', sea[1])
      .style('font-size', `${width < 480 ? 9 : 10}px`);

    pos = new Map(data.hubs.records.map((r) => [r.name, projection([r.lon, r.lat])]));
    const s = Math.max(0.7, Math.min(1.15, width / 800));
    hubG.attr('transform', (d) => `translate(${pos.get(d.name)}) scale(${s})`);
    clusterG.attr('transform', (d) => `translate(${pos.get(d.name)}) scale(${Math.max(0.8, s)})`);
    links
      .attr('x1', (d) => pos.get(d.name)[0])
      .attr('y1', (d) => pos.get(d.name)[1])
      .attr('x2', (d) => pos.get(d.parent_hub)[0])
      .attr('y2', (d) => pos.get(d.parent_hub)[1]);

    // 东 → 西 二次贝塞尔弧线（向北拱起）
    defs.selectAll('linearGradient').remove();
    const flowSel = gFlows
      .selectAll('path.cfm__flow')
      .data(flows, (d) => `${d.from}-${d.to}`)
      .join('path')
      .attr('class', 'cfm__flow')
      .attr('d', (d, i) => {
        const [x0, y0] = pos.get(d.from);
        const [x1, y1] = pos.get(d.to);
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len = Math.hypot(dx, dy) || 1;
        let nx = -dy / len;
        let ny = dx / len;
        if (ny > 0) {
          nx = -nx;
          ny = -ny;
        }
        const k = len * 0.28;
        const cx = (x0 + x1) / 2 + nx * k;
        const cy = (y0 + y1) / 2 + ny * k;
        const gid = `${id}-g${i}`;
        const grad = defs
          .append('linearGradient')
          .attr('id', gid)
          .attr('gradientUnits', 'userSpaceOnUse')
          .attr('x1', x0)
          .attr('y1', y0)
          .attr('x2', x1)
          .attr('y2', y1);
        grad.append('stop').attr('offset', '0%').style('stop-color', 'var(--tool)');
        grad.append('stop').attr('offset', '100%').style('stop-color', 'var(--object)');
        return `M${x0},${y0}Q${cx},${cy} ${x1},${y1}`;
      })
      .style('stroke', (_, i) => `url(#${id}-g${i})`)
      .style('stroke-width', Math.max(1.2, Math.min(2.2, width / 450)));
    flowGeom = flowSel.nodes().map((node, i) => ({ node, len: node.getTotalLength(), flow: flows[i] }));

    // 粒子（头部 + 拖尾）
    gParticles
      .selectAll('circle')
      .data(d3.range(flowGeom.length * PARTICLES_PER_FLOW * TRAIL))
      .join('circle')
      .attr('r', (i) => [2.6, 1.8, 1.2][i % TRAIL])
      .style('fill', (i) => (i % TRAIL === 0 ? 'var(--text)' : 'var(--tool)'))
      .style('opacity', (i) => [1, 0.6, 0.3][i % TRAIL]);
    drawParticles();

    layoutInset();
    clusterList.html(
      narrow
        ? `<b>${t('十大集群：', 'Ten clusters: ')}</b>${hubs
            .map((h) => {
              const cs = clusters.filter((c) => c.parent_hub === h.name).map(siteLabel);
              return cs.length ? `${siteLabel(h)}→${cs.join(t('、', ', '))}` : '';
            })
            .filter(Boolean)
            .join(t('；', '; '))}`
        : '',
    );
  }

  function layoutInset() {
    gInset.selectAll('*').remove();
    const recs = share.records.slice().sort((a, b) => b.value - a.value);
    const sw = width < 480;
    const left = Math.max(6, projection([73.5, 20])[0] - (sw ? 0 : 8));
    let right = projection([sw ? 106 : 97.5, 20])[0];
    // 英文“South China Sea Islands”较宽：插图右缘不越过该标注
    if (isEn()) right = Math.min(right, seaLabel.node().getBBox().x - 8);
    const rowH = sw ? 15 : 19;
    const boxW = Math.min(240, right - left);
    const top = Math.min(projection([0, sw ? 17.2 : 21])[1] + 6, height - 8 - (recs.length + 1) * rowH - 6);
    const insetName = (d) => (isEn() ? provName(d.province) : d.province.replace(/(省|市|自治区)$/, ''));
    const fsInset = sw ? 10 : 11;
    const nameW = isEn()
      ? Math.ceil(d3.max(recs, (d) => textWidth(insetName(d), fsInset))) + 6
      : sw
        ? 34
        : 44;
    const valW = sw ? 34 : 44;
    const barMax = Math.max(20, boxW - nameW - valW - 4);
    const x = d3.scaleLinear().domain([0, shareMax]).range([0, barMax]);
    gInset.attr('transform', `translate(${left},${top})`);
    gInset
      .append('text')
      .attr('class', 'cfm__inset-title')
      .attr('y', 10)
      .style('font-size', sw ? '10px' : null)
      .text(t(`AI 骨干企业省份占比（${share.unit}）`, `Leading AI firms by province (${share.unit})`));
    const row = gInset
      .selectAll('g.row')
      .data(recs)
      .join('g')
      .attr('class', 'row')
      .attr('transform', (_, i) => `translate(0,${(i + 1) * rowH + 4})`);
    row
      .append('text')
      .attr('class', 'cfm__inset-name')
      .attr('y', rowH / 2)
      .attr('dy', '0.35em')
      .style('font-size', sw ? '10px' : null)
      .text(insetName);
    row
      .append('rect')
      .attr('x', nameW)
      .attr('y', 3)
      .attr('height', rowH - 6)
      .attr('rx', 2)
      .attr('width', (d) => x(d.value))
      .style('fill', 'var(--cyan)')
      .style('fill-opacity', (d) => shareOpacity(d.value));
    row
      .append('text')
      .attr('class', 'cfm__inset-val')
      .attr('x', (d) => nameW + x(d.value) + 4)
      .attr('y', rowH / 2)
      .attr('dy', '0.35em')
      .style('font-size', sw ? '10px' : null)
      .text((d) => fmt.num(d.value, 2));
  }

  const shareOpacity = (v) => 0.25 + 0.7 * (v / shareMax);

  // ---------- 标签 ----------
  function renderLabels(animate) {
    const showHubs = step >= 1 && step <= 3;
    const showClusters = step === 3 && !narrow;
    const hubSize = width < 480 ? 11 : 13;
    const clSize = width < 700 ? 10 : 11;
    const items = [];
    const obstacles = [];
    const hubR = 7 * Math.max(0.7, Math.min(1.15, width / 800));
    if (showHubs) {
      hubs.forEach((h) => {
        const [x, y] = pos.get(h.name);
        const text = siteLabel(h);
        const bw = textWidth(text, hubSize) + 4;
        const right = h.role === 'east_demand';
        items.push({
          id: h.name,
          ax: x,
          ay: y,
          text,
          size: hubSize,
          cls: 'hub',
          bw,
          bh: hubSize + 3,
          x0: right ? x + hubR + 3 + bw / 2 : x - hubR - 3 - bw / 2,
          y0: y,
        });
        obstacles.push({ id: h.name, x, y, r: hubR });
      });
    }
    if (showClusters) {
      clusters.forEach((c) => {
        const [x, y] = pos.get(c.name);
        const text = siteLabel(c);
        const bw = textWidth(text, clSize) + 4;
        items.push({
          id: c.name,
          ax: x,
          ay: y,
          text,
          size: clSize,
          cls: 'cluster',
          bw,
          bh: clSize + 3,
          x0: x,
          y0: y + 6 + clSize / 2 + 4,
        });
        obstacles.push({ id: c.name, x, y, r: 5 });
      });
    }
    const placed = layoutLabels(items, obstacles, width, height);
    const tt = (sel) => (animate ? tr(sel) : sel);

    const lab = gLabels
      .selectAll('text.cfm__label')
      .data(placed, (d) => d.id)
      .join(
        (enter) =>
          enter
            .append('text')
            .attr('class', (d) => `cfm__label cfm__label--${d.cls}`)
            .attr('text-anchor', 'middle')
            .attr('dy', '0.36em')
            .attr('x', (d) => d.cx)
            .attr('y', (d) => d.cy)
            .style('opacity', 0),
        (update) => update,
        (exit) => tt(exit).style('opacity', 0).remove(),
      )
      .style('font-size', (d) => `${d.size}px`)
      .text((d) => d.text);
    tt(lab)
      .attr('x', (d) => d.cx)
      .attr('y', (d) => d.cy)
      .style('opacity', 1);

    // 被推离锚点较远的标签画引线
    const leaders = placed.filter((d) => {
      const ex = Math.max(Math.abs(d.cx - d.ax) - d.bw / 2, 0);
      const ey = Math.max(Math.abs(d.cy - d.ay) - d.bh / 2, 0);
      return Math.hypot(ex, ey) > 9;
    });
    const edge = (d) => {
      const ex = Math.max(d.cx - d.bw / 2, Math.min(d.ax, d.cx + d.bw / 2));
      const ey = Math.max(d.cy - d.bh / 2, Math.min(d.ay, d.cy + d.bh / 2));
      return [ex, ey];
    };
    gLeaders
      .selectAll('line')
      .data(leaders, (d) => d.id)
      .join('line')
      .attr('class', 'cfm__leader')
      .attr('x1', (d) => d.ax)
      .attr('y1', (d) => d.ay)
      .attr('x2', (d) => edge(d)[0])
      .attr('y2', (d) => edge(d)[1])
      .style('opacity', 0)
      .call((s) => tt(s).style('opacity', 0.8));
  }

  // ---------- 粒子动画 ----------
  function drawParticles() {
    if (!flowGeom.length) return;
    const speed = Math.max(40, width / 9); // px/s
    gParticles.selectAll('circle').each(function (i) {
      const fi = Math.floor(i / (PARTICLES_PER_FLOW * TRAIL));
      const pi = Math.floor(i / TRAIL) % PARTICLES_PER_FLOW;
      const ti = i % TRAIL;
      const f = flowGeom[fi];
      const cycle = f.len + 30;
      let d = ((clock / 1000) * speed + (pi / PARTICLES_PER_FLOW) * cycle + fi * 37) % cycle;
      d -= ti * 5;
      const visibleOnPath = d >= 0 && d <= f.len;
      const p = f.node.getPointAtLength(Math.max(0, Math.min(f.len, d)));
      this.setAttribute('cx', p.x);
      this.setAttribute('cy', p.y);
      this.setAttribute('visibility', visibleOnPath ? 'visible' : 'hidden');
    });
  }

  function loop(ts) {
    clock += last ? Math.min(64, ts - last) : 16;
    last = ts;
    drawParticles();
    rafId = requestAnimationFrame(loop);
  }

  function syncLoop() {
    const want = (step === 2 || step === 3) && visible && !theme.reducedMotion && flowGeom.length > 0;
    if (want && !rafId) {
      last = 0;
      rafId = requestAnimationFrame(loop);
    } else if (!want && rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  // ---------- 步骤状态（幂等、可逆） ----------
  function applyStep(animate) {
    if (!width) return;
    const tt = (sel, delay = 0) => (animate ? tr(sel, delay) : sel);
    const motion = !theme.reducedMotion;

    // 枢纽
    tt(hubG).style('opacity', step >= 1 ? (step === 4 ? 0.28 : 1) : 0);
    hubG.style('pointer-events', step >= 1 ? null : 'none').attr('tabindex', step >= 1 ? 0 : -1);
    hubG.select('circle.cfm__pulse').style('display', motion && step >= 1 && step <= 3 ? null : 'none');

    // 流向弧线：进入时用 dash 描边动画
    const showFlows = step === 2 || step === 3;
    const flowPaths = gFlows.selectAll('path.cfm__flow');
    const wasHidden = +gFlows.attr('data-on') !== 1;
    gFlows.attr('data-on', showFlows ? 1 : 0);
    if (showFlows && wasHidden && animate && motion) {
      flowPaths
        .attr('stroke-dasharray', (_, i) => `${flowGeom[i]?.len || 0} ${flowGeom[i]?.len || 0}`)
        .attr('stroke-dashoffset', (_, i) => flowGeom[i]?.len || 0)
        .style('opacity', step === 3 ? 0.35 : 0.85)
        .transition()
        .duration(theme.duration * 1.6)
        .delay((_, i) => i * 90)
        .ease(d3.easeCubicOut)
        .attr('stroke-dashoffset', 0)
        .on('end', function () {
          d3.select(this).attr('stroke-dasharray', null);
        });
    } else {
      flowPaths.interrupt().attr('stroke-dasharray', null).attr('stroke-dashoffset', null);
      tt(flowPaths).style('opacity', showFlows ? (step === 3 ? 0.35 : 0.85) : 0);
    }
    tt(gParticles).style('opacity', showFlows && motion ? (step === 3 ? 0.5 : 1) : 0);
    badge.classed('is-on', showFlows);

    // 集群
    const showCl = step === 3;
    tt(clusterG, 150).style('opacity', showCl ? 1 : 0);
    clusterG.style('pointer-events', showCl ? null : 'none').attr('tabindex', showCl ? 0 : -1);
    tt(links, 150).style('opacity', showCl ? 0.7 : 0);
    facts.classed('is-on', showCl);

    // 分级设色
    const choro = step >= 4;
    provPaths
      .style('fill', (f) => {
        const r = choro && shareBy.get(f.properties.name);
        return r ? 'var(--cyan)' : null;
      })
      .style('fill-opacity', (f) => {
        const r = choro && shareBy.get(f.properties.name);
        return r ? shareOpacity(r.value) : null;
      })
      .attr('tabindex', (f) => (choro && shareBy.has(f.properties.name) ? 0 : -1));
    tt(gInset).style('opacity', choro ? 1 : 0);

    renderLabels(animate);
    renderLegend();
    syncLoop();
    if (!rafId) drawParticles();
  }

  function renderLegend() {
    legendWrap.selectAll('*').remove();
    const items = [];
    if (step === 0) {
      items.push({
        label: t('省级行政区', 'Provincial-level divisions'),
        color: 'var(--panel-2)',
        shape: 'square',
      });
      items.push({
        label: t('南海诸岛与断续线', 'South China Sea Islands and dashed line'),
        color: 'var(--muted)',
        shape: 'line',
      });
    }
    if (step >= 1 && step <= 3) {
      items.push({
        label: `${t('枢纽', 'Hub')} · ${ROLE.east_demand.label}`,
        color: ROLE.east_demand.color,
        shape: 'dot',
      });
      items.push({
        label: `${t('枢纽', 'Hub')} · ${ROLE.west_resource.label}`,
        color: ROLE.west_resource.color,
        shape: 'dot',
      });
    }
    if (step === 2 || step === 3)
      items.push({
        label: t('东→西示意流向（非实测）', 'East→west illustrative flow (not measured)'),
        color: 'var(--tool)',
        shape: 'line',
      });
    if (step === 3)
      items.push({
        label: t('国家数据中心集群', 'National data-centre cluster'),
        color: 'var(--muted)',
        shape: 'diamond',
      });
    if (step >= 4) {
      items.push({
        label: t('AI 骨干企业占比（越深越高）', 'Share of leading AI firms (darker = higher)'),
        color: 'var(--cyan)',
        shape: 'square',
      });
      items.push({ label: t('未摘录', 'Not excerpted'), color: 'var(--panel-2)', shape: 'square' });
      items.push({
        label: t('枢纽位置（淡化）', 'Hub locations (faded)'),
        color: 'var(--muted)',
        shape: 'dot',
      });
    }
    legend(legendWrap.node(), items);
  }

  const stopSize = observeSize(container, ({ width: w }) => {
    width = w;
    layout();
    applyStep(false);
  });
  const stopVisible = observeVisible(container, (v) => {
    visible = v;
    syncLoop();
  });
  const stopTheme = onThemeChange(() => applyStep(false));

  return {
    update(s) {
      step = Math.max(0, Math.min(4, +s || 0));
      applyStep(true);
    },
    resize() {
      width = container.clientWidth;
      layout();
      applyStep(false);
    },
    destroy() {
      tooltip.hide();
      stopSize();
      stopVisible();
      stopTheme();
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      svg.selectAll('*').interrupt();
      root.selectAll('*').remove();
      root.classed('china-flow', false);
    },
  };
}
