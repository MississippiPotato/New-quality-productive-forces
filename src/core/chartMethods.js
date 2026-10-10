import { t, isEn } from './i18n.js';

const methods = {
  computeArea: {
    title: ['算力规模：指标与精度', 'Computing power: metrics and precision'],
    text: ['“算力总规模”与“智能算力”是不同指标。FP16 与 FP32、算力中心侧与设备侧的统计范围不同，不可直接比较或合并计算增速。圆点标记 FP16 数据；虚线段表示口径变化，未注明精度的记录保留在数据详情中。机架视图中，2023 年为在用数据中心机架，2025 年为算力中心／算力设施标准机架。', 'Total computing power and AI computing power are different metrics. FP16 and FP32, and data-centre-side and device-side figures, use different definitions and cannot be combined to calculate growth. Circles identify FP16 data; dashed segments mark a change of basis. Unspecified precision is recorded in the tooltips. Rack definitions also changed between 2023 and 2025.'],
  },
  regionDonut: {
    title: ['区域占比与 PUE', 'Regional shares and PUE'],
    text: ['PUE = 数据中心总耗电量 ÷ IT 设备耗电量，理论下限为 1。两个数值分别是全国在用算力中心平均值与超大型算力设施平均值，统计范围和来源不同，只能并列查看，不能解读为同口径的时间下降幅度。区域环图展示同一时点东部、西部、中部与东北的智算规模占比。', 'PUE is total data-centre electricity use divided by IT equipment electricity use, with a theoretical minimum of 1. The national average for computing centres in use and the average for very large facilities differ in coverage and source; they are separate observations, not a like-for-like time trend. The donut shows regional AI computing shares at one point in time.'],
  },
  flywheel: {
    title: ['生产力飞轮：关系示意', 'Productivity flywheel: conceptual relationships'],
    text: ['箭头整理算力、模型、应用与数据反馈的概念关系，并非统计估计或实时流量。各节点数字来自不同来源和时点，用于查看相应环节的发展情况，不能相互换算，也不能从图中推算全要素生产率的提升幅度。', 'Arrows describe conceptual relationships between computing power, models, applications and data feedback, not statistical estimates or live flows. Node figures come from different sources and dates, cannot be converted into one another, and do not estimate a rise in total factor productivity.'],
  },
};

export function chartMethodsHtml(name) {
  const method = methods[name];
  const stored = [...document.querySelectorAll(`figure[data-chart="${name}"] template.chart-method-note`)]
    .filter((el) => el.dataset.lang === (isEn() ? 'en' : 'zh'))
    .map((el) => el.content.querySelector('p')?.innerHTML.replace(/⚠\s*/g, '').trim())
    .filter(Boolean);
  const title = [...document.querySelectorAll(`figure[data-chart="${name}"] .fig__title`)]
    .find((el) => el.lang === (isEn() ? 'en' : 'zh-CN'))?.textContent || name;
  return `${method ? `<section class="source-methods"><h3>${t(...method.title)}</h3><p>${t(...method.text)}</p></section>` : ''}${stored.length ? `<section class="source-methods"><h3>${title}</h3>${[...new Set(stored)].map((html) => `<p>${html}</p>`).join('')}</section>` : ''}`;
}
export function allMethodsHtml() {
  const names = new Set([...Object.keys(methods), ...[...document.querySelectorAll('figure[data-chart]:has(template.chart-method-note)')].map((fig) => fig.dataset.chart)]);
  return [...names].map(chartMethodsHtml).join('');
}
