// 主题、动效与配色的唯一入口
import * as d3 from 'd3';
import { t } from './i18n.js';

const listeners = new Set();
const STORAGE_KEY = 'ainp-theme';
const MOTION_KEY = 'ainp-motion';

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 隐私模式下忽略 */
  }
}

const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
let motionOff = safeGet(MOTION_KEY) === 'off' || mq.matches;

export const theme = {
  get duration() {
    return motionOff ? 0 : 750;
  },
  get countDuration() {
    return motionOff ? 0 : 1200;
  },
  ease: d3.easeCubicInOut,
  get reducedMotion() {
    return motionOff;
  },
  get mode() {
    return document.documentElement.dataset.theme || 'dark';
  },
};

/** 读取 CSS 变量的实际颜色值（Canvas 等无法使用 var() 的场景） */
export function color(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
}

/** 三要素与国家分组配色名 */
export const FACTOR_COLOR = { worker: 'var(--worker)', tool: 'var(--tool)', object: 'var(--object)', combo: 'var(--combo)' };
export const GROUP_COLOR = { CN: 'var(--cn)', US: 'var(--us)', 'EU+UK': 'var(--eu)', Multi: 'var(--green)', Other: 'var(--other)', Unknown: 'var(--other)' };
export const GROUP_LABEL = {
  get CN() {
    return t('中国', 'China');
  },
  get US() {
    return t('美国', 'United States');
  },
  get ['EU+UK']() {
    return t('欧洲（含英国、瑞士）', 'Europe (incl. UK, Switzerland)');
  },
  get Multi() {
    return t('多国合作', 'Multinational');
  },
  get Other() {
    return t('其他', 'Other');
  },
  get Unknown() {
    return t('未注明', 'Unspecified');
  },
};

export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  listeners.forEach((fn) => fn(theme));
}

export function setTheme(mode) {
  document.documentElement.dataset.theme = mode;
  safeSet(STORAGE_KEY, mode);
  emit();
}

export function toggleTheme() {
  setTheme(theme.mode === 'dark' ? 'light' : 'dark');
}

export function setMotion(on) {
  motionOff = !on;
  document.documentElement.dataset.motion = on ? 'on' : 'off';
  safeSet(MOTION_KEY, on ? 'on' : 'off');
  emit();
}

export function initTheme() {
  const saved = safeGet(STORAGE_KEY);
  // 科技感暗色为主视觉；用户手动切换后记住选择
  document.documentElement.dataset.theme = saved || 'dark';
  document.documentElement.dataset.motion = motionOff ? 'off' : 'on';
  mq.addEventListener?.('change', (e) => {
    if (safeGet(MOTION_KEY) == null) {
      motionOff = e.matches;
      emit();
    }
  });
}
