/* ============================================================
   data.js — 默认用药类型库 & 默认参数
   每种用药类型包含：
     - defaultBasis: 默认计算基准 'tree' 按棵 | 'area' 按亩
     - flightHeight: 建议飞行高度（米）
     - waterPerMu: 每亩水量（升）
     - treesPerMu: 每亩棵数（按棵数计算时用）
     - waterPerTree: 每棵用水量（升，按棵数计算时用）
     - pesticideWaterPerSet: 一套药对应的水量（升）
     - droneSavingCoeff: 无人机省药系数（0-1）
   内置类型仅两种（杀菌/果蝇）；用户可自定义增减，
   完整类型库存 localStorage（drone_spray_types_v1，见 storage.js）。
   内部全局名沿用 PLANT_DATABASE / state.plant，兼容旧存档与预设。
   ============================================================ */

const PLANT_DATABASE = {
  shajun: {
    name: '杀菌',
    icon: '🧪',
    defaultBasis: 'tree',
    flightHeight: 2.0,
    waterPerMu: 20,
    treesPerMu: 80,
    waterPerTree: 3,
    pesticideWaterPerSet: 300,
    droneSavingCoeff: 0.7,
    builtin: true,
    description: '果园/大田杀菌剂喷施，建议高于树冠1-1.5米作业（参数可按实际药剂修改）',
    notes: '⚠️ 花期、幼果期慎用敏感药剂；避免大风天作业。'
  },
  guoying: {
    name: '果蝇',
    icon: '🪰',
    defaultBasis: 'tree',
    flightHeight: 2.0,
    waterPerMu: 20,
    treesPerMu: 80,
    waterPerTree: 3,
    pesticideWaterPerSet: 300,
    droneSavingCoeff: 0.7,
    builtin: true,
    description: '果园果蝇防治/诱杀作业（参数可按实际药剂修改）',
    notes: '⚠️ 注意药剂安全间隔期与采收期。'
  }
};

/* 默认成本参数（用户可全量修改） */
const DEFAULT_COSTS = {
  // 循环成本：电池折旧按次、油费整次直填（出发加满回家加满的差价）
  batteryDepreciation: 7, // 电池折旧（元/次充电）
  fuelExpense: 150,       // 本次油费（元）：含行车与发电机用油
  cycleArea: 2,           // 单次循环作业亩数（亩，单地块按亩口径时用）

  // 人工成本
  workers: 3,             // 作业人数（含飞手）
  days: 0.3,              // 作业天数（3人团队10亩约0.3天，实际可喷30-50亩/天）
  dailyWage: 300,         // 每人日薪（元）
  mealCost: 50,           // 每人每天餐费（元）
  accommodation: 0,       // 住宿费（元/天，全部人员合计；3人住2间×200元则填400）
  accommodationDays: 0,   // 住宿天数（与作业天数独立，如提前一天到达则填作业天数+1）

  // 其他成本
  pesticidePrice: 80,     // 一套药剂价格（元/套）
  pesticideIncluded: false, // 是否包药（true=作业方提供药剂并计入成本；false=农户自备，不扣药剂成本）
  droneDepreciation: 0.3, // 无人机折旧（元/亩）
  maintenanceReserve: 0.2,// 维修保养储备金（元/亩）
  protectiveGear: 5,      // 防护装备分摊（元/次作业）
  cleaningCost: 10,       // 清洗费用（元/次作业）
  insurance: 0.1,         // 保险分摊（元/亩）
  miscCost: 0             // 其他杂费（元）
};

/* 默认收入参数 */
const DEFAULT_INCOME = {
  pricePerMu: 25,         // 每亩服务收费（元/亩）
  subsidy: 0              // 农机补贴等（元）
};

/* 默认作业时间参数（用于作业时间估算） */
const DEFAULT_TIMING = {
  flightSpeed: 2.5,           // 飞行速度（m/s）
  lineSpacing: 2,             // 航线间距（米）
  manualFlightTime: 0,        // 手动输入飞行作业时间（min，高优先级，0表示用估算）
  roundTripTime: 3,           // 来回升降时间（min/循环）
  loadTime: 1,                // 加药装载时间（min/循环）：给无人机药箱加药液的真实串行耗时
  baseMixTime: 10,            // 基础兑药时间（min/轮，与水量无关）
  batchCapacity: 1000,        // 单批兑水量（升/轮）：配药桶一批能兑的量，总水量超过则分多批
  batteryCount: 2,            // 拥有电池数量（块）
  generatorChargeTime: 8,     // 发电机充电时间（min/块）
  threePhaseChargeTime: 5,    // 三相电充电时间（min/块）
  chargeMode: 'generator',    // 充电模式：generator | threePhase | dual
  chargeAfterWork: true       // 作业结束后是否充满所有电池再走（默认true）
};

/* 默认作业参数 */
const DEFAULT_FIELD = {
  area: 10,               // 作业亩数
  treeCount: 0,           // 果树棵数（calcBasis='tree' 时作为主输入，亩数反推）
  calcBasis: 'area',      // 计算基准：'area' 按亩数 | 'tree' 按棵数（选类型时按其 defaultBasis 预置）
  plantKey: 'shajun',     // 当前用药类型 key（内部字段名沿用，兼容旧存档）
  existingPesticideSets: 0, // 现有药剂套数（用户填，0表示无库存，作为主显示）
  farmerName: '',         // 农户名称（工单抬头显示；三期接入农户档案）
  droneTank: 85,          // 机载装药上限（升/趟）：无人机药箱最大装载量
  plotMode: false,        // 多地块模式：true 时按地块列表计算
  plots: [],              // 地块列表 [{id, name, area, treeCount, groupId}]
  groupTrips: {}          // 组级趟数覆盖 {组号: 趟数}（组内连片连续作业，合并算趟数）
};

/* 表单字段定义（用于动态渲染 + tooltip 说明 + 输入验证）
   约束元数据：
     integer: true    → 整数约束（输入时自动取整）
     min: number      → 最小值（低于则警告，但不阻止）
     minHard: number  → 硬性最小值（低于则拒绝并弹窗）
     warnBelow: number → 低于此值显示橙色警告边框
     warnAbove: number → 高于此值显示橙色警告边框
*/
const FIELD_DEFS = {
  // 作业参数
  calcBasis: { label: '计算基准', unit: '', tip: '按棵数：直接填果树棵数算药量，亩数=棵数÷每亩棵数反推；按亩数：维持原方式。选果树类时默认按棵数', group: 'param', type: 'radio', options: [
    { value: 'area', label: '按亩数' },
    { value: 'tree', label: '按棵数' }
  ], default: 'area' },
  droneTank: { label: '机载装药上限', unit: '升/趟', tip: '无人机药箱一次最多装载的药液量（多地块模式按此算每组最少趟数）。T40约40-50升，T60/T100更大，可超配到85', group: 'param', advanced: true, default: 85, step: 1, integer: true, minHard: 1, warnBelow: 10 },
  existingPesticideSets: { label: '现有药剂套数', unit: '套', tip: '已库存的药剂套数（主显示，作为主要参考）。0表示无库存，将完全按公式参考量采购', group: 'param', default: 0, step: 1, integer: true, min: 0, priority: 'high' },
  flightHeight: { label: '飞行高度', unit: '米', tip: '无人机距离作物冠层的建议高度，影响覆盖均匀度（建议 1-5 米）', group: 'param', advanced: true, default: 2.0, step: 0.1, min: 0.5, warnBelow: 0.5, warnAbove: 10 },
  waterPerMu: { label: '每亩水量', unit: '升', tip: '每亩地需要喷洒的药液总量（升/亩，建议 1-50）', group: 'param', default: 20, step: 0.1, min: 0.1, warnBelow: 0.5 },
  treesPerMu: { label: '每亩棵数', unit: '棵', tip: '每亩种植的棵数，按棵数计算时用于亩数反推', group: 'param', advanced: true, default: 80, step: 1, integer: true, min: 0 },
  waterPerTree: { label: '每棵用水量', unit: '升', tip: '单棵树需要喷洒的药液量（升/棵），按棵数计算时使用', group: 'param', advanced: true, default: 3, step: 0.1, min: 0 },
  pesticideWaterPerSet: { label: '一套药需水量', unit: '升', tip: '一整套药剂对应需要的水量（升），决定一套药能配多少药液', group: 'param', advanced: true, default: 300, step: 1, min: 1, warnBelow: 10 },
  droneSavingCoeff: { label: '无人机省药系数', unit: '', tip: '无人机相比人工打药节省的药量比例，0.7 表示省 30%（可超过1，表示更费药；建议 0.5-1.5）', group: 'param', advanced: true, default: 0.7, step: 0.05, min: 0, warnBelow: 0.1, warnAbove: 3 },

  // 循环成本
  batteryDepreciation: { label: '电池折旧', unit: '元/次充电', tip: '一组电池每充一次电分摊的折旧费（建议 5-10）', group: 'cycle', advanced: true, default: 7, step: 0.5, min: 0 },
  fuelExpense: { label: '本次油费', unit: '元', tip: '出发加满、回家加满的加油差价（含行车与发电机用油）。每次充电油钱=油费÷充电次数，自动算出', group: 'cycle', default: 150, step: 10, min: 0 },
  cycleArea: { label: '单循环亩数', unit: '亩', tip: '一个循环（一组电池）能完成的作业亩数（建议 0.5-30）', group: 'cycle', advanced: true, default: 2, step: 0.1, min: 0.1, warnBelow: 0.1, warnAbove: 100 },

  // 人工
  workers: { label: '作业人数', unit: '人', tip: '含飞手、配药、搬运等所有人员。填0可剔除人工成本', group: 'labor', default: 3, step: 1, integer: true, min: 0 },
  days: { label: '作业天数', unit: '天', tip: '本次作业预计所需天数。3人团队一天可喷 30-50 亩。按天计薪时半天通常按 1 天算', group: 'labor', default: 0.3, step: 0.1, min: 0, warnAbove: 30 },
  dailyWage: { label: '每人日薪', unit: '元/天', tip: '每个工人每天的工钱（建议 100-1000）', group: 'labor', default: 300, step: 10, min: 0, warnBelow: 50, warnAbove: 2000 },
  mealCost: { label: '每人每天餐费', unit: '元', tip: '每人每天的饭钱（含中午工作餐）', group: 'labor', default: 50, step: 5, min: 0 },
  accommodation: { label: '住宿费', unit: '元/天', tip: '全部人员合计的住宿费/天（3人住2间×200元则填400，0表示不住宿）', group: 'labor', default: 0, step: 50, min: 0 },
  accommodationDays: { label: '住宿天数', unit: '天', tip: '住宿天数，与作业天数独立。如需提前一天到达，则填 作业天数+1', group: 'labor', default: 0, step: 0.5, min: 0 },

  // 其他
  pesticidePrice: { label: '一套药剂价格', unit: '元/套', tip: '一套药剂的进货价格（建议 20-500）', group: 'other', default: 80, step: 1, min: 0, warnBelow: 1, warnAbove: 5000 },
  pesticideIncluded: { label: '包药（作业方提供药剂）', unit: '', tip: '勾选=作业方提供药剂并承担药剂成本；不勾选=农户自备药剂，不扣药剂成本（默认不包药）', group: 'other', type: 'check', default: false },
  droneDepreciation: { label: '无人机折旧', unit: '元/亩', tip: '无人机机身分摊到每亩的折旧费', group: 'other', advanced: true, default: 0.3, step: 0.05, min: 0 },
  maintenanceReserve: { label: '维修保养储备', unit: '元/亩', tip: '机臂、桨叶、电机等易损件更换分摊', group: 'other', advanced: true, default: 0.2, step: 0.05, min: 0 },
  protectiveGear: { label: '防护装备', unit: '元/次', tip: '口罩、手套、护目镜等分摊到每次作业', group: 'other', advanced: true, default: 5, step: 1, min: 0 },
  cleaningCost: { label: '清洗费用', unit: '元/次', tip: '作业后药箱、管路清洗的材料费', group: 'other', advanced: true, default: 10, step: 1, min: 0 },
  insurance: { label: '保险分摊', unit: '元/亩', tip: '无人机+第三者责任险分摊到每亩', group: 'other', advanced: true, default: 0.1, step: 0.05, min: 0 },
  miscCost: { label: '其他杂费', unit: '元', tip: '如通信、停车、临时用工等本次作业的杂费', group: 'other', default: 0, step: 1, min: 0 },

  // 收入
  pricePerMu: { label: '每亩收费', unit: '元/亩', tip: '向农户/农场收取的每亩服务费。果树类一般 60-150 元/亩（含药），大田作物 8-25 元/亩', group: 'income', default: 25, step: 0.5, min: 0, warnBelow: 1, priority: 'high' },
  subsidy: { label: '农机补贴等', unit: '元', tip: '政府补贴或项目补贴（若有）', group: 'income', default: 0, step: 10, min: 0 },

  // 作业时间参数
  flightSpeed: { label: '飞行速度', unit: 'm/s', tip: '无人机作业时的飞行速度，常见 2-5 m/s（建议 1-10）。填了飞行作业时间后此字段禁用', group: 'timing', advanced: true, default: 2.5, step: 0.1, minHard: 0.1, warnBelow: 0.5, warnAbove: 20 },
  lineSpacing: { label: '航线间距', unit: '米', tip: '相邻航线间距，影响喷幅覆盖。一般 1.5-3 米（建议 1-5）。填了飞行作业时间后此字段禁用', group: 'timing', advanced: true, default: 2, step: 0.1, minHard: 0.5, warnBelow: 0.5, warnAbove: 10 },
  manualFlightTime: { label: '飞行作业时间（手动）', unit: 'min', tip: '高优先级：手动输入飞行作业时间。填了则用此值计算（显示"准确时间"），不填或0则用飞行速度×航线间距估算（显示"参考时间"）', group: 'timing', default: 0, step: 0.5, min: 0, priority: 'high' },
  roundTripTime: { label: '来回升降时间', unit: 'min/循环', tip: '每次循环的起飞、降落、转场时间。一般 2-5 分钟', group: 'timing', default: 3, step: 0.5, min: 0, warnAbove: 30 },
  loadTime: { label: '加药装载时间', unit: 'min/循环', tip: '每趟飞行前给无人机药箱加药液的时间。真实串行耗时，不能被飞行抵消（充电可以）。一般 0.5-2 分钟', group: 'timing', default: 1, step: 0.5, min: 0, warnAbove: 15 },
  baseMixTime: { label: '基础兑药时间', unit: 'min/轮', tip: '每批兑水兑药搅拌的时间，与水量无关', group: 'timing', default: 10, step: 1, min: 0, warnAbove: 60 },
  batchCapacity: { label: '单批兑水量', unit: '升', tip: '配药桶一批能兑的药液量。总水量超过此值分多批：首批必须在飞行前兑完（串行），第2批起可与飞行并行', group: 'timing', advanced: true, default: 1000, step: 50, min: 1, minHard: 1, warnBelow: 10 },
  batteryCount: { label: '拥有电池数量', unit: '块', tip: '作业用电池数量（至少 1 块）。2块轮流、3块以上更宽松', group: 'timing', default: 2, step: 1, integer: true, minHard: 1, warnBelow: 1, warnAbove: 20 },
  generatorChargeTime: { label: '发电机充电时间', unit: 'min/块', tip: '发电机给单块电池充满的时间，一般 6-10 min', group: 'timing', advanced: true, default: 8, step: 0.5, minHard: 0.1, warnBelow: 1, warnAbove: 60 },
  threePhaseChargeTime: { label: '三相电充电时间', unit: 'min/块', tip: '三相电给单块电池充满的时间，一般 4-6 min', group: 'timing', advanced: true, default: 5, step: 0.5, minHard: 0.1, warnBelow: 1, warnAbove: 60 },
  chargeMode: { label: '充电模式', unit: '', tip: '仅发电机/仅三相电/三相电+发电机双充（双充更快但需≥3块电池才能完全无等待）', group: 'timing', type: 'radio', options: [
    { value: 'generator', label: '仅发电机' },
    { value: 'threePhase', label: '仅三相电' },
    { value: 'dual', label: '三相电+发电机' }
  ], default: 'generator' },
  chargeAfterWork: { label: '作业结束后充满电再走', unit: '', tip: '勾选=作业完成后所有未满电池继续充电至充满（结束后用三相电，成本低）；不勾选=作业完成即走，剩余电量保留', group: 'timing', type: 'check', default: true }
};

/* 顺序字段分组（控制表单渲染顺序） */
const FIELD_ORDER = {
  param: ['calcBasis', 'droneTank', 'existingPesticideSets', 'flightHeight', 'waterPerMu', 'treesPerMu', 'waterPerTree', 'pesticideWaterPerSet', 'droneSavingCoeff'],
  cycle: ['batteryDepreciation', 'fuelExpense', 'cycleArea'],
  labor: ['workers', 'days', 'dailyWage', 'mealCost', 'accommodation', 'accommodationDays'],
  other: ['pesticidePrice', 'pesticideIncluded', 'droneDepreciation', 'maintenanceReserve', 'protectiveGear', 'cleaningCost', 'insurance', 'miscCost'],
  income: ['pricePerMu', 'subsidy'],
  timing: ['manualFlightTime', 'flightSpeed', 'lineSpacing', 'roundTripTime', 'loadTime', 'baseMixTime', 'batchCapacity', 'batteryCount', 'generatorChargeTime', 'threePhaseChargeTime', 'chargeMode', 'chargeAfterWork']
};

// 暴露到全局
window.PLANT_DATABASE = PLANT_DATABASE;
window.DEFAULT_COSTS = DEFAULT_COSTS;
window.DEFAULT_INCOME = DEFAULT_INCOME;
window.DEFAULT_TIMING = DEFAULT_TIMING;
window.DEFAULT_FIELD = DEFAULT_FIELD;
window.FIELD_DEFS = FIELD_DEFS;
window.FIELD_ORDER = FIELD_ORDER;

/* ============================================================
   ★★★ 吊运模式（HAUL）—— 与打药模式完全独立 ★★★
   场景：无人机吊运水果/农产品从果园下山或跨地形运输
   收入：按每斤多少毛计费（用户填毛，实际 ×0.1 = 元）
   人工：分无人机部分（按天）+ 采摘部分（按斤，可选）
   成本：电池循环（多少躺一组电池）+ 交通 + 设备折旧 + 其他
   ============================================================ */

/* 吊运模式默认成本参数 */
const DEFAULT_HAUL_COSTS = {
  // 电池循环：电池折旧按次、油费整次直填
  batteryDepreciation: 3,          // 电池折旧（元/次充电）
  fuelExpense: 150,                // 本次油费（元）
  weightPerTrip: 50,               // 一躺多少斤（斤/躺）：单次吊运重量，T40约50-60斤
  tripsPerBatteryCycle: 6,         // 多少躺一组电池：满电到换电能跑的来回数

  // 无人机人工（按天计算，与采摘独立）
  droneWorkers: 1,                 // 无人机作业人数（飞手，地面辅助由采摘工兼任或另算）
  droneDays: 1,                    // 无人机作业天数
  droneDailyWage: 500,             // 无人机每人日薪（飞手工资较高，按天算 400-600）
  droneMealCost: 50,               // 无人机每人每天餐费
  droneAccommodation: 0,           // 无人机住宿费（元/天，全部人员合计）
  droneAccommodationDays: 0,       // 无人机住宿天数（独立于作业天数）

  // 采摘人工（按斤计算，可选）
  pickupIncluded: false,           // 是否包采摘（true=作业方负责采摘并承担成本）
  pickupPricePerJin: 5,            // 采摘每斤单价（毛，5毛=0.5元/斤）

  // 设备折旧（按100斤分摊，吊运按重量计损更合理）
  droneDepreciation: 0.5,          // 无人机折旧（元/100斤）
  maintenanceReserve: 0.3,         // 维修保养储备（元/100斤）
  protectiveGear: 5,               // 防护装备（元/次）
  cleaningCost: 5,                 // 清洗费用（元/次）
  insurance: 0.05,                 // 保险分摊（元/100斤）
  miscCost: 0                      // 其他杂费（元）
};

/* 吊运模式默认收入参数 */
const DEFAULT_HAUL_INCOME = {
  pricePerJin: 12                  // 吊运每斤单价（毛，12毛=1.2元/斤）
};

/* 吊运模式默认作业参数 */
const DEFAULT_HAUL_FIELD = {
  totalWeight: 1000,               // 总斤数（斤）
  flightHeight: 5                  // 飞行高度（米）
};

/* 吊运模式字段定义 */
const HAUL_FIELD_DEFS = {
  // 作业参数
  totalWeight: { label: '总斤数', unit: '斤', tip: '本次需要吊运的总重量（斤）', group: 'param', default: 1000, step: 10 },
  flightHeight: { label: '飞行高度', unit: '米', tip: '无人机吊运时的飞行高度，根据地形和障碍物调整。山区吊运通常 5-15 米', group: 'param', advanced: true, default: 5, step: 0.5 },

  // 电池循环
  batteryDepreciation: { label: '电池折旧', unit: '元/次充电', tip: '一组电池每充一次电分摊的折旧费', group: 'cycle', advanced: true, default: 3, step: 0.5, min: 0 },
  fuelExpense: { label: '本次油费', unit: '元', tip: '出发加满、回家加满的加油差价。每次充电油钱=油费÷充电次数，自动算出', group: 'cycle', default: 150, step: 10, min: 0 },
  weightPerTrip: { label: '一躺多少斤', unit: '斤', tip: '单次吊运（一个来回）的重量。受无人机载重限制，T40约50-60斤，T30约30-40斤', group: 'cycle', default: 50, step: 5 },
  tripsPerBatteryCycle: { label: '多少躺一组电池', unit: '躺', tip: '一组电池能完成的来回数（满电到换电）。载重越大越少，通常4-8躺', group: 'cycle', default: 6 },
  // 无人机人工（按天）
  droneWorkers: { label: '无人机作业人数', unit: '人', tip: '含飞手、地面辅助人员（装货/卸货）', group: 'droneLabor', default: 2 },
  droneDays: { label: '无人机作业天数', unit: '天', tip: '无人机作业预计所需天数', group: 'droneLabor', default: 1, step: 0.5 },
  droneDailyWage: { label: '每人日薪', unit: '元/天', tip: '无人机作业人员每人每天的工钱（飞手工资通常较高 400-600）', group: 'droneLabor', default: 400, step: 10 },
  droneMealCost: { label: '每人每天餐费', unit: '元', tip: '每人每天的饭钱', group: 'droneLabor', default: 50, step: 5 },
  droneAccommodation: { label: '住宿费', unit: '元/天', tip: '全部人员合计的住宿费/天；0表示不住宿', group: 'droneLabor', default: 0, step: 50 },
  droneAccommodationDays: { label: '住宿天数', unit: '天', tip: '住宿天数，与作业天数独立。如需提前一天到达则填作业天数+1', group: 'droneLabor', default: 0, step: 0.5 },

  // 采摘人工（按斤）
  pickupIncluded: { label: '包采摘（作业方负责采摘）', unit: '', tip: '勾选=作业方负责采摘并承担采摘人工成本；不勾选=农户自采，作业方只负责吊运（默认不包采摘）', group: 'pickupLabor', type: 'check', default: false },
  pickupPricePerJin: { label: '采摘每斤单价', unit: '毛', tip: '采摘工每斤的工钱（毛）。5毛=0.5元/斤。仅包采摘时计入', group: 'pickupLabor', default: 5, step: 0.5 },

  // 设备折旧（按100斤）
  droneDepreciation: { label: '无人机折旧', unit: '元/100斤', tip: '无人机机身分摊到每100斤的折旧费（吊运损耗比打药大）', group: 'other', advanced: true, default: 0.5, step: 0.05 },
  maintenanceReserve: { label: '维修保养储备', unit: '元/100斤', tip: '机臂、桨叶、电机等易损件更换分摊', group: 'other', advanced: true, default: 0.3, step: 0.05 },
  protectiveGear: { label: '防护装备', unit: '元/次', tip: '口罩、手套、安全帽等分摊到每次作业', group: 'other', advanced: true, default: 5, step: 1 },
  cleaningCost: { label: '清洗费用', unit: '元/次', tip: '作业后设备清洗的材料费', group: 'other', advanced: true, default: 5, step: 1 },
  insurance: { label: '保险分摊', unit: '元/100斤', tip: '无人机+第三者责任险分摊', group: 'other', advanced: true, default: 0.05, step: 0.01 },
  miscCost: { label: '其他杂费', unit: '元', tip: '如通信、停车、临时用工等', group: 'other', default: 0, step: 1 },

  // 收入
  pricePerJin: { label: '吊运每斤单价', unit: '毛', tip: '吊运服务每斤的收费（毛）。8毛=0.8元/斤。山区果园吊运通常 5-15 毛/斤', group: 'income', default: 8, step: 0.5 }
};

/* 吊运模式字段顺序（控制表单渲染顺序和 Tab 分组） */
const HAUL_FIELD_ORDER = {
  param: ['totalWeight', 'flightHeight'],
  cycle: ['batteryDepreciation', 'fuelExpense', 'weightPerTrip', 'tripsPerBatteryCycle'],
  droneLabor: ['droneWorkers', 'droneDays', 'droneDailyWage', 'droneMealCost', 'droneAccommodation', 'droneAccommodationDays'],
  pickupLabor: ['pickupIncluded', 'pickupPricePerJin'],
  other: ['droneDepreciation', 'maintenanceReserve', 'protectiveGear', 'cleaningCost', 'insurance', 'miscCost'],
  income: ['pricePerJin']
};

/* 吊运模式 Tab 配置（显示在成本明细面板） */
const HAUL_TAB_CONFIG = [
  { key: 'cycle',      label: '🔋 电池循环' },
  { key: 'droneLabor', label: '🚁 无人机人工' },
  { key: 'pickupLabor',label: '🧺 采摘人工' },
  { key: 'other',      label: '📦 其他' }
];

// 吊运模式常量暴露到全局
window.DEFAULT_HAUL_COSTS = DEFAULT_HAUL_COSTS;
window.DEFAULT_HAUL_INCOME = DEFAULT_HAUL_INCOME;
window.DEFAULT_HAUL_FIELD = DEFAULT_HAUL_FIELD;
window.HAUL_FIELD_DEFS = HAUL_FIELD_DEFS;
window.HAUL_FIELD_ORDER = HAUL_FIELD_ORDER;
window.HAUL_TAB_CONFIG = HAUL_TAB_CONFIG;
