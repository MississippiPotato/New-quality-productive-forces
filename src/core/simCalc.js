// AI 生产力模拟器的纯计算函数（无 DOM、无副作用，便于单元测试）
// 所有百分比输入均为 0–100；实验参数（avg / novice / r）来自 ai_plus_targets.json → simulator.params。
// 结果是“情景演示”：把单项实验结果线性外推到团队层面，不是预测。

/** 输入范围（界面约定，不是统计数据） */
export const LIMITS = {
  team_size: { min: 1, max: 500, step: 1 },
  adoption: { min: 0, max: 100, step: 1 },
  novice_share: { min: 0, max: 100, step: 1 },
  task_share: { min: 0, max: 100, step: 1 },
  annual_hours: { min: 100, max: 4000, step: 50 },
};
export const INPUT_KEYS = Object.keys(LIMITS);

/** 数值钳制；非有限数返回 fallback（缺省为 min） */
export function clamp(v, min, max, fallback = min) {
  const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
  if (!Number.isFinite(n)) return Math.min(max, Math.max(min, fallback));
  return Math.min(max, Math.max(min, n));
}

/** 清洗用户输入：钳制到 LIMITS，团队人数取整；非法值回退到 defaults 中的同名值 */
export function sanitizeInputs(raw = {}, defaults = {}, limits = LIMITS) {
  const out = {};
  for (const key of Object.keys(limits)) {
    const { min, max } = limits[key];
    const fb = Number.isFinite(Number(defaults[key])) ? Number(defaults[key]) : min;
    out[key] = clamp(raw[key], min, max, fb);
  }
  out.team_size = Math.round(out.team_size);
  return out;
}

/**
 * 吞吐类（客服）的综合增益（小数）：
 * gain = novice_share × novice + (1 − novice_share) × avg
 * 简化：非新手按全体平均值计（avg 本身包含新手），因此可能高估。
 * 若实验未给出 novice，则 gain = avg。
 */
export function throughputGain(avgPct, novicePct, noviceSharePct) {
  const avg = avgPct / 100;
  if (novicePct == null) return avg;
  const ns = clamp(noviceSharePct, 0, 100) / 100;
  return ns * (novicePct / 100) + (1 - ns) * avg;
}

/**
 * 计算情景结果。
 * @param {{kind:'throughput'|'time', avg:number, novice:number|null}} param 实验参数（百分数）
 * @param {object} rawInputs 用户输入（百分数 / 人 / 小时），会先经过 sanitizeInputs
 * @returns {{kind, gain:number|null, r:number|null, adopted:number, equivalentFte:number, savedHours:number, inputs:object}}
 */
export function simulate(param, rawInputs, defaults = {}) {
  const inputs = sanitizeInputs(rawInputs, defaults);
  const team = inputs.team_size;
  const adoption = inputs.adoption / 100;
  const task = inputs.task_share / 100;
  const hours = inputs.annual_hours;
  const adopted = team * adoption;

  if (param.kind === 'throughput') {
    const gain = throughputGain(param.avg, param.novice, inputs.novice_share);
    const equivalentFte = team * adoption * task * gain;
    return {
      kind: 'throughput',
      gain,
      r: null,
      adopted,
      equivalentFte,
      savedHours: equivalentFte * hours,
      inputs,
    };
  }
  if (param.kind === 'time') {
    const r = param.avg / 100;
    const savedHours = team * adoption * hours * task * r;
    const equivalentFte = hours > 0 ? savedHours / hours : 0;
    return { kind: 'time', gain: null, r, adopted, equivalentFte, savedHours, inputs };
  }
  throw new Error(`未知的参数类型：${param.kind}`);
}
