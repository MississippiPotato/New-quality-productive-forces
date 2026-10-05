// 下载可直接获取的开放数据到 raw/ 与 public/geo/。
// 运行：npm run fetch   （如本机 npm 配置了失效代理，可设置环境变量 NO_PROXY=* 或直接用 node 运行）
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const targets = [
  ['https://epoch.ai/data/notable_ai_models.csv', 'raw/notable_ai_models.csv'],
  [
    'https://ourworldindata.org/grapher/cumulative-number-of-large-scale-ai-systems-by-country.csv?v=1&csvType=full&useColumnShortNames=true',
    'raw/large_scale_by_country.csv',
  ],
];

for (const [url, out] of targets) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (course project data fetch)' } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const file = resolve(root, out);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, buf);
  console.log(`✓ ${out}  ${(buf.length / 1024).toFixed(0)} KB`);
}
