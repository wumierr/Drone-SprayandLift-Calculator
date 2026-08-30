/* ============================================================
   calculator.js — 计算核心
   公式：
     【果树类 calcMode='tree'】（按人工打药水量计算药量）
       药量(套) = (亩数 × 每棵水量 × 每亩棵数 ÷ 一套药需水量) × 无人机省药系数
     【面积类 calcMode='area'】（按每亩水量计算药量）
       药量(套) = (亩数 × 每亩水量 ÷ 一套药需水量) × 无人机省药系数

     注意：药量公式中的"每棵水量/每亩水量"是【人工打药稀释水量】，
          用于计算需要多少套药剂；
          而下方的"实际用水量"用的是植物的 waterPerMu，
          即【无人机实际喷洒水量】，两者独立、互不影响。

     7舍8入取整：小数部分 ≥0.8 进1，否则舍去
       例：5.7→5，5.8→6，5.9→6
     实际用水量(升) = 亩数 × 每亩水量（无人机喷洒量）
     参考浓度(套/100升) = 取整后药量(套) ÷ 实际水量(升) × 100
     循环数 = ceil(亩数 / 单循环亩数)
     循环成本 = 循环数 × (三相电 ? cycleCostThreePhase : cycleCost)
     交通 = (单程×2) × 油耗/100 × 油价 + 路桥费 + 车辆折旧×(单程×2)
     人工 = 人数 × 作业天数 × (日薪 + 餐费) + 住宿费 × 住宿天数
     药剂成本 = 取整后药量(套) × 一套药价  （仅 pesticideIncluded=true 时计入）
     设备折旧 = 亩数 × (无人机折旧 + 维修储备 + 保险分摊)
     其他 = 防护装备 + 清洗费 + 杂费
     总成本 = 上述之和
     收入 = 亩数 × 每亩收费 + 补贴
     利润 = 收入 - 总成本
   ============================================================ */

const Calculator = {
  /**
   * 7舍8入取整：小数部分 ≥0.8 进1，否则舍去
   * 例：5.7→5，5.8→6，5.9→6，5.0→5
   * 用字符串处理，彻底避免 JS 浮点精度问题（2.8 % 1 = 0.7999...）
   */
  round78(num) {
    if (typeof num !== 'number' || isNaN(num) || num < 0) return 0;
    // toFixed 截到 4 位小数，转为字符串后取小数点后第一位判断
    const str = num.toFixed(4);
    const dotIdx = str.indexOf('.');
    if (dotIdx === -1) return parseInt(str, 10);
    const intPart = parseInt(str.substring(0, dotIdx), 10);
    const firstDecimal = parseInt(str.charAt(dotIdx + 1), 10);
    return intPart + (firstDecimal >= 8 ? 1 : 0);
  },

  /**
   * 主计算函数
   * @param {Object} state - 完整状态 { plant, field, costs, income }
   * @returns {Object} 计算结果
   *
   * 双路线药剂计算：
   *   路线A（主显示）：existingPesticideSets = 用户填的现有库存套数
   *   路线B（参考）：pesticide/pesticideRounded = 按水量公式算的参考需要套数
   *   主卡片显示 existingPesticideSets（最高优先级）
   *   参考行显示 pesticideRounded（7舍8入后）
   *   药剂成本（包药时）= max(0, 参考取整 - 现有) × 单价  —— 即需补购的量
   */
  compute(state) {
    const { plant, field, costs, income } = state;
    const area = Number(field.area) || 0;
    const existingSets = Number(field.existingPesticideSets) || 0;
    const result = {
      pesticide: 0,                  // 参考药量（小数原值）
      pesticideRounded: 0,           // 参考药量（7舍8入取整）
      existingSets: existingSets,    // 现有药量（主显示）
      needToBuy: 0,                  // 需补购套数 = max(0, 参考-现有)
      stockStatus: 'none',           // 库存状态：enough/sufficient/short/none
      water: 0,                      // 实际喷洒水量（升）
      concentration: 0,              // 参考浓度（套/100升，用参考取整套数算）
      cycles: 0,                     // 循环数
      costBreakdown: {},             // 成本明细
      totalCost: 0,                  // 总成本
      income: 0,                     // 收入
      profit: 0,                     // 利润
      costPerMu: 0,                  // 每亩成本
      profitPerMu: 0,                // 每亩利润
      flightHeight: plant.flightHeight,
      pesticideIncluded: costs.pesticideIncluded === true
    };

    if (area <= 0) return result;

    /* 1. 参考药量（按人工打药稀释水量计算） */
    let pesticideRaw;
    const pesticideWaterPerSet = Math.max(0.01, Number(plant.pesticideWaterPerSet) || 1);
    if (plant.calcMode === 'tree') {
      const treesPerMu = Number(plant.treesPerMu) || 0;
      const waterPerTree = Number(plant.waterPerTree) || 0;
      pesticideRaw = (area * waterPerTree * treesPerMu) / pesticideWaterPerSet;
    } else {
      pesticideRaw = (area * Number(plant.waterPerMu)) / pesticideWaterPerSet;
    }
    pesticideRaw *= Number(plant.droneSavingCoeff) || 1;
    result.pesticide = pesticideRaw;
    result.pesticideRounded = this.round78(pesticideRaw);

    /* 1.5 现有药量与补购计算（双路线核心） */
    result.needToBuy = Math.max(0, result.pesticideRounded - existingSets);
    if (existingSets <= 0) {
      result.stockStatus = 'none';        // 无库存
    } else if (existingSets >= result.pesticideRounded) {
      result.stockStatus = 'enough';      // 库存充足
    } else {
      result.stockStatus = 'short';       // 库存不足
    }

    /* 2. 实际用水量（无人机喷洒量，独立于药量计算） */
    result.water = area * Number(plant.waterPerMu);

    /* 2.5 参考浓度（套/100升）—— 用参考取整套数和实际喷洒水量 */
    result.concentration = result.water > 0
      ? (result.pesticideRounded / result.water) * 100
      : 0;

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

    /* 6. 人工成本（住宿天数独立于作业天数） */
    const workers = Number(costs.workers) || 0;
    const days = Number(costs.days) || 0;
    const dailyWage = Number(costs.dailyWage) || 0;
    const mealCost = Number(costs.mealCost) || 0;
    const accommodation = Number(costs.accommodation) || 0;
    const accommodationDays = Number(costs.accommodationDays) || 0;
    result.costBreakdown.labor = workers * days * (dailyWage + mealCost)
                               + accommodation * accommodationDays;

    /* 7. 药剂成本（仅当 pesticideIncluded=true 时计入）
       用 needToBuy（需补购套数）× 单价
       即：现有库存够则不花钱，不足则补差额 */
    const pesticidePrice = Number(costs.pesticidePrice) || 0;
    if (result.pesticideIncluded) {
      result.costBreakdown.pesticide = result.needToBuy * pesticidePrice;
    } else {
      // 不包药：药剂农户自备，作业方不承担药剂成本
      result.costBreakdown.pesticide = 0;
    }

    /* 8. 设备折旧 & 维修 & 保险（每亩分摊） */
    const perMuCost = (Number(costs.droneDepreciation) || 0)
                    + (Number(costs.maintenanceReserve) || 0)
                    + (Number(costs.insurance) || 0);
    result.costBreakdown.equipment = area * perMuCost;

    /* 9. 其他成本（每次作业固定） */
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

    /* 14. 作业时间估算 */
    result.timing = this.computeTiming(state, result);

    return result;
  },

  /* ============================================================
     ★★★ 作业时间计算（打药模式专用）★★★
     实际作业流程建模：
       1. 先兑水兑药：首批必须在飞行前完成（串行）
       2. 再加药装载、飞行循环
       3. 总水量超过单批兑水量时分多批，第 2..N 批可与飞行并行
          （利用升降、充电等待的地面空闲），兑药总时长成为瓶颈时延长总时间
     公式：
       兑药轮数 = ⌈总水量 ÷ 单批兑水量⌉（每轮耗时 = 基础兑药时间，与水量无关）
       飞行阶段时长 = 飞行作业 + 来回升降 + 加药装载 + 电池等待
       总作业时间 = max(兑药总时长, 首批兑药 + 飞行阶段时长)
       单循环地面时间 T = 来回升降 + 加药装载 + 飞行作业/循环数
         （加药装载是真实串行耗时，不能被飞行抵消；充电可以——
          这就是"加药时间高优先级于充电时间"的含义）
     ============================================================ */
  computeTiming(state, r) {
    const t = state.timing || window.DEFAULT_TIMING || {};
    const flightSpeed = Math.max(0.01, Number(t.flightSpeed) || 2.5);
    const lineSpacing = Math.max(0.1, Number(t.lineSpacing) || 2);
    const manualFlightTime = Math.max(0, Number(t.manualFlightTime) || 0);
    const roundTripTime = Math.max(0, Number(t.roundTripTime) || 0);
    const loadTime = Math.max(0, Number(t.loadTime) || 0);
    const baseMixTime = Math.max(0, Number(t.baseMixTime) || 0);
    const batchCapacity = Math.max(1, Number(t.batchCapacity) || 1000);
    const batteryCount = Math.max(1, Math.floor(Number(t.batteryCount) || 1));
    const generatorChargeTime = Math.max(0.1, Number(t.generatorChargeTime) || 8);
    const threePhaseChargeTime = Math.max(0.1, Number(t.threePhaseChargeTime) || 5);
    const chargeMode = t.chargeMode || 'generator';
    const chargeAfterWork = t.chargeAfterWork !== false;

    const area = Number(state.field.area) || 0;
    const totalWater = r.water || 0;
    const cycles = r.cycles || 0;

    /* 1. 兑水兑药批次（首批串行在前，其余批次与飞行并行） */
    let mixRounds = 0;
    let mixTotalTime = 0;
    let firstMixTime = 0;
    if (totalWater > 0) {
      mixRounds = Math.max(1, Math.ceil(totalWater / batchCapacity));
      mixTotalTime = mixRounds * baseMixTime;
      firstMixTime = baseMixTime;   // 飞行开始前必须完成首批
    }

    /* 2. 飞行作业时间（高优先级：manualFlightTime > 0 时用此值，否则估算） */
    let flightLength = 0;
    let flightTimeMin = 0;
    let flightTimeSource = 'estimate';  // 'estimate' or 'manual'
    if (manualFlightTime > 0) {
      flightTimeMin = manualFlightTime;
      flightTimeSource = 'manual';
      // 飞行长度不计算（手动模式不需要）
    } else {
      flightLength = area > 0 ? (area * 666.67) / lineSpacing : 0;
      const flightTimeSec = flightLength / flightSpeed;
      flightTimeMin = flightTimeSec / 60;
      flightTimeSource = 'estimate';
    }

    /* 3. 来回升降 + 加药装载（都是每循环真实串行耗时） */
    const roundTripTotal = cycles * (roundTripTime + loadTime);

    /* 3.5 单次循环时间 T = 来回升降 + 加药装载 + 飞行作业/循环数 */
    const perCycleFlight = cycles > 0 ? flightTimeMin / cycles : 0;
    const T = roundTripTime + loadTime + perCycleFlight;

    /* 4. 电池等待时间（事件驱动模拟，时刻相对首批兑药完成点） */
    const batteryResult = this.computeBatteryWait(
      cycles,
      T,
      batteryCount,
      chargeMode,
      generatorChargeTime,
      threePhaseChargeTime
    );
    const batteryWait = batteryResult.total;
    // 飞行阶段时长（相对值）：飞行 + 升降 + 装载 + 电池等待
    const flightSpan = batteryResult.cycleEnd > 0
      ? batteryResult.cycleEnd
      : (cycles > 0 ? cycles * T : 0);

    /* 5. 结束后充电（如果勾选）——先按相对时刻计算，再统一平移 */
    const afterWorkCharge = chargeAfterWork ? this.computeAfterWorkCharge(
      batteryResult.batteries_final, batteryResult.cycleEnd, batteryCount, chargeMode,
      generatorChargeTime, threePhaseChargeTime
    ) : { total: 0, blocks: [] };

    /* 6. 时刻平移：所有飞行/充电事件发生在首批兑药完成之后 */
    batteryResult.cycles.forEach(c => {
      c.tStart += firstMixTime;
      c.tEnd += firstMixTime;
      c.chargeStart += firstMixTime;
      c.chargeEnd += firstMixTime;
    });
    afterWorkCharge.blocks.forEach(b => {
      b.startAt += firstMixTime;
      b.endAt += firstMixTime;
    });

    /* 7. 总作业时间（不含结束后充电）：
          首批兑药 + 飞行阶段 与 兑药总时长 取大者（后续批次并行兑药） */
    const totalTime = Math.max(mixTotalTime, firstMixTime + flightSpan);
    const totalTimeWithCharge = totalTime + afterWorkCharge.total;

    return {
      mixTotalTime: mixTotalTime,
      mixRounds: mixRounds,
      batchCapacity: batchCapacity,
      firstMixTime: firstMixTime,
      flightSpan: flightSpan,
      flightLength: flightLength,
      flightTimeMin: flightTimeMin,
      flightTimeSource: flightTimeSource,    // 'manual' or 'estimate'
      roundTripTotal: roundTripTotal,
      loadTime: loadTime,
      T: T,
      perCycleFlight: perCycleFlight,
      batteryWait: batteryWait,
      batteryCycles: batteryResult.cycles,
      noWaitCount: batteryResult.noWaitCount,
      totalTime: totalTime,
      afterWorkCharge: afterWorkCharge.total,
      afterWorkBlocks: afterWorkCharge.blocks,
      totalTimeWithCharge: totalTimeWithCharge,
      batteryCount: batteryCount,
      chargeMode: chargeMode,
      chargeAfterWork: chargeAfterWork
    };
  },

  /* ============================================================
     ★ 结束后充电计算 ★
     作业完成后，所有未满电池继续充电至充满
     - 无论什么模式，结束后都是单充电器串行
     - dual / threePhase 模式 → 用三相电（成本低）
     - generator 模式 → 用发电机（只有发电机）
     - 每块电池独立显示一个蓝色块
     返回：{ total, blocks: [{ idx, time, charger }] }
     ============================================================ */
  computeAfterWorkCharge(batteries_final, cycleEndTime, N, mode, genTime, threeTime) {
    if (!batteries_final || batteries_final.length === 0) {
      return { total: 0, blocks: [] };
    }
    // 结束后充电器选择：有三相电用三相电，没有才用发电机
    const useTime = (mode === 'generator') ? genTime : threeTime;
    const useCharger = (mode === 'generator') ? 'generator' : 'threePhase';

    // 收集所有未满电池的剩余充电时间
    const pending = [];
    batteries_final.forEach(b => {
      const remaining = Math.max(0, b.avail_time - cycleEndTime);
      if (remaining > 0.001) {
        pending.push({ idx: b.idx, time: remaining });
      }
    });

    // 按剩余时间排序（短的先充）
    pending.sort((a, b) => a.time - b.time);

    // 单充电器串行充
    const blocks = [];
    let accuTime = 0;
    pending.forEach(p => {
      blocks.push({
        idx: p.idx,
        time: p.time,
        startAt: cycleEndTime + accuTime,
        endAt: cycleEndTime + accuTime + p.time,
        charger: useCharger
      });
      accuTime += p.time;
    });
    return { total: accuTime, blocks };
  },

  /* ============================================================
     ★ 电池等待时间事件驱动模拟 ★
     参数：
       cycles: 循环数
       T: 单次循环时间 (min) = 来回升降 + 飞行作业/循环数
          一个完整循环 = 升空去作业点 + 单次作业时间 + 回来降落
       N: 电池数量
       mode: 'generator' | 'threePhase' | 'dual'
       genTime: 发电机充电时间
       threeTime: 三相电充电时间

     算法（事件驱动）：
       - 每块电池跟踪 avail_time（可用时刻，初始0表示满电）
       - 充电器跟踪 free_at（空闲时刻）
       - 每轮循环：
         1. 找 avail_time <= 当前时间的电池
         2. 没有则等待到最早可用时刻
         3. 用最早可用的电池，飞行 T 分钟
         4. 用完后安排充电（选最早空闲的充电器）
         5. 更新该电池 avail_time = charge_end
         6. 记录该轮实际使用的充电器（影响瓶颈计算）

     单充电器：1个充电器（generator 或 threePhase 之一）
     双充电器：2个充电器（generator + threePhase 同时工作）

     返回：{ total, cycles, noWaitCount, batteries_final, cycleEnd }
       - cycles[i].charger = 该轮实际充电器（dual 模式可能是 threePhase 或 generator）
       - cycles[i].chargeTime = 该轮实际充电时间（用于精确计算瓶颈）
       - batteries_final = 所有电池的最终 avail_time（供结束后充电计算）
       - cycleEnd = 作业结束时刻
     ============================================================ */
  computeBatteryWait(cycles, T, N, mode, genTime, threeTime) {
    if (cycles <= 0 || N <= 0) return { total: 0, cycles: [], noWaitCount: 0, batteries_final: [], cycleEnd: 0 };
    if (cycles === 1) {
      const chgTime = mode === 'threePhase' ? threeTime : (mode === 'generator' ? genTime : Math.min(threeTime, genTime));
      return {
        total: 0,
        noWaitCount: 1,
        cycles: [{
          idx: 1, wait: 0, tStart: 0, tEnd: T, battery: 0,
          chargeStart: T, chargeEnd: T + chgTime,
          charger: mode === 'dual' ? 'threePhase' : mode,
          chargeTime: chgTime
        }],
        batteries_final: [{ avail_time: T + chgTime, idx: 0 }],
        cycleEnd: T
      };
    }

    // 初始化：N 块电池都满（avail_time = 0），跟踪电池索引
    const batteries = new Array(N).fill(0).map((_, i) => ({ avail_time: 0, idx: i }));

    // 充电器配置
    let charger1Time, charger2Time;
    if (mode === 'generator') {
      charger1Time = genTime;
      charger2Time = 0;
    } else if (mode === 'threePhase') {
      charger1Time = threeTime;
      charger2Time = 0;
    } else { // dual
      charger1Time = threeTime;
      charger2Time = genTime;
    }

    let charger1FreeAt = 0;
    let charger2FreeAt = 0;
    let waitTotal = 0;
    const cycleDetails = [];
    let noWaitCount = 0;

    for (let cycle = 0; cycle < cycles; cycle++) {
      let tNow = cycle * T + waitTotal;
      const cycleStart = tNow;

      // 找可用电池（avail_time <= tNow）
      let useBattery = null;
      let minAvail = Infinity;
      for (const b of batteries) {
        if (b.avail_time <= tNow) {
          if (b.avail_time < minAvail) {
            minAvail = b.avail_time;
            useBattery = b;
          }
        } else {
          if (b.avail_time < minAvail) {
            minAvail = b.avail_time;
          }
        }
      }

      // 没有可用电池，需要等待
      let thisWait = 0;
      if (useBattery === null) {
        thisWait = minAvail - tNow;
        waitTotal += thisWait;
        tNow = minAvail;
        for (const b of batteries) {
          if (b.avail_time <= tNow) {
            useBattery = b;
            break;
          }
        }
        if (useBattery === null) continue;
      } else {
        noWaitCount++;
      }

      const tEnd = tNow + T;
      const usedBatteryIdx = useBattery.idx;

      // 安排充电
      let chargeEnd, chargeStart, usedCharger;
      if (mode === 'dual') {
        if (charger1FreeAt <= charger2FreeAt) {
          chargeStart = Math.max(tEnd, charger1FreeAt);
          chargeEnd = chargeStart + charger1Time;
          charger1FreeAt = chargeEnd;
          usedCharger = 'threePhase';
        } else {
          chargeStart = Math.max(tEnd, charger2FreeAt);
          chargeEnd = chargeStart + charger2Time;
          charger2FreeAt = chargeEnd;
          usedCharger = 'generator';
        }
      } else {
        chargeStart = Math.max(tEnd, charger1FreeAt);
        chargeEnd = chargeStart + charger1Time;
        charger1FreeAt = chargeEnd;
        usedCharger = mode;
      }

      useBattery.avail_time = chargeEnd;

      cycleDetails.push({
        idx: cycle + 1,
        wait: thisWait,
        tStart: cycleStart,
        tEnd: tEnd,
        battery: usedBatteryIdx,
        chargeStart: chargeStart,
        chargeEnd: chargeEnd,
        charger: usedCharger,
        chargeTime: charger1Time && usedCharger === 'threePhase' ? (mode === 'dual' ? threeTime : charger1Time) :
                    (usedCharger === 'generator' ? (mode === 'dual' ? genTime : charger1Time) : charger1Time)
      });
    }

    // 计算作业结束时刻（最后一个循环的 tEnd）
    const cycleEnd = cycleDetails.length > 0 ? cycleDetails[cycleDetails.length - 1].tEnd : 0;

    // 返回 batteries_final 供结束后充电使用
    return {
      total: waitTotal,
      cycles: cycleDetails,
      noWaitCount: noWaitCount,
      batteries_final: batteries,
      cycleEnd: cycleEnd
    };
  },

  /* ============================================================
     ★★★ 吊运模式计算（HAUL）—— 与打药模式完全独立 ★★★
     ※ 历史上本文件曾有两个 computeHaul 定义（后定义覆盖前定义），
       现仅保留唯一实现。UI 传参形式：{ field, costs, income }
       （haulField/haulCosts/haulIncome 已展开），亦兼容
       { haul: { field, costs, income } } 完整 state 形式。
     公式：
       【收入】
         总收入(元) = 总斤数 × 吊运单价(毛) × 0.1
         例：1000斤 × 8毛 × 0.1 = 800元
       【电池循环】
         总躺数 = ⌈总斤数 ÷ 每躺斤数⌉         （一躺=一个来回）
         电池循环数 = ⌈总躺数 ÷ 每组电池躺数⌉  （多少躺换一次电池）
         电池循环成本 = 电池循环数 × (三相电 ? 三相电成本 : 普通成本)
       【无人机人工（按天）】
         无人机人工 = 人数 × 天数 × (日薪 + 餐费) + 住宿费 × 住宿天数
       【采摘人工（按斤，可选）】
         采摘人工 = 包采摘 ? 总斤数 × 采摘单价(毛) × 0.1 : 0
       【交通】
         油费 = 单程×2 × 油耗/100 × 油价
         车折旧 = 单程×2 × 元/公里
         交通 = 油费 + 车折旧 + 路桥费
       【设备折旧（按100斤）】
         设备折旧 = (总斤数 ÷ 100) × (无人机折旧 + 维修储备 + 保险)
       【其他】
         其他 = 防护装备 + 清洗费 + 杂费
       【汇总】
         总成本 = 电池循环 + 无人机人工 + 采摘人工 + 交通 + 设备折旧 + 其他
         利润 = 总收入 - 总成本
         每斤利润 = 利润 ÷ 总斤数
         每躺利润 = 利润 ÷ 总躺数
     ============================================================ */

  /**
   * 格式化数字显示（去掉小数尾零："2.50"→"2.5"，"2.00"→"2"，"100"→"100"）
   */
  fmt(num, decimals = 2) {
    if (typeof num !== 'number' || isNaN(num)) return '0';
    return num.toFixed(decimals)
      .replace(/(\.\d*?)0+$/, '$1')
      .replace(/\.$/, '');
  },

  /**
   * 格式化时长（min → "Xh Ymin" 紧凑格式）
   * 例：45 → "45min", 90 → "1h30min", 120 → "2h", 67 → "1h7min"
   */
  formatDuration(min) {
    if (typeof min !== 'number' || isNaN(min) || min < 0) min = 0;
    const totalMin = Math.round(min);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h === 0) return `${m}min`;
    if (m === 0) return `${h}h`;
    return `${h}h${m}min`;
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
  },

  /* ============================================================
     ★★★ 吊运模式计算（HAUL）—— 与打药模式完全独立 ★★★
     公式：
       【收入】
         总收入(元) = 总斤数 × 吊运单价(毛) × 0.1
         例：1000斤 × 8毛 × 0.1 = 800元
       【电池循环】
         总躺数 = ⌈总斤数 ÷ 每躺斤数⌉         （一躺=一个来回）
         电池循环数 = ⌈总躺数 ÷ 每组电池躺数⌉  （多少躺换一次电池）
         电池循环成本 = 电池循环数 × (三相电 ? 三相电成本 : 普通成本)
       【无人机人工（按天）】
         无人机人工 = 人数 × 天数 × (日薪 + 餐费) + 住宿费 × 住宿天数
       【采摘人工（按斤，可选）】
         采摘人工 = 包采摘 ? 总斤数 × 采摘单价(毛) × 0.1 : 0
       【交通】
         油费 = 单程×2 × 油耗/100 × 油价
         车折旧 = 单程×2 × 元/公里
         交通 = 油费 + 车折旧 + 路桥费
       【设备折旧（按100斤）】
         设备折旧 = (总斤数 ÷ 100) × (无人机折旧 + 维修储备 + 保险)
       【其他】
         其他 = 防护装备 + 清洗费 + 杂费
       【汇总】
         总成本 = 电池循环 + 无人机人工 + 采摘人工 + 交通 + 设备折旧 + 其他
         利润 = 总收入 - 总成本
         每斤利润 = 利润 ÷ 总斤数
         每躺利润 = 利润 ÷ 总躺数
     ============================================================ */
  computeHaul(state) {
    // 兼容两种调用形式：
    //   1. UI 传 { field, costs, income }（haulField/haulCosts/haulIncome 已展开）
    //   2. 完整 state 传 { haul: { field, costs, income } }
    const haul = state.haul || state;
    const totalWeight = Number(haul.field.totalWeight) || 0;
    const result = {
      totalWeight: totalWeight,        // 总斤数
      totalTrips: 0,                   // 总躺数（来回数）
      batteryCycles: 0,                // 电池循环数
      costBreakdown: {},               // 成本明细
      totalCost: 0,                    // 总成本
      income: 0,                       // 总收入
      profit: 0,                       // 利润
      profitPerJin: 0,                 // 每斤利润
      profitPerTrip: 0,                // 每躺利润
      costPerJin: 0,                   // 每斤成本
      pickupIncluded: haul.costs.pickupIncluded === true,
      flightHeight: haul.field.flightHeight
    };

    if (totalWeight <= 0) return result;

    /* 1. 总躺数（一躺=一个来回） */
    const weightPerTrip = Math.max(0.01, Number(haul.costs.weightPerTrip) || 1);
    result.totalTrips = Math.ceil(totalWeight / weightPerTrip);

    /* 2. 电池循环数 */
    const tripsPerCycle = Math.max(1, Number(haul.costs.tripsPerBatteryCycle) || 1);
    result.batteryCycles = Math.ceil(result.totalTrips / tripsPerCycle);

    /* 3. 电池循环成本 */
    const cycleUnitCost = haul.costs.useThreePhase
      ? Number(haul.costs.batteryCycleCostThreePhase) || 0
      : Number(haul.costs.batteryCycleCost) || 0;
    result.costBreakdown.cycle = result.batteryCycles * cycleUnitCost;

    /* 4. 无人机人工（按天） */
    const dWorkers = Number(haul.costs.droneWorkers) || 0;
    const dDays = Number(haul.costs.droneDays) || 0;
    const dWage = Number(haul.costs.droneDailyWage) || 0;
    const dMeal = Number(haul.costs.droneMealCost) || 0;
    const dAcc = Number(haul.costs.droneAccommodation) || 0;
    const dAccDays = Number(haul.costs.droneAccommodationDays) || 0;
    result.costBreakdown.droneLabor = dWorkers * dDays * (dWage + dMeal) + dAcc * dAccDays;

    /* 5. 采摘人工（按斤，可选） */
    if (result.pickupIncluded) {
      const pickupPricePerJin = Number(haul.costs.pickupPricePerJin) || 0;
      // 用户填的是"毛"，×0.1 转元
      result.costBreakdown.pickupLabor = totalWeight * pickupPricePerJin * 0.1;
    } else {
      result.costBreakdown.pickupLabor = 0;
    }

    /* 6. 交通 */
    const distance = Number(haul.costs.distance) || 0;
    const fuelConsumption = Number(haul.costs.fuelConsumption) || 0;
    const fuelPrice = Number(haul.costs.fuelPrice) || 0;
    const roundTripKm = distance * 2;
    const fuelCost = roundTripKm * (fuelConsumption / 100) * fuelPrice;
    const vehicleDep = roundTripKm * (Number(haul.costs.vehicleDepreciation) || 0);
    result.costBreakdown.transport = fuelCost + vehicleDep + (Number(haul.costs.tolls) || 0);

    /* 7. 设备折旧（按100斤） */
    const per100JinCost = (Number(haul.costs.droneDepreciation) || 0)
                        + (Number(haul.costs.maintenanceReserve) || 0)
                        + (Number(haul.costs.insurance) || 0);
    result.costBreakdown.equipment = (totalWeight / 100) * per100JinCost;

    /* 8. 其他 */
    result.costBreakdown.other = (Number(haul.costs.protectiveGear) || 0)
                               + (Number(haul.costs.cleaningCost) || 0)
                               + (Number(haul.costs.miscCost) || 0);

    /* 9. 汇总 */
    result.totalCost = Object.values(result.costBreakdown).reduce((a, b) => a + b, 0);

    /* 10. 总收入（用户填毛，×0.1 转元） */
    const pricePerJin = Number(haul.income.pricePerJin) || 0;
    result.income = totalWeight * pricePerJin * 0.1;

    /* 11. 利润 */
    result.profit = result.income - result.totalCost;
    result.profitPerJin = totalWeight > 0 ? result.profit / totalWeight : 0;
    result.profitPerTrip = result.totalTrips > 0 ? result.profit / result.totalTrips : 0;
    result.costPerJin = totalWeight > 0 ? result.totalCost / totalWeight : 0;

    return result;
  }
};

window.Calculator = Calculator;
