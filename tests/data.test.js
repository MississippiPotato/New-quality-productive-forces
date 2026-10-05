import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dataDir = resolve(root, 'public/data');
const read = (f) => JSON.parse(readFileSync(resolve(dataDir, f), 'utf8'));

describe('数据层', () => {
  it('npm run validate 通过', () => {
    const out = execFileSync(process.execPath, ['scripts/validate_data.mjs'], { cwd: root, encoding: 'utf8' });
    expect(out).toContain('校验通过');
  });

  it('来源 id 唯一且可信度合法', () => {
    const sources = read('sources.json');
    const ids = sources.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    sources.forEach((s) => expect(['A', 'B', 'C', 'D', 'S']).toContain(s.reliability));
  });

  it('index.html 的每个 data-fact 都有带来源的数值', () => {
    const { facts } = read('facts.json');
    const sourceIds = new Set(read('sources.json').map((s) => s.id));
    const html = readFileSync(resolve(root, 'index.html'), 'utf8');
    const keys = [...html.matchAll(/data-fact="([^"]+)"/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(50);
    for (const k of keys) {
      expect(facts[k], k).toBeDefined();
      expect(sourceIds.has(facts[k].source_id), k).toBe(true);
    }
  });

  it('正文数字与结构化数据一致（抽查）', () => {
    const { facts } = read('facts.json');
    const filings = read('genai_filings.json').records;
    const byDate = (d) => filings.find((r) => r.date === d);
    expect(facts.genai_filed_2026_04.value).toBe(byDate('2026-04-30').filed);
    expect(facts.genai_filed_2026_08.value).toBe(byDate('2026-08-31').filed);
    expect(facts.registered_2026_08.value).toBe(byDate('2026-08-31').registered);
    expect(facts.genai_filed_2026_08.value).toBe(filings.at(-1).filed);
    const ifr = read('ifr_robots.json');
    expect(facts.robots_cn_2025_wan.value * 10000).toBe(ifr.installations_2025.china.value);
    expect(facts.robot_density_cn.value).toBe(ifr.density.records.find((r) => r.country === '中国').value);
    const compute = read('compute_china.json').records;
    expect(facts.compute_intel_2026_06.value).toBe(compute.find((r) => r.date === '2026-06-30').value);
    const robots = read('ifr_robots.json').installations_2024;
    expect(facts.robots_cn_2024_wan.value * 10000).toBe(robots.china.value);
    expect(facts.robots_world_2024.value * 10000).toBe(robots.world.value);
    const wef = read('jobs_wef_imf.json').wef;
    expect(facts.wef_created.value * 100).toBe(wef.created.value);
    expect(facts.wef_net.value / 100).toBe(wef.net.value);
  });

  it('口径字段齐全：算力记录都有 precision 与 scope', () => {
    read('compute_china.json').records.forEach((r) => {
      expect(r.precision).toBeTruthy();
      expect(r.scope).toBeTruthy();
    });
  });

  it('所有 JSON 可解析', () => {
    readdirSync(dataDir)
      .filter((f) => f.endsWith('.json'))
      .forEach((f) => expect(() => read(f)).not.toThrow());
  });
});
