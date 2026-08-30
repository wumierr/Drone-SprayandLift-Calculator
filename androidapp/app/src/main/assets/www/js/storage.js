/* ============================================================
   storage.js — 本地存储 / 预设 / 历史记录 / 导入导出
   支持打药模式(spray) + 吊运模式(haul) 双模式
   ============================================================ */

const Storage = {
  KEYS: {
    state: 'drone_spray_state_v2',
    presets: 'drone_spray_presets_v2',
    history: 'drone_spray_history_v2',
    theme: 'drone_spray_theme_v1'
  },

  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) {
      console.warn('Storage.get failed:', key, e);
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('Storage.set failed:', key, e);
      return false;
    }
  },

  getTheme() { return this.get(this.KEYS.theme, 'day'); },
  setTheme(t) { this.set(this.KEYS.theme, t); },

  getState() { return this.get(this.KEYS.state, null); },
  saveState(state) { this.set(this.KEYS.state, state); },

  getPresets() { return this.get(this.KEYS.presets, []); },

  savePreset(name, mode, state) {
    const presets = this.getPresets();
    const idx = presets.findIndex(p => p.name === name);
    const item = {
      name,
      mode,
      plant: mode === 'spray' ? { ...state.plant } : null,
      field: { ...state.field },
      costs: { ...state.costs },
      income: { ...state.income },
      timing: state.timing ? { ...state.timing } : null,
      haulField: { ...state.haulField },
      haulCosts: { ...state.haulCosts },
      haulIncome: { ...state.haulIncome },
      savedAt: new Date().toISOString()
    };
    if (idx >= 0) presets[idx] = item;
    else presets.push(item);
    this.set(this.KEYS.presets, presets);
    return item;
  },

  deletePreset(name) {
    const presets = this.getPresets().filter(p => p.name !== name);
    this.set(this.KEYS.presets, presets);
  },

  getHistory() { return this.get(this.KEYS.history, []); },

  addHistory(record) {
    const history = this.getHistory();
    history.unshift({ ...record, time: new Date().toISOString() });
    if (history.length > 20) history.length = 20;
    this.set(this.KEYS.history, history);
  },

  clearHistory() { this.set(this.KEYS.history, []); },

  /* ---------- 导出为文本格式（易读，支持双模式） ---------- */
  exportText(state, mode) {
    const lines = [];
    lines.push('===== 无人机作业配置 =====');
    lines.push(`版本: 2.0`);
    lines.push(`模式: ${mode === 'haul' ? '吊运' : '打药'}`);
    lines.push(`导出时间: ${new Date().toLocaleString('zh-CN')}`);
    lines.push('');

    if (mode === 'haul') {
      // 吊运模式导出
      lines.push('【作业参数】');
      lines.push(`  总斤数: ${state.haulField.totalWeight} 斤`);
      lines.push(`  飞行高度: ${state.haulField.flightHeight} 米`);
      lines.push('');
      lines.push('【电池循环】');
      lines.push(`  电池循环成本: ${state.haulCosts.batteryCycleCost} 元`);
      lines.push(`  三相电循环成本: ${state.haulCosts.batteryCycleCostThreePhase} 元`);
      lines.push(`  一躺多少斤: ${state.haulCosts.weightPerTrip} 斤`);
      lines.push(`  多少躺一组电池: ${state.haulCosts.tripsPerBatteryCycle} 躺`);
      lines.push(`  使用三相电: ${state.haulCosts.useThreePhase ? '是' : '否'}`);
      lines.push('');
      lines.push('【无人机人工】');
      lines.push(`  无人机作业人数: ${state.haulCosts.droneWorkers}`);
      lines.push(`  无人机作业天数: ${state.haulCosts.droneDays}`);
      lines.push(`  每人日薪: ${state.haulCosts.droneDailyWage} 元`);
      lines.push(`  每人每天餐费: ${state.haulCosts.droneMealCost} 元`);
      lines.push(`  住宿费: ${state.haulCosts.droneAccommodation} 元/天`);
      lines.push(`  住宿天数: ${state.haulCosts.droneAccommodationDays}`);
      lines.push('');
      lines.push('【采摘人工】');
      lines.push(`  包采摘: ${state.haulCosts.pickupIncluded ? '是' : '否'}`);
      lines.push(`  采摘每斤单价: ${state.haulCosts.pickupPricePerJin} 毛`);
      lines.push('');
      lines.push('【交通成本】');
      lines.push(`  单程路程: ${state.haulCosts.distance} 公里`);
      lines.push(`  油耗: ${state.haulCosts.fuelConsumption} 升/100km`);
      lines.push(`  油价: ${state.haulCosts.fuelPrice} 元/升`);
      lines.push(`  路桥费: ${state.haulCosts.tolls} 元`);
      lines.push(`  车辆折旧: ${state.haulCosts.vehicleDepreciation} 元/公里`);
      lines.push('');
      lines.push('【其他成本】');
      lines.push(`  无人机折旧: ${state.haulCosts.droneDepreciation} 元/100斤`);
      lines.push(`  维修保养储备: ${state.haulCosts.maintenanceReserve} 元/100斤`);
      lines.push(`  防护装备: ${state.haulCosts.protectiveGear} 元/次`);
      lines.push(`  清洗费用: ${state.haulCosts.cleaningCost} 元/次`);
      lines.push(`  保险分摊: ${state.haulCosts.insurance} 元/100斤`);
      lines.push(`  其他杂费: ${state.haulCosts.miscCost} 元`);
      lines.push('');
      lines.push('【收入参数】');
      lines.push(`  吊运每斤单价: ${state.haulIncome.pricePerJin} 毛`);
    } else {
      // 打药模式导出
      const plant = state.plant;
      lines.push(`【植物】${plant.icon || ''} ${plant.name} (calcMode=${plant.calcMode})`);
      lines.push(`  飞行高度: ${plant.flightHeight} 米`);
      lines.push(`  每亩水量: ${plant.waterPerMu} 升`);
      lines.push(`  每亩棵数: ${plant.treesPerMu}`);
      lines.push(`  每棵水量: ${plant.waterPerTree} 升`);
      lines.push(`  一套药需水量: ${plant.pesticideWaterPerSet} 升`);
      lines.push(`  无人机省药系数: ${plant.droneSavingCoeff}`);
      lines.push('');
      lines.push('【作业参数】');
      lines.push(`  亩数: ${state.field.area}`);
      lines.push(`  现有药剂套数: ${state.field.existingPesticideSets}`);
      if (state.field.plotMode && Array.isArray(state.field.plots) && state.field.plots.length) {
        lines.push(`  机载装药上限: ${state.field.droneTank != null ? state.field.droneTank : 85} 升`);
        lines.push('');
        lines.push('【地块列表】');
        state.field.plots.forEach(p => {
          const parts = [`名称=${p.name || ''}`, `亩数=${p.area != null ? p.area : 0}`, `棵数=${p.treeCount != null ? p.treeCount : 0}`,
            `转场=${p.transferMin != null ? p.transferMin : 5}`, `趟数覆盖=${p.tripsOverride || 0}`];
          lines.push(`  [地块] ${parts.join(' | ')}`);
        });
      }
      lines.push('');
      lines.push('【循环成本】');
      lines.push(`  单次循环成本: ${state.costs.cycleCost} 元`);
      lines.push(`  三相电循环成本: ${state.costs.cycleCostThreePhase} 元`);
      lines.push(`  单循环亩数: ${state.costs.cycleArea} 亩`);
      lines.push(`  使用三相电: ${state.costs.useThreePhase ? '是' : '否'}`);
      lines.push('');
      lines.push('【交通成本】');
      lines.push(`  单程路程: ${state.costs.distance} 公里`);
      lines.push(`  油耗: ${state.costs.fuelConsumption} 升/100km`);
      lines.push(`  油价: ${state.costs.fuelPrice} 元/升`);
      lines.push(`  路桥费: ${state.costs.tolls} 元`);
      lines.push(`  车辆折旧: ${state.costs.vehicleDepreciation} 元/公里`);
      lines.push('');
      lines.push('【人工成本】');
      lines.push(`  作业人数: ${state.costs.workers}`);
      lines.push(`  作业天数: ${state.costs.days}`);
      lines.push(`  每人日薪: ${state.costs.dailyWage} 元`);
      lines.push(`  每人每天餐费: ${state.costs.mealCost} 元`);
      lines.push(`  住宿费: ${state.costs.accommodation} 元/天`);
      lines.push(`  住宿天数: ${state.costs.accommodationDays}`);
      lines.push('');
      lines.push('【其他成本】');
      lines.push(`  一套药剂价格: ${state.costs.pesticidePrice} 元`);
      lines.push(`  包药: ${state.costs.pesticideIncluded ? '是' : '否'}`);
      lines.push(`  无人机折旧: ${state.costs.droneDepreciation} 元/亩`);
      lines.push(`  维修保养储备: ${state.costs.maintenanceReserve} 元/亩`);
      lines.push(`  防护装备: ${state.costs.protectiveGear} 元/次`);
      lines.push(`  清洗费用: ${state.costs.cleaningCost} 元/次`);
      lines.push(`  保险分摊: ${state.costs.insurance} 元/亩`);
      lines.push(`  其他杂费: ${state.costs.miscCost} 元`);
      lines.push('');
      lines.push('【收入参数】');
      lines.push(`  每亩收费: ${state.income.pricePerMu} 元/亩`);
      lines.push(`  补贴: ${state.income.subsidy} 元`);
      // 时间参数
      if (state.timing) {
        lines.push('');
        lines.push('【时间参数】');
        lines.push(`  飞行速度: ${state.timing.flightSpeed} m/s`);
        lines.push(`  航线间距: ${state.timing.lineSpacing} 米`);
        lines.push(`  手动飞行时间: ${state.timing.manualFlightTime} min`);
        lines.push(`  来回升降时间: ${state.timing.roundTripTime} min/循环`);
        lines.push(`  加药装载时间: ${state.timing.loadTime != null ? state.timing.loadTime : 1} min/循环`);
        lines.push(`  基础兑药时间: ${state.timing.baseMixTime} min/轮`);
        lines.push(`  单批兑水量: ${state.timing.batchCapacity != null ? state.timing.batchCapacity : 1000} 升`);
        lines.push(`  拥有电池数量: ${state.timing.batteryCount} 块`);
        lines.push(`  发电机充电时间: ${state.timing.generatorChargeTime} min/块`);
        lines.push(`  三相电充电时间: ${state.timing.threePhaseChargeTime} min/块`);
        const modeLabels = { generator: '仅发电机', threePhase: '仅三相电', dual: '三相电+发电机' };
        lines.push(`  充电模式: ${state.timing.chargeMode} （${modeLabels[state.timing.chargeMode] || ''}）`);
        lines.push(`  作业结束充满电: ${state.timing.chargeAfterWork ? '是' : '否'}`);
      }
      // 工单覆盖值（已完成量在 JSON 中精确往返；文本段仅保留套数与备注）
      const wo = state.workOrder;
      if (wo && (wo.actualSets || wo.note)) {
        lines.push('');
        lines.push('【工单】');
        if (wo.actualSets) lines.push(`  实际用药套数: ${wo.actualSets}`);
        if (wo.note) lines.push(`  工单备注: ${wo.note}`);
      }
    }

    lines.push('');
    lines.push('===== 配置结束 =====');
    return lines.join('\n');
  },

  /* ---------- 导出为 JSON 格式（精确，支持双模式） ---------- */
  exportJSON(state, mode) {
    return JSON.stringify({
      type: 'drone-spray-config',
      version: '2.0',
      mode: mode,
      exportedAt: new Date().toISOString(),
      plant: mode === 'spray' ? { ...state.plant } : null,
      field: { ...state.field },
      costs: { ...state.costs },
      income: { ...state.income },
      timing: state.timing ? { ...state.timing } : null,
      haulField: { ...state.haulField },
      haulCosts: { ...state.haulCosts },
      haulIncome: { ...state.haulIncome },
      workOrder: state.workOrder ? { ...state.workOrder } : null
    }, null, 2);
  },

  /* ---------- 从文本导入（自动识别 JSON 或带【】文本） ---------- */
  importText(text) {
    if (!text || typeof text !== 'string') return null;
    text = text.trim();

    // 1. 尝试 JSON
    if (text.startsWith('{')) {
      try {
        const obj = JSON.parse(text);
        if (obj.type === 'drone-spray-config') {
          return this._normalizeImport(obj);
        }
      } catch (e) {
        console.warn('JSON parse failed, try text format', e);
      }
    }

    // 2. 尝试文本格式
    return this._parseTextFormat(text);
  },

  _normalizeImport(obj) {
    const woDefaults = { completedByPlot: {}, completedSingle: 0, actualSets: 0, note: '' };
    const result = {
      mode: obj.mode || 'spray',
      plant: obj.plant || { ...window.PLANT_DATABASE.fruit_tree },
      field: Object.assign({}, window.DEFAULT_FIELD, obj.field || {}),
      costs: Object.assign({}, window.DEFAULT_COSTS, obj.costs || {}),
      income: Object.assign({}, window.DEFAULT_INCOME, obj.income || {}),
      timing: Object.assign({}, window.DEFAULT_TIMING, obj.timing || {}),
      haulField: Object.assign({}, window.DEFAULT_HAUL_FIELD, obj.haulField || {}),
      haulCosts: Object.assign({}, window.DEFAULT_HAUL_COSTS, obj.haulCosts || {}),
      haulIncome: Object.assign({}, window.DEFAULT_HAUL_INCOME, obj.haulIncome || {}),
      workOrder: Object.assign({}, woDefaults, obj.workOrder || {})
    };
    return result;
  },

  _parseTextFormat(text) {
    const result = {
      mode: 'spray',
      plant: { ...window.PLANT_DATABASE.fruit_tree },
      field: { ...window.DEFAULT_FIELD },
      costs: { ...window.DEFAULT_COSTS },
      income: { ...window.DEFAULT_INCOME },
      timing: { ...window.DEFAULT_TIMING },
      haulField: { ...window.DEFAULT_HAUL_FIELD },
      haulCosts: { ...window.DEFAULT_HAUL_COSTS },
      haulIncome: { ...window.DEFAULT_HAUL_INCOME },
      workOrder: { completedByPlot: {}, completedSingle: 0, actualSets: 0, note: '' }
    };

    // 检测模式
    if (text.includes('模式: 吊运') || text.includes('【吊运') || text.includes('【电池循环】') && text.includes('一躺多少斤')) {
      result.mode = 'haul';
    }

    // 字段映射表（打药 + 吊运合并）
    const fieldMap = {
      // 打药-植物
      '飞行高度': ['plant', 'flightHeight', parseFloat],
      '每亩水量': ['plant', 'waterPerMu', parseFloat],
      '每亩棵数': ['plant', 'treesPerMu', parseFloat],
      '每棵水量': ['plant', 'waterPerTree', parseFloat],
      '一套药需水量': ['plant', 'pesticideWaterPerSet', parseFloat],
      '无人机省药系数': ['plant', 'droneSavingCoeff', parseFloat],
      // 打药-作业
      '亩数': ['field', 'area', parseFloat],
      '机载装药上限': ['field', 'droneTank', parseFloat],
      '现有药剂套数': ['field', 'existingPesticideSets', parseFloat],
      // 打药-循环
      '单次循环成本': ['costs', 'cycleCost', parseFloat],
      '三相电循环成本': ['costs', 'cycleCostThreePhase', parseFloat],
      '单循环亩数': ['costs', 'cycleArea', parseFloat],
      // 打药-人工
      '作业人数': ['costs', 'workers', parseFloat],
      '作业天数': ['costs', 'days', parseFloat],
      '每人日薪': ['costs', 'dailyWage', parseFloat],
      '每人每天餐费': ['costs', 'mealCost', parseFloat],
      '住宿费': ['costs', 'accommodation', parseFloat],
      '住宿天数': ['costs', 'accommodationDays', parseFloat],
      // 打药-其他
      '一套药剂价格': ['costs', 'pesticidePrice', parseFloat],
      '无人机折旧': ['costs', 'droneDepreciation', parseFloat],
      '维修保养储备': ['costs', 'maintenanceReserve', parseFloat],
      '防护装备': ['costs', 'protectiveGear', parseFloat],
      '清洗费用': ['costs', 'cleaningCost', parseFloat],
      '保险分摊': ['costs', 'insurance', parseFloat],
      '其他杂费': ['costs', 'miscCost', parseFloat],
      // 打药-收入
      '每亩收费': ['income', 'pricePerMu', parseFloat],
      '补贴': ['income', 'subsidy', parseFloat],
      // 工单
      '实际用药套数': ['workOrder', 'actualSets', parseFloat],
      '工单备注': ['workOrder', 'note', (v) => v],
      // 时间参数
      '飞行速度': ['timing', 'flightSpeed', parseFloat],
      '航线间距': ['timing', 'lineSpacing', parseFloat],
      '手动飞行时间': ['timing', 'manualFlightTime', parseFloat],
      '来回升降时间': ['timing', 'roundTripTime', parseFloat],
      '加药装载时间': ['timing', 'loadTime', parseFloat],
      '基础兑药时间': ['timing', 'baseMixTime', parseFloat],
      '单批兑水量': ['timing', 'batchCapacity', parseFloat],
      '拥有电池数量': ['timing', 'batteryCount', parseFloat],
      '发电机充电时间': ['timing', 'generatorChargeTime', parseFloat],
      '三相电充电时间': ['timing', 'threePhaseChargeTime', parseFloat],
      // 注：旧版导出的"兑水速度"行已废弃，无映射时自动忽略
      '充电模式': ['timing', 'chargeMode', (v) => ({
        '仅发电机': 'generator',
        '仅三相电': 'threePhase',
        '三相电+发电机': 'dual'
      }[v] || v)],
      // 吊运-作业
      '总斤数': ['haulField', 'totalWeight', parseFloat],
      // 吊运-电池循环
      '电池循环成本': ['haulCosts', 'batteryCycleCost', parseFloat],
      '一躺多少斤': ['haulCosts', 'weightPerTrip', parseFloat],
      '多少躺一组电池': ['haulCosts', 'tripsPerBatteryCycle', parseFloat],
      // 吊运-无人机人工
      '无人机作业人数': ['haulCosts', 'droneWorkers', parseFloat],
      '无人机作业天数': ['haulCosts', 'droneDays', parseFloat],
      // 吊运-采摘
      '采摘每斤单价': ['haulCosts', 'pickupPricePerJin', parseFloat],
      // 吊运-收入
      '吊运每斤单价': ['haulIncome', 'pricePerJin', parseFloat]
    };

    // 布尔字段映射
    const boolMap = {
      '使用三相电': ['costs', 'useThreePhase'],
      '包药': ['costs', 'pesticideIncluded'],
      '包采摘': ['haulCosts', 'pickupIncluded'],
      '作业结束充满电': ['timing', 'chargeAfterWork']
    };

    // 吊运模式：同名标签实际属于 haulCosts。
    // 必须在逐行解析前覆盖 fieldMap，否则会被打药映射抢先命中，
    // 把吊运数值误写入 costs 并丢失 haulCosts 的真实值（历史 bug）。
    if (result.mode === 'haul') {
      Object.assign(fieldMap, {
        '三相电循环成本': ['haulCosts', 'batteryCycleCostThreePhase', parseFloat],
        '每人日薪': ['haulCosts', 'droneDailyWage', parseFloat],
        '每人每天餐费': ['haulCosts', 'droneMealCost', parseFloat],
        '住宿费': ['haulCosts', 'droneAccommodation', parseFloat],
        '住宿天数': ['haulCosts', 'droneAccommodationDays', parseFloat],
        '防护装备': ['haulCosts', 'protectiveGear', parseFloat],
        '清洗费用': ['haulCosts', 'cleaningCost', parseFloat],
        '维修保养储备': ['haulCosts', 'maintenanceReserve', parseFloat],
        '保险分摊': ['haulCosts', 'insurance', parseFloat],
        '无人机折旧': ['haulCosts', 'droneDepreciation', parseFloat],
        '其他杂费': ['haulCosts', 'miscCost', parseFloat]
      });
    }

    // 通用字段（两种模式都有，需根据模式分配）
    const commonFields = ['distance', 'fuelConsumption', 'fuelPrice', 'tolls', 'vehicleDepreciation', 'miscCost'];
    const commonLabels = {
      '单程路程': 'distance',
      '油耗': 'fuelConsumption',
      '油价': 'fuelPrice',
      '路桥费': 'tolls',
      '车辆折旧': 'vehicleDepreciation'
    };

    const lines = text.split('\n');
    lines.forEach(line => {
      // 地块行（多地块模式）：  [地块] 名称=xx | 亩数=12 | 棵数=0 | 转场=5 | 趟数覆盖=0
      if (line.includes('[地块]')) {
        const kv = {};
        line.replace(/^\s*\[地块\]\s*/, '').split('|').forEach(seg => {
          const idx = seg.indexOf('=');
          if (idx > -1) kv[seg.slice(0, idx).trim()] = seg.slice(idx + 1).trim();
        });
        result.field.plotMode = true;
        if (!Array.isArray(result.field.plots)) result.field.plots = [];
        result.field.plots.push({
          id: 'imp' + result.field.plots.length,
          name: kv['名称'] || '',
          area: parseFloat(kv['亩数']) || 0,
          treeCount: parseFloat(kv['棵数']) || 0,
          transferMin: parseFloat(kv['转场']) != null && !isNaN(parseFloat(kv['转场'])) ? parseFloat(kv['转场']) : 5,
          tripsOverride: parseFloat(kv['趟数覆盖']) || 0
        });
        return;
      }
      // 匹配 "  字段名: 值 单位" 形式
      const m = line.match(/^\s*([^:：【】]+)[:：]\s*([^\s\n]+)/);
      if (!m) return;
      const key = m[1].trim();
      const valStr = m[2].trim();

      // 布尔字段
      if (boolMap[key]) {
        const [group, field] = boolMap[key];
        result[group][field] = (valStr === '是' || valStr === 'true');
        return;
      }

      // 数值字段
      if (fieldMap[key]) {
        const [group, field, parser] = fieldMap[key];
        result[group][field] = parser(valStr);
        return;
      }

      // 通用字段（根据模式分配）
      if (commonLabels[key]) {
        const fieldName = commonLabels[key];
        if (result.mode === 'haul') {
          result.haulCosts[fieldName] = parseFloat(valStr) || 0;
        } else {
          result.costs[fieldName] = parseFloat(valStr) || 0;
        }
        return;
      }
    });

    // 提取植物名（打药模式）
    if (result.mode === 'spray') {
      const plantNameMatch = text.match(/【植物】\s*(\S+)/);
      if (plantNameMatch) {
        const name = plantNameMatch[1].replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
        const found = Object.values(window.PLANT_DATABASE).find(p => p.name === name);
        if (found) result.plant = { ...found };
        else result.plant.name = name;
      }
    }

    return result;
  }
};

window.Storage = Storage;
