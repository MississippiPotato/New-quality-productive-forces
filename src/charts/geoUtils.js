// 地理数据小工具（chinaFlowMap / worldChoropleth 共用）
import * as d3 from 'd3';

/**
 * 部分 GeoJSON（如 DataV、天地图）的环绕方向与 d3 球面约定相反：逐个多边形检查并翻转（返回新对象，不修改原数据）。
 * 同时剔除退化的环（少于 4 个点），否则 d3 投影流会报错。
 */
export function rewind(geo) {
  const clean = (rings) => (rings[0]?.length >= 4 ? rings.filter((r) => r.length >= 4) : null);
  const fixPoly = (rings) =>
    d3.geoArea({ type: 'Polygon', coordinates: rings }) > 2 * Math.PI
      ? rings.map((r) => r.slice().reverse())
      : rings;
  return {
    type: 'FeatureCollection',
    features: geo.features.map((f) => {
      const g = f.geometry;
      if (!g) return f;
      if (g.type === 'Polygon') {
        const rings = clean(g.coordinates);
        return { ...f, geometry: rings ? { type: 'Polygon', coordinates: fixPoly(rings) } : null };
      }
      if (g.type === 'MultiPolygon') {
        const polys = g.coordinates.map(clean).filter(Boolean).map(fixPoly);
        return { ...f, geometry: { type: 'MultiPolygon', coordinates: polys } };
      }
      return f;
    }),
  };
}

/** 线要素：天地图“境界线”（kind = dash_line 南海断续线 / boundary 其他境界线），兼容旧 DataV 的 100000_JD */
export const isNineDash = (f) =>
  ['dash_line', 'boundary'].includes(f.properties?.kind) || String(f.properties?.adcode).endsWith('_JD');

/** 本站使用的审图号（天地图行政区划可视化页面标注） */
export const SHEET_NUMBER = 'GS（2026）4921号';
