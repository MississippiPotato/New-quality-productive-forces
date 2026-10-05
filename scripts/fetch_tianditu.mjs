// 获取天地图（国家地理信息公共服务平台）省级行政区划数据 → public/geo/china_tianditu.json
// 数据页面：https://cloudcenter.tianditu.gov.cn/administrativeDivision
//   页面标注：审图号 GS（2026）4921号；数据更新时间 2025 年 9 月；该数据仅供地图可视化使用；坐标系 CGCS2000。
// 本脚本读取的是该页面展示行政区划时调用的公开接口（/api/portal/region/map），与页面展示数据一致。
// 若已登录天地图账号并用页面“下载数据”按钮下载了官方 GeoJSON，可运行：
//   node scripts/fetch_tianditu.mjs --file <下载的文件路径>
// 处理：仅将坐标保留 4 位小数（约 10 米，远小于本站显示精度）并去除连续重复点，不删除、不修改任何要素。
import { writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { unzipSync } from 'node:zlib';

const root = resolve(import.meta.dirname, '..');
const API = 'https://cloudcenter.tianditu.gov.cn/api/portal/region/map?gb=156000000&level=2';
const SHEET_NUMBER = 'GS（2026）4921号';

/** 与页面前端相同的解码：inflate → 每 4 字节大端整数右移 2 位得到 1 个 UTF-8 字节 */
function decode(buf) {
  const raw = unzipSync(buf);
  const e = new Int8Array(raw.buffer, raw.byteOffset, raw.length);
  const out = new Uint8Array(Math.floor(e.length / 4));
  for (let i = 0, k = 0; i + 3 < e.length; i += 4, k++) {
    let n = 0;
    for (let o = 0; o < 4; o++) n += (255 & e[i + o]) << (8 * (3 - o));
    out[k] = (n >> 2) & 255;
  }
  return JSON.parse(new TextDecoder('utf-8').decode(out));
}

let geo;
const fileArg = process.argv.indexOf('--file');
if (fileArg > 0) {
  geo = JSON.parse(await readFile(process.argv[fileArg + 1], 'utf8'));
} else {
  const res = await fetch(API, {
    headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://cloudcenter.tianditu.gov.cn/administrativeDivision' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  geo = decode(Buffer.from(await res.arrayBuffer()));
}

const r = (v) => Math.round(v * 1e4) / 1e4;
function ring(coords) {
  const rounded = coords.map(([x, y]) => [r(x), r(y)]);
  const out = [];
  for (const p of rounded) {
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out.length >= 4 || out.length === rounded.length ? out : rounded;
}
const walk = (c, depth) => (depth === 1 ? ring(c) : c.map((x) => walk(x, depth - 1)));
const DEPTH = { LineString: 1, MultiLineString: 2, Polygon: 2, MultiPolygon: 3 };

const before = JSON.stringify(geo).length;
geo.features = geo.features.map((f) => {
  const { name, gb } = f.properties;
  const isLine = name === '境界线';
  const kind = !isLine ? 'province' : gb === '156990000' ? 'dash_line' : 'boundary';
  f.geometry.coordinates = walk(f.geometry.coordinates, DEPTH[f.geometry.type]);
  return {
    type: 'Feature',
    properties: { name: isLine ? '' : name, gb, adcode: isLine ? null : gb.slice(3), kind },
    geometry: f.geometry,
  };
});
geo.metadata = {
  source: '天地图 · 国家地理信息公共服务平台 行政区划可视化',
  url: 'https://cloudcenter.tianditu.gov.cn/administrativeDivision',
  sheet_number: SHEET_NUMBER,
  data_updated: '2025-09',
  crs: 'CGCS2000',
  processing: '坐标保留 4 位小数并去除连续重复点；未删除或修改任何要素',
  fetched: new Date().toISOString().slice(0, 10),
};
const text = JSON.stringify(geo);
await writeFile(resolve(root, 'public/geo/china_tianditu.json'), text);
const kinds = geo.features.reduce((m, f) => ((m[f.properties.kind] = (m[f.properties.kind] || 0) + 1), m), {});
console.log(`✓ china_tianditu.json：${JSON.stringify(kinds)}，${(before / 1024).toFixed(0)} KB → ${(text.length / 1024).toFixed(0)} KB`);
