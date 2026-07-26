/* ============================================================
   storage.js — 本地存储 / 预设 / 历史记录 / 导入导出
   ============================================================ */

const Storage = {
  KEYS: {
    state: 'drone_spray_state_v1',
    presets: 'drone_spray_presets_v1',
    history: 'drone_spray_history_v1',
    theme: 'drone_spray_theme_v1'
  },

  /* ---------- 通用 ---------- */
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

  /* ---------- 主题 ---------- */
  getTheme() { return this.get(this.KEYS.theme, 'day'); },
  setTheme(t) { this.set(this.KEYS.theme, t); },

  /* ---------- 当前状态 ---------- */
  getState() {
    return this.get(this.KEYS.state, null);
  },
  saveState(state) { this.set(this.KEYS.state, state); },

  /* ---------- 预设管理 ---------- */
  getPresets() { return this.get(this.KEYS.presets, []); },

  savePreset(name, plant, state) {
    const presets = this.getPresets();
    const idx = presets.findIndex(p => p.name === name);
    const item = {
      name,
      plant: plant,
      state: JSON.parse(JSON.stringify(state)),
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

  /* ---------- 历史记录 ---------- */
  getHistory() { return this.get(this.KEYS.history, []); },

  addHistory(record) {
    const history = this.getHistory();
    history.unshift({
      ...record,
      time: new Date().toISOString()
    });
    // 仅保留最近 20 条
    if (history.length > 20) history.length = 20;
    this.set(this.KEYS.history, history);
  },

  clearHistory() { this.set(this.KEYS.history, []); },

  /* ---------- 导出为文本格式（易读） ---------- */
  exportText(state, plant) {
    const lines = [];
    lines.push('===== 无人机打药配置 =====');
    lines.push(`版本: 1.0`);
    lines.push(`导出时间: ${new Date().toLocaleString('zh-CN')}`);
    lines.push('');
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
    lines.push('');
    lines.push('【其他成本】');
    lines.push(`  一套药剂价格: ${state.costs.pesticidePrice} 元`);
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
    lines.push('');
    lines.push('===== 配置结束 =====');
    return lines.join('\n');
  },

  /* ---------- 导出为 JSON 格式（精确） ---------- */
  exportJSON(state, plant) {
    return JSON.stringify({
      type: 'drone-spray-config',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      plant: { ...plant },
      field: { ...state.field },
      costs: { ...state.costs },
      income: { ...state.income }
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
    const plant = obj.plant || { ...window.PLANT_DATABASE.fruit_tree };
    const field = obj.field || { ...window.DEFAULT_FIELD };
    const costs = Object.assign({}, window.DEFAULT_COSTS, obj.costs || {});
    const income = Object.assign({}, window.DEFAULT_INCOME, obj.income || {});
    return { plant, field, costs, income };
  },

  _parseTextFormat(text) {
    const result = {
      plant: { ...window.PLANT_DATABASE.fruit_tree },
      field: { ...window.DEFAULT_FIELD },
      costs: { ...window.DEFAULT_COSTS },
      income: { ...window.DEFAULT_INCOME }
    };

    // 提取【植物】行
    const plantMatch = text.match(/【植物】[^\n]*\((\w+=[\w_]+)\)/);
    if (plantMatch) {
      const mode = plantMatch[1].split('=')[1];
      result.plant.calcMode = mode;
    }

    // 提取植物名（去emoji）
    const plantNameMatch = text.match(/【植物】\s*(\S+)/);
    if (plantNameMatch) {
      const name = plantNameMatch[1].replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
      // 尝试匹配数据库
      const found = Object.values(window.PLANT_DATABASE).find(p => p.name === name);
      if (found) {
        result.plant = { ...found };
      } else {
        result.plant.name = name;
      }
    }

    // 字段映射表
    const fieldMap = {
      '飞行高度': ['plant', 'flightHeight', parseFloat],
      '每亩水量': ['plant', 'waterPerMu', parseFloat],
      '每亩棵数': ['plant', 'treesPerMu', parseFloat],
      '每棵水量': ['plant', 'waterPerTree', parseFloat],
      '一套药需水量': ['plant', 'pesticideWaterPerSet', parseFloat],
      '无人机省药系数': ['plant', 'droneSavingCoeff', parseFloat],
      '亩数': ['field', 'area', parseFloat],
      '单次循环成本': ['costs', 'cycleCost', parseFloat],
      '三相电循环成本': ['costs', 'cycleCostThreePhase', parseFloat],
      '单循环亩数': ['costs', 'cycleArea', parseFloat],
      '使用三相电': ['costs', 'useThreePhase', (v) => v === '是' || v === 'true'],
      '单程路程': ['costs', 'distance', parseFloat],
      '油耗': ['costs', 'fuelConsumption', parseFloat],
      '油价': ['costs', 'fuelPrice', parseFloat],
      '路桥费': ['costs', 'tolls', parseFloat],
      '车辆折旧': ['costs', 'vehicleDepreciation', parseFloat],
      '作业人数': ['costs', 'workers', parseFloat],
      '作业天数': ['costs', 'days', parseFloat],
      '每人日薪': ['costs', 'dailyWage', parseFloat],
      '每人每天餐费': ['costs', 'mealCost', parseFloat],
      '住宿费': ['costs', 'accommodation', parseFloat],
      '一套药剂价格': ['costs', 'pesticidePrice', parseFloat],
      '无人机折旧': ['costs', 'droneDepreciation', parseFloat],
      '维修保养储备': ['costs', 'maintenanceReserve', parseFloat],
      '防护装备': ['costs', 'protectiveGear', parseFloat],
      '清洗费用': ['costs', 'cleaningCost', parseFloat],
      '保险分摊': ['costs', 'insurance', parseFloat],
      '其他杂费': ['costs', 'miscCost', parseFloat],
      '每亩收费': ['income', 'pricePerMu', parseFloat],
      '补贴': ['income', 'subsidy', parseFloat]
    };

    const lines = text.split('\n');
    lines.forEach(line => {
      // 匹配 "  字段名: 值 单位" 形式
      const m = line.match(/^\s*([^:：【】]+)[:：]\s*([^\s\n]+)/);
      if (!m) return;
      const key = m[1].trim();
      const valStr = m[2].trim();
      if (fieldMap[key]) {
        const [group, field, parser] = fieldMap[key];
        result[group][field] = parser(valStr);
      }
    });

    return result;
  }
};

window.Storage = Storage;
