// 滚动叙事：scrollama 驱动 .scrolly 中的 .step → 图表 update(step)
// 另含：顶部进度条、章节导航点、当前章节标题、URL hash 同步
import scrollama from 'scrollama';
import { stepFigure } from './figure.js';
import { isEn, onLangChange } from './i18n.js';

export function initScrolly() {
  const scrollers = [];
  document.querySelectorAll('.scrolly').forEach((block) => {
    const fig = block.querySelector('figure[data-chart]');
    const steps = block.querySelectorAll('.step');
    if (!fig || !steps.length) return;
    const s = scrollama();
    s.setup({ step: steps, offset: window.innerWidth < 768 ? 0.75 : 0.55 }).onStepEnter(({ element, index }) => {
      steps.forEach((el) => el.classList.toggle('is-active', el === element));
      stepFigure(fig, +(element.dataset.step ?? index));
    });
    scrollers.push(s);

    // 移动端：图表高于视口约 60% 时改为“图在上、文在下”的非 sticky 布局，避免步骤卡片遮住图表
    const graphic = block.querySelector('.scrolly__graphic');
    const layout = () => {
      const tooTall = window.innerWidth < 768 && graphic.offsetHeight > window.innerHeight * 0.6;
      if (block.classList.contains('scrolly--static') !== tooTall) {
        block.classList.toggle('scrolly--static', tooTall);
        s.resize();
      }
    };
    new ResizeObserver(layout).observe(graphic);
    window.addEventListener('resize', layout);
  });
  window.addEventListener('resize', () => scrollers.forEach((s) => s.resize()));
  return scrollers;
}

export function initNav() {
  const chapters = [...document.querySelectorAll('[data-nav]')];
  const nav = document.querySelector('.navdots');
  const label = document.querySelector('.topbar__chapter');
  const bar = document.querySelector('.progress__bar');
  const topbar = document.querySelector('.topbar');

  const navLabel = (c) => (isEn() && c.dataset.navEn ? c.dataset.navEn : c.dataset.nav);
  let current = null;
  const renderNav = () => {
    nav.innerHTML = chapters
      .map(
        (c) =>
          `<li><a href="#${c.id}" data-factor="${c.dataset.factor || ''}" aria-label="${navLabel(c)}"><span>${navLabel(c)}</span></a></li>`,
      )
      .join('');
    links = [...nav.querySelectorAll('a')];
    if (current) {
      links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === `#${current.id}`));
      label.textContent = navLabel(current);
    }
  };
  let links = [];
  renderNav();
  onLangChange(renderNav);

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const id = e.target.id;
        current = e.target;
        links.forEach((a) => {
          const on = a.getAttribute('href') === `#${id}`;
          a.classList.toggle('is-active', on);
          if (on) a.setAttribute('aria-current', 'true');
          else a.removeAttribute('aria-current');
        });
        label.textContent = navLabel(e.target);
        if (history.replaceState && id) history.replaceState(null, '', `#${id}`);
      });
    },
    { rootMargin: '-45% 0px -50% 0px' },
  );
  chapters.forEach((c) => io.observe(c));

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const max = document.documentElement.scrollHeight - innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
      topbar.classList.toggle('is-scrolled', scrollY > 40);
      ticking = false;
    });
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}
