// Canvas 神经网络粒子：
//   network 模式：节点漂移 + 近邻连线 + 鼠标聚合
//   setProgress(p)：p∈[0,1]，随滚动重组为“劳动者 / 劳动资料 / 劳动对象”三簇
//   text 模式：粒子汇聚成文字（结语“新质生产力”）
import { color, onThemeChange, theme } from '../core/theme.js';
import { observeVisible } from '../core/chartUtils.js';
import { t } from '../core/i18n.js';

const FACTORS = [
  { key: 'worker', get label() { return t('劳动者', 'Workers'); } },
  { key: 'tool', get label() { return t('劳动资料', 'Means of labour'); } },
  { key: 'object', get label() { return t('劳动对象', 'Objects of labour'); } },
];

export function createParticles(canvas, { mode = 'network', text = '' } = {}) {
  const ctx = canvas.getContext('2d');
  let w = 0;
  let h = 0;
  let dpr = 1;
  let nodes = [];
  let progress = 0;
  let textTargets = [];
  let textProgress = mode === 'text' ? 0 : 0;
  let raf = 0;
  let visible = true;
  let palette = {};
  const mouse = { x: -1e4, y: -1e4, active: false };

  function readPalette() {
    palette = {
      worker: color('worker') || '#34d399',
      tool: color('tool') || '#22d3ee',
      object: color('object') || '#a78bfa',
      text: color('text') || '#e5e7eb',
      muted: color('muted') || '#94a3b8',
      light: theme.mode === 'light',
    };
  }

  function clusterCenters() {
    const narrow = w < 700;
    return FACTORS.map((f, i) =>
      narrow
        ? { ...f, x: w / 2, y: h * (0.25 + i * 0.25) }
        : { ...f, x: w * (0.22 + i * 0.28), y: h * 0.52 },
    );
  }

  function sampleText() {
    if (!text) return [];
    const off = document.createElement('canvas');
    const fs = Math.min(w / (text.length * 1.12), h * 0.22);
    off.width = w;
    off.height = h;
    const o = off.getContext('2d');
    o.fillStyle = '#fff';
    o.font = `900 ${fs}px ${getComputedStyle(document.body).fontFamily}`;
    o.textAlign = 'center';
    o.textBaseline = 'middle';
    o.fillText(text, w / 2, h * 0.3);
    const img = o.getImageData(0, 0, w, h).data;
    const pts = [];
    const gap = Math.max(3, Math.round(fs / 30));
    for (let y = 0; y < h; y += gap)
      for (let x = 0; x < w; x += gap) if (img[(y * w + x) * 4 + 3] > 128) pts.push({ x, y });
    // 打乱，保证每个粒子分到的目标分布均匀
    for (let i = pts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pts[i], pts[j]] = [pts[j], pts[i]];
    }
    return pts;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = Math.max(1, Math.floor(rect.width));
    h = Math.max(1, Math.floor(rect.height));
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const base = Math.round(Math.min(220, Math.max(70, (w * h) / 9000)));
    textTargets = mode === 'text' ? sampleText() : [];
    const count = mode === 'text' ? Math.min(1600, Math.max(base, textTargets.length)) : base;
    const centers = clusterCenters();
    nodes = Array.from({ length: count }, (_, i) => {
      const f = i % 3;
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.sqrt(Math.random()) * Math.min(w, h) * (w < 700 ? 0.1 : 0.13);
      const tt = textTargets.length ? textTargets[i % textTargets.length] : null;
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: 1.2 + Math.random() * 1.8,
        f,
        cx: centers[f].x + Math.cos(ang) * rad,
        cy: centers[f].y + Math.sin(ang) * rad,
        tx: tt?.x,
        ty: tt?.y,
      };
    });
    if (theme.reducedMotion) draw();
  }

  function step() {
    const centersOn = mode === 'network' ? easeInOut(progress) : 0;
    const textOn = mode === 'text' ? easeInOut(textProgress) : 0;
    for (const n of nodes) {
      // 自由漂移
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < 0 || n.x > w) n.vx *= -1;
      if (n.y < 0 || n.y > h) n.vy *= -1;
      // 鼠标聚合
      if (mouse.active) {
        const dx = mouse.x - n.x;
        const dy = mouse.y - n.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 180 * 180 && d2 > 1) {
          const k = 0.012 * (1 - Math.sqrt(d2) / 180);
          n.vx += dx * k * 0.08;
          n.vy += dy * k * 0.08;
        }
      }
      n.vx *= 0.985;
      n.vy *= 0.985;
      if (Math.abs(n.vx) + Math.abs(n.vy) < 0.15) {
        n.vx += (Math.random() - 0.5) * 0.08;
        n.vy += (Math.random() - 0.5) * 0.08;
      }
      // 重组为三簇 / 汇聚成文字
      if (centersOn > 0) {
        n.x += (n.cx - n.x) * 0.08 * centersOn;
        n.y += (n.cy - n.y) * 0.08 * centersOn;
      }
      if (textOn > 0 && n.tx != null) {
        n.x += (n.tx - n.x) * 0.09 * textOn;
        n.y += (n.ty - n.y) * 0.09 * textOn;
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    const linkDist = mode === 'text' ? 0 : w < 700 ? 90 : 120;
    const factorMix = mode === 'network' ? easeInOut(progress) : mode === 'text' ? 1 : 0;
    // 连线（网格分桶加速）
    if (linkDist > 0) {
      const cell = linkDist;
      const grid = new Map();
      nodes.forEach((n, i) => {
        const key = `${Math.floor(n.x / cell)},${Math.floor(n.y / cell)}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(i);
      });
      ctx.lineWidth = 0.8;
      nodes.forEach((a, i) => {
        const gx = Math.floor(a.x / cell);
        const gy = Math.floor(a.y / cell);
        for (let ox = -1; ox <= 1; ox++)
          for (let oy = -1; oy <= 1; oy++) {
            const bucket = grid.get(`${gx + ox},${gy + oy}`);
            if (!bucket) continue;
            for (const j of bucket) {
              if (j <= i) continue;
              const b = nodes[j];
              const d = Math.hypot(a.x - b.x, a.y - b.y);
              if (d > linkDist) continue;
              const same = a.f === b.f;
              if (factorMix > 0.5 && !same) continue;
              const alpha = (1 - d / linkDist) * (palette.light ? 0.35 : 0.28);
              ctx.strokeStyle = withAlpha(factorMix > 0.2 ? palette[FACTORS[a.f].key] : palette.tool, alpha);
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
      });
    }
    // 节点
    for (const n of nodes) {
      const c = factorMix > 0.15 ? palette[FACTORS[n.f].key] : n.f === 2 ? palette.object : palette.tool;
      ctx.fillStyle = withAlpha(c, palette.light ? 0.75 : 0.9);
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // 三簇标签
    if (mode === 'network' && progress > 0.55) {
      const a = Math.min(1, (progress - 0.55) / 0.3);
      ctx.textAlign = 'center';
      ctx.font = `700 ${w < 700 ? 15 : 18}px ${getComputedStyle(document.body).fontFamily}`;
      clusterCenters().forEach((c) => {
        ctx.fillStyle = withAlpha(palette[c.key], a);
        ctx.fillText(c.label, c.x, c.y + Math.min(w, h) * (w < 700 ? 0.13 : 0.17));
      });
    }
  }

  function loop() {
    step();
    draw();
    raf = requestAnimationFrame(loop);
  }

  function start() {
    cancelAnimationFrame(raf);
    if (theme.reducedMotion) {
      // 静态：直接放到目标位置
      for (const n of nodes) {
        if (mode === 'network' && progress > 0.5) {
          n.x = n.cx;
          n.y = n.cy;
        }
        if (mode === 'text' && textProgress > 0.5 && n.tx != null) {
          n.x = n.tx;
          n.y = n.ty;
        }
      }
      draw();
      return;
    }
    if (visible) raf = requestAnimationFrame(loop);
  }

  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
    mouse.active = true;
  };
  const onLeave = () => {
    mouse.active = false;
  };
  const host = canvas.parentElement;
  host.addEventListener('pointermove', onMove);
  host.addEventListener('pointerleave', onLeave);

  readPalette();
  const offTheme = onThemeChange(() => {
    readPalette();
    start();
  });
  const ro = new ResizeObserver(() => {
    resize();
  });
  ro.observe(canvas);
  resize();
  const stopVis = observeVisible(canvas, (v) => {
    visible = v;
    if (v) start();
    else cancelAnimationFrame(raf);
  });

  return {
    setProgress(p) {
      progress = Math.max(0, Math.min(1, p));
      if (theme.reducedMotion) start();
    },
    setTextProgress(p) {
      textProgress = Math.max(0, Math.min(1, p));
      if (theme.reducedMotion) start();
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      stopVis();
      offTheme();
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
    },
  };
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function withAlpha(c, a) {
  if (!c) return `rgba(148,163,184,${a})`;
  if (c.startsWith('#')) {
    const hex = c.length === 4 ? c.replace(/#(.)(.)(.)/, '#$1$1$2$2$3$3') : c;
    const n = parseInt(hex.slice(1, 7), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  if (c.startsWith('rgb(')) return c.replace('rgb(', 'rgba(').replace(')', `,${a})`);
  return c;
}
