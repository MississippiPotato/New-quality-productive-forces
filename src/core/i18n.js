// 中英双语：语言状态、切换事件与翻译工具
//   t('中文', 'English')     —— 图表与界面中的固定文案
//   tf(obj, 'field')         —— 数据中的文本字段：英文模式下优先取 obj.field_en
//   isEn()                   —— 当前是否英文
// 语言切换时，figure.js 会销毁并重建所有已初始化的图表，图表模块只需在创建时读取当前语言。
const KEY = 'ainp-lang';
const listeners = new Set();

function safeGet() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function safeSet(v) {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* 隐私模式下忽略 */
  }
}

let lang = 'zh';

export function initLang() {
  const q = new URLSearchParams(location.search).get('lang');
  lang = q === 'en' || q === 'zh' ? q : safeGet() === 'en' ? 'en' : 'zh';
  apply();
}

function apply() {
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
  document.documentElement.dataset.lang = lang;
}

export const getLang = () => lang;
export const isEn = () => lang === 'en';

export function setLang(next) {
  if (next === lang) return;
  lang = next === 'en' ? 'en' : 'zh';
  safeSet(lang);
  apply();
  listeners.forEach((fn) => fn(lang));
}

export function toggleLang() {
  setLang(lang === 'en' ? 'zh' : 'en');
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 固定文案：t('中文', 'English') */
export function t(zh, en) {
  return lang === 'en' && en != null ? en : zh;
}

/** 数据文本字段：英文模式下取 obj[field + '_en']，缺失时回退中文 */
export function tf(obj, field) {
  if (!obj) return '';
  if (lang === 'en') {
    const v = obj[`${field}_en`];
    if (v != null && v !== '') return v;
  }
  return obj[field];
}
