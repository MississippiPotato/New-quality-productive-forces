// 组件独立预览：dev.html?chart=名称&step=0&w=900&theme=light
import './styles/tokens.css';
import './styles/base.css';
import './styles/sections.css';
import { registry } from './sections/registry.js';
import { initTheme, toggleTheme, setTheme } from './core/theme.js';
import { forceInit, stepFigure } from './core/figure.js';
import { initLang, toggleLang } from './core/i18n.js';

initLang();
initTheme();
const params = new URLSearchParams(location.search);
if (params.get('theme')) setTheme(params.get('theme'));
const names = Object.keys(registry);
const current = params.get('chart') || names[0];
const sel = document.getElementById('dev-chart');
sel.innerHTML = names.map((n) => `<option ${n === current ? 'selected' : ''}>${n}</option>`).join('');
sel.addEventListener('change', () => {
  params.set('chart', sel.value);
  location.search = params.toString();
});
document.getElementById('dev-theme').addEventListener('click', toggleTheme);
document.getElementById('dev-lang').addEventListener('click', toggleLang);

const stage = document.getElementById('dev-stage');
const width = document.getElementById('dev-width');
const wLabel = document.getElementById('dev-w');
const setW = (w) => {
  stage.style.width = `${w}px`;
  wLabel.textContent = `${w}px`;
};
width.value = params.get('w') || 900;
setW(width.value);
width.addEventListener('input', () => setW(width.value));

stage.innerHTML = `<figure class="fig" data-chart="${current}">
  <figcaption><h3 class="fig__title">${current}</h3><p class="fig__sub">独立预览</p></figcaption>
  <div class="fig__body"></div></figure>`;
const fig = stage.querySelector('figure');
forceInit(fig).then(() => {
  const step = params.get('step');
  if (step != null) stepFigure(fig, +step);
  document.body.dataset.ready = 'true';
});

const steps = document.getElementById('dev-steps');
steps.innerHTML = [0, 1, 2, 3, 4].map((i) => `<button class="btn" data-s="${i}">step ${i}</button>`).join(' ');
steps.addEventListener('click', (e) => {
  const s = e.target.dataset.s;
  if (s != null) stepFigure(fig, +s);
});
