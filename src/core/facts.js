// 正文数字绑定：<b data-fact="key"></b> ← public/data/facts.json
// 英文模式使用 value_en / unit_en / label_en（数值换算如“1.7 亿”→“170 million”在数据中写明）
// data-count 属性存在时，进入视口后做计数动画（d3.interpolateNumber）
import * as d3 from 'd3';
import { loader } from './loader.js';
import { theme } from './theme.js';
import { tooltip } from './tooltip.js';
import { t, tf, isEn, onLangChange } from './i18n.js';

let factsCache = {};
let byId = new Map();

const valueOf = (fact) => (isEn() && fact.value_en != null ? fact.value_en : fact.value);
const unitOf = (fact) => (isEn() ? (fact.unit_en ?? fact.unit ?? '') : (fact.unit ?? ''));

function format(fact, v) {
  if (typeof v !== 'number') return String(v);
  const base = valueOf(fact);
  const digits = fact.digits ?? (Number.isInteger(base) ? 0 : String(base).split('.')[1].length);
  return d3.format(`,.${digits}f`)(v);
}

function render(el, fact, v = valueOf(fact)) {
  const unit = el.dataset.noUnit != null ? '' : unitOf(fact);
  el.textContent = `${fact.prefix ?? ''}${format(fact, v)}`;
  if (unit) {
    const u = document.createElement('span');
    u.className = 'fact__unit';
    u.textContent = unit;
    el.append(u);
  }
}

function tipHtml(fact) {
  const src = byId.get(fact.source_id);
  const label = tf(fact, 'label');
  return `${label ? `<strong>${label}</strong><br>` : ''}${t('来源', 'Source')}：${
    src ? `${tf(src, 'org')} · ${tf(src, 'title')}` : fact.source_id
  }${fact.kind === 'forecast' ? `<br><em>${t('预测/目标值', 'Forecast / target')}</em>` : ''}${
    tf(fact, 'note') ? `<br><em>${tf(fact, 'note')}</em>` : ''
  }`;
}

export async function bindFacts(root = document) {
  const [{ facts }, sources] = await Promise.all([loader.json('facts'), loader.json('sources')]);
  factsCache = facts;
  byId = new Map(sources.map((s) => [s.id, s]));
  const counters = [];
  root.querySelectorAll('[data-fact]').forEach((el) => {
    const fact = facts[el.dataset.fact];
    if (!fact) {
      el.textContent = t('［缺失］', '[missing]');
      el.classList.add('fact--missing');
      return;
    }
    el.classList.add('fact');
    if (fact.kind) el.classList.add(`fact--${fact.kind}`);
    el.tabIndex = 0;
    el.addEventListener('pointerenter', (e) => tooltip.show(e, tipHtml(fact)));
    el.addEventListener('focus', (e) => tooltip.show(e, tipHtml(fact)));
    el.addEventListener('pointermove', (e) => tooltip.move(e));
    el.addEventListener('pointerleave', () => tooltip.hide());
    el.addEventListener('blur', () => tooltip.hide());
    if (el.hasAttribute('data-count') && typeof valueOf(fact) === 'number' && !theme.reducedMotion) {
      render(el, fact, 0);
      counters.push({ el, fact });
    } else render(el, fact);
  });

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        const c = counters.find((x) => x.el === e.target);
        const interp = d3.interpolateNumber(0, valueOf(c.fact));
        d3.select(c.el)
          .transition()
          .duration(theme.countDuration)
          .ease(d3.easeCubicOut)
          .tween('count', () => (tt) => render(c.el, c.fact, interp(tt)));
      });
    },
    { threshold: 0.6 },
  );
  counters.forEach((c) => io.observe(c.el));
}

// 切换语言：所有数字按新语言重新渲染（不重复计数动画）
onLangChange(() => {
  document.querySelectorAll('[data-fact]').forEach((el) => {
    const fact = factsCache[el.dataset.fact];
    if (fact) {
      d3.select(el).interrupt();
      render(el, fact);
    }
  });
});
