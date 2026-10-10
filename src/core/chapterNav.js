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
  header.querySelector('.topbar__chapter').replaceWith(toolbar);
  document.querySelector('.navdots')?.closest('nav')?.remove();
  const dialog = document.createElement('dialog');
  dialog.className = 'chapter-directory';
  dialog.setAttribute('aria-labelledby', 'directory-title');
  document.body.append(dialog);
  const sidebar = document.createElement('aside');
  sidebar.className = 'reader-sidebar';
  document.body.append(sidebar);
  let current = null;
  let menuFocus;
  let routeIndex = history.state?.readerIndex || 0;
  const offsets = new Map();
  const label = (chapter) => isEn() ? chapter.dataset.navEn : chapter.dataset.nav;
  const titles = [
    ['序章', 'Prologue'], ['概念与要素', 'Concept & factors'], ['算力基础', 'Computing infrastructure'],
    ['模型工具', 'AI models'], ['数据与任务', 'Data & tasks'], ['效率与差异', 'Efficiency & differences'],
    ['协作机制', 'How collaboration works'], ['产业应用', 'Industry applications'], ['经济贡献', 'Economic contribution'],
    ['全球分布', 'Global distribution'], ['成本与转型', 'Costs & transition'], ['情景实验', 'Scenario experiment'],
    ['结语', 'Epilogue'], ['数据与方法', 'Data & methods'],
  ];
  const groups = [
    { start: 1, end: 4, title: ['生产工具', 'Production tools'], question: ['AI 靠什么进入生产？', 'How does AI enter production?'] },
    { start: 5, end: 6, title: ['工作效果', 'Effects on work'], question: ['同一份工作，改变了多少？', 'How much does the same task change?'] },
    { start: 7, end: 9, title: ['产业变化', 'Changes in industry'], question: ['这些变化怎样扩展到产业？', 'How do these changes reach industry?'] },
    { start: 10, end: 11, title: ['发展条件', 'Conditions for progress'], question: ['收益怎样才能持续？', 'What makes the benefits last?'] },
  ];
  const shortTitle = (i) => t(...titles[i]);
  const number = (i) => i === 0 ? '00' : i < 12 ? String(i).padStart(2, '0') : i === 12 ? 'END' : 'REF';
  const chapterLink = (i) => `<a href="#${chapters[i].id}" data-factor="${chapters[i].dataset.factor || 'combo'}" ${chapters[i] === current ? 'aria-current="page"' : ''}><span class="directory-number">${number(i)}</span><span>${shortTitle(i)}</span></a>`;
  const contents = (questions = false) => `${chapterLink(0)}${groups.map((group, i) => `<section class="directory-group"><h3><span>${String.fromCharCode(65 + i)}</span>${t(...group.title)}</h3>${questions ? `<p>${t(...group.question)}</p>` : ''}<div>${chapters.slice(group.start, group.end + 1).map((_, offset) => chapterLink(group.start + offset)).join('')}</div></section>`).join('')}<div class="directory-reference">${chapterLink(12)}${chapterLink(13)}</div>`;
  const route = (id) => ({ ...(history.state || {}), readerIndex: routeIndex, readerChapter: id });
  history.scrollRestoration = 'manual';

  function render() {
    const index = chapters.indexOf(current);
    toolbar.setAttribute('aria-label', t('阅读导航', 'Reading navigation'));
    document.querySelector('.evidence-entry')?.setAttribute('aria-label', t('数据阅读入口', 'Explore the evidence'));
    toolbar.querySelector('.reader-back').textContent = t('← 返回', '← Back');
    toolbar.querySelector('.reader-back').disabled = index === 0 && routeIndex === 0;
    toolbar.querySelector('.reader-menu').textContent = t('☰ 目录', '☰ Chapters');
    toolbar.querySelector('.reader-location').innerHTML = `<span>${number(index)}</span> ${shortTitle(index)}`;
    toolbar.querySelector('.reader-prev').textContent = '←';
    toolbar.querySelector('.reader-next').textContent = '→';
    toolbar.querySelector('.reader-prev').setAttribute('aria-label', t('上一章', 'Previous chapter'));
    toolbar.querySelector('.reader-next').setAttribute('aria-label', t('下一章', 'Next chapter'));
    toolbar.querySelector('.reader-prev').disabled = index === 0;
    toolbar.querySelector('.reader-next').disabled = index === chapters.length - 1;
    sidebar.setAttribute('aria-label', t('章节目录', 'Chapters'));
    sidebar.innerHTML = `<a class="sidebar-brand" href="#top"><span class="sidebar-mark" aria-hidden="true">◈</span>${t('智能涌现', 'Emergence')}</a><p class="sidebar-eyebrow">${t('人工智能与新质生产力', 'AI & PRODUCTIVITY')}</p><nav class="directory-list">${contents()}</nav>`;
    dialog.innerHTML = `<header class="directory-head"><div><p>${t('用数据回答四个问题', 'Four questions, explored through data')}</p><h2 id="directory-title">${t('章节目录', 'Chapters')}</h2></div><button type="button" class="btn directory-close">${t('关闭', 'Close')}</button></header>
      <nav class="directory-list">${contents(true)}</nav>`;
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
    document.documentElement.style.setProperty('--reader-header', `${header.getBoundingClientRect().bottom}px`);
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
