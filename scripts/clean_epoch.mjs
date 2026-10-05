// 清洗 Epoch AI notable models 与 OWID 大规模 AI 系统数据 → public/data/
// 只保留需要的字段；不做任何插值或估算，缺失值保留为 null。
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { csvParse, csvFormat } from 'd3';

const root = resolve(import.meta.dirname, '..');
const num = (v) => (v === '' || v == null || Number.isNaN(+v) ? null : +v);

// 国家名规范化（Epoch 原始写法 → 本站中文分组）
const COUNTRY_GROUP = {
  'United States of America': 'US',
  China: 'CN',
  'Hong Kong': 'CN', // 归入中国，脚注说明
  Taiwan: 'CN', // 台湾是中国的一部分
  'United Kingdom': 'EU+UK',
  France: 'EU+UK',
  Germany: 'EU+UK',
  Finland: 'EU+UK',
  Netherlands: 'EU+UK',
  Denmark: 'EU+UK',
  Czechia: 'EU+UK',
  Switzerland: 'EU+UK',
  Italy: 'EU+UK',
  Spain: 'EU+UK',
  Sweden: 'EU+UK',
  Poland: 'EU+UK',
  Austria: 'EU+UK',
  Belgium: 'EU+UK',
  Ireland: 'EU+UK',
  Norway: 'EU+UK',
};

// 地区名称规范：港台按“X, China”书写（地图与政治表述合规）
const RENAME = { 'Hong Kong': 'Hong Kong, China', Taiwan: 'Taiwan, China' };

const rows = csvParse(await readFile(resolve(root, 'raw/notable_ai_models.csv'), 'utf8'));
const cleaned = rows
  .filter((r) => r['Publication date'])
  .map((r) => {
    const countries = [...new Set((r['Country (of organization)'] || '').split(',').map((s) => s.trim()).filter(Boolean))];
    const groups = [...new Set(countries.map((c) => COUNTRY_GROUP[c] || 'Other'))];
    let group = groups.length === 1 ? groups[0] : groups.length ? 'Multi' : 'Unknown';
    if (groups.length > 1 && groups.includes('US') && groups.every((g) => g === 'US' || g === 'Other')) group = 'US';
    return {
      model: r.Model,
      date: r['Publication date'],
      organization: r.Organization,
      country: countries.map((c) => RENAME[c] || c).join('; '),
      group,
      domain: (r.Domain || '').split(',')[0].trim(),
      parameters: num(r.Parameters),
      training_compute_flop: num(r['Training compute (FLOP)']),
    };
  })
  .sort((a, b) => a.date.localeCompare(b.date));

await writeFile(resolve(root, 'public/data/epoch_notable_models.csv'), csvFormat(cleaned));
console.log(`✓ epoch_notable_models.csv  ${cleaned.length} 行，其中有训练算力 ${cleaned.filter((d) => d.training_compute_flop).length} 行`);

const owid = csvParse(await readFile(resolve(root, 'raw/large_scale_by_country.csv'), 'utf8'));
const owidOut = owid.map((r) => ({ entity: r.entity, code: r.code, year: +r.year, count: +r.cumulative_count }));
await writeFile(resolve(root, 'public/data/owid_large_scale_ai_by_country.csv'), csvFormat(owidOut));
console.log(`✓ owid_large_scale_ai_by_country.csv  ${owidOut.length} 行`);
