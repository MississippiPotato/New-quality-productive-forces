// 滚动叙事：scrollama 驱动 .scrolly 中的 .step → 图表 update(step)
// 另含：顶部进度条、章节导航点、当前章节标题、URL hash 同步
import scrollama from 'scrollama';
import { stepFigure } from './figure.js';

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
    window.addEventListener('chapterchange', () => {
      if (block.closest('[data-nav]')?.hidden) return;
      s.resize();
      const threshold = innerHeight * (innerWidth < 768 ? 0.75 : 0.55);
      let index = 0;
      steps.forEach((step, i) => { if (step.getBoundingClientRect().top <= threshold) index = i; });
      steps.forEach((step, i) => step.classList.toggle('is-active', i === index));
      stepFigure(fig, +(steps[index].dataset.step ?? index));
    });

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

export { initChapterNav as initNav } from './chapterNav.js';
