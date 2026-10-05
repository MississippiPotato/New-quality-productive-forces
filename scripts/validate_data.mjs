// 数据校验：npm run validate
// 1) 每个含数值的记录都能追溯到合法 source_id（自身或祖先节点）
// 2) source_id 必须存在于 sources.json；日期合法；无重复
// 3) index.html 中每个 data-fact 都存在于 facts.json
import { readFile, readdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { csvParse } from 'd3';

const root = resolve(import.meta.dirname, '..');
const dataDir = resolve(root, 'public/data');
const errors = [];
const warnings = [];
const err = (file, msg) => errors.push(`✗ [${file}] ${msg}`);
const warn = (file, msg) => warnings.push(`! [${file}] ${msg}`);

// 结构性数值字段：不是统计数据，不要求 source_id
const STRUCTURAL_KEYS = new Set(['year', 'rank', 'lon', 'lat', 'since', 'from_owid']);
const DATE_RE = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;
const RELIABILITY = new Set(['A', 'B', 'C', 'D', 'S']);

const sources = JSON.parse(await readFile(resolve(dataDir, 'sources.json'), 'utf8'));
const sourceIds = new Set();
for (const s of sources) {
  if (!s.id) err('sources.json', `缺少 id：${JSON.stringify(s).slice(0, 60)}`);
  if (sourceIds.has(s.id)) err('sources.json', `重复 id：${s.id}`);
  sourceIds.add(s.id);
  if (!RELIABILITY.has(s.reliability)) err('sources.json', `${s.id} reliability 非法：${s.reliability}`);
  if (s.url && !/^https?:\/\//.test(s.url)) err('sources.json', `${s.id} url 非法`);
  if (!s.org || !s.title) err('sources.json', `${s.id} 缺少 org/title`);
  if (!s.quote && !s.summary) err('sources.json', `${s.id} 缺少 quote/summary`);
}
const usedSources = new Set();

function walk(file, node, path, inherited) {
  if (Array.isArray(node)) {
    const seen = new Set();
    node.forEach((child, i) => {
      if (child && typeof child === 'object') {
        const key = JSON.stringify(child);
        if (seen.has(key)) err(file, `${path}[${i}] 与前面的记录完全重复`);
        seen.add(key);
      }
      walk(file, child, `${path}[${i}]`, inherited);
    });
    return;
  }
  if (!node || typeof node !== 'object') return;
  let sid = inherited;
  for (const k of ['source_id', 'coord_source_id', 'ci_source_id']) {
    if (k in node) {
      if (!sourceIds.has(node[k])) err(file, `${path}.${k} = "${node[k]}" 不在 sources.json 中`);
      else usedSources.add(node[k]);
    }
  }
  if (node.source_id) sid = node.source_id;
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) err(file, `${path}.${k} 不是有限数值`);
      if (!STRUCTURAL_KEYS.has(k) && !sid) err(file, `${path}.${k} = ${v} 无法追溯 source_id`);
    } else if (typeof v === 'string' && /^(value|low|high|share|total)$/.test(k) && /^\d+(\.\d+)?$/.test(v)) {
      err(file, `${path}.${k} 是字符串形式的数字，应为 number`);
    }
    if ((k === 'date' || k === 'period') && typeof v === 'string' && !DATE_RE.test(v)) {
      err(file, `${path}.${k} 日期非法：${v}`);
    }
    if (k === 'low' && typeof v === 'number' && typeof node.high === 'number' && v > node.high) {
      err(file, `${path} low > high`);
    }
  }
  for (const [k, v] of Object.entries(node)) {
    if (v && typeof v === 'object') walk(file, v, `${path}.${k}`, sid);
  }
}

const files = (await readdir(dataDir)).filter((f) => extname(f) === '.json' && f !== 'sources.json');
let facts = {};
for (const f of files) {
  let json;
  try {
    json = JSON.parse(await readFile(resolve(dataDir, f), 'utf8'));
  } catch (e) {
    err(f, `JSON 解析失败：${e.message}`);
    continue;
  }
  walk(f, json, '$', null);
  if (f === 'facts.json') facts = json.facts || {};
}

// 口径类数据必须有 precision/scope
const compute = JSON.parse(await readFile(resolve(dataDir, 'compute_china.json'), 'utf8'));
compute.records.forEach((r, i) => {
  if (!r.precision || !r.scope) err('compute_china.json', `records[${i}] 缺少 precision/scope`);
});

// facts.json
for (const [key, fact] of Object.entries(facts)) {
  if (!fact.source_id) err('facts.json', `${key} 缺少 source_id`);
  if (fact.value === undefined) err('facts.json', `${key} 缺少 value`);
}

// CSV
const csvChecks = [
  ['epoch_notable_models.csv', ['model', 'date', 'organization', 'group', 'parameters', 'training_compute_flop']],
  ['owid_large_scale_ai_by_country.csv', ['entity', 'year', 'count']],
];
for (const [f, cols] of csvChecks) {
  try {
    const rows = csvParse(await readFile(resolve(dataDir, f), 'utf8'));
    for (const c of cols) if (!rows.columns.includes(c)) err(f, `缺少列 ${c}`);
    rows.forEach((r, i) => {
      if (r.date && !DATE_RE.test(r.date)) err(f, `第 ${i + 2} 行日期非法：${r.date}`);
    });
    usedSources.add(f.startsWith('epoch') ? 'epoch_notable' : 'owid_large_scale');
  } catch (e) {
    err(f, `读取失败：${e.message}（先运行 npm run fetch && npm run clean:epoch）`);
  }
}

// index.html 中的 data-fact
const html = await readFile(resolve(root, 'index.html'), 'utf8').catch(() => '');
const factRefs = [...html.matchAll(/data-fact="([^"]+)"/g)].map((m) => m[1]);
for (const k of factRefs) if (!(k in facts)) err('index.html', `data-fact="${k}" 不在 facts.json 中`);
const sourceRefs = [...html.matchAll(/data-sources="([^"]+)"/g)].flatMap((m) => m[1].split(/[ ,]+/));
for (const k of sourceRefs) {
  if (!sourceIds.has(k)) err('index.html', `data-sources 引用了不存在的来源 ${k}`);
  else usedSources.add(k);
}

// 叙事正文中裸写的数字（年份、章节号除外）→ 警告
const stepText = [...html.matchAll(/<(p|li|h3|blockquote)[^>]*>([\s\S]*?)<\/\1>/g)]
  .map((m) => m[2].replace(/<b data-fact="[^"]+"><\/b>/g, '').replace(/<[^>]+>/g, ''))
  .join('\n')
  // 日期、章节号、文号不是统计数据
  .replace(/\d{1,2}\s*月\s*\d{1,2}\s*日/g, '')
  .replace(/第\s*\d+\s*章/g, '')
  .replace(/〔\d{4}〕\d+号/g, '')
  .replace(/GS[（(]\d{4}[）)]\d+号/g, '') // 审图号
  .replace(/[A-Za-z]+-?\d+/g, '') // FP16、WGS84、GCJ-02 等标识符
  .replace(/\d+\s*岁/g, '')
  .replace(/每个点代表\s*\d+\s*台|=\s*100%/g, ''); // 图形编码说明
const bare = [...stepText.matchAll(/(?<![\d.])\d+(\.\d+)?(?![\d.])/g)]
  .map((m) => m[0])
  .filter((n) => !/^(19|20)\d{2}$/.test(n) && +n > 12);
if (bare.length) warn('index.html', `正文中可能有未绑定 data-fact 的数字：${[...new Set(bare)].slice(0, 20).join(', ')}`);

for (const id of sourceIds) if (!usedSources.has(id)) warn('sources.json', `来源 ${id} 未被任何数据引用`);

console.log(`校验 ${files.length} 个 JSON、${csvChecks.length} 个 CSV、${factRefs.length} 处 data-fact、${sourceIds.size} 个来源`);
warnings.forEach((w) => console.log(w));
if (errors.length) {
  errors.forEach((e) => console.error(e));
  console.error(`\n校验失败：${errors.length} 个错误`);
  process.exit(1);
}
console.log('✓ 校验通过');
