import './styles/tokens.css';
import './styles/base.css';
import './styles/sections.css';
import { initTheme, setTheme, toggleTheme, setMotion, theme } from './core/theme.js';
import { bindFacts } from './core/facts.js';
import { initFigures } from './core/figure.js';
import { initScrolly, initNav } from './core/scroller.js';
import { openAllSources, renderSourceTable } from './core/sourcePanel.js';
import { createParticles } from './hero/particles.js';
import { initLang, toggleLang, onLangChange, t, isEn } from './core/i18n.js';

initLang();
initTheme();
const qs = new URLSearchParams(location.search);
if (qs.get('theme')) setTheme(qs.get('theme'));

// ---------- 顶栏按钮 ----------
const themeBtn = document.getElementById('btn-theme');
const motionBtn = document.getElementById('btn-motion');
const langBtn = document.getElementById('btn-lang');
const syncButtons = () => {
  themeBtn.setAttribute('aria-pressed', theme.mode === 'light');
  themeBtn.querySelector('span').textContent = theme.mode === 'dark' ? t('亮色', 'Light') : t('暗色', 'Dark');
  motionBtn.setAttribute('aria-pressed', theme.reducedMotion);
  motionBtn.querySelector('span').textContent = theme.reducedMotion
    ? t('开启动画', 'Motion on')
    : t('关闭动画', 'Motion off');
  langBtn.querySelector('span').textContent = isEn() ? '中文' : 'EN';
  langBtn.setAttribute('aria-label', isEn() ? '切换到中文' : 'Switch to English');
  document.querySelectorAll('[data-open-sources] .js-src-label').forEach((el) => {
    el.textContent = t('数据来源', 'Sources');
  });
  document.title = t('智能涌现：人工智能作为新质生产力', 'Emergence: AI as a New Quality Productive Force');
};
langBtn.addEventListener('click', () => toggleLang());
onLangChange(syncButtons);
themeBtn.addEventListener('click', () => {
  toggleTheme();
  syncButtons();
});
motionBtn.addEventListener('click', () => {
  setMotion(theme.reducedMotion);
  syncButtons();
});
syncButtons();
document.querySelectorAll('[data-open-sources]').forEach((b) => b.addEventListener('click', openAllSources));

// ---------- Hero：标题逐字出现 + 粒子 ----------
document.querySelectorAll('.hero__title').forEach((title) => {
  const chars = [...title.textContent.trim()];
  title.setAttribute('aria-label', title.textContent.trim());
  title.innerHTML = chars
    .map((c, i) => `<span class="ch" aria-hidden="true" style="animation-delay:${200 + i * 140}ms;--bgx:${(i / Math.max(1, chars.length - 1)) * 100}%">${c === ' ' ? '&nbsp;' : c}</span>`)
    .join('');
});

const hero = document.querySelector('.hero');
const heroParticles = createParticles(document.querySelector('.hero__canvas'), { mode: 'network' });
const outro = document.querySelector('.outro');
const outroText = () => (isEn() ? outro.dataset.textEn : outro.dataset.text) || '新质生产力';
let outroParticles = outro ? createParticles(document.querySelector('.outro__canvas'), { mode: 'text', text: outroText() }) : null;
onLangChange(() => {
  if (!outro) return;
  outroParticles?.destroy();
  outroParticles = createParticles(document.querySelector('.outro__canvas'), { mode: 'text', text: outroText() });
  onScroll();
});

let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    // Hero 离开视口时粒子重组为三要素簇
    const hr = hero.getBoundingClientRect();
    heroParticles.setProgress(-hr.top / (hr.height * 0.6));
    if (outro && outroParticles) {
      const or = outro.getBoundingClientRect();
      outroParticles.setTextProgress((innerHeight - or.top) / (or.height * 0.8));
    }
    ticking = false;
  });
}
addEventListener('scroll', onScroll, { passive: true });
onScroll();

// ---------- 数据绑定、图表、滚动叙事 ----------
bindFacts();
initFigures();
initScrolly();
initNav();
const table = document.getElementById('source-summary');
if (table) renderSourceTable(table);
