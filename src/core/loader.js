// 数据加载：带缓存的并行加载，图表模块内不得自行 fetch
import * as d3 from 'd3';

const BASE = import.meta.env.BASE_URL;
const cache = new Map();

function load(key, fn) {
  if (!cache.has(key)) {
    const p = fn().catch((e) => {
      cache.delete(key);
      showError(`数据加载失败：${key}（${e.message}）`);
      throw e;
    });
    cache.set(key, p);
  }
  return cache.get(key);
}

export const loader = {
  json: (name) => load(`data/${name}.json`, () => d3.json(`${BASE}data/${name}.json`)),
  csv: (name) => load(`data/${name}.csv`, () => d3.csv(`${BASE}data/${name}.csv`, d3.autoType)),
  geo: (name) => load(`geo/${name}.json`, () => d3.json(`${BASE}geo/${name}.json`)),
  /** 并行加载多个：all({a: () => loader.json('x')}) */
  async all(spec) {
    const keys = Object.keys(spec);
    const values = await Promise.all(keys.map((k) => spec[k]()));
    return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
  },
};

function showError(msg) {
  let box = document.querySelector('.load-error');
  if (!box) {
    box = document.createElement('div');
    box.className = 'load-error';
    box.setAttribute('role', 'alert');
    document.body.append(box);
  }
  box.textContent = msg;
  box.hidden = false;
}

/** 递归收集数据中的全部 source_id（来源按钮使用） */
export function collectSourceIds(data, out = new Set()) {
  if (Array.isArray(data)) data.forEach((d) => collectSourceIds(d, out));
  else if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) {
      if ((k === 'source_id' || k === 'coord_source_id' || k === 'ci_source_id') && typeof v === 'string') out.add(v);
      else if (v && typeof v === 'object') collectSourceIds(v, out);
    }
  }
  return out;
}
