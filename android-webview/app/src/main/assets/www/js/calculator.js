/* ============================================================
   calculator.js — 计算核心
   公式：
     【果树类 calcMode='tree'】
       药量(套) = (亩数 × 每棵水量 × 每亩棵数 ÷ 一套药需水量) × 无人机省药系数
     【面积类 calcMode='area'】
       药量(套) = (亩数 × 每亩水量 ÷ 一套药需水量) × 无人机省药系数
     水量(升) = 亩数 × 每亩水量
     循环数 = ceil(亩数 / 单循环亩数)
     循环成本 = 循环数 × (三相电 ? cycleCostThreePhase : cycleCost)
     油费 = (单程路程 × 2) × 油耗/100 × 油价 + 路桥费 + 车辆折旧×(单程×2)
     人工 = 人数 × 天数 × (日薪 + 餐费) + 住宿费 × 天数
     药剂成本 = 药量(套) × 一套药价
     设备折旧 = 亩数 × (无人机折旧 + 维修储备 + 保险分摊)
     其他 = 防护装备 + 清洗费 + 杂费
     总成本 = 上述之和
     收入 = 亩数 × 每亩收费 + 补贴
     利润 = 收入 - 总成本
   ============================================================ */

const Calculator = {
  /**
   * 主计算函数
   * @param {Object} state - 完整状态 { plant, field, costs, income }
   * @returns {Object} 计算结果
   */
  compute(state) {
    const { plant, field, costs, income } = state;
    const area = Number(field.area) || 0;
    const result = {
      pesticide: 0,        // 套
      pesticideRounded: 0, // 向上取整套数
      water: 0,            // 升
      cycles: 0,           // 循环数
      costBreakdown: {},   // 成本明细
      totalCost: 0,        // 总成本
      income: 0,           // 收入
      profit: 0,           // 利润
      costPerMu: 0,        // 每亩成本
      profitPerMu: 0,      // 每亩利润
      flightHeight: plant.flightHeight
    };

    if (area <= 0) return result;

    /* 1. 药剂用量 */
    let pesticideRaw;
    if (plant.calcMode === 'tree') {
      const treesPerMu = Number(plant.treesPerMu) || 0;
      const waterPerTree = Number(plant.waterPerTree) || 0;
      pesticideRaw = (area * waterPerTree * treesPerMu) / (Number(plant.pesticideWaterPerSet) || 1);
    } else {
      pesticideRaw = (area * Number(plant.waterPerMu)) / (Number(plant.pesticideWaterPerSet) || 1);
    }
    pesticideRaw *= Number(plant.droneSavingCoeff) || 1;
    result.pesticide = pesticideRaw;
    result.pesticideRounded = Math.ceil(pesticideRaw);

    /* 2. 用水量 */
    result.water = area * Number(plant.waterPerMu);

    /* 3. 循环数 */
    const cycleArea = Math.max(0.01, Number(costs.cycleArea) || 1);
    result.cycles = Math.ceil(area / cycleArea);

    /* 4. 循环成本（电池+充电+油钱 或 仅电池折旧） */
    const cycleUnitCost = costs.useThreePhase
      ? Number(costs.cycleCostThreePhase) || 0
      : Number(costs.cycleCost) || 0;
    result.costBreakdown.cycle = result.cycles * cycleUnitCost;

    /* 5. 交通成本 */
    const distance = Number(costs.distance) || 0;
    const fuelConsumption = Number(costs.fuelConsumption) || 0;
    const fuelPrice = Number(costs.fuelPrice) || 0;
    const roundTripKm = distance * 2;
    const fuelCost = roundTripKm * (fuelConsumption / 100) * fuelPrice;
    const vehicleDep = roundTripKm * (Number(costs.vehicleDepreciation) || 0);
    result.costBreakdown.transport = fuelCost + vehicleDep + (Number(costs.tolls) || 0);

    /* 6. 人工成本 */
    const workers = Number(costs.workers) || 0;
    const days = Number(costs.days) || 0;
    const dailyWage = Number(costs.dailyWage) || 0;
    const mealCost = Number(costs.mealCost) || 0;
    const accommodation = Number(costs.accommodation) || 0;
    result.costBreakdown.labor = workers * days * (dailyWage + mealCost) + accommodation * days;

    /* 7. 药剂成本 */
    const pesticidePrice = Number(costs.pesticidePrice) || 0;
    result.costBreakdown.pesticide = pesticideRaw * pesticidePrice;

    /* 8. 设备折旧 & 维修 & 保险（每亩分摊） */
    const perMuCost = (Number(costs.droneDepreciation) || 0)
                    + (Number(costs.maintenanceReserve) || 0)
                    + (Number(costs.insurance) || 0);
    result.costBreakdown.equipment = area * perMuCost;

    /* 9. 其他成本 */
    result.costBreakdown.other = (Number(costs.protectiveGear) || 0)
                               + (Number(costs.cleaningCost) || 0)
                               + (Number(costs.miscCost) || 0);

    /* 10. 汇总 */
    result.totalCost = Object.values(result.costBreakdown).reduce((a, b) => a + b, 0);

    /* 11. 收入 */
    const pricePerMu = Number(income.pricePerMu) || 0;
    const subsidy = Number(income.subsidy) || 0;
    result.income = area * pricePerMu + subsidy;

    /* 12. 利润 */
    result.profit = result.income - result.totalCost;

    /* 13. 每亩指标 */
    result.costPerMu = area > 0 ? result.totalCost / area : 0;
    result.profitPerMu = area > 0 ? result.profit / area : 0;

    return result;
  },

  /**
   * 格式化数字显示
   */
  fmt(num, decimals = 2) {
    if (typeof num !== 'number' || isNaN(num)) return '0';
    return num.toFixed(decimals).replace(/\.?0+$/, (m) => m.includes('.') ? '' : m);
  },

  /**
   * 格式化货币
   */
  fmtMoney(num) {
    if (typeof num !== 'number' || isNaN(num)) num = 0;
    return num.toFixed(2);
  },

  /**
   * 生成成本明细文案
   */
  costBreakdownText(r) {
    const c = r.costBreakdown;
    return [
      `循环(电池/充电/油): ¥${this.fmtMoney(c.cycle)}`,
      `交通(油费/折旧/路桥): ¥${this.fmtMoney(c.transport)}`,
      `人工(工资/餐/宿): ¥${this.fmtMoney(c.labor)}`,
      `药剂: ¥${this.fmtMoney(c.pesticide)}`,
      `设备折旧/维修/保险: ¥${this.fmtMoney(c.equipment)}`,
      `其他(防护/清洗/杂): ¥${this.fmtMoney(c.other)}`
    ].join('；');
  }
};

window.Calculator = Calculator;
