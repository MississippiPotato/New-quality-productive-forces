// 图表外壳：<figure class="fig" data-chart="name"> 懒加载初始化 + “ⓘ 来源”按钮 + 滚动步骤分发
// 切换语言时销毁并重建所有已初始化的图表（恢复各自的当前步骤）
import { registry } from '../sections/registry.js';
import { collectSourceIds } from './loader.js';
import { openSources } from './sourcePanel.js';
import { t, onLangChange } from './i18n.js';

const instances = new Map(); // figure element → { chart, step, promise }

const srcLabel = () => `<span aria-hidden="true">ⓘ</span> ${t('来源', 'Sources')}`;

/** 当前语言下可见的图表标题 */
function figTitle(fig, fallback) {
  const titles = [...fig.querySelectorAll('.fig__title')];
  const visible = titles.find((el) => el.offsetParent !== null) || titles[0];
  return visible?.textContent || fallback;
}

function ensureShell(fig) {
  let body = fig.querySelector('.fig__body');
  if (!body) {
    body = document.createElement('div');
    body.className = 'fig__body';
    const caption = fig.querySelector('figcaption');
    if (caption) caption.after(body);
    else fig.prepend(body);
  }
  let foot = fig.querySelector('.fig__foot');
  if (!foot) {
    foot = document.createElement('footer');
    foot.className = 'fig__foot';
    fig.append(foot);
  }
  if (!foot.querySelector('.fig__src')) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fig__src';
    btn.innerHTML = srcLabel();
    btn.disabled = true;
    btn.addEventListener('click', () => {
      const ids = instances.get(fig)?.sourceIds;
      if (ids) openSources([...ids], figTitle(fig, fig.dataset.chart), fig.dataset.chart);
    });
    foot.append(btn);
  }
  return body;
}

async function init(fig) {
  if (instances.has(fig)) return instances.get(fig).promise;
  const name = fig.dataset.chart;
  const entry = registry[name];
  const state = { chart: null, step: null, sourceIds: null };
  instances.set(fig, state);
  const body = ensureShell(fig);
  body.setAttribute('aria-busy', 'true');
  if (!entry) {
    body.innerHTML = `<p class="chart-note chart-note--warn">${t('未注册的图表', 'Unregistered chart')}：${name}</p>`;
    return;
  }
  state.promise = (async () => {
    try {
      const [factory, data] = await Promise.all([entry.load(), entry.data()]);
      state.factory = factory;
      state.data = data;
      state.chart = factory(body, data, { ...fig.dataset });
      body.removeAttribute('aria-busy');
      state.sourceIds = new Set([
        ...collectSourceIds(data),
        ...(fig.dataset.sources || '').split(/[ ,]+/).filter(Boolean),
      ]);
      fig.querySelector('.fig__src').disabled = false;
      if (state.step != null) state.chart.update?.(state.step);
    } catch (e) {
      console.error(e);
      body.removeAttribute('aria-busy');
      body.innerHTML = `<p class="chart-note chart-note--warn">${t('图表加载失败', 'Chart failed to load')}：${e.message}</p>`;
    }
  })();
  return state.promise;
}

/** 语言切换：重建所有已就绪的图表 */
function rebuildAll() {
  for (const [fig, state] of instances) {
    const btn = fig.querySelector('.fig__src');
    if (btn) btn.innerHTML = srcLabel();
    if (!state.chart || !state.factory) continue;
    if (fig.closest('[data-nav]')?.hidden) { state.needsRebuild = true; continue; }
    const body = fig.querySelector('.fig__body');
    try {
      state.chart.destroy?.();
    } catch (e) {
      console.warn(e);
    }
    body.innerHTML = '';
    state.chart = state.factory(body, state.data, { ...fig.dataset });
    state.needsRebuild = false;
    if (state.step != null) state.chart.update?.(state.step);
  }
}
onLangChange(rebuildAll);
window.addEventListener('chapterchange', () => {
  if ([...instances].some(([fig, state]) => state.needsRebuild && !fig.closest('[data-nav]')?.hidden)) rebuildAll();
});

/** 懒加载：figure 进入视口前一屏才初始化 */
export function initFigures(root = document) {
  const figs = [...root.querySelectorAll('figure[data-chart]')];
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          io.unobserve(e.target);
          init(e.target);
        }
      });
    },
    { rootMargin: '100% 0px' },
  );
  figs.forEach((f) => {
    ensureShell(f);
    io.observe(f);
  });
  return figs;
}

/** 滚动步骤 → 图表 update(step)，图表未就绪时先缓存 */
export function stepFigure(fig, step) {
  if (!instances.has(fig)) init(fig); // 同步登记 state，图表就绪后会应用 step
  const state = instances.get(fig);
  state.step = step;
  state.chart?.update?.(step);
}

export function forceInit(fig) {
  return init(fig);
}
