// AI 生产力模拟器（情景演示）：岗位参数只取自已引用的单项实验，团队参数为用户可调的情景值
// 输出：等效新增人力、年度节省工时（计数动画）+ 团队华夫图（采用 AI 的成员 + 等效新增人力）
// update(step)：交互组件，不随滚动改变状态（no-op）
import * as d3 from 'd3';
import { observeSize, createSvg, fmt, legend, srTable } from '../core/chartUtils.js';
import { theme } from '../core/theme.js';
import { LIMITS, simulate, sanitizeInputs } from '../core/simCalc.js';
import { t, tf } from '../core/i18n.js';
import '../styles/charts/simulator.css';

// source_id → 研究简称（标识符映射，不含统计数字）；语言在图表创建时读取
const studies = () => ({
  nber_w31161: t(
    'Brynjolfsson、Li、Raymond，NBER 工作论文 w31161（客服实验）',
    'Brynjolfsson, Li & Raymond, NBER Working Paper w31161 (customer-support experiment)',
  ),
  peng_2023_copilot: t(
    'Peng 等，arXiv 2302.06590（GitHub Copilot 编程实验）',
    'Peng et al., arXiv 2302.06590 (GitHub Copilot coding experiment)',
  ),
  noy_zhang_2023: t(
    'Noy & Zhang，Science（专业写作实验）',
    'Noy & Zhang, Science (professional writing experiment)',
  ),
});

const fields = () => [
  {
    key: 'team_size',
    label: t('团队人数', 'Team size'),
    unit: t('人', 'people'),
    hint: t('参与测算的团队规模', 'Size of the team being modelled'),
  },
  {
    key: 'adoption',
    label: t('AI 采用率', 'AI adoption'),
    unit: '%',
    hint: t('团队中实际使用 AI 工具的成员比例', 'Share of team members who actually use AI tools'),
  },
  {
    key: 'novice_share',
    label: t('新手占比', 'Novice share'),
    unit: '%',
    hint: t('团队中新手 / 低技能员工的比例', 'Share of novice / low-skilled staff in the team'),
    needsNovice: true,
  },
  {
    key: 'task_share',
    label: t('任务占比', 'Task share'),
    unit: '%',
    hint: t('工作时间中用于此类任务的比例', 'Share of working time spent on this kind of task'),
  },
  {
    key: 'annual_hours',
    label: t('人均年工时', 'Annual hours per person'),
    unit: t('小时', 'hours'),
    hint: t('每人每年的工作小时数', 'Working hours per person per year'),
  },
];

const pct = (v, d = 1) => `${fmt.num(v * 100, d)}%`;
/** “人”：英文按单复数 */
const people = (v) => t('人', Math.abs(v - 1) < 1e-9 ? 'person' : 'people');

export function createSimulator(container, data) {
  const cfg = data.simulator;
  const params = cfg.params || [];
  const defaults = cfg.scenario_defaults || {};
  const root = d3.select(container).classed('sim', true);
  const uid = Math.random().toString(36).slice(2, 8);
  const STUDY = studies();
  const FIELDS = fields();
  const sep = t('：', ': ');
  const SCENARIO = t('情景演示', 'Scenario demo');

  // ---- 顶部常驻警示 ----
  const banner = root.append('div').attr('class', 'sim__banner').attr('role', 'note');
  banner.append('span').attr('class', 'tag tag--scenario').text(SCENARIO);
  banner.append('span').attr('class', 'sim__banner-text').text(tf(cfg, 'label'));

  const grid = root.append('div').attr('class', 'sim__grid');
  const form = grid
    .append('form')
    .attr('class', 'sim__controls')
    .attr('aria-label', t('模拟器参数', 'Simulator parameters'))
    .on('submit', (e) => e.preventDefault());

  // 岗位选择
  const roleBox = form.append('fieldset').attr('class', 'sim__field sim__field--role');
  roleBox.append('legend').attr('class', 'sim__label').text(t('岗位类型', 'Role'));
  const seg = roleBox
    .append('div')
    .attr('class', 'seg sim__seg')
    .attr('role', 'radiogroup')
    .attr('aria-label', t('岗位类型', 'Role'));
  const roleBtns = seg
    .selectAll('button')
    .data(params, (d) => d.role)
    .join('button')
    .attr('type', 'button')
    .attr('role', 'radio')
    .text((d) => tf(d, 'name'))
    .on('click', (_, d) => setRole(d.role))
    .on('keydown', (event, d) => {
      const i = params.indexOf(d);
      const k = event.key;
      if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowUp') {
        event.preventDefault();
        const next =
          params[(i + (k === 'ArrowRight' || k === 'ArrowDown' ? 1 : params.length - 1)) % params.length];
        setRole(next.role);
        roleBtns
          .filter((p) => p === next)
          .node()
          ?.focus();
      }
    });
  const paramBox = roleBox.append('div').attr('class', 'sim__param');

  // 滑块 + 数字输入
  const rows = form
    .selectAll('div.sim__row')
    .data(FIELDS, (d) => d.key)
    .join('div')
    .attr('class', 'sim__row');
  const lab = rows.append('div').attr('class', 'sim__row-head');
  lab
    .append('label')
    .attr('class', 'sim__label')
    .attr('for', (d) => `sim-${d.key}-${uid}`)
    .text((d) => d.label);
  const numWrap = lab.append('span').attr('class', 'sim__num-wrap');
  const nums = numWrap
    .append('input')
    .attr('type', 'number')
    .attr('class', 'sim__num')
    .attr('inputmode', 'numeric')
    .attr('aria-label', (d) => `${d.label}${t(`（${d.unit}）`, ` (${d.unit})`)}`)
    .attr('min', (d) => LIMITS[d.key].min)
    .attr('max', (d) => LIMITS[d.key].max)
    .attr('step', (d) => LIMITS[d.key].step);
  numWrap
    .append('span')
    .attr('class', 'sim__unit')
    .text((d) => d.unit);
  const ranges = rows
    .append('input')
    .attr('type', 'range')
    .attr('class', 'sim__range')
    .attr('id', (d) => `sim-${d.key}-${uid}`)
    .attr('min', (d) => LIMITS[d.key].min)
    .attr('max', (d) => LIMITS[d.key].max)
    .attr('step', (d) => LIMITS[d.key].step)
    .attr('aria-describedby', (d) => `sim-${d.key}-hint-${uid}`);
  const hints = rows
    .append('p')
    .attr('class', 'sim__hint')
    .attr('id', (d) => `sim-${d.key}-hint-${uid}`)
    .text((d) => d.hint);

  const foot = form.append('div').attr('class', 'sim__form-foot');
  foot
    .append('p')
    .attr('class', 'sim__defaults')
    .text(
      t(
        '团队参数默认值：情景参数，可调，非统计数据',
        'Team defaults: adjustable scenario values, not statistics',
      ),
    );
  foot
    .append('button')
    .attr('type', 'button')
    .attr('class', 'btn sim__reset')
    .text(t('↺ 恢复默认', '↺ Reset defaults'))
    .on('click', () => {
      state = sanitizeInputs({}, defaults);
      sync();
      compute(true);
    });

  // ---- 输出 ----
  const out = grid.append('div').attr('class', 'sim__out').attr('aria-live', 'polite');
  const kpis = out.append('div').attr('class', 'sim__kpis');
  const KPI = [
    {
      key: 'fte',
      label: t('等效新增人力', 'Equivalent added staff'),
      unit: t('人', 'people'),
      fmt: (v) => fmt.num(v, 1),
      cls: 'sim__kpi--fte',
    },
    {
      key: 'hours',
      label: t('年度节省工时', 'Annual hours saved'),
      unit: t('小时', 'hours'),
      fmt: (v) => fmt.int(v),
      cls: 'sim__kpi--hours',
    },
  ];
  const kpi = kpis
    .selectAll('div.sim__kpi')
    .data(KPI)
    .join('div')
    .attr('class', (d) => `sim__kpi ${d.cls}`);
  const kh = kpi.append('div').attr('class', 'sim__kpi-head');
  kh.append('span').text((d) => d.label);
  kh.append('span').attr('class', 'tag tag--scenario').text(SCENARIO);
  const kv = kpi.append('div').attr('class', 'sim__kpi-val');
  const kNum = kv.append('span').attr('class', 'sim__kpi-num').text('0');
  kv.append('span')
    .attr('class', 'sim__kpi-unit')
    .text((d) => d.unit);
  const kSub = kpi.append('div').attr('class', 'sim__kpi-sub');

  const vizHead = out.append('div').attr('class', 'sim__viz-head');
  const svg = createSvg(out.node(), 'sim__svg');
  const legendWrap = out.append('div');
  legend(legendWrap.node(), [
    { label: t('团队成员', 'Team members'), color: 'var(--slate)' },
    { label: t('采用 AI 的成员', 'Members using AI'), color: 'var(--tool)' },
    {
      label: t('等效新增人力（情景演示）', 'Equivalent added staff (scenario demo)'),
      color: 'var(--green)',
      shape: 'ring',
    },
  ]);

  // ---- 计算方法 ----
  const method = out.append('details').attr('class', 'sim__method');
  method.append('summary').text(t('计算方法与局限', 'Method and limitations'));
  const methodBody = method.append('div').attr('class', 'sim__method-body');

  srTable(
    container,
    t('模拟器实验参数', 'Simulator experiment parameters'),
    [
      t('岗位', 'Role'),
      t('类型', 'Type'),
      t('平均效应', 'Average effect'),
      t('新手效应', 'Novice effect'),
      t('来源', 'Source'),
    ],
    params.map((p) => [
      tf(p, 'name'),
      p.kind === 'throughput' ? t('吞吐提升', 'Throughput gain') : t('耗时缩短', 'Time reduction'),
      `${p.avg}%`,
      p.novice == null ? '—' : `${p.novice}%`,
      STUDY[p.source_id] || p.source_id,
    ]),
  );

  // ---- 状态 ----
  let state = sanitizeInputs({}, defaults);
  let role = params[0]?.role;
  let result = null;
  let prev = { fte: 0, hours: 0 };
  let width = 0;
  const param = () => params.find((p) => p.role === role) || params[0];

  function setRole(r) {
    role = r;
    sync();
    compute(true);
  }

  // 非法 / 超界输入：钳制到范围，空值回退到当前值
  function readInput(key, value) {
    state = sanitizeInputs({ ...state, [key]: value }, state);
    sync();
    compute(false);
  }
  ranges.on('input', function (_, d) {
    readInput(d.key, this.value);
  });
  nums
    .on('input', function (_, d) {
      const v = Number(this.value);
      if (this.value !== '' && Number.isFinite(v) && v >= LIMITS[d.key].min && v <= LIMITS[d.key].max) {
        state = sanitizeInputs({ ...state, [d.key]: v }, state);
        ranges.filter((f) => f.key === d.key).property('value', state[d.key]);
        compute(false);
      }
    })
    .on('change', function (_, d) {
      readInput(d.key, this.value);
    });

  function sync() {
    const p = param();
    const hasNovice = p?.novice != null;
    roleBtns
      .classed('is-active', (d) => d.role === role)
      .attr('aria-checked', (d) => d.role === role)
      .attr('tabindex', (d) => (d.role === role ? 0 : -1));
    ranges.property('value', (d) => state[d.key]);
    nums.property('value', (d) => state[d.key]);
    const disabled = (d) => d.needsNovice && !hasNovice;
    rows.classed('is-disabled', disabled);
    ranges.property('disabled', disabled);
    nums.property('disabled', disabled);
    hints.text((d) =>
      disabled(d)
        ? t(
            '该岗位的实验未区分新手效应，不适用',
            'Not applicable: the experiment for this role did not report a separate novice effect',
          )
        : d.hint,
    );
    paramBox.html('');
    if (!p) return;
    const pe = paramBox.append('div').attr('class', 'sim__param-vals');
    if (p.kind === 'throughput') {
      pe.append('span')
        .attr('class', 'sim__pill')
        .html(`${t('平均', 'Average')} <b>+${p.avg}%</b>`);
      if (hasNovice)
        pe.append('span')
          .attr('class', 'sim__pill')
          .html(`${t('新手', 'Novices')} <b>+${p.novice}%</b>`);
      pe.append('span').attr('class', 'sim__pill-k').text(t('每小时解决问题数', 'issues resolved per hour'));
    } else {
      pe.append('span')
        .attr('class', 'sim__pill')
        .html(`${t('耗时', 'Time')} <b>−${p.avg}%</b>`);
      pe.append('span')
        .attr('class', 'sim__pill-k')
        .text(t('任务完成时间缩短', 'reduction in task completion time'));
    }
    paramBox
      .append('p')
      .attr('class', 'sim__src')
      .html(
        `${t('实验来源', 'Source experiment')}${sep}${STUDY[p.source_id] || p.source_id}${p.note ? `<br><span class="sim__src-note">${tf(p, 'note')}</span>` : ''}`,
      );
  }

  function compute(roleChanged) {
    const p = param();
    if (!p) return;
    result = simulate(p, state, defaults);
    renderKpis();
    renderWaffle(roleChanged);
    renderMethod();
  }

  function renderKpis() {
    const next = { fte: result.equivalentFte, hours: result.savedHours };
    kNum.each(function (d) {
      const el = d3.select(this);
      const from = prev[d.key];
      const to = next[d.key];
      if (theme.reducedMotion) {
        el.interrupt().text(d.fmt(to));
        return;
      }
      el.interrupt()
        .transition()
        .duration(Math.min(theme.countDuration, 700))
        .ease(d3.easeCubicOut)
        .tween('count', () => {
          const i = d3.interpolateNumber(from, to);
          return (t) => el.text(d.fmt(i(t)));
        });
    });
    prev = next;
    kSub.text((d) =>
      d.key === 'fte'
        ? t(
            `${fmt.int(result.inputs.team_size)} 人团队中 ${fmt.num(result.adopted, 1)} 人采用 AI`,
            `${fmt.num(result.adopted, 1)} of ${fmt.int(result.inputs.team_size)} team members use AI`,
          )
        : t(
            `人均年工时 ${fmt.int(result.inputs.annual_hours)} 小时`,
            `${fmt.int(result.inputs.annual_hours)} working hours per person per year`,
          ),
    );
  }

  /** 单元格图形：格子够大时画人形，否则画圆点（以 0,0 为中心） */
  function glyph(s) {
    if (s < 15) {
      const r = Math.max(1.6, s * 0.36);
      return `M${-r},0a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;
    }
    const hr = s * 0.17;
    const hy = -s * 0.2;
    const w = s * 0.3;
    const top = s * 0.04;
    const bot = s * 0.4;
    return (
      `M${-hr},${hy}a${hr},${hr} 0 1,0 ${2 * hr},0a${hr},${hr} 0 1,0 ${-2 * hr},0Z` +
      `M${-w},${bot}L${-w},${top + w * 0.6}Q${-w},${top} ${-w * 0.4},${top}L${w * 0.4},${top}Q${w},${top} ${w},${top + w * 0.6}L${w},${bot}Z`
    );
  }

  function renderWaffle() {
    if (!width) return;
    const W = Math.max(260, width);
    const team = result.inputs.team_size;
    const adopted = Math.round(result.adopted);
    const extra = result.equivalentFte;
    const nExtra = Math.ceil(extra - 1e-9);
    const labelH = 26;
    const maxH = W < 480 ? 240 : 300;
    // 选取最大的格子尺寸，使两块华夫图都放得下
    let s = 34;
    let cols = 1;
    for (; s > 5; s--) {
      cols = Math.max(1, Math.floor(W / s));
      const rowsT = Math.ceil(team / cols);
      const rowsE = Math.max(1, Math.ceil(nExtra / cols));
      if (rowsT * s + labelH * 2 + rowsE * s <= maxH) break;
    }
    const rowsT = Math.ceil(team / cols);
    const rowsE = Math.max(1, Math.ceil(nExtra / cols));
    const yExtra = labelH + rowsT * s + labelH;
    const H = yExtra + rowsE * s + 4;
    svg
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('width', W)
      .attr('height', H)
      .classed('is-small', s < 15);
    svg.attr(
      'aria-label',
      t(
        `华夫图：${team} 人团队，${adopted} 人采用 AI，等效新增 ${fmt.num(extra, 1)} 人（情景演示）`,
        `Waffle chart: team of ${team}, ${adopted} using AI, equivalent of ${fmt.num(extra, 1)} added staff (scenario demo)`,
      ),
    );
    vizHead.text(
      s >= 10
        ? t('每格 = 1 人', 'Each cell = 1 person')
        : t('每格 = 1 人（团队较大，格子已缩小）', 'Each cell = 1 person (cells shrunk for a large team)'),
    );

    const cell = (i, y0) => ({ x: (i % cols) * s + s / 2, y: y0 + Math.floor(i / cols) * s + s / 2 });
    const d = glyph(s);
    const dur = theme.reducedMotion ? 0 : 450;
    const at = (p, k = 1) => `translate(${p.x},${p.y}) scale(${k})`;

    const labels = [
      {
        k: 't',
        y: 16,
        text: t(
          `团队 · ${fmt.int(team)} 人（其中 ${fmt.int(adopted)} 人采用 AI）`,
          `Team · ${fmt.int(team)} ${people(team)} (${fmt.int(adopted)} using AI)`,
        ),
        cls: '',
      },
      {
        k: 'e',
        y: labelH + rowsT * s + 18,
        text: t(
          `等效新增人力 · ${fmt.num(extra, 1)} 人`,
          `Equivalent added staff · ${fmt.num(extra, 1)} ${people(+fmt.num(extra, 1))}`,
        ),
        cls: 'is-extra',
      },
    ];
    svg
      .selectAll('text.sim__wlabel')
      .data(labels, (l) => l.k)
      .join('text')
      .attr('class', (l) => `sim__wlabel ${l.cls}`)
      .attr('x', 0)
      .attr('y', (l) => l.y)
      .text((l) => l.text);

    const teamData = d3.range(team).map((i) => ({ i, on: i < adopted, ...cell(i, labelH) }));
    svg
      .selectAll('path.sim__p')
      .data(teamData, (p) => p.i)
      .join(
        (enter) =>
          enter
            .append('path')
            .attr('class', 'sim__p')
            .attr('transform', (p) => at(p, 0.01)),
        (update) => update,
        (exit) =>
          exit
            .transition()
            .duration(dur)
            .attr('transform', (p) => at(p, 0.01))
            .remove(),
      )
      .attr('d', d)
      .classed('is-on', (p) => p.on)
      .transition()
      .duration(dur)
      .delay((p) => (theme.reducedMotion ? 0 : Math.min(300, p.i * 2)))
      .attr('transform', (p) => at(p));

    // 等效新增人力：虚线轮廓 + 按小数部分自下而上填充
    const extraData = d3.range(nExtra).map((i) => ({ i, frac: Math.min(1, extra - i), ...cell(i, yExtra) }));
    const eg = svg
      .selectAll('g.sim__e')
      .data(extraData, (p) => p.i)
      .join(
        (enter) => {
          const g = enter
            .append('g')
            .attr('class', 'sim__e')
            .attr('transform', (p) => at(p, 0.01));
          g.append('clipPath')
            .attr('id', (p) => `sim-clip-${uid}-${p.i}`)
            .append('rect');
          g.append('path').attr('class', 'sim__e-ring');
          g.append('path')
            .attr('class', 'sim__e-fill')
            .attr('clip-path', (p) => `url(#sim-clip-${uid}-${p.i})`);
          return g;
        },
        (update) => update,
        (exit) =>
          exit
            .transition()
            .duration(dur)
            .attr('transform', (p) => at(p, 0.01))
            .remove(),
      );
    eg.selectAll('path').attr('d', d);
    eg.select('clipPath rect')
      .attr('x', -s / 2)
      .attr('width', s)
      .attr('y', (p) => s / 2 - s * p.frac)
      .attr('height', (p) => s * p.frac);
    eg.transition()
      .duration(dur)
      .delay((p) => (theme.reducedMotion ? 0 : 150 + Math.min(300, p.i * 6)))
      .attr('transform', (p) => at(p));
    svg
      .selectAll('text.sim__empty')
      .data(nExtra ? [] : [0])
      .join('text')
      .attr('class', 'sim__empty')
      .attr('x', 0)
      .attr('y', yExtra + s / 2 + 4)
      .text(t('当前参数下无等效新增人力', 'No equivalent added staff with the current settings'));
  }

  function renderMethod() {
    const p = param();
    const i = result.inputs;
    const team = fmt.int(i.team_size);
    const ad = `${fmt.num(i.adoption, 0)}%`;
    const ts = `${fmt.num(i.task_share, 0)}%`;
    const hrs = fmt.int(i.annual_hours);
    const ppl = t(' 人', ' people');
    const hrsU = t(' 小时', ' hours');
    const L = {
      gain: t('① 综合增益', '① Combined gain'),
      novShare: t('新手占比', 'novice share'),
      novGain: t('新手增益', 'novice gain'),
      avgGain: t('平均增益', 'average gain'),
      fte: t('等效新增人力', 'Equivalent added staff'),
      fteLc: t('等效新增人力', 'equivalent added staff'),
      team: t('团队人数', 'team size'),
      adoption: t('采用率', 'adoption'),
      task: t('任务占比', 'task share'),
      hours: t('年度节省工时', 'Annual hours saved'),
      hoursLc: t('年度节省工时', 'annual hours saved'),
      annual: t('人均年工时', 'annual hours per person'),
    };
    let html;
    if (p.kind === 'throughput') {
      const hasNovice = p.novice != null;
      html = `
        <p class="sim__formula"><span class="sim__f-k">${L.gain}</span> g = ${L.novShare} × ${L.novGain} + (1 − ${L.novShare}) × ${L.avgGain}
        <br><span class="sim__f-v">= ${hasNovice ? `${fmt.num(i.novice_share, 0)}% × ${p.novice}% + ${fmt.num(100 - i.novice_share, 0)}% × ${p.avg}%` : `${p.avg}%`} = ${pct(result.gain)}</span></p>
        <p class="sim__formula"><span class="sim__f-k">② ${L.fte}</span> = ${L.team} × ${L.adoption} × ${L.task} × g
        <br><span class="sim__f-v">= ${team} × ${ad} × ${ts} × ${pct(result.gain)} = ${fmt.num(result.equivalentFte, 2)}${ppl}</span></p>
        <p class="sim__formula"><span class="sim__f-k">③ ${L.hours}</span> = ${L.fteLc} × ${L.annual}
        <br><span class="sim__f-v">= ${fmt.num(result.equivalentFte, 2)} × ${hrs} = ${fmt.int(result.savedHours)}${hrsU}</span></p>
        <p class="sim__caveat">${t(
          '简化：非新手按全体平均值计，可能高估（实验中的平均值本身已包含新手）。',
          'Simplification: non-novices are assigned the overall average, which may overstate the effect (the average in the experiment already includes novices).',
        )}</p>`;
    } else {
      const note = p.note ? String(tf(p, 'note')).replace(/[。.]\s*$/, '') : '';
      html = `
        <p class="sim__formula"><span class="sim__f-k">① ${L.hours}</span> = ${L.team} × ${L.adoption} × ${L.annual} × ${L.task} × r${t('（平均耗时缩短）', ' (average time reduction)')}
        <br><span class="sim__f-v">= ${team} × ${ad} × ${hrs} × ${ts} × ${p.avg}% = ${fmt.int(result.savedHours)}${hrsU}</span></p>
        <p class="sim__formula"><span class="sim__f-k">② ${L.fte}</span> = ${L.hoursLc} ÷ ${L.annual}
        <br><span class="sim__f-v">= ${fmt.int(result.savedHours)} ÷ ${hrs} = ${fmt.num(result.equivalentFte, 2)}${ppl}</span></p>
        ${note ? `<p class="sim__caveat">${t('参数解释', 'Interpretation')}${sep}${note}${t('。', '.')}</p>` : ''}`;
    }
    html += `<p class="sim__caveat">${t(
      '局限：参数来自特定任务、特定样本的单项实验，线性外推到整个团队忽略了学习成本、质量差异、任务替代与组织调整；也有随机对照试验发现资深开发者使用 AI 工具后耗时反而增加（见第 5 章）。结果仅用于理解量级，不是预测。',
      'Limitations: the parameters come from single experiments on specific tasks and samples. Extrapolating them linearly to a whole team ignores learning costs, differences in quality, task substitution and organisational change; one randomised controlled trial even found that experienced developers took longer when using AI tools (see Chapter 5). The results only convey orders of magnitude and are not forecasts.',
    )}</p>`;
    methodBody.html(html);
  }

  let methodInit = false;
  const stop = observeSize(out.node(), ({ width: w }) => {
    width = w;
    if (!methodInit) {
      methodInit = true;
      method.property('open', container.clientWidth >= 720);
    }
    if (result) renderWaffle();
  });
  sync();
  compute(true);

  return {
    update() {},
    resize() {
      width = out.node().clientWidth;
      if (result) renderWaffle();
    },
    destroy() {
      stop();
      svg.selectAll('*').interrupt();
      kNum.interrupt();
      root.selectAll('*').remove();
      root.classed('sim', false);
    },
  };
}
