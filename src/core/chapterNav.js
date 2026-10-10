import { t, isEn, onLangChange } from './i18n.js';

let navigateTo;
export function goToChapter(href) {
  navigateTo?.(href);
}

export function initChapterNav() {
  const chapters = [...document.querySelectorAll('[data-nav]')];
  const header = document.querySelector('.topbar');
  const toolbar = document.createElement('nav');
  toolbar.className = 'reader-nav';
  toolbar.innerHTML = `<button type="button" class="btn reader-back"></button>
    <button type="button" class="btn reader-menu" aria-haspopup="dialog"></button>
    <span class="reader-location" aria-live="polite"></span>
    <button type="button" class="btn reader-prev"></button>
    <button type="button" class="btn reader-next"></button>`;
  header.after(toolbar);
  document.querySelector('.navdots')?.closest('nav')?.remove();
  const dialog = document.createElement('dialog');
  dialog.className = 'chapter-directory';
  dialog.setAttribute('aria-labelledby', 'directory-title');
  document.body.append(dialog);
  let current = null;
  let menuFocus;
  let routeIndex = history.state?.readerIndex || 0;
  const offsets = new Map();
  const label = (chapter) => isEn() ? chapter.dataset.navEn : chapter.dataset.nav;
  const route = (id) => ({ ...(history.state || {}), readerIndex: routeIndex, readerChapter: id });
  history.scrollRestoration = 'manual';

  function render() {
    const index = chapters.indexOf(current);
    toolbar.setAttribute('aria-label', t('阅读导航', 'Reading navigation'));
    document.querySelector('.evidence-entry')?.setAttribute('aria-label', t('数据阅读入口', 'Explore the evidence'));
    toolbar.querySelector('.reader-back').textContent = t('← 返回', '← Back');
    toolbar.querySelector('.reader-back').disabled = index === 0 && routeIndex === 0;
    toolbar.querySelector('.reader-menu').textContent = t('☰ 章节目录', '☰ Chapters');
    toolbar.querySelector('.reader-location').textContent = label(current);
    toolbar.querySelector('.reader-prev').textContent = t('上一章', 'Previous');
    toolbar.querySelector('.reader-next').textContent = t('下一章 →', 'Next →');
    toolbar.querySelector('.reader-prev').disabled = index === 0;
    toolbar.querySelector('.reader-next').disabled = index === chapters.length - 1;
    document.querySelector('.topbar__chapter').textContent = t('数据如何说明 AI 的作用', 'How data explains AI’s impact');
    const groupLabel = (i) => i === 0 ? t('开始阅读', 'Start reading') : i <= 4 ? t('工具与任务', 'Tools & tasks') : i <= 8 ? t('工作效果与产业', 'Work & industry') : t('分布、成本与应用条件', 'Distribution, costs & adoption');
    dialog.innerHTML = `<header class="directory-head"><div><p>${t('阅读路径', 'Reading path')}</p><h2 id="directory-title">${t('章节目录', 'Chapters')}</h2></div><button type="button" class="btn directory-close">${t('关闭', 'Close')}</button></header>
      <ol class="directory-list">${chapters.map((chapter, i) => `<li><a href="#${chapter.id}" data-factor="${chapter.dataset.factor || 'combo'}" ${chapter === current ? 'aria-current="page"' : ''}><small>${groupLabel(i)}</small><strong>${label(chapter)}</strong></a></li>`).join('')}</ol>`;
    dialog.querySelector('.directory-close').addEventListener('click', () => dialog.close());
    document.querySelectorAll('.chapter-pager').forEach((pager) => {
      const chapter = pager.parentElement;
      pager.setAttribute('aria-label', t('章节翻页', 'Chapter navigation'));
      const i = chapters.indexOf(chapter);
      pager.innerHTML = `${i > 0 ? `<a class="btn" href="#${chapters[i - 1].id}">← ${t('上一章', 'Previous')}</a>` : '<span></span>'}
        <button type="button" class="btn" data-directory>${t('章节目录', 'Chapters')}</button>
        ${i < chapters.length - 1 ? `<a class="btn btn--primary" href="#${chapters[i + 1].id}">${t('继续阅读', 'Continue')} · ${label(chapters[i + 1])} →</a>` : `<a class="btn" href="#top">${t('回到首页', 'Home')}</a>`}`;
    });
  }

  function show(href, { push = true, restore = false, focus = true } = {}) {
    let id;
    try { id = decodeURIComponent(href.replace(/^#/, '')); } catch { id = 'top'; }
    const target = document.getElementById(id) || chapters[0];
    const next = chapters.find((chapter) => chapter === target || chapter.contains(target));
    if (!next) return;
    const changed = next !== current;
    if (changed && current) offsets.set(current.id, scrollY);
    if (push && (changed || location.hash !== href)) {
      routeIndex++;
      history.pushState(route(next.id), '', `#${id || next.id}`);
    }
    current = next;
    chapters.forEach((chapter) => { chapter.hidden = chapter !== current; });
    document.body.dataset.chapter = current.id;
    const main = document.querySelector('main');
    main.hidden = !main.contains(current);
    document.documentElement.classList.add('chapter-reader');
    if (dialog.open) dialog.close();
    render();
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
      const y = restore ? offsets.get(current.id) || 0 : target === current ? 0 : target.getBoundingClientRect().top + scrollY - parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--reader-header'));
      window.scrollTo({ top: Math.max(0, y), behavior: 'instant' });
      if (focus) {
        const heading = [...current.querySelectorAll('h1,h2')].find((el) => el.offsetParent !== null);
        heading?.setAttribute('tabindex', '-1');
        heading?.focus({ preventScroll: true });
      }
      window.dispatchEvent(new CustomEvent('chapterchange', { detail: current.id }));
    });
  }
  navigateTo = show;
  chapters.forEach((chapter) => {
    const pager = document.createElement('nav');
    pager.className = 'chapter-pager';
    chapter.append(pager);
  });
  const openMenu = () => {
    menuFocus = document.activeElement;
    dialog.showModal();
    dialog.querySelector('[aria-current]')?.focus();
  };
  toolbar.querySelector('.reader-menu').addEventListener('click', openMenu);
  toolbar.querySelector('.reader-back').addEventListener('click', () => routeIndex > 0 ? history.back() : show('#top'));
  toolbar.querySelector('.reader-prev').addEventListener('click', () => show(`#${chapters[chapters.indexOf(current) - 1].id}`));
  toolbar.querySelector('.reader-next').addEventListener('click', () => show(`#${chapters[chapters.indexOf(current) + 1].id}`));
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => menuFocus?.focus());
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-directory]')) { openMenu(); return; }
    const anchor = event.target.closest('a[href^="#"]');
    if (!anchor || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const id = anchor.getAttribute('href');
    if (!chapters.some((chapter) => chapter.id === id.slice(1) || chapter.contains(document.getElementById(id.slice(1))))) return;
    event.preventDefault();
    show(id);
  });
  window.addEventListener('popstate', () => {
    routeIndex = history.state?.readerIndex || 0;
    show(location.hash || '#top', { push: false, restore: true });
  });
  window.addEventListener('hashchange', () => {
    if (location.hash.slice(1) !== current.id) show(location.hash || '#top', { push: false });
  });
  const sizeHeader = () => {
    const top = header.getBoundingClientRect().bottom;
    toolbar.style.top = `${top}px`;
    document.documentElement.style.setProperty('--reader-header', `${top + toolbar.offsetHeight}px`);
  };
  new ResizeObserver(sizeHeader).observe(header);
  new ResizeObserver(sizeHeader).observe(toolbar);
  onLangChange(render);
  history.replaceState(route(location.hash.slice(1) || 'top'), '', location.href);
  show(location.hash || '#top', { push: false, focus: false });
  let ticking = false;
  const scrollProgress = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      document.querySelector('.progress__bar').style.transform = `scaleX(${Math.min(1, scrollY / max)})`;
      header.classList.toggle('is-scrolled', scrollY > 40);
      ticking = false;
    });
  };
  window.addEventListener('scroll', scrollProgress, { passive: true });
  window.addEventListener('chapterchange', scrollProgress);
}
