import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { clamp, sanitizeInputs, throughputGain, simulate, LIMITS } from '../src/core/simCalc.js';

// 参数直接取自数据文件，测试不硬编码研究数值
const data = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../public/data/ai_plus_targets.json'), 'utf8'),
);
const { params, scenario_defaults: defaults } = data.simulator;
const cs = params.find((p) => p.kind === 'throughput');
const timeParams = params.filter((p) => p.kind === 'time');

describe('clamp', () => {
  it('钳制到区间', () => {
    expect(clamp(-5, 0, 100)).toBe(0);
    expect(clamp(150, 0, 100)).toBe(100);
    expect(clamp(42, 0, 100)).toBe(42);
  });
  it('非法值回退', () => {
    expect(clamp('abc', 0, 100)).toBe(0);
    expect(clamp('', 0, 100, 30)).toBe(30);
    expect(clamp(NaN, 1, 10, 5)).toBe(5);
    expect(clamp(undefined, 1, 10, 99)).toBe(10);
    expect(clamp('12', 0, 100)).toBe(12);
  });
});

describe('sanitizeInputs', () => {
  it('超界输入被钳制，团队人数取整', () => {
    const s = sanitizeInputs({
      team_size: 9999.7,
      adoption: 140,
      novice_share: -3,
      task_share: 50,
      annual_hours: 1,
    });
    expect(s.team_size).toBe(LIMITS.team_size.max);
    expect(s.adoption).toBe(100);
    expect(s.novice_share).toBe(0);
    expect(s.annual_hours).toBe(LIMITS.annual_hours.min);
    expect(Number.isInteger(sanitizeInputs({ team_size: 12.6 }).team_size)).toBe(true);
    expect(sanitizeInputs({ team_size: 12.6 }).team_size).toBe(13);
  });
  it('缺失或非法字段回退到默认值', () => {
    const s = sanitizeInputs({ adoption: 'x' }, defaults);
    expect(s.adoption).toBe(defaults.adoption);
    expect(s.team_size).toBe(defaults.team_size);
    expect(s.annual_hours).toBe(defaults.annual_hours);
  });
});

describe('throughputGain（客服）', () => {
  it('按新手占比加权', () => {
    const g = throughputGain(cs.avg, cs.novice, 30);
    expect(g).toBeCloseTo(0.3 * (cs.novice / 100) + 0.7 * (cs.avg / 100), 10);
  });
  it('新手占比 0% / 100% 的端点', () => {
    expect(throughputGain(cs.avg, cs.novice, 0)).toBeCloseTo(cs.avg / 100, 10);
    expect(throughputGain(cs.avg, cs.novice, 100)).toBeCloseTo(cs.novice / 100, 10);
  });
  it('无新手参数时取平均值', () => {
    expect(throughputGain(cs.avg, null, 80)).toBeCloseTo(cs.avg / 100, 10);
  });
});

describe('simulate · 吞吐类', () => {
  const base = { team_size: 20, adoption: 60, novice_share: 30, task_share: 50, annual_hours: 2000 };
  it('等效人力 = 团队 × 采用率 × 任务占比 × 增益；工时 = 等效人力 × 年工时', () => {
    const r = simulate(cs, base);
    const gain = 0.3 * (cs.novice / 100) + 0.7 * (cs.avg / 100);
    expect(r.kind).toBe('throughput');
    expect(r.gain).toBeCloseTo(gain, 10);
    expect(r.equivalentFte).toBeCloseTo(20 * 0.6 * 0.5 * gain, 10);
    expect(r.savedHours).toBeCloseTo(r.equivalentFte * 2000, 8);
    expect(r.adopted).toBeCloseTo(12, 10);
  });
  it('采用率 0% 时无效果', () => {
    const r = simulate(cs, { ...base, adoption: 0 });
    expect(r.equivalentFte).toBe(0);
    expect(r.savedHours).toBe(0);
  });
  it('采用率 100% 且任务占比 100% 时等于团队 × 增益', () => {
    const r = simulate(cs, { ...base, adoption: 100, task_share: 100, novice_share: 0 });
    expect(r.equivalentFte).toBeCloseTo(20 * (cs.avg / 100), 10);
  });
  it('超界输入先被钳制', () => {
    const r = simulate(cs, { ...base, adoption: 250, task_share: -10 });
    expect(r.inputs.adoption).toBe(100);
    expect(r.equivalentFte).toBe(0);
  });
});

describe('simulate · 时间类', () => {
  const base = { team_size: 20, adoption: 60, novice_share: 30, task_share: 50, annual_hours: 2000 };
  it.each(timeParams.map((p) => [p.name, p]))(
    '%s：节省工时 = 团队 × 采用率 × 年工时 × 任务占比 × r',
    (_, p) => {
      const r = simulate(p, base);
      const rr = p.avg / 100;
      expect(r.kind).toBe('time');
      expect(r.r).toBeCloseTo(rr, 10);
      expect(r.savedHours).toBeCloseTo(20 * 0.6 * 2000 * 0.5 * rr, 8);
      expect(r.equivalentFte).toBeCloseTo(r.savedHours / 2000, 10);
    },
  );
  it('新手占比不影响时间类结果', () => {
    const p = timeParams[0];
    expect(simulate(p, { ...base, novice_share: 0 }).savedHours).toBeCloseTo(
      simulate(p, { ...base, novice_share: 100 }).savedHours,
      10,
    );
  });
  it('采用率 0% / 100% 的端点', () => {
    const p = timeParams[0];
    expect(simulate(p, { ...base, adoption: 0 }).savedHours).toBe(0);
    const full = simulate(p, { ...base, adoption: 100, task_share: 100 });
    expect(full.equivalentFte).toBeCloseTo(20 * (p.avg / 100), 10);
  });
  it('年工时被钳制到下限，避免除以 0', () => {
    const r = simulate(timeParams[0], { ...base, annual_hours: 0 });
    expect(r.inputs.annual_hours).toBe(LIMITS.annual_hours.min);
    expect(Number.isFinite(r.equivalentFte)).toBe(true);
  });
});

describe('simulate · 异常', () => {
  it('未知类型抛错', () => {
    expect(() => simulate({ kind: 'magic', avg: 1 }, {})).toThrow();
  });
});
