/* ============================================================
   calc.test.js — 无依赖测试套件（Node 原生运行）
   运行：node tests/calc.test.js
   覆盖：calculator.js 计算核心 + storage.js 导入导出/预设
   说明：源码按浏览器方式在共享 vm 上下文中加载，
        使跨文件的顶层 const 相互可见（与 <script> 行为一致）。
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

/* ---------- 加载源码（模拟浏览器多 <script> 环境） ---------- */
const ctx = vm.createContext({
  window: {},
  console,
  navigator: {},
  localStorage: {
    _d: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; }
  }
});
for (const f of ['js/data.js', 'js/calculator.js', 'js/storage.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}

/* ---------- 极简测试框架 ---------- */
let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; failures.push({ name, e }); }
}
function eq(actual, expected, msg = '') {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg} expected=${b} actual=${a}`);
}
function ok(cond, msg = '') { if (!cond) throw new Error(msg || 'expected truthy'); }

const C = ctx.window.Calculator;
const S = ctx.window.Storage;

function freshState() {
  return vm.runInContext(`({
    mode: 'spray',
    plant: { ...PLANT_DATABASE.fruit_tree },
    field: { ...DEFAULT_FIELD },
    costs: { ...DEFAULT_COSTS },
    income: { ...DEFAULT_INCOME },
    timing: { ...DEFAULT_TIMING },
    haulField: { ...DEFAULT_HAUL_FIELD },
    haulCosts: { ...DEFAULT_HAUL_COSTS },
    haulIncome: { ...DEFAULT_HAUL_INCOME }
  })`, ctx);
}

/* ============================================================
   Calculator.round78（7舍8入）
   ============================================================ */
test('round78 边界值', () => {
  eq(C.round78(5.7), 5, '5.7→5');
  eq(C.round78(5.8), 6, '5.8→6');
  eq(C.round78(2.8), 3, '2.8→3');
  eq(C.round78(2.79), 2, '2.79→2');
  eq(C.round78(5.0), 5, '5.0→5');
  eq(C.round78(0), 0, '0→0');
  eq(C.round78(-1), 0, '负数→0');
});

/* ============================================================
   Calculator.fmt（去尾零）
   ============================================================ */
test('fmt 去尾零一致', () => {
  eq(C.fmt(2.5, 2), '2.5', '2.5→"2.5"');
  eq(C.fmt(2.0, 2), '2', '2.0→"2"');
  eq(C.fmt(5.6, 2), '5.6', '5.6→"5.6"');
  eq(C.fmt(10, 2), '10', '10→"10"');
  eq(C.fmt(0, 2), '0', '0→"0"');
  eq(C.fmt(100, 0), '100', '100 整数不被误删');
  eq(C.fmt(NaN), '0', 'NaN→"0"');
});

/* ============================================================
   Calculator.compute（打药模式）
   ============================================================ */
test('打药默认参数（果树 10 亩）', () => {
  const r = C.compute(freshState());
  eq(r.pesticide.toFixed(3), '5.600', '参考药量 = 10×3×80÷300×0.7');
  eq(r.pesticideRounded, 5, '7舍8入后 5');
  eq(r.water, 200, '实际水量 10×20');
  eq(r.cycles, 5, '循环数 ⌈10÷2⌉');
  eq(r.pesticideIncluded, false, '默认不包药');
  eq(r.costBreakdown.pesticide, 0, '不包药药剂成本为 0');
});

test('costs 缺字段时 pesticideIncluded 应回落为 false（历史 bug：曾翻转为 true）', () => {
  const r = C.compute({ plant: { ...ctx.window.PLANT_DATABASE.fruit_tree }, field: { area: 10 }, costs: {}, income: {} });
  eq(r.pesticideIncluded, false, '缺字段 ≠ 包药');
});

test('包药时药剂成本 = 需补购套数 × 单价', () => {
  const s = freshState();
  s.costs.pesticideIncluded = true;   // 包药
  s.costs.pesticidePrice = 80;
  s.field.existingPesticideSets = 3;  // 库存 3，参考需 5 → 补购 2
  const r = C.compute(s);
  eq(r.needToBuy, 2, '补购 2 套');
  eq(r.costBreakdown.pesticide, 160, '2×80=160');
  eq(r.stockStatus, 'short', '库存不足');
});

/* ============================================================
   电池等待事件驱动模拟
   ============================================================ */
test('T>充电时间时 2 块电池无等待', () => {
  const bw = C.computeBatteryWait(5, 10, 2, 'generator', 8, 5);
  eq(bw.total, 0, '总等待 0');
  eq(bw.noWaitCount, 5, '5 轮全部无等待');
});

test('慢充场景等待逐步累积（T=5 充8 N=2）', () => {
  const bw = C.computeBatteryWait(6, 5, 2, 'generator', 8, 5);
  eq(bw.total.toFixed(2), '12.00', '第3轮起每轮等 3min×4=12');
});

/* ============================================================
   作业时间估算（兑药调度模型：首批串行，其余批次与飞行并行）
   ============================================================ */
test('computeTiming 手动飞行时间优先于估算', () => {
  const s = freshState();
  s.timing.manualFlightTime = 45;
  const r = C.compute(s);
  eq(r.timing.flightTimeMin, 45, '直接采用手动值');
  eq(r.timing.flightTimeSource, 'manual', '来源标记 manual');
});

test('单批兑药：首批串行 + 飞行阶段（默认参数 10 亩 200L）', () => {
  const r = C.compute(freshState());
  const t = r.timing;
  eq(t.mixRounds, 1, '200L ≤ 1000L 单批');
  eq(t.firstMixTime, 10, '首批兑药 = baseMixTime');
  // T = 升降3 + 装载1 + 飞行22.222/5 = 8.444；T>充电8 → 无电池等待
  ok(Math.abs(t.T - 8.4444) < 0.001, `T=${t.T} 应为 8.4444`);
  eq(t.batteryWait, 0, '无电池等待');
  ok(Math.abs(t.flightSpan - 42.2222) < 0.01, `flightSpan=${t.flightSpan} 应为 5×8.4444`);
  ok(Math.abs(t.totalTime - (10 + 42.2222)) < 0.01, `总时间=${t.totalTime} = 首批10 + 飞行阶段42.22`);
});

test('兑药瓶颈：多批串行流水超过飞行阶段时取 max', () => {
  const s = freshState();
  s.timing.batchCapacity = 60;   // 200L → ⌈200/60⌉=4 批
  s.timing.baseMixTime = 20;     // 4×20=80min > 首批20+飞行42.2=62.2
  const t = C.compute(s).timing;
  eq(t.mixRounds, 4, '分 4 批');
  ok(Math.abs(t.mixTotalTime - 80) < 0.001, `兑药总时长=${t.mixTotalTime}`);
  ok(Math.abs(t.totalTime - 80) < 0.01, `总时间=${t.totalTime} 由兑药瓶颈决定`);
});

test('电池模拟时刻平移：首批兑药完成后才开始飞行', () => {
  const s = freshState();
  const t = C.compute(s).timing;
  ok(t.batteryCycles.length > 0, '有循环明细');
  ok(Math.abs(t.batteryCycles[0].tStart - 10) < 0.001, `首循环 tStart=${t.batteryCycles[0].tStart} 应=首批兑药10min`);
});

test('加药装载计入单循环地面时间（真实串行耗时）', () => {
  const s = freshState();
  s.timing.loadTime = 2;
  s.timing.roundTripTime = 3;
  const t = C.compute(s).timing;
  ok(Math.abs(t.T - (3 + 2 + 22.2222 / 5)) < 0.001, `T=${t.T} 含装载2min`);
  ok(Math.abs(t.roundTripTotal - 5 * 5) < 0.001, `升降+装载合计=${t.roundTripTotal}`);
});

/* ============================================================
   Calculator.computeHaul（吊运模式，唯一实现）
   ============================================================ */
test('吊运计算基本公式', () => {
  const r = C.computeHaul({
    field: { totalWeight: 1000, flightHeight: 5 },
    costs: { ...ctx.window.DEFAULT_HAUL_COSTS },
    income: { pricePerJin: 8 }
  });
  eq(r.totalTrips, 20, '⌈1000÷50⌉=20 躺');
  eq(r.batteryCycles, 4, '⌈20÷6⌉=4 循环');
  eq(r.income, 800, '1000斤×8毛×0.1=800元');
  eq(r.pickupIncluded, false, '默认不包采摘');
  eq(Object.keys(r.costBreakdown).sort().join(','),
     'cycle,droneLabor,equipment,other,pickupLabor,transport', '成本项齐全');
});

test('computeHaul 兼容 { haul: {...} } 完整 state 形式', () => {
  const r = C.computeHaul({
    haul: {
      field: { totalWeight: 100, flightHeight: 5 },
      costs: { ...ctx.window.DEFAULT_HAUL_COSTS },
      income: { pricePerJin: 8 }
    }
  });
  eq(r.totalTrips, 2, '⌈100÷50⌉=2 躺');
});

/* ============================================================
   Storage：文本导出 → 导入 往返（打药）
   ============================================================ */
test('打药文本往返保留时间参数（manualFlightTime/chargeAfterWork 曾丢失）', () => {
  const s = freshState();
  s.timing.manualFlightTime = 42.5;
  s.timing.chargeAfterWork = false;
  s.timing.chargeMode = 'dual';
  s.timing.batchCapacity = 800;
  s.timing.loadTime = 1.5;
  const text = S.exportText(s, 'spray');
  ok(!text.includes('兑水速度'), '已废弃的兑水速度不再导出');
  const back = S.importText(text);
  eq(back.mode, 'spray');
  eq(back.timing.manualFlightTime, 42.5, '手动飞行时间');
  eq(back.timing.chargeAfterWork, false, '结束后充电开关');
  eq(back.timing.chargeMode, 'dual', '充电模式');
  eq(back.timing.batchCapacity, 800, '单批兑水量');
  eq(back.timing.loadTime, 1.5, '加药装载时间');
  eq(back.field.area, 10, '亩数');
  eq(back.costs.cycleCost, 14, '循环成本');
});

test('旧版文本（含已废弃的兑水速度行）仍可导入', () => {
  const oldText = [
    '===== 无人机作业配置 =====', '版本: 2.0', '模式: 打药', '',
    '【作业参数】', '  亩数: 25 亩', '  现有药剂套数: 2 套', '',
    '【时间参数】', '  兑水速度: 1.5 min/100L', '  基础兑药时间: 12 min/轮', ''
  ].join('\n');
  const back = S.importText(oldText);
  eq(back.field.area, 25, '亩数 25');
  eq(back.timing.baseMixTime, 12, '基础兑药时间 12');
  ok(!('waterMixRate' in back.timing), '废弃字段不进入 state');
});

/* ============================================================
   Storage：吊运文本导入字段路由（曾整体错路由到 costs）
   ============================================================ */
test('吊运文本导入：人工/住宿/折旧/三相电 路由到 haulCosts 且不污染 costs', () => {
  const text = [
    '===== 无人机作业配置 =====', '版本: 2.0', '模式: 吊运', '',
    '【作业参数】', '  总斤数: 1200 斤', '  飞行高度: 5 米', '',
    '【电池循环】', '  电池循环成本: 5 元', '  三相电循环成本: 9 元', '  一躺多少斤: 50 斤', '  多少躺一组电池: 6 躺', '  使用三相电: 否', '',
    '【无人机人工】', '  无人机作业人数: 2', '  无人机作业天数: 1', '  每人日薪: 600 元', '  每人每天餐费: 60 元', '  住宿费: 200 元/天', '  住宿天数: 1', '',
    '【其他成本】', '  无人机折旧: 0.6 元/100斤', '  维修保养储备: 0.4 元/100斤', '  防护装备: 8 元/次', '  清洗费用: 6 元/次', '  保险分摊: 0.08 元/100斤', '  其他杂费: 3 元', ''
  ].join('\n');
  const back = S.importText(text);
  eq(back.mode, 'haul');
  // haulCosts 拿到真实值
  eq(back.haulCosts.droneDailyWage, 600, '日薪→haulCosts');
  eq(back.haulCosts.droneMealCost, 60, '餐费→haulCosts');
  eq(back.haulCosts.droneAccommodation, 200, '住宿→haulCosts');
  eq(back.haulCosts.batteryCycleCostThreePhase, 9, '三相电循环成本→haulCosts');
  eq(back.haulCosts.droneDepreciation, 0.6, '无人机折旧→haulCosts');
  eq(back.haulCosts.miscCost, 3, '杂费→haulCosts');
  // costs 不被污染（保持默认）
  eq(back.costs.dailyWage, 300, 'costs.dailyWage 保持默认 300');
  eq(back.costs.cycleCostThreePhase, 7, 'costs.cycleCostThreePhase 保持默认 7');
});

/* ============================================================
   Storage：JSON 导入
   ============================================================ */
test('JSON 导入保留 timing 并做默认值合并', () => {
  const s = freshState();
  s.timing.batteryCount = 4;
  const json = S.exportJSON(s, 'spray');
  const back = S.importText(json);
  eq(back.mode, 'spray');
  eq(back.timing.batteryCount, 4, 'batteryCount=4');
  eq(back.timing.chargeMode, 'generator', '未提供的字段回落默认');
});

/* ============================================================
   Storage：预设结构（曾丢失 timing，导致预设列表崩溃的是
   renderPresetList 读取不存在的 p.state——此处保证新结构扁平且含 timing）
   ============================================================ */
test('savePreset 预设为扁平结构并含 timing 快照', () => {
  const s = freshState();
  s.timing.batteryCount = 3;
  S.savePreset('测试预设', 'spray', s);
  const presets = S.getPresets();
  eq(presets.length, 1, '已保存 1 条');
  const p = presets[0];
  // renderPresetList 读取的字段必须直接存在于预设对象上
  ok(p.field && typeof p.field.area === 'number', 'p.field.area 存在（渲染预设列表用）');
  ok(p.haulField && typeof p.haulField.totalWeight === 'number', 'p.haulField.totalWeight 存在');
  ok(!('state' in p), '不存在 p.state（历史 bug 来源）');
  ok(p.timing && p.timing.batteryCount === 3, 'timing 已随预设保存');
});

/* ---------- 汇总 ---------- */
console.log(`\n测试结果: ${passed} 通过, ${failed} 失败`);
if (failed > 0) {
  for (const f of failures) {
    console.error(`\n✗ ${f.name}\n  ${f.e.message}`);
  }
  process.exit(1);
}
console.log('全部通过 ✅');
