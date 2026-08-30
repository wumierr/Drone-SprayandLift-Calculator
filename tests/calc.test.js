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

/* ---------- 内置类型推荐参数（v4.3 用户指定） ---------- */
test('内置类型默认参数：杀菌 6/4/2、果蝇 7/6/4', () => {
  const shajun = ctx.window.PLANT_DATABASE.shajun;
  const guoying = ctx.window.PLANT_DATABASE.guoying;
  eq(shajun.flightHeight, 6, '杀菌飞行高度 6 米');
  eq(shajun.lineSpacing, 4, '杀菌航线间距 4 米');
  eq(shajun.flightSpeed, 2, '杀菌飞行速度 2 m/s');
  eq(guoying.flightHeight, 7, '果蝇飞行高度 7 米');
  eq(guoying.lineSpacing, 6, '果蝇航线间距 6 米');
  eq(guoying.flightSpeed, 4, '果蝇飞行速度 4 m/s');
});

/* ---------- 棵数速算（独立参考工具，不接地块引擎） ---------- */
test('calcTreesPesticide 棵数速算药量', () => {
  const plant = { ...ctx.window.PLANT_DATABASE.shajun };
  ok(Math.abs(C.calcTreesPesticide(160, plant) - 1.12) < 1e-9, '160棵 → 160×3÷300×0.7=1.12');
  eq(C.calcTreesPesticide(0, plant), 0, '0 棵 → 0');
  eq(C.calcTreesPesticide(-5, plant), 0, '负数 → 0');
  ok(Math.abs(C.calcTreesPesticide(800, plant) - 5.6) < 1e-9, '800棵 → 5.6 套');
});

/* ---------- APK 兼容防护：禁止原生对话框（WebView 不实现 prompt/confirm） ---------- */
test('js/ui.js 无原生 prompt()/confirm() 调用（注释除外）', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'ui.js'), 'utf8')
    .replace(/^\s*\/\*[\s\S]*?\*\/\s*$/gm, '')   // 去块注释
    .replace(/\/\/.*$/gm, '');                        // 去行注释
  ok(!/prompt\s*\(/.test(src), '不应调用 prompt()');
  ok(!/confirm\s*\(/.test(src), '不应调用 confirm()（用 UI.confirmDialog）');
  ok(/confirmDialog/.test(src), '应使用应用内确认模态');
});

function freshState() {
  const s = vm.runInContext(`({
    mode: 'spray',
    plant: { ...PLANT_DATABASE.shajun },
    field: { ...DEFAULT_FIELD },
    costs: { ...DEFAULT_COSTS },
    income: { ...DEFAULT_INCOME },
    timing: { ...DEFAULT_TIMING },
    haulField: { ...DEFAULT_HAUL_FIELD },
    haulCosts: { ...DEFAULT_HAUL_COSTS },
    haulIncome: { ...DEFAULT_HAUL_INCOME }
  })`, ctx);
  // 与 UI.ensurePlots 一致：默认合成一张地块卡
  if (!Array.isArray(s.field.plots) || s.field.plots.length === 0) {
    s.field.plots = [{ id: 'p_default', name: '地块1', area: s.field.area || 0, treeCount: s.field.treeCount || 0, groupId: 1 }];
  }
  return s;
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
test('打药统一计算（果树 10 亩 = 单卡）', () => {
  const r = C.computePlots(freshState());
  ok(Math.abs(r.pesticide - 5.6) < 1e-9, `需求合计=${r.pesticide} 应为 10×80×3÷300×0.7=5.6`);
  eq(r.pesticideRounded, 5, '7舍8入后 5');
  eq(r.water, 200, '实际水量 10×20');
  eq(r.totalTrips, 3, '趟数 ⌈200÷85⌉=3');
  eq(r.cycles, 1, '电池循环 ⌈3÷6⌉=1');
  eq(r.pesticideIncluded, false, '默认不包药');
  eq(r.costBreakdown.pesticide, 0, '不包药药剂成本为 0');
  eq(r.stockStatus, 'none', '无库存');
});

test('costs 缺字段时 pesticideIncluded 应回落为 false（历史 bug：曾翻转为 true）', () => {
  const s = { plant: { ...ctx.window.PLANT_DATABASE.shajun }, field: { plots: [{ id: 'a', area: 10, groupId: 1 }] }, costs: {}, income: {} };
  const r = C.computePlots(s);
  eq(r.pesticideIncluded, false, '缺字段 ≠ 包药');
});

test('包药时药剂成本 = 需补购套数 × 单价', () => {
  const s = freshState();
  s.costs.pesticideIncluded = true;   // 包药
  s.costs.pesticidePrice = 80;
  s.field.existingPesticideSets = 3;  // 库存 3，参考需 5 → 补购 2
  const r = C.computePlots(s);
  eq(r.pesticideRounded, 5, '采购 5 套');
  eq(r.needToBuy, 2, '补购 5−3=2 套');
  eq(r.costBreakdown.pesticide, 160, '作业方成本 2×80=160（补购口径）');
  eq(r.stockStatus, 'short', '库存不足');
  ok(Math.abs(r.settlement[0].usedSets - 5.6) < 1e-9, '结算按小数用量 5.6（不扣库存）');
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
test('手动飞行时间优先于估算', () => {
  const s = freshState();
  s.timing.manualFlightTime = 45;
  const r = C.computePlots(s);
  eq(r.timing.flightTimeMin, 45, '直接采用手动值');
  eq(r.timing.flightTimeSource, 'manual', '来源标记 manual');
});

test('单批兑药：首批串行 + 飞行阶段（默认参数 10 亩 200L）', () => {
  const t = C.computePlots(freshState()).timing;
  eq(t.mixRounds, 1, '200L ≤ 1000L 单批');
  eq(t.firstMixTime, 10, '首批兑药 = baseMixTime');
  // 趟数 ⌈200÷85⌉=3；T = 升降3+装载1+飞行22.222/3 = 11.407；T>充电8 → 无等待
  eq(t.batteryWait, 0, '无电池等待');
  ok(Math.abs(t.flightSpan - 3 * (4 + 22.2222 / 3)) < 0.01, `飞行阶段=${t.flightSpan} 应为 3×11.407`);
  ok(Math.abs(t.totalTime - (10 + 3 * (4 + 22.2222 / 3))) < 0.01, `总时间=${t.totalTime} = 首批10 + 飞行阶段`);
});

test('兑药瓶颈：多批串行流水超过飞行阶段时取 max', () => {
  const s = freshState();
  s.timing.batchCapacity = 60;   // 200L → ⌈200/60⌉=4 批
  s.timing.baseMixTime = 20;     // 4×20=80min > 首批20+飞行42.2=62.2
  const t = C.computePlots(s).timing;
  eq(t.mixRounds, 4, '分 4 批');
  ok(Math.abs(t.mixTotalTime - 80) < 0.001, `兑药总时长=${t.mixTotalTime}`);
  ok(Math.abs(t.totalTime - 80) < 0.01, `总时间=${t.totalTime} 由兑药瓶颈决定`);
});

test('电池模拟时刻平移：首批兑药完成后才开始飞行', () => {
  const s = freshState();
  const t = C.computePlots(freshState()).timing;
  ok(t.batteryCycles.length > 0, '有循环明细');
  ok(Math.abs(t.batteryCycles[0].tStart - 10) < 0.001, `首趟 tStart=${t.batteryCycles[0].tStart} 应=首批兑药10min`);
});

test('加药装载计入单循环地面时间（真实串行耗时）', () => {
  const s = freshState();
  s.timing.loadTime = 2;
  s.timing.roundTripTime = 3;
  const t = C.computePlots(s).timing;
  ok(Math.abs(t.T - (3 + 2 + 22.2222 / 3)) < 0.001, `T=${t.T} = 升降3+装载2+每趟喷洒`);
  ok(Math.abs(t.roundTripTotal - 3 * 2) < 0.001, `装载合计=${t.roundTripTotal} = 3趟×2min（转场输入已删，升降在T内）`);
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
     'cycle,droneLabor,equipment,fuel,other,pickupLabor', '成本项齐全（交通已并入油费）');
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
   计算基准：按棵数直算（一期 B）
   ============================================================ */
test('类型 defaultBasis 决定面积模式药量公式（稀释 vs 每亩水量）', () => {
  const s = freshState();
  eq(s.plant.defaultBasis, 'tree', '杀菌默认按棵数（果树林型）');
  // 大田型：面积模式药量 = 面积×每亩水量口径
  const field_type = { ...ctx.window.PLANT_DATABASE.shajun, defaultBasis: 'area' };
  const r = C.computePlots({ plant: field_type, field: { plots: [{ id: 'a', area: 10, groupId: 1 }] }, costs: {}, income: {} });
  ok(Math.abs(r.pesticide - (10 * 20 / 300) * 0.7) < 1e-9, '大田型药量=面积×每亩水量÷需水量×系数');
  // 旧快照只有 calcMode 字段也能工作
  const legacy = { ...ctx.window.PLANT_DATABASE.shajun, calcMode: 'area' };
  delete legacy.defaultBasis;
  const r2 = C.computePlots({ plant: legacy, field: { plots: [{ id: 'a', area: 10, groupId: 1 }] }, costs: {}, income: {} });
  ok(Math.abs(r2.pesticide - (10 * 20 / 300) * 0.7) < 1e-9, '旧 calcMode=area 走每亩水量口径');
});

test('旧作物快照注册为自定义类型（迁移逻辑纯数据验证）', () => {
  // 模拟 ui.registerTypeSnapshot 的注册规则
  const library = [
    { key: 'shajun', name: '杀菌', builtin: true },
    { key: 'guoying', name: '果蝇', builtin: true }
  ];
  const snapshot = { name: '果树', icon: '🌳', calcMode: 'tree', flightHeight: 2, waterPerMu: 20, treesPerMu: 80, waterPerTree: 3, pesticideWaterPerSet: 300, droneSavingCoeff: 0.7 };
  const existing = library.find(t => t.name === snapshot.name);
  eq(existing || null, null, '果树不在新库');
  const key = 'custom_test_0';
  library.push({
    key, name: snapshot.name, icon: snapshot.icon || '🧪',
    defaultBasis: snapshot.defaultBasis || (snapshot.calcMode === 'tree' ? 'tree' : 'area'),
    builtin: false
  });
  eq(library.length, 3, '注册后 3 个类型');
  eq(library[2].defaultBasis, 'tree', '旧 calcMode=tree 迁移为默认基准');
  // 重名不再注册
  const again = library.find(t => t.name === snapshot.name);
  ok(again, '重名直接复用');
});

/* ============================================================
   多地块模式（一期 C）
   ============================================================ */
test('多地块：独立组各自 ⌈组水量÷机载上限⌉，组级覆盖重算每趟量', () => {
  const s = freshState();
  s.field.plotMode = true;
  s.field.droneTank = 85;
  s.field.plots = [
    { id: 'a', name: '东边', area: 10, groupId: 1, transferMin: 5 },
    { id: 'b', name: '西边', area: 20, groupId: 2, transferMin: 3 },
    { id: 'c', name: '北边', area: 5, groupId: 3, transferMin: 0 }
  ];
  s.field.groupTrips = { 2: 8 };   // 组2 覆盖 8 趟
  const r = C.computePlots(s);
  eq(r.plots.length, 3, '3 个地块');
  eq(r.groups.length, 3, '3 个作业组');
  ok(Math.abs(r.water - 700) < 0.01, `总水量=${r.water} 应为 200+400+100`);
  ok(Math.abs(r.area - 35) < 0.01, `总面积=${r.area}`);
  const g1 = r.groups.find(g => g.id === 1), g2 = r.groups.find(g => g.id === 2), g3 = r.groups.find(g => g.id === 3);
  eq(g1.minTrips, 3, '组1 ⌈200÷85⌉=3');
  eq(g2.trips, 8, '组2 覆盖 8 趟');
  ok(Math.abs(g2.perTripWater - 50) < 0.01, `组2 每趟=${g2.perTripWater} 应为 400÷8`);
  eq(g3.trips, 2, '组3 ⌈100÷85⌉=2');
  eq(r.totalTrips, 13, '总趟数 3+8+2');
  ok(Math.abs(r.income - 875) < 0.01, `收入=${r.income} 应为 35×25`);
  eq(r.cycles, 3, '电池循环改按趟数=⌈13÷6⌉');
});

test('作业组连片：同组合并趟数（30L+30L 连片 1 趟，分块则 2 趟）', () => {
  const s = freshState();
  s.plant.waterPerMu = 3;   // 10亩×3=30L/块
  s.field.plots = [
    { id: 'a', name: '甲', area: 10, groupId: 1 },
    { id: 'b', name: '乙', area: 10, groupId: 1 }
  ];
  const r = C.computePlots(s);
  eq(r.groups.length, 1, '合并为 1 组');
  eq(r.groups[0].minTrips, 1, '⌈60÷85⌉=1 趟（连片优势）');
  eq(r.totalTrips, 1, '总趟数 1');
});

test('药量三层口径：块级小数 → 合计小数 → 取整采购（不逐块取整）', () => {
  const s = freshState();
  s.field.plotMode = true;
  s.field.plots = [
    { id: 'a', name: 'A', area: 10, groupId: 1, transferMin: 5 },
    { id: 'b', name: 'B', area: 20, groupId: 1, transferMin: 3 },
    { id: 'c', name: 'C', area: 5, groupId: 1, transferMin: 0 }
  ];
  s.plant.pesticideWaterPerSet = 100;  // 稀释口径块级小数：10亩→16.8, 20亩→33.6, 5亩→8.4
  const r = C.computePlots(s);
  ok(Math.abs(r.pesticide - 58.8) < 1e-9, `合计小数用量=${r.pesticide} 应为 58.8`);
  eq(r.pesticideRounded, 59, '合计后 7舍8入 → 采购 59');
  eq(r.needToBuy, 59, '无库存需补 59 套');
  s.field.existingPesticideSets = 2;
  const r2 = C.computePlots(s);
  eq(r2.needToBuy, 57, '库存 2 补 57');
  // 块级小数保留（明细表展示）
  ok(Math.abs(r.plots[0].pesticideRaw - 16.8) < 1e-9, 'A 块小数用量 16.8');
});

test('农户结算四数据（含不包药分支）', () => {
  const s = freshState();
  s.field.plotMode = true;
  s.field.plots = [
    { id: 'a', name: 'A', area: 10, groupId: 1, transferMin: 5 },
    { id: 'b', name: 'B', area: 20, groupId: 1, transferMin: 3 }
  ];
  // 包药：地块 30亩 | 打药 750 | 用药 (200+400)/300*0.7=1.4套 | 药钱 1.4×80=112
  const r1 = C.computePlots(s);
  eq(r1.settlement.length, 1, '单行结算');
  const st1 = r1.settlement[0];
  ok(Math.abs(st1.area - 30) < 1e-9, '地块大小 30 亩');
  ok(Math.abs(st1.sprayFee - 750) < 1e-9, '打药钱 30×25=750');
  // 稀释口径：30亩×80棵×3升÷300×0.7 = 16.8 套
  ok(Math.abs(st1.usedSets - 16.8) < 1e-9, `用药量 ${st1.usedSets} 应为 16.8 套`);
  eq(st1.pesticideFee, 0, '不包药 → 药钱 0');
  eq(st1.included, false, '默认不包药');
  // 包药开关
  s.costs.pesticideIncluded = true;
  const r2 = C.computePlots(s);
  eq(r2.settlement[0].included, true, '包药标记');
  ok(Math.abs(r2.settlement[0].pesticideFee - 1344) < 1e-9, '包药药钱 16.8×80=1344');
  // 作业方药剂成本按补购口径（与结算药钱解耦）：采购 round78(16.8)=17
  eq(r2.pesticideRounded, 17, '采购 17 套');
  eq(r2.costBreakdown.pesticide, 17 * 80, '作业方成本=补购×单价');
});

test('多地块：总时长=调度模型（组级覆盖，无转场概念）', () => {
  const s = freshState();
  s.field.plots = [
    { id: 'a', name: 'A', area: 10, groupId: 1 },
    { id: 'b', name: 'B', area: 20, groupId: 1 },
    { id: 'c', name: 'C', area: 5, groupId: 1 }
  ];
  s.field.groupTrips = { 1: 8 };   // 组1 覆盖 8 趟（合并水量 700L）
  const r = C.computePlots(s);
  const t = r.timing;
  eq(t.mixRounds, 1, '700L ≤ 1000L 单批');
  // 每趟时间 = 3(升降) + 1(装载) + 9.72(喷洒) = 13.72 → 8 趟 = 109.78
  ok(Math.abs(t.flightSpan - 109.7778) < 0.01, `飞行阶段=${t.flightSpan} 应为 109.78`);
  ok(Math.abs(t.totalTime - 119.7778) < 0.01, `总时间=${t.totalTime} = 首批10+109.78`);
  eq(t.batteryCycles.length, 8, '8 趟参与电池竞争');
  ok(Math.abs(t.batteryCycles[0].tStart - 10) < 0.01, '首趟平移到首批兑药后');
});

test('多地块文本往返：地块/组/机载上限/组趟数保留', () => {
  const s = freshState();
  s.field.plotMode = true;
  s.field.droneTank = 60;
  s.field.plots = [
    { id: 'a', name: '东边', area: 12, groupId: 1 },
    { id: 'b', name: '西边', area: 8, groupId: 2 }
  ];
  s.field.groupTrips = { 2: 4 };
  const text = S.exportText(s, 'spray');
  const back = S.importText(text);
  eq(back.field.plotMode, true, '多地块标记');
  eq(back.field.droneTank, 60, '机载上限');
  eq(back.field.plots.length, 2, '2 个地块');
  eq(back.field.plots[0].name, '东边', '名称');
  eq(back.field.plots[1].groupId, 2, '组号');
  eq(back.field.groupTrips[2], 4, '组趟数覆盖');
  ok(Math.abs(back.field.plots[0].area - 12) < 1e-9, '亩数');
});

/* ============================================================
   工单续药计算（二期）
   ============================================================ */
test('computeRefillSets 续药套数（剩余水量÷一套药需水量×系数，7舍8入）', () => {
  eq(C.computeRefillSets(350, 100, 0.7), 2, '350÷100×0.7=2.45 → 首位小数4 → 2');
  eq(C.computeRefillSets(300, 100, 0.7), 2, '2.1 → 2');
  eq(C.computeRefillSets(200, 100, 0.7), 1, '1.4 → 1');
  eq(C.computeRefillSets(280, 100, 0.7), 2, '1.96 → 首位小数9 → 2');
  eq(C.computeRefillSets(70, 100, 0.7), 0, '0.49 → 0');
  eq(C.computeRefillSets(0, 100, 0.7), 0, '无剩余 0');
  eq(C.computeRefillSets(-5, 100, 0.7), 0, '负数 0');
});

test('JSON 导入携带工单覆盖值', () => {
  const s = freshState();
  s.workOrder = { completedByPlot: { a: 120 }, completedSingle: 50, actualSets: 4, note: '下午续药' };
  const back = S.importText(S.exportJSON(s, 'spray'));
  ok(back.workOrder && back.workOrder.actualSets === 4, '实际用药套数');
  ok(back.workOrder.note === '下午续药', '备注');
  ok(back.workOrder.completedByPlot && back.workOrder.completedByPlot.a === 120, '按地块已完成量');
});

test('农户档案：地块归属校验与 farmerName 迁移（模拟 loadFarmers 规则）', () => {
  const farmers = [{ id: 'farmer_default', name: '默认农户', enabled: true }];
  const plots = [
    { id: 'a', farmerId: 'farmer_default' },
    { id: 'b', farmerId: 'gone' },      // 失效 → 归默认
    { id: 'c', farmerId: undefined }    // 缺失 → 归默认
  ];
  plots.forEach(pl => {
    if (!pl.farmerId || !farmers.find(f => f.id === pl.farmerId)) pl.farmerId = 'farmer_default';
  });
  eq(plots[0].farmerId, 'farmer_default');
  eq(plots[1].farmerId, 'farmer_default', '失效归属回默认');
  eq(plots[2].farmerId, 'farmer_default', '缺失归属回默认');
  // farmerName 迁移：非空且无同名档案 → 建同名档案
  const farmerName = '老王家果园';
  if (farmerName && !farmers.find(f => f.name === farmerName)) {
    farmers.push({ id: 'farmer_migrated', name: farmerName, enabled: true });
  }
  eq(farmers.length, 2, '迁移后 2 个农户');
  eq(farmers[1].name, '老王家果园');
});

test('农户档案文本往返', () => {
  const s = freshState();
  s.farmers = [
    { id: 'farmer_default', name: '默认农户', phone: '', pricePerMu: 0, enabled: true },
    { id: 'f1', name: '老李家', phone: '13800000000', pricePerMu: 30, enabled: true, notes: '果园东片' }
  ];
  const back = S.importText(S.exportText(s, 'spray'));
  eq(back.farmers.length, 2, '2 个农户');
  eq(back.farmers[1].name, '老李家', '名称');
  ok(Math.abs(back.farmers[1].pricePerMu - 30) < 1e-9, '默认单价');
  eq(back.farmers[1].phone, '13800000000', '电话');
});

test('多农户同组：共享趟数，账务按农户独立（低依赖高解耦）', () => {
  const s = freshState();
  s.field.plotMode = true;
  s.field.plots = [
    { id: 'a', name: 'A东', area: 10, groupId: 1, transferMin: 5, farmerId: 'fA' },
    { id: 'b', name: 'B西', area: 20, groupId: 1, transferMin: 5, farmerId: 'fB' }
  ];
  s.farmers = [
    { id: 'fA', name: '农户甲', pricePerMu: 30, enabled: true },
    { id: 'fB', name: '农户乙', pricePerMu: 0, enabled: true }   // 无档案价 → 回退全局 25
  ];
  s.costs.pesticideIncluded = true;
  const r = C.computePlots(s);
  // 同组连片：水量 200+400=600 → 组趟数 ⌈600÷85⌉=8
  eq(r.groups.length, 1, '1 个作业组');
  eq(r.groups[0].trips, 8, '组趟数 8（跨农户共享）');
  eq(r.totalTrips, 8, '总趟数');
  // 分户账务
  eq(r.settlement.length, 2, '两户各自结算');
  const fa = r.settlement.find(x => x.farmerId === 'fA');
  const fb = r.settlement.find(x => x.farmerId === 'fB');
  ok(Math.abs(fa.area - 10) < 1e-9, '甲 地块 10 亩');
  ok(Math.abs(fa.sprayFee - 300) < 1e-9, '甲 打药 10×30=300');
  ok(Math.abs(fb.sprayFee - 500) < 1e-9, '乙 打药 20×25=500（回退全局价）');
  ok(Math.abs(fa.usedSets + fb.usedSets - r.pesticide) < 1e-9, '分户用量之和=合计');
  ok(Math.abs(r.income - 800) < 1e-9, `收入=${r.income} 应为 300+500`);
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
  eq(back.costs.batteryDepreciation, 7, '电池折旧');
  eq(back.costs.fuelExpense, 150, '本次油费');
});

test('迁移用户（plotMode=false 但有地块）地块仍随文本导出', () => {
  const s = freshState();          // 模拟迁移用户：有合成地块、plotMode=false
  s.field.plotMode = false;
  const text = S.exportText(s, 'spray');
  ok(text.includes('[地块]'), '地块列表随导出');
  vm.runInContext('DEFAULT_FIELD.plots = []', ctx);  // 清共享累积（测试环境现象）
  const back = S.importText(text);
  const pl = (back.field.plots || []).find(x => x.name === '地块1');
  ok(pl, '地块往返');
  ok(Math.abs(pl.area - 10) < 1e-9, '面积保留');
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
    '【电池循环】', '  电池折旧: 4 元/次', '  本次油费: 180 元', '  一躺多少斤: 50 斤', '  多少躺一组电池: 6 躺', '',
    '【无人机人工】', '  无人机作业人数: 2', '  无人机作业天数: 1', '  每人日薪: 600 元', '  每人每天餐费: 60 元', '  住宿费: 200 元/天', '  住宿天数: 1', '',
    '【其他成本】', '  无人机折旧: 0.6 元/100斤', '  维修保养储备: 0.4 元/100斤', '  防护装备: 8 元/次', '  清洗费用: 6 元/次', '  保险分摊: 0.08 元/100斤', '  其他杂费: 3 元', ''
  ].join('\n');
  const back = S.importText(text);
  eq(back.mode, 'haul');
  // haulCosts 拿到真实值
  eq(back.haulCosts.droneDailyWage, 600, '日薪→haulCosts');
  eq(back.haulCosts.droneMealCost, 60, '餐费→haulCosts');
  eq(back.haulCosts.droneAccommodation, 200, '住宿→haulCosts');
  eq(back.haulCosts.batteryDepreciation, 4, '电池折旧→haulCosts');
  eq(back.haulCosts.fuelExpense, 180, '本次油费→haulCosts');
  eq(back.haulCosts.droneDepreciation, 0.6, '无人机折旧→haulCosts');
  eq(back.haulCosts.miscCost, 3, '杂费→haulCosts');
  // costs 不被污染（保持默认）
  eq(back.costs.dailyWage, 300, 'costs.dailyWage 保持默认 300');
  eq(back.costs.batteryDepreciation, 7, 'costs.batteryDepreciation 保持默认 7');
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
