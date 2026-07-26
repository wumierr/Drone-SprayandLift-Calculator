/* ============================================================
   data.js — 默认植物数据库 & 默认参数
   每种植物包含：
     - calcMode: 'tree' 按棵计算 | 'area' 按面积计算
     - flightHeight: 建议飞行高度（米）
     - waterPerMu: 每亩水量（升）
     - treesPerMu: 每亩棵数（果树类）
     - waterPerTree: 每棵用水量（升，果树类）
     - pesticideWaterPerSet: 一套药对应的水量（升）
     - droneSavingCoeff: 无人机省药系数（0-1）
   ============================================================ */

const PLANT_DATABASE = {
  fruit_tree: {
    name: '果树',
    icon: '🌳',
    calcMode: 'tree',
    flightHeight: 2.0,
    waterPerMu: 20,
    treesPerMu: 80,
    waterPerTree: 3,
    pesticideWaterPerSet: 300,
    droneSavingCoeff: 0.7,
    description: '苹果/梨/桃等常见果树，建议高于树冠1-1.5米作业',
    notes: '⚠️ 花期、幼果期慎用敏感药剂；避免大风天作业。'
  },
  orchard_dense: {
    name: '密植果园',
    icon: '🍎',
    calcMode: 'tree',
    flightHeight: 1.8,
    waterPerMu: 25,
    treesPerMu: 110,
    waterPerTree: 2.5,
    pesticideWaterPerSet: 300,
    droneSavingCoeff: 0.7,
    description: '矮化密植苹果/樱桃等，行距小、棵数多',
    notes: '⚠️ 注意树冠穿透性，可适当降低飞行高度。'
  },
  citrus: {
    name: '柑橘园',
    icon: '🍊',
    calcMode: 'tree',
    flightHeight: 2.0,
    waterPerMu: 22,
    treesPerMu: 60,
    waterPerTree: 3.5,
    pesticideWaterPerSet: 300,
    droneSavingCoeff: 0.7,
    description: '柑橘/橙/柚，树冠较大需稍高水量',
    notes: '⚠️ 红蜘蛛、潜叶蛾高发期注意轮换用药。'
  },
  rice: {
    name: '水稻',
    icon: '🌾',
    calcMode: 'area',
    flightHeight: 2.0,
    waterPerMu: 1.5,
    treesPerMu: 0,
    waterPerTree: 0,
    pesticideWaterPerSet: 300,
    droneSavingCoeff: 0.7,
    description: '水稻飞防最佳期为分蘖期至抽穗期',
    notes: '⚠️ 避开开花期(9-11点)喷洒；注意防治稻飞虱、二化螟。'
  },
  wheat: {
    name: '小麦',
    icon: '🌾',
    calcMode: 'area',
    flightHeight: 1.8,
    waterPerMu: 1.5,
    treesPerMu: 0,
    waterPerTree: 0,
    pesticideWaterPerSet: 300,
    droneSavingCoeff: 0.7,
    description: '小麦飞防最佳期为拔节期至灌浆期',
    notes: '⚠️ 重点防治赤霉病、蚜虫、白粉病。'
  },
  corn: {
    name: '玉米',
    icon: '🌽',
    calcMode: 'area',
    flightHeight: 2.5,
    waterPerMu: 2.0,
    treesPerMu: 0,
    waterPerTree: 0,
    pesticideWaterPerSet: 300,
    droneSavingCoeff: 0.7,
    description: '玉米飞防最佳期为大喇叭口期',
    notes: '⚠️ 玉米植株高，飞行高度需相应提高，避免倒伏。'
  },
  cotton: {
    name: '棉花',
    icon: '🌱',
    calcMode: 'area',
    flightHeight: 2.0,
    waterPerMu: 1.8,
    treesPerMu: 0,
    waterPerTree: 0,
    pesticideWaterPerSet: 300,
    droneSavingCoeff: 0.7,
    description: '棉花飞防注意防治蚜虫、红蜘蛛、棉铃虫',
    notes: '⚠️ 避免在花期喷洒影响授粉。'
  },
  vegetables: {
    name: '蔬菜',
    icon: '🥬',
    calcMode: 'area',
    flightHeight: 1.5,
    waterPerMu: 1.2,
    treesPerMu: 0,
    waterPerTree: 0,
    pesticideWaterPerSet: 300,
    droneSavingCoeff: 0.7,
    description: '叶菜/根菜类，飞行高度低，需选低毒农药',
    notes: '⚠️ 严格遵守安全间隔期，避免农残超标。'
  },
  tea: {
    name: '茶园',
    icon: '🍵',
    calcMode: 'area',
    flightHeight: 1.8,
    waterPerMu: 2.5,
    treesPerMu: 0,
    waterPerTree: 0,
    pesticideWaterPerSet: 300,
    droneSavingCoeff: 0.7,
    description: '茶园飞防注意防治茶小绿叶蝉、茶尺蠖',
    notes: '⚠️ 采摘前15天停止喷药；优选生物农药。'
  },
  banana: {
    name: '香蕉园',
    icon: '🍌',
    calcMode: 'area',
    flightHeight: 2.2,
    waterPerMu: 3.0,
    treesPerMu: 0,
    waterPerTree: 0,
    pesticideWaterPerSet: 300,
    droneSavingCoeff: 0.7,
    description: '香蕉叶片大需水量较高',
    notes: '⚠️ 注意防治叶斑病、黑星病。'
  },
  forest: {
    name: '林地/防护林',
    icon: '🌲',
    calcMode: 'area',
    flightHeight: 3.0,
    waterPerMu: 3.0,
    treesPerMu: 0,
    waterPerTree: 0,
    pesticideWaterPerSet: 300,
    droneSavingCoeff: 0.75,
    description: '杨树/松树等林地，飞行高度较高',
    notes: '⚠️ 注意防治美国白蛾、松毛虫。'
  }
};

/* 默认成本参数（用户可全量修改） */
const DEFAULT_COSTS = {
  // 循环成本
  cycleCost: 7,           // 单次循环费用：电池折旧+充电+油钱（元）
  cycleCostThreePhase: 5, // 三相电模式下：仅电池折旧（元）
  cycleArea: 2,           // 单次循环作业亩数（亩）
  useThreePhase: false,   // 是否使用三相电（true 则只用电池折旧费）

  // 交通成本
  distance: 20,           // 单程路程（公里），本地作业通常 10-30km
  fuelConsumption: 12,    // 满载小型厢式货车油耗（升/100公里）
  fuelPrice: 8,           // 油价（元/升）
  tolls: 0,               // 路桥费（元）
  vehicleDepreciation: 0.5, // 车辆折旧（元/公里）

  // 人工成本
  workers: 3,             // 作业人数（含飞手）
  days: 0.3,              // 作业天数（3人团队10亩约0.3天，实际可喷30-50亩/天）
  dailyWage: 300,         // 每人日薪（元）
  mealCost: 50,           // 每人每天餐费（元）
  accommodation: 0,       // 住宿费（元/天，0表示无）

  // 其他成本
  pesticidePrice: 80,     // 一套药剂价格（元/套）
  droneDepreciation: 0.3, // 无人机折旧（元/亩）
  maintenanceReserve: 0.2,// 维修保养储备金（元/亩）
  protectiveGear: 5,      // 防护装备分摊（元/次作业）
  cleaningCost: 10,       // 清洗费用（元/次作业）
  insurance: 0.1,         // 保险分摊（元/亩）
  miscCost: 0             // 其他杂费（元）
};

/* 默认收入参数 */
const DEFAULT_INCOME = {
  pricePerMu: 100,        // 每亩服务收费（元/亩），果树类约 60-150，大田作物 8-25
  subsidy: 0              // 农机补贴等（元）
};

/* 默认作业参数 */
const DEFAULT_FIELD = {
  area: 10,               // 作业亩数
  plantKey: 'fruit_tree'  // 默认植物
};

/* 表单字段定义（用于动态渲染 + tooltip 说明） */
const FIELD_DEFS = {
  // 作业参数
  area: { label: '作业亩数', unit: '亩', tip: '本次需要打药的总亩数', group: 'param', default: 10 },
  flightHeight: { label: '飞行高度', unit: '米', tip: '无人机距离作物冠层的建议高度，影响覆盖均匀度', group: 'param', default: 2.0, step: 0.1 },
  waterPerMu: { label: '每亩水量', unit: '升', tip: '每亩地需要喷洒的药液总量（升/亩）', group: 'param', default: 20, step: 0.1 },
  treesPerMu: { label: '每亩棵数', unit: '棵', tip: '每亩种植的棵数，仅果树类使用', group: 'param', default: 80 },
  waterPerTree: { label: '每棵用水量', unit: '升', tip: '单棵树需要喷洒的药液量（升/棵），仅果树类使用', group: 'param', default: 3, step: 0.1 },
  pesticideWaterPerSet: { label: '一套药需水量', unit: '升', tip: '一整套药剂对应需要的水量（升），决定一套药能配多少药液', group: 'param', default: 300, step: 1 },
  droneSavingCoeff: { label: '无人机省药系数', unit: '', tip: '无人机相比人工打药节省的药量比例，0.7 表示省 30%', group: 'param', default: 0.7, step: 0.05 },

  // 循环成本
  cycleCost: { label: '单次循环成本', unit: '元', tip: '一个循环的电池折旧+充电+油钱等费用（默认含充电油钱 7 元）', group: 'cycle', default: 7, step: 0.1 },
  cycleCostThreePhase: { label: '三相电循环成本', unit: '元', tip: '使用三相电时仅需电池折旧费（默认 5 元）', group: 'cycle', default: 5, step: 0.1 },
  cycleArea: { label: '单循环亩数', unit: '亩', tip: '一个循环（一组电池）能完成的作业亩数', group: 'cycle', default: 2, step: 0.1 },
  useThreePhase: { label: '使用三相电（仅电池折旧）', unit: '', tip: '勾选后循环成本改为仅电池折旧费', group: 'cycle', type: 'check', default: false },

  // 交通
  distance: { label: '单程路程', unit: '公里', tip: '从驻地到作业地块的单程距离，本地作业通常 10-30km', group: 'transport', default: 20, step: 1 },
  fuelConsumption: { label: '满载油耗', unit: '升/100km', tip: '小型厢式货车满载（无人机+发电机+水桶+人员）的油耗', group: 'transport', default: 12, step: 0.5 },
  fuelPrice: { label: '油价', unit: '元/升', tip: '当前柴油/汽油价格', group: 'transport', default: 8, step: 0.05 },
  tolls: { label: '路桥费', unit: '元', tip: '来回过路过桥费总和', group: 'transport', default: 0, step: 1 },
  vehicleDepreciation: { label: '车辆折旧', unit: '元/公里', tip: '车辆磨损分摊，建议 0.3-0.6 元/公里', group: 'transport', default: 0.5, step: 0.05 },

  // 人工
  workers: { label: '作业人数', unit: '人', tip: '含飞手、配药、搬运等所有人员', group: 'labor', default: 3 },
  days: { label: '作业天数', unit: '天', tip: '本次作业预计所需天数。3人团队一天可喷 30-50 亩', group: 'labor', default: 0.3, step: 0.1 },
  dailyWage: { label: '每人日薪', unit: '元/天', tip: '每个工人每天的工钱', group: 'labor', default: 300, step: 10 },
  mealCost: { label: '每人每天餐费', unit: '元', tip: '每人每天的饭钱（含中午工作餐）', group: 'labor', default: 50, step: 5 },
  accommodation: { label: '住宿费', unit: '元/天', tip: '若需在外住宿，总住宿费/天；0 表示不住宿', group: 'labor', default: 0, step: 50 },

  // 其他
  pesticidePrice: { label: '一套药剂价格', unit: '元/套', tip: '一套药剂的进货价格', group: 'other', default: 80, step: 1 },
  droneDepreciation: { label: '无人机折旧', unit: '元/亩', tip: '无人机机身分摊到每亩的折旧费', group: 'other', default: 0.3, step: 0.05 },
  maintenanceReserve: { label: '维修保养储备', unit: '元/亩', tip: '机臂、桨叶、电机等易损件更换分摊', group: 'other', default: 0.2, step: 0.05 },
  protectiveGear: { label: '防护装备', unit: '元/次', tip: '口罩、手套、护目镜等分摊到每次作业', group: 'other', default: 5, step: 1 },
  cleaningCost: { label: '清洗费用', unit: '元/次', tip: '作业后药箱、管路清洗的材料费', group: 'other', default: 10, step: 1 },
  insurance: { label: '保险分摊', unit: '元/亩', tip: '无人机+第三者责任险分摊到每亩', group: 'other', default: 0.1, step: 0.05 },
  miscCost: { label: '其他杂费', unit: '元', tip: '如通信、停车、临时用工等本次作业的杂费', group: 'other', default: 0, step: 1 },

  // 收入
  pricePerMu: { label: '每亩收费', unit: '元/亩', tip: '向农户/农场收取的每亩服务费。果树类一般 60-150 元/亩（含药），大田作物 8-25 元/亩', group: 'income', default: 100, step: 0.5 },
  subsidy: { label: '农机补贴等', unit: '元', tip: '政府补贴或项目补贴（若有）', group: 'income', default: 0, step: 10 }
};

/* 顺序字段分组（控制表单渲染顺序） */
const FIELD_ORDER = {
  param: ['area', 'flightHeight', 'waterPerMu', 'treesPerMu', 'waterPerTree', 'pesticideWaterPerSet', 'droneSavingCoeff'],
  cycle: ['cycleCost', 'cycleCostThreePhase', 'cycleArea', 'useThreePhase'],
  transport: ['distance', 'fuelConsumption', 'fuelPrice', 'tolls', 'vehicleDepreciation'],
  labor: ['workers', 'days', 'dailyWage', 'mealCost', 'accommodation'],
  other: ['pesticidePrice', 'droneDepreciation', 'maintenanceReserve', 'protectiveGear', 'cleaningCost', 'insurance', 'miscCost'],
  income: ['pricePerMu', 'subsidy']
};

// 暴露到全局
window.PLANT_DATABASE = PLANT_DATABASE;
window.DEFAULT_COSTS = DEFAULT_COSTS;
window.DEFAULT_INCOME = DEFAULT_INCOME;
window.DEFAULT_FIELD = DEFAULT_FIELD;
window.FIELD_DEFS = FIELD_DEFS;
window.FIELD_ORDER = FIELD_ORDER;
