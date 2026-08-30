/* ============================================================
   calculator.js — 计算核心
   公式（打药模式统一走 computePlots，compute() 已删除）：
     药量（人工打药稀释水量口径）：
       果树林型（defaultBasis='tree'）
         按棵数：棵数 × 每棵水量 ÷ 一套药需水量 × 省药系数
         按亩数：亩数 × 每亩棵数 × 每棵水量 ÷ 一套药需水量 × 省药系数
       大田型（defaultBasis='area'）
         亩数 × 每亩水量 ÷ 一套药需水量 × 省药系数
     无人机实际喷洒水量 = 亩数 × 每亩水量（与药量口径独立）

     7舍8入取整：小数部分 ≥0.8 进1，否则舍去
       例：5.7→5，5.8→6，5.9→6
     实际用水量(升) = 亩数 × 每亩水量（无人机喷洒量）
     参考浓度(套/100升) = 取整后药量(套) ÷ 实际水量(升) × 100
     循环数 = ceil(亩数 / 单循环亩数)
     循环成本 = 电池折旧 × 循环数；本次油费整笔计入
     每次充电油钱 = 本次油费 ÷ 循环数（发电机模式=充电油耗参考）
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
     ★★★ 多地块模式计算（computePlots）★★★
     每地块：
       总水量 = 棵数×每棵水量（棵数基准）| 亩数×每亩水量（亩数基准）
       最少趟数 = ⌈总水量 ÷ 机载装药上限⌉（可手动覆盖趟数）
       每趟加药量 = 总水量 ÷ 趟数
       参考药量(套) = 7舍8入(该地块稀释水量 ÷ 一套药需水量 × 省药系数)（逐块保守取整后求和）
       单趟时间 = 转场往返(2×单程) + 加药装载 + 该趟喷洒时间
     汇总：
       电池循环成本按总面积 ÷ 单循环亩数（与单地块口径一致）
       电池等待按总趟数模拟（每次落地 = 一次换电竞争事件）
       总时长 = max(兑药总时长, 首批兑药 + 飞行阶段)（与单地块同一调度模型）
     ============================================================ */
  computePlots(state) {
    const { plant, field, costs, income, timing } = state;
    const plots = Array.isArray(field.plots) ? field.plots : [];
    const existingSets = Number(field.existingPesticideSets) || 0;
    const droneTank = Math.max(1, Number(field.droneTank) || 85);
    const spareWater = Math.max(0, Number(field.spareWater) || 0);
    const groupTripsOv = (field.groupTrips && typeof field.groupTrips === 'object') ? field.groupTrips : {};

    const t = timing || window.DEFAULT_TIMING || {};
    const flightSpeed = Math.max(0.01, Number(t.flightSpeed) || 2.5);
    const lineSpacing = Math.max(0.1, Number(t.lineSpacing) || 2);
    const roundTripTime = Math.max(0, Number(t.roundTripTime) || 0);
    const loadTime = Math.max(0, Number(t.loadTime) || 0);
    const baseMixTime = Math.max(0, Number(t.baseMixTime) || 0);
    const batchCapacity = Math.max(1, Number(t.batchCapacity) || 1000);
    const batteryCount = Math.max(1, Math.floor(Number(t.batteryCount) || 1));
    const genTime = Math.max(0.1, Number(t.generatorChargeTime) || 8);
    const threeTime = Math.max(0.1, Number(t.threePhaseChargeTime) || 5);
    const chargeMode = t.chargeMode || 'generator';

    const pesticideWaterPerSet = Math.max(0.01, Number(plant.pesticideWaterPerSet) || 1);
    const savingCoeff = Number(plant.droneSavingCoeff) || 1;

    /* 地块固定按亩数。药量按"人工打药稀释水量"口径：
       果树林型 = 面积×每亩棵数×每棵水量，大田型 = 面积×每亩水量；
       两者都再 ÷一套药需水量 × 省药系数 */
    const typeTree = (plant.defaultBasis || plant.calcMode) === 'tree';

    /* 第 1 步：逐地块原始数据（水量/药量/所属组） */
    const rows = [];
    plots.forEach((p, i) => {
      const area = Number(p.area) || 0;
      const water = area * (Number(plant.waterPerMu) || 0);
      const pesticideRaw = typeTree
        ? (area * (Number(plant.treesPerMu) || 0) * (Number(plant.waterPerTree) || 0)) / pesticideWaterPerSet * savingCoeff
        : water / pesticideWaterPerSet * savingCoeff;
      rows.push({
        id: p.id != null ? p.id : i,
        name: p.name || `地块${i + 1}`,
        area: area,
        water: water,
        farmerId: p.farmerId || 'farmer_default',
        groupId: Math.max(1, Math.round(Number(p.groupId) || 1)),
        flightMin: area > 0 ? (area * 666.67) / lineSpacing / flightSpeed / 60 : 0,
        pesticideRaw: pesticideRaw,
        pesticideRounded: 0
      });
    });

    /* 第 2 步：按组聚合——同组相邻地块连片连续作业，合并算趟数 */
    const groupMap = new Map();
    rows.forEach(r => {
      let g = groupMap.get(r.groupId);
      if (!g) {
        g = { id: r.groupId, water: 0, flightMin: 0, minTrips: 0, trips: 0, tripsOverride: 0, perTripWater: 0, perTripTime: 0 };
        groupMap.set(r.groupId, g);
      }
      g.water += r.water;
      g.flightMin += r.flightMin;
    });
    const groups = [...groupMap.values()].sort((a, b) => a.id - b.id);
    // 手动飞行时间：覆盖估算总飞行时长，按各组飞行占比分摊
    const rawFlightTotal = rows.reduce((sum, r) => sum + r.flightMin, 0);
    const manualFlightTime = Math.max(0, Number(t.manualFlightTime) || 0);
    const flightTimeSource = manualFlightTime > 0 ? 'manual' : 'estimate';
    const totalFlightMin = manualFlightTime > 0 ? manualFlightTime : rawFlightTotal;
    groups.forEach(g => {
      g.flightMin = rawFlightTotal > 0 ? g.flightMin / rawFlightTotal * totalFlightMin : 0;
    });

    groups.forEach(g => {
      const ov = Math.round(Number(groupTripsOv[g.id]) || 0);
      g.tripsOverride = ov > 0 ? ov : 0;
      g.minTrips = g.water > 0 ? Math.ceil(g.water / droneTank) : 0;
      g.trips = g.tripsOverride > 0 ? g.tripsOverride : g.minTrips;
      g.perTripWater = g.trips > 0 ? g.water / g.trips : 0;
      const perTripSpray = g.trips > 0 ? g.flightMin / g.trips : 0;
      g.perTripTime = roundTripTime + loadTime + perTripSpray;
    });
    // 回填每块地所属组的趟数信息（展示用）；药量保持小数（三层口径：块级不取整）
    rows.forEach(r => {
      const g = groupMap.get(r.groupId);
      r.groupTrips = g ? g.trips : 0;
      r.groupPerTripWater = g ? g.perTripWater : 0;
    });

    const totalArea = rows.reduce((sum, r) => sum + r.area, 0);
    const totalWater = rows.reduce((sum, r) => sum + r.water, 0);
    const totalAddWater = totalWater + spareWater;
    const totalTrips = groups.reduce((sum, g) => sum + g.trips, 0);
    const totalLoad = groups.reduce((sum, g) => sum + g.trips * loadTime, 0);
    const weightedTSum = groups.reduce((sum, g) => sum + g.trips * g.perTripTime, 0);

    const result = {
      plots: rows,
      groups: groups,
      plotMode: true,
      droneTank: droneTank,
      area: totalArea,
      water: totalWater,
      spareWater: spareWater,
      totalAddWater: totalAddWater,
      totalTrips: totalTrips,
      totalLoad: totalLoad,
      totalFlightMin: totalFlightMin,
      pesticide: 0, pesticideRounded: 0,
      existingSets: existingSets, needToBuy: 0, stockStatus: 'none',
      concentration: 0, cycles: 0,
      costBreakdown: {}, totalCost: 0, income: 0, profit: 0,
      costPerMu: 0, profitPerMu: 0,
      flightHeight: plant.flightHeight,
      pesticideIncluded: costs.pesticideIncluded === true
    };
    if (rows.length === 0) {
      result.timing = this._emptyPlotTiming();
      return result;
    }

    /* 药量三层口径：
       块级小数（pesticideRaw）→ 合计小数（usedSets，给农户看"用药量"）
       → 7舍8入取整（pesticideRounded = 采购量，作业方备药） */
    const usedSets = rows.reduce((s, r) => s + r.pesticideRaw, 0);
    result.pesticide = usedSets;                       // 合计小数用量
    result.usedSets = usedSets;
    result.pesticideRounded = this.round78(usedSets);  // 采购取整
    result.needToBuy = Math.max(0, result.pesticideRounded - existingSets);
    result.stockStatus = existingSets <= 0 ? 'none'
      : (existingSets >= result.pesticideRounded ? 'enough' : 'short');
    result.concentration = totalWater > 0 ? (usedSets / totalWater) * 100 : 0;

    /* 兑药批次：按总加水（计算水量+富余）算 */
    const mixRounds = totalAddWater > 0 ? Math.max(1, Math.ceil(totalAddWater / batchCapacity)) : 0;
    const mixTotalTime = mixRounds * baseMixTime;
    const firstMixTime = mixRounds > 0 ? baseMixTime : 0;

    /* 电池循环成本：按趟数（每次落地装药=一次电池竞争事件）×电池折旧；
       本次油费整笔计入；每次充电油钱 = 油费 ÷ 充电次数（发电机模式=充电油耗参考） */
    const tripsPerCycle = Math.max(1, Number(costs.tripsPerBatteryCyclePlot) || 6);
    result.cycles = Math.ceil(totalTrips / tripsPerCycle);
    const batteryDepreciation = Math.max(0, Number(costs.batteryDepreciation) || 0);
    const fuelExpense = Math.max(0, Number(costs.fuelExpense) || 0);
    result.costBreakdown.cycle = result.cycles * batteryDepreciation;
    result.costBreakdown.fuel = fuelExpense;
    result.perChargeOil = result.cycles > 0 ? fuelExpense / result.cycles : 0;

    /* 电池等待：按总趟数模拟（跨组合并排队），T 取加权平均单趟时间 */
    const avgT = totalTrips > 0 ? weightedTSum / totalTrips : 0;
    const batteryResult = this.computeBatteryWait(totalTrips, avgT, batteryCount, chargeMode, genTime, threeTime);
    const batteryWait = batteryResult.total;
    const flightSpan = totalTrips > 0 ? weightedTSum + batteryWait : 0;
    batteryResult.cycles.forEach(c => {
      c.tStart += firstMixTime; c.tEnd += firstMixTime;
      c.chargeStart += firstMixTime; c.chargeEnd += firstMixTime;
    });
    const afterWorkCharge = t.chargeAfterWork !== false ? this.computeAfterWorkCharge(
      batteryResult.batteries_final, batteryResult.cycleEnd, batteryCount, chargeMode, genTime, threeTime
    ) : { total: 0, blocks: [] };
    afterWorkCharge.blocks.forEach(b => { b.startAt += firstMixTime; b.endAt += firstMixTime; });

    const totalTime = Math.max(mixTotalTime, firstMixTime + flightSpan);

    /* 结算按农户聚合：面积/水量/药量线性归属，作业组不影响账务（低依赖高解耦）。
       打药钱 = 农户档案默认单价 × 其地块面积；档案无价（0）回退全局每亩收费 */
    const pesticidePrice = Number(costs.pesticidePrice) || 0;
    const farmerMeta = Array.isArray(state.farmers) ? state.farmers : [];
    const wo = state.workOrder || {};
    const selfByFarmer = (wo.selfByFarmer && typeof wo.selfByFarmer === 'object') ? wo.selfByFarmer : {};
    const farmerMap = new Map();
    rows.forEach(r => {
      const fid = r.farmerId || 'farmer_default';
      let f = farmerMap.get(fid);
      if (!f) {
        const meta = farmerMeta.find(x => x.id === fid);
        f = {
          farmerId: fid,
          farmerName: meta ? meta.name : '未知农户',
          area: 0, sprayFee: 0, usedSets: 0, selfSets: 0, supplementSets: 0, pesticideFee: 0,
          included: result.pesticideIncluded === true
        };
        farmerMap.set(fid, f);
      }
      f.area += r.area;
      f.usedSets += r.pesticideRaw;
    });
    farmerMap.forEach(f => {
      const meta = farmerMeta.find(x => x.id === f.farmerId);
      const price = (meta && meta.pricePerMu > 0) ? meta.pricePerMu : (Number(income.pricePerMu) || 0);
      f.sprayFee = f.area * price;
      // 凑药口径：农户自备部分不收钱，只收我们补充卖出的量
      f.selfSets = Math.max(0, Number(selfByFarmer[f.farmerId]) || 0);
      f.supplementSets = Math.max(0, f.usedSets - f.selfSets);
      f.pesticideFee = f.included ? f.supplementSets * pesticidePrice : 0;
    });
    result.settlement = [...farmerMap.values()].sort((a, b) => a.farmerName.localeCompare(b.farmerName, 'zh'));

    result.timing = {
      mixTotalTime: mixTotalTime, mixRounds: mixRounds, batchCapacity: batchCapacity,
      firstMixTime: firstMixTime, flightSpan: flightSpan,
      flightLength: 0, flightTimeMin: totalFlightMin, flightTimeSource: flightTimeSource,
      roundTripTotal: totalLoad, totalLoad: totalLoad,
      T: avgT, perCycleFlight: 0,
      batteryWait: batteryWait, batteryCycles: batteryResult.cycles,
      noWaitCount: batteryResult.noWaitCount,
      totalTime: totalTime,
      afterWorkCharge: afterWorkCharge.total, afterWorkBlocks: afterWorkCharge.blocks,
      totalTimeWithCharge: totalTime + afterWorkCharge.total,
      batteryCount: batteryCount, chargeMode: chargeMode,
      chargeAfterWork: t.chargeAfterWork !== false,
      plotUnits: '趟'
    };

    /* 成本/收入（与单地块同口径，面积取总面积） */
    result.costBreakdown.labor = (Number(costs.workers) || 0) * (Number(costs.days) || 0)
      * ((Number(costs.dailyWage) || 0) + (Number(costs.mealCost) || 0))
      + (Number(costs.accommodation) || 0) * (Number(costs.accommodationDays) || 0);
    result.costBreakdown.pesticide = result.pesticideIncluded
      ? result.needToBuy * (Number(costs.pesticidePrice) || 0) : 0;
    result.costBreakdown.equipment = totalArea * ((Number(costs.droneDepreciation) || 0)
      + (Number(costs.maintenanceReserve) || 0) + (Number(costs.insurance) || 0));
    result.costBreakdown.other = (Number(costs.protectiveGear) || 0)
      + (Number(costs.cleaningCost) || 0) + (Number(costs.miscCost) || 0);
    result.totalCost = Object.values(result.costBreakdown).reduce((a, b) => a + b, 0);
    result.income = result.settlement.reduce((sum, f) => sum + f.sprayFee, 0) + (Number(income.subsidy) || 0);
    result.profit = result.income - result.totalCost;
    result.costPerMu = totalArea > 0 ? result.totalCost / totalArea : 0;
    result.profitPerMu = totalArea > 0 ? result.profit / totalArea : 0;

    return result;
  },

  _emptyPlotTiming() {
    return {
      mixTotalTime: 0, mixRounds: 0, batchCapacity: 1000, firstMixTime: 0,
      flightSpan: 0, flightLength: 0, flightTimeMin: 0, flightTimeSource: 'estimate',
      roundTripTotal: 0, totalTransfer: 0, totalLoad: 0, T: 0, perCycleFlight: 0,
      batteryWait: 0, batteryCycles: [], noWaitCount: 0, totalTime: 0,
      afterWorkCharge: 0, afterWorkBlocks: [], totalTimeWithCharge: 0,
      batteryCount: 1, chargeMode: 'generator', chargeAfterWork: true, plotUnits: '趟'
    };
  },

  /**
   * 农户标准药量（按农户人工打药标准折算无人机用量）：
   * 亩数 × 人工每亩套数 × 省药系数 → 小数套数
   * 用途：农户按自己人工打药习惯报量时的参考（与标准参考并列，互不覆盖）
   */
  calcFarmerDose(totalArea, manualDosePerMu, plant) {
    const dose = Math.max(0, Number(manualDosePerMu) || 0);
    if (!dose || !plant) return 0;
    return Math.max(0, Number(totalArea) || 0) * dose * (Number(plant.droneSavingCoeff) || 1);
  },

  /**
   * 棵数速算药量（独立参考工具，不接地块/作业引擎）：
   * 棵数 × 每棵水量 ÷ 一套药需水量 × 省药系数 → 小数套数
   * 用途：农户不知道亩数、只说大致棵数时的药量参考
   */
  calcTreesPesticide(treeCount, plant) {
    const t = Math.max(0, Number(treeCount) || 0);
    if (!t || !plant) return 0;
    const perSet = Math.max(0.01, Number(plant.pesticideWaterPerSet) || 1);
    return (t * (Number(plant.waterPerTree) || 0)) / perSet * (Number(plant.droneSavingCoeff) || 1);
  },

  /**
   * 续药计算：剩余水量 ÷ 一套药需水量 × 省药系数 → 7舍8入
   */
  computeRefillSets(restWater, pesticideWaterPerSet, savingCoeff) {
    if (!(restWater > 0)) return 0;
    return this.round78(
      (restWater / Math.max(0.01, Number(pesticideWaterPerSet) || 1)) * (Number(savingCoeff) || 1)
    );
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

    /* 3. 电池循环成本：电池折旧×循环数；油费整笔计入 */
    const batteryDepreciation = Math.max(0, Number(haul.costs.batteryDepreciation) || 0);
    const fuelExpense = Math.max(0, Number(haul.costs.fuelExpense) || 0);
    result.costBreakdown.cycle = result.batteryCycles * batteryDepreciation;
    result.costBreakdown.fuel = fuelExpense;
    result.perChargeOil = result.batteryCycles > 0 ? fuelExpense / result.batteryCycles : 0;

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
