// 天地图（国家地理信息公共服务平台）在线瓦片服务
// 审图号：GS（2026）4921号（天地图页面标注）。需要浏览器端 Key：
//   在 https://console.tianditu.gov.cn 注册并创建“浏览器端”应用，把 Key 写入项目根目录 .env.local：
//   VITE_TDT_TK=你的Key
// 图层：vec 矢量底图、cva/eva 矢量注记（中/英）、img 影像底图、cia/eia 影像注记（中/英）、ibo 全球境界
export function tdtKey() {
  return (import.meta.env.VITE_TDT_TK || '').trim();
}

/** Web 墨卡托（w）切片地址 */
export function tdtTileUrl(layer, x, y, z, key = tdtKey()) {
  const s = (x + y) % 8;
  return (
    `https://t${s}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0` +
    `&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}&tk=${key}`
  );
}
