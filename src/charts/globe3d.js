// 3D 地球：three.js 渲染球体，D3 负责比例尺、配色、年份控件、标签与提示
// 合规：有天地图 Key 时，球面贴图 = 天地图影像底图 + 全球境界 + 注记瓦片（审图号 GS（2026）4921号），本站不绘制国界；
//       无 Key 时只绘制经纬网与天地图中国行政区划（同一审图号），不显示其他国家边界。
// 数据：OWID 各国累计大规模 AI 系统数 → 从地表伸出的光柱，高度 ∝ √数量
// 首次进入视野自动从最早年份播放到最新年份；update(step)：0 最新年份；1 从最早年份回放
import * as d3 from 'd3';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { observeSize, observeVisible, chartHeight, note, legend, srTable, fmt } from '../core/chartUtils.js';
import { tooltip } from '../core/tooltip.js';
import { theme, color, onThemeChange } from '../core/theme.js';
import { t, tf, isEn } from '../core/i18n.js';
import { rewind, isNineDash, SHEET_NUMBER } from './geoUtils.js';
import { tdtKey, tdtTileUrl } from './tianditu.js';
import '../styles/charts/globe3d.css';

const R = 1; // 地球半径
const MAX_MERC_LAT = 85.0511;

/** 经纬度 → 球面坐标（与贴图 UV 使用同一约定） */
function toVec(lat, lon, r = R) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

/** 按 Web 墨卡托重新计算球体 UV，使天地图瓦片拼图正确贴合 */
function mercatorUV(geometry) {
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const lat = Math.max(-MAX_MERC_LAT, Math.min(MAX_MERC_LAT, (Math.asin(v.y) * 180) / Math.PI));
    let lon = (Math.atan2(v.z, -v.x) * 180) / Math.PI - 180;
    if (lon < -180) lon += 360;
    const u0 = uv.getX(i); // 保留原 u 以处理接缝
    let u = (lon + 180) / 360;
    if (Math.abs(u - u0) > 0.5) u = u0 > 0.5 ? u + 1 : u - 1;
    const rad = (lat * Math.PI) / 180;
    const mercY = (1 - Math.log(Math.tan(Math.PI / 4 + rad / 2)) / Math.PI) / 2; // 0 = 北
    uv.setXY(i, u, 1 - mercY);
  }
  uv.needsUpdate = true;
}

/** 拼接天地图瓦片为一张墨卡托贴图（z 级 2^z × 2^z 张） */
async function buildTexture(key, z, layers) {
  const n = 2 ** z;
  const size = 256 * n;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  // 瓦片以 CORS 方式加载，跨域不允许时直接 onerror → 降级；单张 15 秒未返回也视为失败
  const load = (url) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const timer = setTimeout(() => reject(new Error('tile timeout')), 15000);
      img.crossOrigin = 'anonymous';
      img.onload = () => (clearTimeout(timer), resolve(img));
      img.onerror = (e) => (clearTimeout(timer), reject(e));
      img.src = url;
    });
  for (const layer of layers) {
    const jobs = [];
    for (let x = 0; x < n; x++)
      for (let y = 0; y < n; y++)
        jobs.push(load(tdtTileUrl(layer, x, y, z, key)).then((img) => ctx.drawImage(img, x * 256, y * 256)));
    await Promise.all(jobs);
  }
  return canvas;
}

export function createGlobe3d(container, data) {
  const key = tdtKey();
  const root = d3.select(container).classed('gl3', true);
  const head = root.append('div').attr('class', 'gl3__head');
  const playBtn = head.append('button').attr('type', 'button').attr('class', 'btn');
  const yearBox = head.append('label').attr('class', 'gl3__year');
  yearBox.append('span').text(t('年份', 'Year'));
  const slider = yearBox
    .append('input')
    .attr('type', 'range')
    .attr('aria-label', t('选择年份', 'Select year'));
  const yearOut = yearBox.append('output').attr('class', 'gl3__year-val');
  const rotateBtn = head.append('button').attr('type', 'button').attr('class', 'btn');

  const stage = root.append('div').attr('class', 'gl3__stage');
  const labelLayer = stage.append('div').attr('class', 'gl3__labels');
  stage
    .append('div')
    .attr('class', 'gl3__credit')
    .text(
      key
        ? `${t('底图', 'Base map')} © ${t('天地图', 'Tianditu')} · ${t('审图号', 'Map approval No.')} ${SHEET_NUMBER}`
        : `${t('中国行政区划', 'China boundaries')} © ${t('天地图', 'Tianditu')} · ${t('审图号', 'Map approval No.')} ${SHEET_NUMBER}`,
    );
  const status = stage.append('div').attr('class', 'gl3__status');
  if (!key)
    status
      .attr('class', 'gl3__status gl3__status--warn')
      .text(
        t(
          '未配置天地图 Key：球面只显示经纬网与中国行政区划，配置后加载天地图影像与全球境界（见 README）。',
          'No Tianditu key: the globe shows only the graticule and China; configure a key to load Tianditu imagery and borders (see README).',
        ),
      );
  const legendWrap = root.append('div');
  note(
    container,
    t(
      `光柱高度 ∝ √累计大规模 AI 系统数（OWID / Epoch AI）。本站不在球面上绘制任何国界：${
        key ? '影像、国界与注记均来自天地图在线服务' : '仅绘制天地图中国行政区划'
      }（${SHEET_NUMBER}）；光柱位于国家代表点（近似坐标）。`,
      `Column height ∝ √cumulative large-scale AI systems (OWID / Epoch AI). This site draws no borders on the globe: ${
        key
          ? 'imagery, borders and labels come from the Tianditu online service'
          : 'only the Tianditu China boundaries are drawn'
      } (${SHEET_NUMBER}); columns sit at approximate representative points.`,
    ),
    'info',
  );

  // ---------- 数据 ----------
  const pointBy = new Map(data.points.records.map((p) => [p.entity, p]));
  const owid = data.owid.filter((r) => pointBy.has(r.entity));
  const years = [...new Set(owid.map((r) => r.year))].sort(d3.ascending);
  const byYear = d3.group(owid, (r) => r.year);
  const maxCount = d3.max(owid, (r) => r.count) || 1;
  const hScale = d3.scaleSqrt().domain([0, maxCount]).range([0, 0.62]);
  const colorKey = (p) => (['CHN', 'HKG'].includes(p.iso3) ? 'cn' : p.iso3 === 'USA' ? 'us' : 'cyan');
  let yearIdx = years.length - 1;

  srTable(
    container,
    t('各国累计大规模 AI 系统数（OWID）', 'Cumulative large-scale AI systems by country (OWID)'),
    [t('国家/地区', 'Country/area'), t('年份', 'Year'), t('累计数', 'Cumulative count')],
    (byYear.get(years[yearIdx]) || []).map((r) => [tf(pointBy.get(r.entity), 'name'), r.year, r.count]),
  );
  legend(legendWrap.node(), [
    { label: t('中国（含中国香港）', 'China (incl. Hong Kong, China)'), color: 'var(--cn)', shape: 'square' },
    { label: t('美国', 'United States'), color: 'var(--us)', shape: 'square' },
    { label: t('其他国家', 'Other countries'), color: 'var(--cyan)', shape: 'square' },
  ]);

  // ---------- three.js 场景 ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  stage.node().prepend(renderer.domElement);
  renderer.domElement.classList.add('gl3__canvas');
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute(
    'aria-label',
    t('3D 地球：各国累计大规模 AI 系统数', '3D globe: large-scale AI systems by country'),
  );

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  const start = toVec(28, 105, 3.6); // 初始视角：亚洲—太平洋
  camera.position.copy(start);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 1.8;
  controls.maxDistance = 6;
  controls.rotateSpeed = 0.5;
  controls.autoRotateSpeed = 0.6;
  controls.autoRotate = !theme.reducedMotion;

  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(5, 3, 5);
  scene.add(sun);

  const globeGeo = new THREE.SphereGeometry(R, 128, 96);
  const globeMat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 8 });
  const globe = new THREE.Mesh(globeGeo, globeMat);
  scene.add(globe);

  // 大气辉光
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.12, 64, 48),
    new THREE.ShaderMaterial({
      uniforms: { glow: { value: new THREE.Color() } },
      vertexShader:
        'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform vec3 glow; varying vec3 vN; void main(){ float i = pow(0.72 - dot(vN, vec3(0.0,0.0,1.0)), 3.0); gl_FragColor = vec4(glow, 1.0) * i; }',
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
    }),
  );
  scene.add(atmo);

  // 经纬网 + 中国轮廓（降级模式与有 Key 时都可用作参考；有 Key 时只保留极淡经纬网）
  const lineGroup = new THREE.Group();
  scene.add(lineGroup);
  const lineMats = [];
  function addLines(coordsList, r, matKey, opacity) {
    const pts = [];
    for (const line of coordsList)
      for (let i = 0; i < line.length - 1; i++) {
        pts.push(toVec(line[i][1], line[i][0], r), toVec(line[i + 1][1], line[i + 1][0], r));
      }
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ transparent: true, opacity });
    mat.userData.colorKey = matKey;
    lineMats.push(mat);
    lineGroup.add(new THREE.LineSegments(geom, mat));
  }
  const grat = d3.geoGraticule().step([15, 15])();
  addLines(grat.coordinates, R * 1.001, 'muted', key ? 0.12 : 0.35);
  if (!key) {
    const china = rewind(data.china);
    const rings = [];
    const lines = [];
    for (const f of china.features) {
      if (!f.geometry) continue;
      const g = f.geometry;
      if (isNineDash(f))
        (g.type === 'MultiLineString' ? g.coordinates : [g.coordinates]).forEach((l) => lines.push(l));
      else if (g.type === 'Polygon') g.coordinates.forEach((r) => rings.push(r));
      else if (g.type === 'MultiPolygon') g.coordinates.forEach((p) => p.forEach((r) => rings.push(r)));
    }
    addLines(rings, R * 1.002, 'cn', 0.85);
    addLines(lines, R * 1.002, 'cn', 0.85);
  }

  // 光柱
  const spikeGroup = new THREE.Group();
  scene.add(spikeGroup);
  const spikeGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, false);
  spikeGeo.translate(0, 0.5, 0); // 底部在原点，沿 +Y 伸长
  const capGeo = new THREE.SphereGeometry(1, 12, 8);
  const spikes = data.points.records
    .filter((p) => owid.some((r) => r.entity === p.entity))
    .map((p) => {
      const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.88 });
      const mesh = new THREE.Mesh(spikeGeo, mat);
      const cap = new THREE.Mesh(capGeo, mat);
      const base = toVec(p.lat, p.lon, R);
      mesh.position.copy(base);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), base.clone().normalize());
      mesh.userData = { p, h: 0, target: 0 };
      cap.userData = mesh.userData;
      spikeGroup.add(mesh, cap);
      const label = labelLayer.append('div').attr('class', 'gl3__label').style('display', 'none');
      return { p, mesh, cap, mat, label, count: 0 };
    });

  function applyColors() {
    const c = (k) => new THREE.Color(color(k) || '#22d3ee');
    spikes.forEach((s) => s.mat.color.copy(c(colorKey(s.p))));
    lineMats.forEach((m) => m.color.copy(c(m.userData.colorKey)));
    atmo.material.uniforms.glow.value.copy(c('cyan'));
    if (!globeMat.map) globeMat.color.copy(new THREE.Color(theme.mode === 'dark' ? '#0e1a33' : '#dbe7f5'));
  }

  function setYear(i, animate = true) {
    yearIdx = Math.max(0, Math.min(years.length - 1, i));
    const y = years[yearIdx];
    slider.property('value', yearIdx);
    yearOut.text(y);
    const rows = new Map((byYear.get(y) || []).map((r) => [r.entity, r.count]));
    spikes.forEach((s) => {
      s.count = rows.get(s.p.entity) || 0;
      s.mesh.userData.target = hScale(s.count);
      if (!animate || theme.reducedMotion) s.mesh.userData.h = s.mesh.userData.target;
    });
    const top = [...spikes].sort((a, b) => b.count - a.count).filter((s) => s.count > 0);
    const shown = new Set(top.slice(0, width < 520 ? 4 : 8));
    spikes.forEach((s) => {
      s.show = shown.has(s);
      s.label.html(`${tf(s.p, 'name')} <b>${fmt.int(s.count)}</b>`);
    });
    requestRender();
  }

  // ---------- 贴图：天地图影像 + 境界 + 注记 ----------
  if (key) {
    status.text(t('正在加载天地图底图…', 'Loading Tianditu base map…'));
    // 英文注记图层（eia）对浏览器端 Key 返回 418，英文模式只用影像 + 境界，不显示注记
    buildTexture(key, 3, isEn() ? ['img', 'ibo'] : ['img', 'ibo', 'cia'])
      .then((canvas) => {
        if (disposed) return;
        mercatorUV(globeGeo);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        globeMat.map = tex;
        globeMat.color.set(0xffffff);
        globeMat.needsUpdate = true;
        status.text('').style('display', 'none');
        requestRender();
      })
      .catch(() => {
        status
          .attr('class', 'gl3__status gl3__status--warn')
          .text(
            t(
              '天地图底图加载失败（Key 或网络问题），已降级为经纬网。',
              'Failed to load the Tianditu base map (key or network); showing graticule only.',
            ),
          );
      });
  }

  // ---------- 交互：悬停提示 ----------
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  function onMove(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(mouse, camera);
    const hit = raycaster.intersectObjects(spikeGroup.children, false)[0];
    if (hit) {
      const p = hit.object.userData.p;
      const s = spikes.find((x) => x.p === p);
      tooltip.show(
        e,
        `<strong>${tf(p, 'name')}</strong><br>${t('累计大规模 AI 系统', 'Cumulative large-scale AI systems')}${t('：', ': ')}${fmt.int(
          s.count,
        )}<br><em>${years[yearIdx]} · OWID / Epoch AI</em>`,
      );
      renderer.domElement.style.cursor = 'pointer';
    } else {
      tooltip.hide();
      renderer.domElement.style.cursor = '';
    }
  }
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerleave', () => tooltip.hide());

  // ---------- 控件 ----------
  slider
    .attr('min', 0)
    .attr('max', years.length - 1)
    .attr('step', 1)
    .on('input', function () {
      stopPlay();
      setYear(+this.value);
    });
  let playTimer = null;
  const syncButtons = () => {
    playBtn.text(playTimer ? t('⏸ 暂停', '⏸ Pause') : t('▶ 回放', '▶ Replay'));
    rotateBtn.text(controls.autoRotate ? t('停止自转', 'Stop rotation') : t('自动旋转', 'Auto-rotate'));
  };
  function stopPlay() {
    if (playTimer) playTimer.stop();
    playTimer = null;
    syncButtons();
  }
  function play() {
    stopPlay();
    setYear(0);
    let i = 0;
    playTimer = d3.interval(
      () => {
        i += 1;
        if (i >= years.length) return stopPlay();
        setYear(i);
      },
      theme.reducedMotion ? 400 : 1100,
    );
    syncButtons();
  }
  playBtn.on('click', () => (playTimer ? stopPlay() : play()));
  rotateBtn.on('click', () => {
    controls.autoRotate = !controls.autoRotate;
    syncButtons();
    requestRender();
  });

  // ---------- 渲染循环（离屏暂停） ----------
  let width = 0;
  let height = 0;
  let visible = false;
  let raf = 0;
  let disposed = false;
  let needsRender = true;
  const requestRender = () => {
    needsRender = true;
    if (!raf && visible) raf = requestAnimationFrame(frame);
  };
  controls.addEventListener('change', requestRender);

  const tmp = new THREE.Vector3();
  function frame() {
    raf = 0;
    if (disposed || !visible) return;
    let animating = controls.autoRotate;
    controls.update();
    camera.updateMatrixWorld();
    spikes.forEach((s) => {
      const u = s.mesh.userData;
      if (Math.abs(u.h - u.target) > 1e-4) {
        u.h += (u.target - u.h) * 0.12;
        animating = true;
      } else u.h = u.target;
      const h = Math.max(u.h, 1e-4);
      const rad = 0.006 + 0.004 * Math.min(1, u.h / 0.3);
      s.mesh.scale.set(rad, h, rad);
      s.mesh.visible = u.h > 0.002;
      const tip = s.mesh.position
        .clone()
        .normalize()
        .multiplyScalar(R + h);
      s.cap.position.copy(tip);
      s.cap.scale.setScalar(rad * 1.8);
      s.cap.visible = s.mesh.visible;
      // 标签：投影到屏幕，背面隐藏
      const facing = tip.clone().normalize().dot(tmp.copy(camera.position).normalize()) > 0.15;
      if (s.show && facing && s.mesh.visible) {
        const v = tip.clone().project(camera);
        s.label
          .style('display', null)
          .style('transform', `translate(${((v.x + 1) / 2) * width}px, ${((1 - v.y) / 2) * height}px)`);
      } else s.label.style('display', 'none');
    });
    if (needsRender || animating) renderer.render(scene, camera);
    needsRender = false;
    // controls.update() 的 change 事件可能已预约下一帧，不能重复预约（否则回调数每帧翻倍）
    if ((animating || controls.autoRotate) && !raf) raf = requestAnimationFrame(frame);
  }

  function resize(w) {
    width = w;
    height = chartHeight(w, { aspect: 0.62, min: 320, max: 620 });
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    requestRender();
  }

  const offTheme = onThemeChange(() => {
    applyColors();
    requestRender();
  });
  const stopSize = observeSize(container, ({ width: w }) => resize(w));
  // 首次进入视野时自动从最早年份播放一遍（演示动画）
  let demoPlayed = false;
  const stopVis = observeVisible(renderer.domElement, (v) => {
    visible = v;
    if (v && !demoPlayed && !theme.reducedMotion) {
      demoPlayed = true;
      play();
    }
    if (v) requestRender();
    else {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  });

  applyColors();
  setYear(yearIdx, false);
  syncButtons();

  return {
    update(step) {
      if (step >= 1) play();
      else {
        stopPlay();
        setYear(years.length - 1);
      }
    },
    resize() {
      resize(container.clientWidth);
    },
    destroy() {
      disposed = true;
      stopPlay();
      cancelAnimationFrame(raf);
      stopSize();
      stopVis();
      offTheme();
      renderer.domElement.removeEventListener('pointermove', onMove);
      controls.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material)
          [].concat(o.material).forEach((m) => {
            m.map?.dispose?.();
            m.dispose?.();
          });
      });
      renderer.dispose();
      tooltip.hide();
      root.selectAll('*').remove();
      root.classed('gl3', false);
    },
  };
}
