// 图表注册表：名称 → { load: 动态导入工厂函数, data: 数据选择器(loader) }
// index.html / dev.html 中 <figure data-chart="名称"> 由 figure.js 按此表懒加载初始化。
import { loader as L } from '../core/loader.js';

const j = L.json;
const chartModules = import.meta.glob('../charts/*.js');
const lazy = (file, fn) => () => {
  const load = chartModules[`../charts/${file}.js`];
  if (!load) return Promise.reject(new Error(`图表模块不存在：${file}.js`));
  return load().then((m) => m[fn]);
};

export const registry = {
  // 第 1 章 · 概念与政策
  radialTimeline: { load: lazy('radialTimeline', 'createRadialTimeline'), data: () => j('timeline') },
  factorForce: { load: lazy('factorForce', 'createFactorForce'), data: async () => ({}) },

  // 第 2 章 · 算力
  chinaFlowMap: {
    load: lazy('chinaFlowMap', 'createChinaFlowMap'),
    data: () => L.all({ geo: () => L.geo('china_tianditu'), hubs: () => j('hubs_eastdata') }),
  },
  computeArea: { load: lazy('computeArea', 'createComputeArea'), data: () => j('compute_china') },
  regionDonut: { load: lazy('regionDonut', 'createRegionDonut'), data: () => j('compute_china') },

  // 第 3 章 · 大模型
  modelScatterBrush: { load: lazy('modelScatterBrush', 'createModelScatterBrush'), data: () => L.csv('epoch_notable_models') },
  stepFilings: { load: lazy('stepFilings', 'createStepFilings'), data: () => j('genai_filings') },
  notableDumbbell: { load: lazy('dumbbell', 'createNotableDumbbell'), data: () => j('models_notable') },

  // 第 4 章 · 劳动对象
  circlePack: { load: lazy('circlePack', 'createCirclePack'), data: () => j('wipo_genai_patents') },
  pictogram: { load: lazy('pictogram', 'createPictogram'), data: () => j('data_objects') },
  scienceTiles: {
    load: lazy('statTiles', 'createStatTiles'),
    data: async () => (await j('data_objects')).science.filter((d) => d.value != null),
  },

  // 第 5 章 · 劳动者
  effectLollipop: { load: lazy('effectLollipop', 'createEffectLollipop'), data: () => j('productivity_studies') },
  divergingBar: { load: lazy('divergingBar', 'createDivergingBar'), data: async () => (await j('jobs_wef_imf')).wef },
  beeswarm: { load: lazy('beeswarm', 'createBeeswarm'), data: async () => (await j('jobs_wef_imf')).imf },
  newOccupations: {
    load: lazy('newOccupations', 'createNewOccupations'),
    data: async () => (await j('jobs_wef_imf')).new_occupations,
  },
  radar: { load: lazy('radar', 'createRadar'), data: () => j('radar_illustrative') },

  // 第 6 章 · 飞轮（优化组合）
  flywheel: {
    load: lazy('flywheel', 'createFlywheel'),
    data: () =>
      L.all({
        compute: () => j('compute_china'),
        filings: () => j('genai_filings'),
        objects: () => j('data_objects'),
        jobs: () => j('jobs_wef_imf'),
      }),
  },

  // 第 7 章 · 产业赋能
  sankey: { load: lazy('sankey', 'createSankey'), data: () => j('wipo_genai_patents') },
  pyramid: { load: lazy('pyramid', 'createPyramid'), data: async () => (await j('lighthouse')).smart_factories },
  dotRobots: { load: lazy('dotRobots', 'createDotRobots'), data: () => j('ifr_robots') },
  robotDensity: { load: lazy('robotDensity', 'createRobotDensity'), data: async () => (await j('ifr_robots')).density },
  lighthouse: { load: lazy('lighthouse', 'createLighthouse'), data: () => j('lighthouse') },
  industryCards: { load: lazy('industryCards', 'createIndustryCards'), data: () => j('industry_cards') },

  // 第 8 章 · 全要素生产率与经济贡献
  comboBarLine: { load: lazy('comboBarLine', 'createComboBarLine'), data: () => j('ai_industry_scale') },
  rangePlot: { load: lazy('rangePlot', 'createRangePlot'), data: () => j('economic_estimates') },
  sunburst: { load: lazy('sunburst', 'createSunburst'), data: () => j('ai_industry_scale') },

  // 第 9 章 · 全球竞争
  barRace: { load: lazy('barRace', 'createBarRace'), data: () => L.csv('owid_large_scale_ai_by_country') },
  worldMap: {
    load: lazy('worldMap', 'createWorldMap'),
    data: () =>
      L.all({
        china: () => L.geo('china_tianditu'),
        points: () => j('country_points'),
        owid: () => L.csv('owid_large_scale_ai_by_country'),
        competition: () => j('competition'),
      }),
  },
  globe3d: {
    load: lazy('globe3d', 'createGlobe3d'),
    data: () =>
      L.all({
        china: () => L.geo('china_tianditu'),
        points: () => j('country_points'),
        owid: () => L.csv('owid_large_scale_ai_by_country'),
      }),
  },
  mirrorBars: {
    load: lazy('mirrorBars', 'createMirrorBars'),
    data: () => L.all({ competition: () => j('competition'), owid: () => L.csv('owid_large_scale_ai_by_country') }),
  },
  researchTiles: {
    load: lazy('statTiles', 'createStatTiles'),
    data: async () => (await j('competition')).research_share_2023,
  },

  // 第 10 章 · 挑战与治理
  energySlope: { load: lazy('energySlope', 'createEnergySlope'), data: () => j('challenges') },

  // 第 11 章 · 展望
  gauge: { load: lazy('gauge', 'createGauge'), data: () => j('ai_plus_targets') },
  simulator: { load: lazy('simulator', 'createSimulator'), data: () => j('ai_plus_targets') },
};
