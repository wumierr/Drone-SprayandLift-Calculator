/* ============================================================
   ui.js — UI 渲染与交互（支持打药/吊运双模式）
   ============================================================ */

const UI = {
  state: {
    mode: 'spray',              // 'spray' | 'haul'
    // 打药模式状态
    plant: null,
    field: { ...DEFAULT_FIELD },
    costs: { ...DEFAULT_COSTS },
    income: { ...DEFAULT_INCOME },
    timing: { ...DEFAULT_TIMING },     // 作业时间参数
    // 吊运模式状态（完全独立）
    haulField: { ...DEFAULT_HAUL_FIELD },
    haulCosts: { ...DEFAULT_HAUL_COSTS },
    haulIncome: { ...DEFAULT_HAUL_INCOME },
    // 作业工单覆盖层（已完成量/实际用药/备注）
    workOrder: { completedByPlot: {}, completedSingle: 0, actualSets: 0, note: '' },
    // 农户档案库（独立存储键，不随作业状态保存）
    farmers: [],
    // 电池循环台账（独立存储键，跨任务累计）
    batteries: { list: [], records: [] }
  },

  /* ---------- 初始化 ---------- */
  init() {
    this.loadTypes();
    this.loadState();
    this.loadFarmers();
    this.loadBatteries();
    this.bindModeSwitcher();
    this.bindEvents();
    this.bindBatteryLedger();
    this.applyMode(this.state.mode);
    this.renderBatteryLedger();
    this.applyTheme(Storage.getTheme());
  },

  /* ============================================================
     ★★★ 用药类型库（自定义增减）★★★
     - 内置定义在 data.js PLANT_DATABASE（杀菌/果蝇），
       用户增改后的完整库存 localStorage（Storage.getTypes/saveTypes）
     - state.plant 仍存选中类型快照（内部字段名沿用，兼容旧存档/预设）
     - 旧存档/旧预设中的作物快照加载时自动注册为自定义类型
     ============================================================ */
  loadTypes() {
    const saved = Storage.getTypes();
    if (Array.isArray(saved) && saved.length > 0) {
      // 补齐 builtin 标记（内置 key 恒为 builtin）
      this.typeLibrary = saved.map(t => ({ ...t, builtin: !!window.PLANT_DATABASE[t.key]?.builtin && !t._modified }));
    } else {
      this.typeLibrary = Object.entries(window.PLANT_DATABASE).map(([key, t]) => ({ key, ...t }));
    }
    Storage.saveTypes(this.typeLibrary);
  },

  saveTypes() {
    Storage.saveTypes(this.typeLibrary);
  },

  getType(key) {
    return this.typeLibrary.find(t => t.key === key) || null;
  },

  /* 旧存档/导入的类型快照若不在库中 → 注册为自定义类型，返回可用 key */
  registerTypeSnapshot(snapshot) {
    if (!snapshot || !snapshot.name) return null;
    const existing = this.typeLibrary.find(t => t.name === snapshot.name);
    if (existing) return existing.key;
    const key = 'custom_' + Date.now().toString(36) + '_' + this.typeLibrary.length;
    this.typeLibrary.push({
      key,
      name: snapshot.name,
      icon: snapshot.icon || '🧪',
      defaultBasis: snapshot.defaultBasis || (snapshot.calcMode === 'tree' ? 'tree' : 'area'),
      flightHeight: snapshot.flightHeight != null ? snapshot.flightHeight : 2,
      waterPerMu: snapshot.waterPerMu != null ? snapshot.waterPerMu : 20,
      treesPerMu: snapshot.treesPerMu != null ? snapshot.treesPerMu : 0,
      waterPerTree: snapshot.waterPerTree != null ? snapshot.waterPerTree : 0,
      pesticideWaterPerSet: snapshot.pesticideWaterPerSet != null ? snapshot.pesticideWaterPerSet : 300,
      droneSavingCoeff: snapshot.droneSavingCoeff != null ? snapshot.droneSavingCoeff : 0.7,
      description: snapshot.description || '（从旧数据自动导入的类型）',
      notes: snapshot.notes || '',
      builtin: false
    });
    this.saveTypes();
    return key;
  },

  /* ---------- 加载已保存状态 ---------- */
  loadState() {
    const saved = Storage.getState();
    if (saved) {
      this.state.mode = saved.mode || 'spray';
      // 先合并 field（拿到存档里的 plantKey），再解析类型快照
      if (saved.field) this.state.field = { ...this.state.field, ...saved.field };
      if (saved.plant) this.state.plant = { ...saved.plant };
      else this.state.plant = { ...PLANT_DATABASE[this.state.field.plantKey || 'shajun'] };
      // 快照不在类型库中（旧作物存档）→ 自动注册为自定义类型
      let key = this.state.field.plantKey;
      if (!key || !this.getType(key)) {
        key = this.registerTypeSnapshot(this.state.plant) || key;
      }
      const libType = this.getType(key);
      if (libType) this.state.plant = { ...libType };
      this.state.field.plantKey = key;
      // 迁移发生时立即持久化新 plantKey，避免每次刷新重复注册
      if (key !== (saved.field || {}).plantKey) this.save();
      if (saved.costs) this.state.costs = { ...this.state.costs, ...saved.costs };
      if (saved.income) this.state.income = { ...this.state.income, ...saved.income };
      if (saved.timing) this.state.timing = { ...this.state.timing, ...saved.timing };
      if (saved.haulField) this.state.haulField = { ...this.state.haulField, ...saved.haulField };
      if (saved.haulCosts) this.state.haulCosts = { ...this.state.haulCosts, ...saved.haulCosts };
      if (saved.haulIncome) this.state.haulIncome = { ...this.state.haulIncome, ...saved.haulIncome };
      if (saved.workOrder) {
        this.state.workOrder = {
          ...{ completedByPlot: {}, completedSingle: 0, actualSets: 0, note: '' },
          ...saved.workOrder
        };
      }
      this.ensurePlots();
    } else {
      this.state.plant = { ...PLANT_DATABASE[this.state.field.plantKey || 'shajun'] };
      this.ensurePlots();
    }
  },

  /* 地块列表为空时按旧字段合成一张卡（单/多地块统一后的迁移） */
  ensurePlots() {
    const f = this.state.field;
    if (!Array.isArray(f.plots)) f.plots = [];
    if (f.plots.length === 0) {
      let area = Number(f.area) || 0;
      // 旧存档按棵数填的地块换算成亩数（棵数÷每亩棵数），零丢失
      const treeCount = Number(f.treeCount) || 0;
      const tpm = (this.state.plant && this.state.plant.treesPerMu) || 0;
      if (!area && treeCount > 0 && tpm > 0) area = treeCount / tpm;
      f.plots = [{
        id: 'p_default',
        name: '地块1',
        area: area,
        groupId: 1,
        farmerId: 'farmer_default'
      }];
    }
  },

  /* 类型的默认计算基准（兼容旧 calcMode 字段） */
  getBasisOf(plant) {
    const b = plant.defaultBasis || plant.calcMode;
    return b === 'tree' ? 'tree' : 'area';
  },

  /* ---------- 模式切换 ---------- */
  bindModeSwitcher() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchMode(btn.dataset.mode);
      });
    });
  },

  switchMode(mode) {
    if (mode !== 'spray' && mode !== 'haul') return;
    this.state.mode = mode;
    this.applyMode(mode);
    this.save();
    this.compute();
  },

  applyMode(mode) {
    this.state.mode = mode;
    // 切换按钮高亮
    document.querySelectorAll('.mode-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
    // 切换结果显示
    document.getElementById('sprayResults').style.display = mode === 'spray' ? '' : 'none';
    document.getElementById('haulResults').style.display = mode === 'haul' ? '' : 'none';
    // 模式标签
    document.getElementById('modeTag').textContent = mode === 'spray' ? '打药模式' : '吊运模式';
    // 工单按钮仅打药模式可用
    const woBtn = document.getElementById('workOrderBtn');
    if (woBtn) woBtn.style.display = mode === 'spray' ? '' : 'none';
    // 类型面板和预设栏：仅打药模式显示
    const plantPanel = document.querySelector('.plant-panel');
    if (plantPanel) plantPanel.style.display = mode === 'spray' ? '' : 'none';
    // 作业时间面板和时间参数面板：仅打药模式显示
    const timingPanel = document.getElementById('timingPanel');
    const timingParamPanel = document.getElementById('timingParamPanel');
    if (timingPanel) timingPanel.style.display = mode === 'spray' ? '' : 'none';
    if (timingParamPanel) timingParamPanel.style.display = mode === 'spray' ? '' : 'none';
    // 电池循环台账：仅打药模式显示（充电次数来自打药计算）
    const batteryPanel = document.getElementById('batteryPanel');
    if (batteryPanel) batteryPanel.style.display = mode === 'spray' ? '' : 'none';
    // 重新渲染表单和结果
    this.renderAll();
    // 渲染完后立即计算一次，确保结果区域有值
    this.compute();
  },

  renderAll() {
    if (this.state.mode === 'spray') {
      this.renderTypeGrid();
      this.updatePlantInfo();
      this.renderParamForm();
      this.renderCostTabs();
      this.renderIncomeForm();
      this.renderTimingForm();
    } else {
      this.renderHaulParamForm();
      this.renderHaulCostTabs();
      this.renderHaulIncomeForm();
    }
  },

  /* ============================================================
     ★★ 打药模式（用药类型 + 计算）★★
     ============================================================ */

  renderTypeGrid() {
    const grid = document.getElementById('plantGrid');
    grid.innerHTML = '';
    this.typeLibrary.forEach(t => {
      const card = document.createElement('div');
      card.className = 'plant-card';
      card.dataset.key = t.key;
      if (this.state.plant && this.state.plant.name === t.name) card.classList.add('active');
      card.innerHTML = `<span class="p-icon">${t.icon}</span><span class="p-name">${this.escapeHtml(t.name)}</span>`;
      card.addEventListener('click', () => this.selectType(t.key));
      grid.appendChild(card);
    });
  },

  selectType(key) {
    const t = this.getType(key);
    if (!t) return;
    this.state.plant = { ...t };
    this.state.field.plantKey = key;
    document.querySelectorAll('.plant-card').forEach(c => {
      c.classList.toggle('active', c.dataset.key === key);
    });
    // 套用类型推荐参数（飞行高度随类型快照自带；间距/速度写入时间参数，覆盖当前值）
    const applied = [];
    if (t.lineSpacing != null) { this.state.timing.lineSpacing = t.lineSpacing; applied.push(`间距${t.lineSpacing}米`); }
    if (t.flightSpeed != null) { this.state.timing.flightSpeed = t.flightSpeed; applied.push(`速度${t.flightSpeed}m/s`); }
    if (t.flightHeight != null) applied.push(`高度${t.flightHeight}米`);
    this.syncTimingFormFromState();
    if (applied.length) this.toast(`已套用「${t.name}」推荐参数（${applied.join(' / ')}），可再调`, 'success');
    this.updatePlantInfo();
    this.syncParamFormFromPlant();
    if (this._treeQuickRender) this._treeQuickRender();   // 速算卡按新类型参数重算
    this.compute();
    this.save();
  },

  /* ---------- 用药类型 CRUD ---------- */
  openTypeModal(key) {
    this._editingTypeKey = key || null;
    this.renderTypeForm();
    this.openModal('typeModal');
  },

  renderTypeForm() {
    const form = document.getElementById('typeForm');
    if (!form) return;
    const t = this._editingTypeKey ? this.getType(this._editingTypeKey) : null;
    const v = (k, dflt) => (t && t[k] != null ? t[k] : dflt);
    const F = (label, id, type, val, tip) => `
      <div class="field">
        <label>${label}${tip ? ` <i class="tip" data-tip="${this.escapeHtml(tip)}">i</i>` : ''}</label>
        <input type="${type}" id="${id}" value="${this.escapeHtml(String(val))}">
      </div>`;
    form.innerHTML = `
      ${F('类型名称 *', 'tf-name', 'text', v('name', ''), '如：杀菌、果蝇、晚熟桃膨大期')}
      ${F('图标', 'tf-icon', 'text', v('icon', '🧪'), '一个 emoji，显示在类型卡片上')}
      ${F('每亩水量 (升)', 'tf-waterPerMu', 'number', v('waterPerMu', 20), '该作业每亩喷洒的药液量')}
      ${F('一套药需水量 (升)', 'tf-perSet', 'number', v('pesticideWaterPerSet', 300), '一整套药剂对应需要的水量')}
      ${F('省药系数', 'tf-coeff', 'number', v('droneSavingCoeff', 0.7), '0.7 表示比人工省 30%')}
      ${F('飞行高度 (米)', 'tf-height', 'number', v('flightHeight', 2), '距作物冠层的高度')}
      ${F('航线间距 (米)', 'tf-lineSpacing', 'number', v('lineSpacing', 4), '相邻航线间距，选类型时套用到时间参数')}
      ${F('飞行速度 (m/s)', 'tf-flightSpeed', 'number', v('flightSpeed', 2), '作业飞行速度，选类型时套用到时间参数')}
      ${F('每亩棵数 (按棵数计算用)', 'tf-treesPerMu', 'number', v('treesPerMu', 80), '按棵数计算时用于亩数反推，可留 0')}
      ${F('每棵水量 (升，按棵数计算用)', 'tf-waterPerTree', 'number', v('waterPerTree', 3), '单棵树喷洒量，可留 0')}
      <div class="field" style="grid-column: 1 / -1;">
        <label>说明</label>
        <input type="text" id="tf-desc" value="${this.escapeHtml(v('description', ''))}" placeholder="如：雨后补喷注意加减量">
      </div>`;
  },

  saveTypeForm() {
    const get = id => document.getElementById(id)?.value;
    const num = (id, dflt) => { const v = parseFloat(get(id)); return isNaN(v) ? dflt : v; };
    const name = (get('tf-name') || '').trim();
    if (!name) {
      this.toast('请填写类型名称', 'warn');
      return;
    }
    const entry = {
      key: this._editingTypeKey || ('custom_' + Date.now().toString(36)),
      name,
      icon: (get('tf-icon') || '🧪').slice(0, 4),
      defaultBasis: this._editingTypeKey ? (this.getBasisOf(this.getType(this._editingTypeKey) || {})) : 'tree',
      flightHeight: num('tf-height', 2),
      lineSpacing: num('tf-lineSpacing', 4),
      flightSpeed: num('tf-flightSpeed', 2),
      waterPerMu: num('tf-waterPerMu', 20),
      treesPerMu: num('tf-treesPerMu', 0),
      waterPerTree: num('tf-waterPerTree', 0),
      pesticideWaterPerSet: num('tf-perSet', 300),
      droneSavingCoeff: num('tf-coeff', 0.7),
      description: get('tf-desc') || '',
      notes: this._editingTypeKey ? (this.getType(this._editingTypeKey)?.notes || '') : '',
      builtin: false   // 用户改过/新建的一律视为自定义（可删除）
    };
    const idx = this.typeLibrary.findIndex(t => t.key === entry.key);
    if (idx >= 0) this.typeLibrary[idx] = entry;
    else this.typeLibrary.push(entry);
    this.saveTypes();
    // 选中它
    this.state.plant = { ...entry };
    this.state.field.plantKey = entry.key;
    this.renderTypeGrid();
    this.updatePlantInfo();
    this.syncParamFormFromPlant();
    this.updateCalcBasisVisibility();
    this.compute();
    this.save();
    this.closeModal('typeModal');
    this.toast(`类型「${name}」已保存`, 'success');
  },

  deleteCurrentType() {
    const key = this.state.field.plantKey;
    const t = this.getType(key);
    if (!t) return;
    if (this.typeLibrary.length <= 1) {
      this.toast('至少保留一个类型', 'warn');
      return;
    }
    this.confirmDialog(`删除类型「${t.name}」？`, () => {
      this.typeLibrary = this.typeLibrary.filter(x => x.key !== key);
      const first = this.typeLibrary[0];
      this.state.plant = { ...first };
      this.state.field.plantKey = first.key;
      this.saveTypes();
      this.renderTypeGrid();
      this.updatePlantInfo();
      this.syncParamFormFromPlant();
      this.compute();
      this.save();
      this.closeModal('typeModal');
      this.toast(`类型「${t.name}」已删除`, 'warn');
    });
  },

  /* ============================================================
     ★★★ 农户档案库 ★★★
     - 独立存储键 drone_spray_farmers_v1，不随作业状态保存
     - 迁移：工单里已填的 farmerName 自动建为同名档案；
       地块 farmerId 缺失/失效时归入"默认农户"
     ============================================================ */
  loadFarmers() {
    const saved = Storage.getFarmers();
    this.state.farmers = (Array.isArray(saved) && saved.length)
      ? saved
      : [{ id: 'farmer_default', name: '默认农户', phone: '', pricePerMu: 0, typeId: '', notes: '', enabled: true }];
    const fn = (this.state.field.farmerName || '').trim();
    if (fn && !this.state.farmers.find(f => f.name === fn)) {
      this.state.farmers.push({
        id: 'farmer_' + Date.now().toString(36),
        name: fn, phone: '', pricePerMu: 0, typeId: '',
        notes: '（从工单自动导入）', enabled: true
      });
      this.state.field.farmerName = '';
      this.state.workOrder.farmerNameDone = true;
    }
    if (!this.state.farmers.find(f => f.id === 'farmer_default')) {
      this.state.farmers.unshift({ id: 'farmer_default', name: '默认农户', phone: '', pricePerMu: 0, typeId: '', notes: '', enabled: true });
    }
    // 地块归属校验：缺失或指向已删农户 → 归入默认农户
    (this.state.field.plots || []).forEach(p => {
      if (!p.farmerId || !this.state.farmers.find(f => f.id === p.farmerId)) {
        p.farmerId = 'farmer_default';
      }
    });
    this.saveFarmers();
  },

  saveFarmers() {
    Storage.saveFarmers(this.state.farmers);
  },

  getFarmer(id) {
    return this.state.farmers.find(f => f.id === id) || null;
  },

  openFarmersModal() {
    this._editingFarmerId = null;
    this.renderFarmersList();
    this.renderFarmerForm();
    this.openModal('farmersModal');
  },

  renderFarmersList() {
    const list = document.getElementById('farmersList');
    if (!list) return;
    const kw = (document.getElementById('farmerSearch')?.value || '').trim();
    const farmers = this.state.farmers.filter(f => !kw || f.name.includes(kw));
    if (farmers.length === 0) {
      list.innerHTML = '<li style="text-align:center;color:var(--text-muted);cursor:default;">无匹配农户</li>';
      return;
    }
    list.innerHTML = farmers.map(f => {
      const plotCount = (this.state.field.plots || []).filter(pl => pl.farmerId === f.id).length;
      return `
      <li data-id="${f.id}" class="${this._editingFarmerId === f.id ? 'selected' : ''}">
        <div>
          <div><b>${this.escapeHtml(f.name)}</b> <span style="margin-left:6px;font-size:11px;color:var(--text-muted);">${f.pricePerMu > 0 ? `${f.pricePerMu}元/亩` : ''}${plotCount ? ` · ${plotCount} 块地` : ''}</span></div>
          <div class="preset-meta">${this.escapeHtml(f.notes || (f.phone || ''))}</div>
        </div>
        <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text-muted);" data-enabled-toggle="${f.id}">
          <input type="checkbox" ${f.enabled !== false ? 'checked' : ''}>启用
        </label>
      </li>`;
    }).join('');
    list.querySelectorAll('li').forEach(li => {
      li.addEventListener('click', e => {
        if (e.target.closest('[data-enabled-toggle]') && e.target.tagName !== 'INPUT') return;
        this._editingFarmerId = li.dataset.id;
        this.renderFarmerForm();
        this.renderFarmersList();
      });
    });
    list.querySelectorAll('[data-enabled-toggle] input').forEach(cb => {
      cb.addEventListener('change', e => {
        e.stopPropagation();
        const f = this.getFarmer(e.target.closest('[data-enabled-toggle]').dataset.enabledToggle);
        if (f) { f.enabled = e.target.checked; this.saveFarmers(); }
      });
    });
  },

  renderFarmerForm() {
    const form = document.getElementById('farmerForm');
    if (!form) return;
    const f = this._editingFarmerId ? this.getFarmer(this._editingFarmerId) : null;
    const v = k => (f && f[k] != null ? f[k] : '');
    form.innerHTML = `
      <div class="field"><label>名称 *</label><input type="text" id="ff-name" value="${this.escapeHtml(v('name'))}" placeholder="如：老王家果园"></div>
      <div class="field"><label>电话</label><input type="text" id="ff-phone" value="${this.escapeHtml(v('phone'))}"></div>
      <div class="field"><label>默认每亩收费 (元)</label><input type="number" id="ff-price" step="0.5" min="0" value="${v('pricePerMu') || ''}" placeholder="0"></div>
      <div class="field"><label>备注</label><input type="text" id="ff-notes" value="${this.escapeHtml(v('notes'))}"></div>`;
    document.getElementById('farmerDelete').style.display = this._editingFarmerId ? '' : 'none';
  },

  saveFarmerForm() {
    const name = (document.getElementById('ff-name')?.value || '').trim();
    if (!name) {
      this.toast('请填写农户名称', 'warn');
      return;
    }
    // 同名去重：已存在同名档案则转为编辑该档案（防重复建档）
    if (!this._editingFarmerId) {
      const dup = this.state.farmers.find(x => x.name === name);
      if (dup) this._editingFarmerId = dup.id;
    }
    const num = v => { const x = parseFloat(v); return isNaN(x) ? 0 : x; };
    let f = this._editingFarmerId ? this.getFarmer(this._editingFarmerId) : null;
    if (f) {
      f.name = name;
      f.phone = document.getElementById('ff-phone')?.value || '';
      f.pricePerMu = num(document.getElementById('ff-price')?.value);
      f.notes = document.getElementById('ff-notes')?.value || '';
    } else {
      f = {
        id: 'farmer_' + Date.now().toString(36),
        name, phone: document.getElementById('ff-phone')?.value || '',
        pricePerMu: num(document.getElementById('ff-price')?.value),
        typeId: '', notes: document.getElementById('ff-notes')?.value || '', enabled: true
      };
      this.state.farmers.push(f);
    }
    this.saveFarmers();
    this._editingFarmerId = f.id;
    this.renderFarmersList();
    this.renderFarmerForm();
    // 从地块下拉"新建农户"进入时：保存后自动绑定发起地块
    if (this._pendingBindPlotId) {
      const plot = (this.state.field.plots || []).find(pl => String(pl.id) === String(this._pendingBindPlotId));
      if (plot) {
        this.assignPlotFarmer(plot, f.id);
        this.closeModal('farmersModal');
        this._pendingBindPlotId = null;
      }
    }
    this.renderPlotsEditor();
    this.compute();
    this.save();
    this.toast(`农户「${name}」已保存`, 'success');
  },

  deleteFarmerForm() {
    const f = this._editingFarmerId ? this.getFarmer(this._editingFarmerId) : null;
    if (!f) return;
    if (this.state.farmers.length <= 1) {
      this.toast('至少保留一个农户', 'warn');
      return;
    }
    const refCount = (this.state.field.plots || []).filter(pl => pl.farmerId === f.id).length;
    this.confirmDialog(`删除农户「${f.name}」？${refCount ? `其名下 ${refCount} 块地将归入默认农户。` : ''}`, () => {
      this.state.farmers = this.state.farmers.filter(x => x.id !== f.id);
      (this.state.field.plots || []).forEach(pl => { if (pl.farmerId === f.id) pl.farmerId = 'farmer_default'; });
      if (this.state.field.farmerName === f.name) this.state.field.farmerName = '';
      this.saveFarmers();
      this._editingFarmerId = null;
      this.renderFarmersList();
      this.renderFarmerForm();
      this.renderPlotsEditor();
      this.compute();
      this.save();
      this.closeModal('farmersModal');
      this.toast(`农户「${f.name}」已删除`, 'warn');
    });
  },

  /* 地块绑定农户：带出档案默认单价 */
  assignPlotFarmer(plot, farmerId) {
    plot.farmerId = farmerId;
    const f = this.getFarmer(farmerId);
    if (f && f.pricePerMu > 0) {
      this.state.income.pricePerMu = f.pricePerMu;
      this.syncIncomeFormFromState();
    }
  },

  restoreDefaultTypes() {
    Object.entries(PLANT_DATABASE).forEach(([key, t]) => {
      if (!this.typeLibrary.find(x => x.key === key)) {
        this.typeLibrary.push({ key, ...t });
      }
    });
    this.saveTypes();
    this.renderTypeGrid();
    this.toast('已找回默认类型（杀菌/果蝇）', 'success');
  },

  renderPlotsEditor() {
    const wrap = document.getElementById('plotsEditor');
    if (!wrap) return;
    const plots = this.state.field.plots || [];
    let html = `
      <div class="plot-toolbar">
        <span class="hint">每个地块一张卡片，按<b>亩数</b>填写大小；相邻地块填<b>相同组号</b>连片连续作业（趟数在下方"组汇总"里调整）</span>
      </div>`;
    plots.forEach((p, i) => {
      html += `
      <div class="plot-card" data-id="${p.id}">
        <div class="plot-card-head">
          <input type="text" class="plot-name" value="${this.escapeHtml(p.name || `地块${i + 1}`)}" placeholder="地块名称">
          ${p.farmerId && p.farmerId !== 'farmer_default' ? this.plotTplButtons(p) : ''}
          <button type="button" class="icon-btn plot-del" title="删除该地块">🗑</button>
        </div>
        <div class="plot-card-fields">
          <div class="field field-span">
            <label>亩数 <i class="tip" data-tip="该地块需要打药的面积">i</i></label>
            <div class="stepper" data-step="0.5">
              <button type="button" class="st-btn st-minus" aria-label="减少">−</button>
              <div class="unit-suffix" data-unit="亩"><input type="number" class="plot-size" step="0.5" min="0" value="${p.area || ''}" placeholder="0"></div>
              <button type="button" class="st-btn st-plus" aria-label="增加">＋</button>
            </div>
          </div>
          <div class="field">
            <label>作业组 <i class="tip" data-tip="相邻地块填相同组号即可连片连续作业（合并算趟数，组内不返航）；不同组之间按远近来往升降时间在时间参数里体现">i</i></label>
            <div class="unit-suffix" data-unit="组"><input type="number" class="plot-group" step="1" min="1" max="9" value="${Math.max(1, Math.round(Number(p.groupId) || 1))}"></div>
          </div>
          <div class="field">
            <label>农户 <i class="tip" data-tip="该地块归属的农户，结算按农户分开；选择后带出档案默认单价">i</i></label>
            <select class="plot-farmer">${this.farmerOptions(p.farmerId)}</select>
          </div>
          <div class="field field-span">
            <label>该地块</label>
            <div class="plot-stat">${this.plotStatText(p)}</div>
          </div>
        </div>
      </div>`;
    });
    html += '<button type="button" class="btn btn-secondary btn-sm plot-add">＋ 添加地块</button>';
    wrap.innerHTML = html;
  },

  /* 农户下拉选项（启用档案优先；含现场新建入口） */
  farmerOptions(currentId) {
    const list = this.state.farmers || [];
    let opts = list.map(f => `<option value="${f.id}" ${f.id === (currentId || 'farmer_default') ? 'selected' : ''}${f.enabled === false ? ' disabled' : ''}>${this.escapeHtml(f.name)}</option>`).join('');
    // 当前值不在列表（如已停用）也要显示
    if (currentId && !list.find(f => f.id === currentId)) {
      const f = this.getFarmer(currentId);
      opts += `<option value="${currentId}" selected>${this.escapeHtml(f ? f.name : currentId)}</option>`;
    }
    opts += '<option value="__new">＋ 新建农户…</option>';
    return opts;
  },

  /* 该农户默认地块模板按钮（未绑定农户不显示；无模板时"读入"置灰提示） */
  plotTplButtons(p) {
    const f = this.getFarmer(p.farmerId);
    const tpl = f && f.plotTemplate;
    const hasTpl = tpl && (Number(tpl.area) || 0) > 0;
    return `
      <button type="button" class="icon-btn plot-load-tpl" title="${hasTpl ? `读入 ${f.name} 的默认地块尺寸` : `${f ? f.name : ''} 还没存过默认地块尺寸`}" ${hasTpl ? '' : 'style="opacity:0.35;"'}>📄</button>
      <button type="button" class="icon-btn plot-save-tpl" title="把当前尺寸存为 ${f ? f.name : ''} 的默认地块">⭐</button>`;
  },

  /* 快捷存/取农户默认地块尺寸（跟随当前计算基准） */
  savePlotTemplate(plot) {
    const f = this.getFarmer(plot.farmerId);
    if (!f) return;
    f.plotTemplate = { area: Number(plot.area) || 0 };
    this.saveFarmers();
    this.renderPlotsEditor();
    this.toast(`已存为 ${f.name} 的默认地块尺寸`, 'success');
  },

  loadPlotTemplate(plot) {
    const f = this.getFarmer(plot.farmerId);
    const tpl = f && f.plotTemplate;
    if (!tpl || ((Number(tpl.area) || 0) <= 0 && (Number(tpl.treeCount) || 0) <= 0)) {
      this.toast('该农户还没存过默认地块尺寸（⭐ 先存一次）', 'warn');
      return;
    }
    if ((Number(tpl.area) || 0) > 0) plot.area = Number(tpl.area);
    this.renderPlotsEditor();
    this.compute();
    this.save();
    this.toast(`已读入 ${f.name} 的默认地块尺寸`, 'success');
  },

  /* 单地块即时统计（编辑器卡片底部实时刷新；趟数在组级） */
  plotStatText(p) {
    const plant = this.state.plant || {};
    const a = Number(p.area) || 0;
    const water = a * (plant.waterPerMu || 0);
    const g = Math.max(1, Math.round(Number(p.groupId) || 1));
    return `${a}亩 · 水量 <b>${Calculator.fmt(water, 1)}</b>升 · 组<b>${g}</b>（组内合并算趟数）`;
  },

  addPlot() {
    if (!Array.isArray(this.state.field.plots)) this.state.field.plots = [];
    const n = this.state.field.plots.length;
    this.state.field.plots.push({
      id: 'p' + Date.now().toString(36) + '_' + n,
      name: `地块${n + 1}`,
      area: 10,
      groupId: 1
    });
    this.renderPlotsEditor();
    this.compute();
    this.save();
  },

  /* ============================================================
     ★★ 电池循环台账（跨任务累计资产）★★
     - 每块电池：名称 + 基础循环次数（可独立微调/改名/删除）
     - 本次任务：填任务循环总数 → 分配到每块电池 → 确认后累加
     - 每次确认生成记录，可整笔回滚（恢复该笔涉及电池的原值）
     - 独立存储键 drone_spray_batteries_v1，不随作业状态保存
     ============================================================ */
  loadBatteries() {
    this.state.batteries = Storage.getBatteries();
  },

  saveBatteries() {
    Storage.saveBatteries(this.state.batteries);
  },

  renderBatteryLedger() {
    const wrap = document.getElementById('batteryLedger');
    if (!wrap) return;
    const data = this.state.batteries || { list: [], records: [] };
    const esc = this.escapeHtml;
    const fmt = Calculator.fmt.bind(Calculator);

    let html = '';
    // 计算结果带入提示（值由 renderSprayResults 更新，这里只渲染骨架）
    html += `
      <div class="batt-calc-hint">
        <span id="battCalcHintText">本次计算充电次数：—</span>
        <button type="button" class="btn btn-secondary btn-sm batt-pull">⟳ 带入</button>
      </div>`;

    // 电池列表
    if (data.list.length === 0) {
      const bc = Math.max(1, Math.round(Number(this.state.timing.batteryCount) || 1));
      html += `
        <div class="batt-empty">
          还没有电池记录。可按时间参数里的"拥有电池数量（${bc}块）"一键创建，或手动添加。
          <div class="batt-empty-actions">
            <button type="button" class="btn btn-secondary btn-sm batt-quick-create">⚡ 创建 ${bc} 块电池</button>
            <button type="button" class="btn btn-secondary btn-sm batt-add">＋ 手动添加</button>
          </div>
        </div>`;
    } else {
      html += '<div class="batt-list">';
      data.list.forEach(b => {
        html += `
        <div class="batt-row" data-id="${b.id}">
          <input type="text" class="batt-name" value="${esc(b.name || '电池')}" placeholder="电池名称">
          <div class="stepper" data-step="1">
            <button type="button" class="st-btn st-minus" aria-label="减少">−</button>
            <div class="unit-suffix" data-unit="次"><input type="number" class="batt-cycles" step="1" min="0" value="${Math.max(0, Math.round(Number(b.cycles) || 0))}"></div>
            <button type="button" class="st-btn st-plus" aria-label="增加">＋</button>
          </div>
          <button type="button" class="icon-btn batt-del" title="删除该电池">🗑</button>
        </div>`;
      });
      html += '</div>';
      html += '<button type="button" class="btn btn-secondary btn-sm batt-add" style="margin-top:8px;">＋ 添加电池</button>';
    }

    // 任务分配区（有电池才显示）
    if (data.list.length > 0) {
      const total = this._battTaskTotal != null ? this._battTaskTotal : '';
      html += `
      <div class="batt-alloc">
        <div class="batt-alloc-head">
          <span class="batt-alloc-title">📥 本次任务循环分配</span>
          <span class="batt-alloc-total">
            <input type="text" id="battTaskLabel" placeholder="备注：如 张三果园30亩" value="${esc(this._battTaskLabel || '')}">
            <label>总数 <input type="number" id="battTaskTotal" step="1" min="0" value="${total}" placeholder="0"> 次</label>
          </span>
        </div>
        <div class="batt-alloc-rows">`;
      data.list.forEach(b => {
        const av = this._battAlloc && this._battAlloc[b.id] != null ? this._battAlloc[b.id] : '';
        html += `
          <div class="batt-alloc-row">
            <span class="batt-alloc-name">${esc(b.name || '电池')}<small class="batt-alloc-base">${fmt(Number(b.cycles) || 0)}次</small></span>
            <input type="number" class="batt-alloc-input" data-id="${b.id}" step="1" min="0" value="${av}" placeholder="0">
          </div>`;
      });
      html += `
        </div>
        <div class="batt-alloc-foot">
          <span id="battAllocRest" class="batt-alloc-rest"></span>
          <button type="button" class="btn btn-secondary btn-sm batt-fill">平均分</button>
          <button type="button" class="btn btn-primary btn-sm batt-apply">✓ 确认加到电池</button>
        </div>
      </div>`;
    }

    // 操作记录（可回滚）
    if (data.records.length > 0) {
      html += '<div class="batt-records"><div class="batt-records-title">🧾 分配记录（回滚只恢复该笔涉及的电池）</div>';
      data.records.forEach(rec => {
        const when = new Date(rec.ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        const names = data.list;
        const detail = Object.entries(rec.deltas || {})
          .map(([id, d]) => {
            const b = names.find(x => x.id === id);
            return `${esc(b ? b.name : '电池')} +${d}`;
          }).join(' · ');
        html += `
        <div class="batt-record">
          <span class="batt-record-main"><b>${when}</b>${rec.label ? `（${esc(rec.label)}）` : ''} 共 ${rec.total} 次：${detail}</span>
          <button type="button" class="btn btn-secondary btn-sm batt-rollback" data-rec="${rec.id}">↩ 回滚</button>
        </div>`;
      });
      html += '</div>';
    }

    wrap.innerHTML = html;
    this.updateBattAllocRest();
    this.updateBatteryCalcHint();
  },

  /* 计算结果充电次数 → 台账提示行（由 renderSprayResults 调用，不重绘台账避免丢焦点） */
  updateBatteryCalcHint() {
    const el = document.getElementById('battCalcHintText');
    if (!el) return;
    const c = this._lastCycles;
    el.textContent = c != null && c > 0
      ? `本次计算充电次数：${c} 次${this._lastChargeSource === 'manual' ? '（手动）' : '（参考）'}`
      : '本次计算充电次数：—（先填写地块与参数）';
  },

  /* 未分配余量提示 */
  updateBattAllocRest() {
    const restEl = document.getElementById('battAllocRest');
    if (!restEl) return;
    const total = Math.max(0, Math.floor(Number((this._battTaskTotal != null ? this._battTaskTotal : 0)) || 0));
    let sum = 0;
    (this.state.batteries.list || []).forEach(b => {
      sum += Math.max(0, Math.floor(Number(this._battAlloc && this._battAlloc[b.id]) || 0));
    });
    const rest = total - sum;
    restEl.textContent = rest === 0
      ? (total > 0 ? '✓ 已全部分配' : '未分配')
      : (rest > 0 ? `还有 ${rest} 次未分配` : `超出 ${-rest} 次`);
    restEl.dataset.warn = rest === 0 ? '' : 'true';
  },

  bindBatteryLedger() {
    const wrap = document.getElementById('batteryLedger');
    if (!wrap) return;
    wrap.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.classList.contains('batt-add')) { this.battAdd(1); return; }
      if (btn.classList.contains('batt-quick-create')) {
        const n = Math.max(1, Math.round(Number(this.state.timing.batteryCount) || 1));
        this.battAdd(n);
        return;
      }
      if (btn.classList.contains('batt-pull')) {
        const c = this._lastCycles;
        if (!c || c <= 0) { this.toast('还没有计算结果，先填写地块与参数', 'warn'); return; }
        this._battTaskTotal = Math.round(c);
        const inp = document.getElementById('battTaskTotal');
        if (inp) inp.value = this._battTaskTotal;
        this.updateBattAllocRest();
        return;
      }
      if (btn.classList.contains('batt-fill')) { this.battFillEven(); return; }
      if (btn.classList.contains('batt-apply')) { this.battApplyAllocation(); return; }
      if (btn.classList.contains('batt-del')) {
        const row = btn.closest('.batt-row');
        const id = row && row.dataset.id;
        const b = this.state.batteries.list.find(x => x.id === id);
        if (!b) return;
        this.confirmDialog(`删除「${b.name}」？其循环数将从台账移除（不影响其他电池）。`, () => {
          this.state.batteries.list = this.state.batteries.list.filter(x => x.id !== id);
          if (this._battAlloc) delete this._battAlloc[id];
          this.saveBatteries();
          this.renderBatteryLedger();
          this.toast(`已删除 ${b.name}`, 'success');
        });
        return;
      }
      if (btn.classList.contains('batt-rollback')) {
        this.battRollback(btn.dataset.rec);
        return;
      }
    });
    // 名称/循环数直接编辑（手动细微调整）
    wrap.addEventListener('change', e => {
      const t = e.target;
      if (t.classList.contains('batt-name')) {
        const row = t.closest('.batt-row');
        const b = this.state.batteries.list.find(x => x.id === (row && row.dataset.id));
        if (b) { b.name = t.value.trim() || '电池'; this.saveBatteries(); }
        return;
      }
      if (t.classList.contains('batt-cycles')) {
        const row = t.closest('.batt-row');
        const b = this.state.batteries.list.find(x => x.id === (row && row.dataset.id));
        if (b) {
          b.cycles = Math.max(0, Math.round(parseFloat(t.value) || 0));
          t.value = b.cycles;
          this.saveBatteries();
        }
        return;
      }
      if (t.id === 'battTaskTotal' || t.id === 'battTaskLabel' || t.classList.contains('batt-alloc-input')) {
        this._battTaskTotal = parseFloat(document.getElementById('battTaskTotal')?.value) || 0;
        this._battTaskLabel = (document.getElementById('battTaskLabel')?.value || '').trim();
        this.state.batteries.list.forEach(b => {
          const el = wrap.querySelector(`.batt-alloc-input[data-id="${b.id}"]`);
          if (el) {
            this._battAlloc = this._battAlloc || {};
            this._battAlloc[b.id] = Math.max(0, Math.floor(parseFloat(el.value) || 0));
          }
        });
        this.updateBattAllocRest();
      }
    });
    // 分配输入实时刷新余量
    wrap.addEventListener('input', e => {
      if (e.target.classList.contains('batt-alloc-input')) {
        this._battAlloc = this._battAlloc || {};
        this._battAlloc[e.target.dataset.id] = Math.max(0, Math.floor(parseFloat(e.target.value) || 0));
        this.updateBattAllocRest();
      }
      if (e.target.id === 'battTaskTotal') {
        this._battTaskTotal = parseFloat(e.target.value) || 0;
        this.updateBattAllocRest();
      }
      if (e.target.id === 'battTaskLabel') {
        this._battTaskLabel = e.target.value.trim();
      }
    });
  },

  battAdd(n) {
    for (let i = 0; i < n; i++) {
      const no = this.state.batteries.list.length + 1;
      this.state.batteries.list.push({
        id: 'batt' + Date.now().toString(36) + '_' + no,
        name: `电池${no}`,
        cycles: 0
      });
    }
    this.saveBatteries();
    this.renderBatteryLedger();
  },

  /* 平均分：整除直接分，余数从第一块起每块 +1 */
  battFillEven() {
    const list = this.state.batteries.list;
    const total = Math.max(0, Math.floor(Number(this._battTaskTotal) || 0));
    if (!list.length || total <= 0) { this.toast('先填任务循环总数', 'warn'); return; }
    this._battAlloc = this._battAlloc || {};
    const base = Math.floor(total / list.length);
    let rest = total - base * list.length;
    list.forEach(b => {
      const d = base + (rest > 0 ? 1 : 0);
      if (rest > 0) rest--;
      this._battAlloc[b.id] = d;
      const el = document.querySelector(`#batteryLedger .batt-alloc-input[data-id="${b.id}"]`);
      if (el) el.value = d;
    });
    this.updateBattAllocRest();
  },

  /* 确认分配：校验恰好分完 → 累加到每块电池 → 写记录 */
  battApplyAllocation() {
    const list = this.state.batteries.list;
    const total = Math.max(0, Math.floor(Number(this._battTaskTotal) || 0));
    if (!list.length) { this.toast('请先添加电池', 'warn'); return; }
    if (total <= 0) { this.toast('请填本次任务循环总数', 'warn'); return; }
    this._battAlloc = this._battAlloc || {};
    const deltas = {};
    let sum = 0;
    list.forEach(b => {
      const d = Math.max(0, Math.floor(Number(this._battAlloc[b.id]) || 0));
      if (d > 0) deltas[b.id] = d;
      sum += d;
    });
    if (sum !== total) {
      this.toast(sum < total ? `还有 ${total - sum} 次未分配，分完才能确认` : `分配超出总数 ${sum - total} 次，请调整`, 'warn');
      return;
    }
    const prev = {};
    Object.keys(deltas).forEach(id => {
      const b = list.find(x => x.id === id);
      prev[id] = b.cycles;
      b.cycles += deltas[id];
    });
    this.state.batteries.records.unshift({
      id: 'rec' + Date.now().toString(36),
      ts: new Date().toISOString(),
      label: (this._battTaskLabel || '').trim(),
      total: total,
      deltas: deltas,
      prev: prev
    });
    if (this.state.batteries.records.length > 30) this.state.batteries.records.length = 30;
    this.saveBatteries();
    this._battAlloc = {};
    this._battTaskTotal = 0;
    this.renderBatteryLedger();
    this.toast(`已把 ${total} 次循环加到 ${Object.keys(deltas).length} 块电池 🔋`, 'success');
  },

  /* 回滚：恢复该笔记录涉及的电池到分配前数值，并移除该记录 */
  battRollback(recId) {
    const recs = this.state.batteries.records;
    const idx = recs.findIndex(r => r.id === recId);
    if (idx < 0) return;
    const rec = recs[idx];
    this.confirmDialog(`回滚「${new Date(rec.ts).toLocaleString('zh-CN')}」的分配（共 ${rec.total} 次）？涉及电池将恢复到分配前的循环数。`, () => {
      Object.entries(rec.prev || {}).forEach(([id, v]) => {
        const b = this.state.batteries.list.find(x => x.id === id);
        if (b) b.cycles = Math.max(0, Math.round(Number(v) || 0));
      });
      recs.splice(idx, 1);
      this.saveBatteries();
      this.renderBatteryLedger();
      this.toast('已回滚该笔分配 ↩', 'success');
    });
  },

  /* 地块明细表（结果区） */
  renderPlotsTable(r) {
    const wrap = document.getElementById('plotsTableWrap');
    if (!wrap) return;
    if (!r || !r.plots || r.plots.length === 0) {
      wrap.innerHTML = '';
      return;
    }
    const fmt = Calculator.fmt.bind(Calculator);
    // 组汇总条：每组水量/趟数/每趟量/转场，趟数可 ±（组级覆盖，留空=自动）
    const chips = (r.groups || []).map(g => `
      <span class="group-chip">
        <b>组${g.id}</b>
        <span class="group-chip-meta">${fmt(g.water, 1)}升 · ${g.trips}趟${g.tripsOverride ? '(手动)' : ''} · 每趟${fmt(g.perTripWater, 1)}升</span>
        <button type="button" class="group-trips-btn" data-g="${g.id}" data-delta="-1" title="减少一趟">−</button>
        <button type="button" class="group-trips-btn" data-g="${g.id}" data-delta="1" title="增加一趟">＋</button>
      </span>`).join('');
    const groupBar = (r.groups && r.groups.length) ? `
      <div class="group-bar">
        <span class="hint">组汇总（同组连片连续作业；± 调整组趟数凑每趟加药量）</span>
        <div class="group-chips">${chips}</div>
      </div>` : '';
    const rows = r.plots.map(p => `
      <tr>
        <td>${this.escapeHtml(p.name)}</td>
        <td>组${p.groupId}</td>
        <td>${fmt(p.area, 1)}</td>
        <td>${fmt(p.water, 1)}</td>
        <td><b>${p.groupTrips}</b></td>
        <td>${fmt(p.groupPerTripWater, 1)}</td>
        <td>${fmt(p.pesticideRaw, 2)}</td>
      </tr>`).join('');
    wrap.innerHTML = `
      ${groupBar}
      <div class="panel-title" style="margin-top:12px;"><span>🗺️</span> 地块明细
        <span class="hint">机载上限 ${r.droneTank} 升/趟 · 共 ${r.totalTrips} 趟</span>
      </div>
      <table class="summary-table plots-table">
        <thead><tr><th>地块</th><th>组</th><th>亩数</th><th>水量(升)</th><th>趟数</th><th>每趟(升)</th><th>用量(套)</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td>合计</td><td>${(r.groups || []).length} 组</td><td>${fmt(r.area, 1)}</td><td>${fmt(r.water, 1)}</td><td>—</td><td><b>${r.totalTrips}</b></td><td>${fmt(r.totalLoad, 1)}min</td><td>${fmt(r.usedSets != null ? r.usedSets : r.pesticide, 2)}</td></tr></tfoot>
      </table>`;
  },

  /* 组级趟数 ±（写 field.groupTrips 覆盖；减到低于最少趟数时提示） */
  adjustGroupTrips(groupId, delta) {
    const r = this._lastResult;
    if (!r || !r.groups) return;
    const g = r.groups.find(x => String(x.id) === String(groupId));
    if (!g) return;
    const cur = Number((this.state.field.groupTrips || {})[g.id]) || 0;
    const next = Math.max(0, (cur > 0 ? cur : g.minTrips) + delta);
    this.state.field.groupTrips = { ...(this.state.field.groupTrips || {}), [g.id]: next };
    if (next < g.minTrips) {
      this.toast(`⚠️ 组${g.id} 趟数少于最少趟数 ${g.minTrips}，每趟加药量将超过机载上限`, 'warn');
    }
    this.compute();
    this.save();
  },

  /* ============================================================
     ★★★ 作业工单（快捷修改 + 纯文本输出）★★★
     - 快捷修改区：已完成量（按地块）、实际用药套数、备注，
       任一输入即时重算剩余量/续药并保存（state.workOrder 覆盖层）
     - 纯文本工单：等宽高可读，可整段复制留存或发给现场人员
     ============================================================ */
  getWorkOrder() {
    if (!this.state.workOrder || typeof this.state.workOrder !== 'object') {
      this.state.workOrder = { completedByPlot: {}, selfByFarmer: {}, completedSingle: 0, actualSets: 0, note: '' };
    }
    const wo = this.state.workOrder;
    if (!wo.completedByPlot) wo.completedByPlot = {};
    if (wo.completedSingle == null) wo.completedSingle = 0;
    if (wo.actualSets == null) wo.actualSets = 0;
    if (wo.note == null) wo.note = '';
    return wo;
  },

  openWorkOrder() {
    if (this.state.mode !== 'spray') {
      this.toast('工单暂仅支持打药模式', 'warn');
      return;
    }
    this.renderWorkOrderQuick();
    this.openModal('workOrderModal');
  },

  renderWorkOrderQuick() {
    const wrap = document.getElementById('workOrderQuick');
    const sumWrap = document.getElementById('workOrderSummary');
    const refill = document.getElementById('woRefill');
    if (!wrap || !sumWrap || !refill) return;
    const r = this._lastResult;
    const wo = this.getWorkOrder();
    const fmt = Calculator.fmt.bind(Calculator);
    const fdur = Calculator.formatDuration.bind(Calculator);
    const pill = '\uD83D\uDC8A';

    /* 汇总小卡 */
    const timeText = fdur(r.timing.totalTime)
      + (r.timing.chargeAfterWork && r.timing.afterWorkCharge > 0 ? '+' + fdur(r.timing.afterWorkCharge) : '');
    sumWrap.innerHTML = `
      <div class="wo-card"><div class="wo-card-label">总水量</div><div class="wo-card-value">${fmt(r.water, 1)}<small>升</small></div></div>
      <div class="wo-card"><div class="wo-card-label">总趟数</div><div class="wo-card-value">${r.totalTrips}<small>趟</small></div></div>
      <div class="wo-card"><div class="wo-card-label">预计总时长</div><div class="wo-card-value">${timeText}</div></div>
      <div class="wo-card"><div class="wo-card-label">药量 参考 / 实际</div><div class="wo-card-value">${r.pesticideRounded}<small>套</small><input type="number" class="wo-sets" min="0" step="1" value="${wo.actualSets || ''}" placeholder="实际"></div></div>`;

    /* 续药提醒条 */
    const doneTotal = this.woDoneTotal(r, wo);
    const restTotal = Math.max(0, r.water - doneTotal);
    if (restTotal > 0) {
      refill.style.display = '';
      const refillSets = Calculator.computeRefillSets(restTotal, this.state.plant.pesticideWaterPerSet, this.state.plant.droneSavingCoeff);
      refill.innerHTML = `${pill} 剩余 <b>${fmt(restTotal, 1)}</b> 升 ≈ 还需 <b>${refillSets}</b> 套药（7舍8入），记得安排续药`;
    } else {
      refill.style.display = 'none';
    }

    /* 农户结算单：地块大小/打药钱/用药量/药钱（不包药隐藏后两项） */
    const settleWrap = document.getElementById('woSettlement');
    if (settleWrap) {
      const st = r.settlement || [];
      if (st.length) {
        const rowsHtml = st.map(row => {
          const med = row.included
            ? `<td>${fmt(row.usedSets, 2)} 套${row.selfSets > 0 ? `<small>（自备${fmt(row.selfSets, 1)}）</small>` : ''}</td><td>¥${Calculator.fmtMoney(row.pesticideFee)}</td>`
            : '';
          return `
          <tr>
            <td>${this.escapeHtml(row.farmerName)}</td>
            <td>${fmt(row.area, 1)} 亩</td>
            <td>¥${Calculator.fmtMoney(row.sprayFee)}</td>
            ${med}
          </tr>`;
        }).join('');
        const totalAreaS = st.reduce((x, row) => x + row.area, 0);
        const totalFee = st.reduce((x, row) => x + row.sprayFee, 0);
        const totalUsed = st.reduce((x, row) => x + row.usedSets, 0);
        const totalMed = st.reduce((x, row) => x + row.pesticideFee, 0);
        const medCols = st[0] && st[0].included;
        settleWrap.innerHTML = `
          <div class="wo-settle-title">农户结算单${medCols ? '' : '（不包药）'}</div>
          <table class="summary-table">
            <thead><tr><th>农户</th><th>地块大小</th><th>打药的钱</th>${medCols ? '<th>用药量</th><th>药钱</th>' : ''}</tr></thead>
            <tbody>${rowsHtml}</tbody>
            <tfoot><tr><td>合计</td><td>${fmt(totalAreaS, 1)} 亩</td><td>¥${Calculator.fmtMoney(totalFee)}</td>${medCols ? `<td>${fmt(totalUsed, 2)} 套</td><td>¥${Calculator.fmtMoney(totalMed)}</td>` : ''}</tr></tfoot>
          </table>`;
        settleWrap.style.display = '';
      } else {
        settleWrap.style.display = 'none';
      }
    }

    /* 农户 + 逐地块行 + 备注 */
    let html = `
      <div class="field wo-farmer-field">
        <label>农户名称 <i class="tip" data-tip="工单抬头显示；未来农户档案将在此选择">i</i></label>
        <input type="text" class="wo-farmer" value="${this.escapeHtml(this.state.field.farmerName || '')}" placeholder="选填，如：老王家果园">
      </div>`;
    if (r && r.plotMode) {
      (r.plots || []).forEach(p => {
        const done = Number(wo.completedByPlot[p.id]) || 0;
        const rest = Math.max(0, p.water - done);
        const fid = p.farmerId || 'farmer_default';
        const selfSets = Number((wo.selfByFarmer || {})[fid]) || 0;
        const fname = (this.getFarmer(fid) || {}).name || '默认农户';
        html += `
        <div class="wo-plot">
          <div class="wo-plot-info">
            <div class="wo-plot-name">${this.escapeHtml(p.name)} <span class="hint">· ${this.escapeHtml(fname)}</span></div>
            <div class="wo-plot-meta">组${p.groupId} · ${fmt(p.water, 1)}升 · 组趟数${p.groupTrips} · 每趟${fmt(p.groupPerTripWater, 1)}升</div>
            <div class="wo-self-row"><label>${this.escapeHtml(fname)} 自备(套)</label>
              <input type="number" class="wo-self" data-fid="${fid}" min="0" step="0.5" value="${selfSets || ''}" placeholder="0">
            </div>
          </div>
          <div class="wo-plot-done">
            <label>已完成(升)</label>
            <input type="number" class="wo-completed" data-id="${p.id}" min="0" step="1" value="${done || ''}" placeholder="0">
          </div>
          <div class="wo-plot-rest" data-id="${p.id}">剩余 ${fmt(rest, 1)}升 ≈ ${p.groupPerTripWater > 0 ? Math.ceil(rest / p.groupPerTripWater) : 0}趟</div>
        </div>`;
      });
    } else {
      const done = Number(wo.completedSingle) || 0;
      const rest = Math.max(0, (r ? r.water : 0) - done);
      html += `
      <div class="wo-plot">
        <div class="wo-plot-info">
          <div class="wo-plot-name">当前地块</div>
          <div class="wo-plot-meta">${fmt(r ? r.water : 0, 1)}升 · 循环 ${r ? r.cycles : 0} 次</div>
        </div>
        <div class="wo-plot-done">
          <label>已完成(升)</label>
          <input type="number" class="wo-single" min="0" step="1" value="${done || ''}" placeholder="0">
        </div>
        <div class="wo-plot-rest" id="woRestSingle">剩余 ${fmt(rest, 1)}升</div>
      </div>`;
    }
    html += `
      <div class="field wo-note-field">
        <label>备注</label>
        <input type="text" class="wo-note" value="${this.escapeHtml(wo.note)}" placeholder="如：农户自备2套 / 下午续药">
      </div>`;
    wrap.innerHTML = html;
  },

  /* 已完成总量（多地块求和 / 单地块取值） */
  woDoneTotal(r, wo) {
    if (!r) return 0;
    return r.plotMode
      ? (r.plots || []).reduce((s, p) => s + (Number(wo.completedByPlot[p.id]) || 0), 0)
      : (Number(wo.completedSingle) || 0);
  },

  buildWorkOrderText() {
    const r = this._lastResult;
    if (!r || this.state.mode !== 'spray') return '';
    const wo = this.getWorkOrder();
    const fmt = Calculator.fmt.bind(Calculator);
    const fdur = Calculator.formatDuration.bind(Calculator);
    const plant = this.state.plant;
    const LINE = '──────────────────────';
    const L = [];
    const basisText = '按亩数';
    L.push('🚁 无人机作业工单');
    L.push(`日期: ${new Date().toLocaleString('zh-CN')}`);
    if (this.state.field.farmerName) L.push(`农户: ${this.state.field.farmerName}`);
    L.push(`类型: ${plant.icon || ''}${plant.name} · ${basisText} · 机载上限 ${r.droneTank}升/趟`);
    L.push(LINE);

    if (r.plotMode) {
      (r.plots || []).forEach(p => {
        const done = Number(wo.completedByPlot[p.id]) || 0;
        const rest = Math.max(0, p.water - done);
        L.push(`【${p.name}】`);
        L.push(`  组${p.groupId} | ${fmt(p.area, 1)}亩 | 水量 ${fmt(p.water, 1)}升 | 组趟数 ${p.groupTrips} | 每趟 ${fmt(p.groupPerTripWater, 1)}升`);
        L.push(`  已完成 ${fmt(done, 1)}升 (${p.water > 0 ? fmt(done / p.water * 100, 0) : 0}%) | 剩余 ${fmt(rest, 1)}升 ≈ ${p.groupPerTripWater > 0 ? Math.ceil(rest / p.groupPerTripWater) : 0}趟 | 用量 ${fmt(p.pesticideRaw, 2)}套`);
      });
    } else {
      const done = Number(wo.completedSingle) || 0;
      const rest = Math.max(0, r.water - done);
      L.push('【当前地块】');
      L.push(`  水量 ${fmt(r.water, 1)}升 | 循环数 ${r.cycles} | 兑药 ${r.timing.mixRounds}批(单批${fmt(r.timing.batchCapacity, 0)}升)`);
      L.push(`  已完成 ${fmt(done, 1)}升 (${r.water > 0 ? fmt(done / r.water * 100, 0) : 0}%) | 剩余 ${fmt(rest, 1)}升`);
    }

    L.push(LINE);
    const doneTotal = r.plotMode
      ? (r.plots || []).reduce((s, p) => s + (Number(wo.completedByPlot[p.id]) || 0), 0)
      : (Number(wo.completedSingle) || 0);
    const restTotal = Math.max(0, r.water - doneTotal);
    const actualSets = Number(wo.actualSets) > 0 ? Number(wo.actualSets) : r.pesticideRounded;
    // 续药按本次作业自身的需求口径折算：剩余占比 × 合计小数用量，再 7舍8入
    const refillSets = (restTotal > 0 && r.water > 0)
      ? Calculator.round78(r.usedSets * (restTotal / r.water))
      : 0;
    L.push('【汇总】');
    L.push(`  计算水量 ${fmt(r.water, 1)}升 + 富余 ${fmt(r.spareWater || 0, 0)}升 = 总加水 ${fmt(r.totalAddWater != null ? r.totalAddWater : r.water, 1)}升`);
    L.push(`  已完成 ${fmt(doneTotal, 1)}升 | 剩余 ${fmt(restTotal, 1)}升`);
    L.push(`  总趟数 ${r.totalTrips}（${(r.groups || []).length} 组） | 兑药 ${r.timing.mixRounds}批(单批${fmt(r.timing.batchCapacity, 0)}升，每批留抽药空间后补满)`);
    let timeText = `预计总时长 ${fdur(r.timing.totalTime)}`;
    if (r.timing.chargeAfterWork && r.timing.afterWorkCharge > 0) timeText += `（另结束后充电 ${fdur(r.timing.afterWorkCharge)}）`;
    L.push(`  ${timeText}`);
    L.push(`  药量: 需求 ${fmt(r.pesticide, 2)}套 → 采购 ${r.pesticideRounded}套 | 实际 ${actualSets}套${Number(wo.actualSets) > 0 ? '（手填）' : ''} | 补购 ${r.needToBuy}套`);
    if (restTotal > 0) L.push(`  续药提醒: 剩余 ${fmt(restTotal, 1)}升 ≈ 还需 ${refillSets}套（7舍8入）`);
    const st = r.settlement || [];
    if (st.length) {
      L.push('【农户结算】');
      st.forEach(row => {
        const medPart = row.included
          ? (row.selfSets > 0
            ? ` | 用药量 ${fmt(row.usedSets, 2)}套（自备${fmt(row.selfSets, 1)}+我们补充${fmt(row.supplementSets, 1)}） | 药钱 ¥${Calculator.fmtMoney(row.pesticideFee)}（按补充量计）`
            : ` | 用药量 ${fmt(row.usedSets, 2)}套 | 药钱 ¥${Calculator.fmtMoney(row.pesticideFee)}`)
          : '';
        L.push(`  ${row.farmerName}: 地块 ${fmt(row.area, 1)}亩 | 打药 ¥${Calculator.fmtMoney(row.sprayFee)}${medPart}`);
      });
    }
    L.push(`  成本 ¥${Calculator.fmtMoney(r.totalCost)} | 收入 ¥${Calculator.fmtMoney(r.income)} | 利润 ¥${Calculator.fmtMoney(r.profit)}`);
    if (wo.note) L.push(`【备注】${wo.note}`);
    L.push('【作业前检查】');
    L.push('  □ 天气适宜（无大风/降雨）  □ 避开正午高温与烈日直晒');
    L.push('  □ 电池已逐块充满（含备用）  □ 加药点往返距离已确认');
    return L.join('\n');
  },

  /* 药量参考卡：四来源即时刷新（随主计算/类型切换/输入联动） */
  renderDoseRef() {
    const byArea = document.getElementById('doseByArea');
    const byTree = document.getElementById('doseByTree');
    const farmer = document.getElementById('doseFarmer');
    if (!byArea) return;
    const r = this._lastResult;
    const fmt = Calculator.fmt.bind(Calculator);
    const plant = this.state.plant || {};
    if (r && r.pesticide > 0) {
      byArea.innerHTML = `<b>${fmt(r.pesticide, 2)}</b> 套（采购 ${r.pesticideRounded}）`;
    } else {
      byArea.textContent = '—';
    }
    const cnt = Number(document.getElementById('treeQuickInput')?.value) || 0;
    const treeRaw = Calculator.calcTreesPesticide(cnt, plant);
    byTree.innerHTML = cnt > 0 && treeRaw > 0
      ? `<b>${fmt(treeRaw, 2)}</b> 套（采购 ${Calculator.round78(treeRaw)}）`
      : '—';
    const dose = Number(this.state.field.manualDosePerMu) || 0;
    const area = r && r.area != null ? r.area : (Number(this.state.field.area) || 0);
    const farmerRaw = Calculator.calcFarmerDose(area, dose, plant);
    farmer.innerHTML = dose > 0
      ? `<b>${fmt(farmerRaw, 2)}</b> 套（${fmt(area, 1)}亩 × ${fmt(dose, 1)}套/亩 × 省药系数）`
      : '—';
  },

  updatePlantInfo() {
    const p = this.state.plant;
    if (!p) return;
    document.getElementById('plantInfoName').textContent = `${p.icon || '🌱'} ${p.name}`;
    document.getElementById('plantInfoDesc').textContent = p.description || '—';
    document.getElementById('plantInfoNotes').textContent = p.notes || '';
  },

  renderParamForm() {
    const form = document.getElementById('paramForm');
    form.innerHTML = '';
    const adv = document.getElementById('paramAdvGrid');
    if (adv) adv.innerHTML = '';
    FIELD_ORDER.param.forEach(key => {
      const def = FIELD_DEFS[key];
      const target = (def && def.advanced && adv) ? adv : form;
      this.appendField(target, key, 'spray');
    });
    this.syncParamFormFromPlant();
    this.renderPlotsEditor();
    this.restoreAdvState();
  },

  syncParamFormFromPlant() {
    const p = this.state.plant;
    if (!p) return;
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    setVal('inp-flightHeight', p.flightHeight);
    setVal('inp-waterPerMu', p.waterPerMu);
    setVal('inp-treesPerMu', p.treesPerMu);
    setVal('inp-waterPerTree', p.waterPerTree);
    setVal('inp-pesticideWaterPerSet', p.pesticideWaterPerSet);
    setVal('inp-droneSavingCoeff', p.droneSavingCoeff);
    setVal('inp-existingPesticideSets', this.state.field.existingPesticideSets);
  },

  renderCostTabs() {
    const tabsContainer = document.getElementById('costTabs');
    const contentContainer = document.getElementById('tabContentContainer');
    tabsContainer.innerHTML = '';
    contentContainer.innerHTML = '';

    const tabs = [
      { key: 'cycle',     label: '🔋 循环与油费' },
      { key: 'labor',     label: '👥 人工' },
      { key: 'other',     label: '📦 其他' }
    ];
    tabs.forEach((tab, i) => {
      const btn = document.createElement('button');
      btn.className = 'tab-btn' + (i === 0 ? ' active' : '');
      btn.dataset.tab = tab.key;
      btn.textContent = tab.label;
      btn.addEventListener('click', () => this.switchCostTab(tab.key, 'spray'));
      tabsContainer.appendChild(btn);

      const content = document.createElement('div');
      content.className = 'tab-content' + (i === 0 ? ' active' : '');
      content.dataset.tab = tab.key;
      contentContainer.appendChild(content);
      const wrap = document.createElement('div');
      wrap.className = 'form-grid';
      content.appendChild(wrap);
      const adv = document.getElementById('costAdvGrid');
      FIELD_ORDER[tab.key].forEach(key => {
        const def = FIELD_DEFS[key];
        const target = (def && def.advanced && adv) ? adv : wrap;
        this.appendField(target, key, 'spray');
      });
    });
    this.syncCostFormFromState();
    this.restoreAdvState();
  },

  switchCostTab(tabKey, mode) {
    // costTabs 和 tabContentContainer 是共享 ID（两种模式复用同一组容器）
    document.querySelectorAll(`#costTabs .tab-btn`).forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tabKey);
    });
    document.querySelectorAll(`#tabContentContainer .tab-content`).forEach(c => {
      c.classList.toggle('active', c.dataset.tab === tabKey);
    });
  },

  syncCostFormFromState() {
    Object.keys(this.state.costs).forEach(k => {
      const el = document.getElementById(`inp-${k}`);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!this.state.costs[k];
      else el.value = this.state.costs[k];
    });
  },

  renderIncomeForm() {
    const form = document.getElementById('incomeForm');
    form.innerHTML = '';
    FIELD_ORDER.income.forEach(key => this.appendField(form, key, 'spray'));
    this.syncIncomeFormFromState();
  },

  syncIncomeFormFromState() {
    Object.keys(this.state.income).forEach(k => {
      const el = document.getElementById(`inp-${k}`);
      if (!el) return;
      el.value = this.state.income[k];
    });
  },

  /* ---------- 时间参数表单 ---------- */
  renderTimingForm() {
    const form = document.getElementById('timingForm');
    if (!form) return;
    form.innerHTML = '';
    const adv = document.getElementById('timingAdvGrid');
    if (adv) adv.innerHTML = '';
    FIELD_ORDER.timing.forEach(key => {
      const def = FIELD_DEFS[key];
      const target = (def && def.advanced && adv) ? adv : form;
      this.appendField(target, key, 'timing');
    });
    this.syncTimingFormFromState();
    this.restoreAdvState();
  },

  /* 高级设置折叠展开状态记忆 */
  restoreAdvState() {
    let st = {};
    try { st = JSON.parse(localStorage.getItem('drone_spray_adv_v1') || '{}'); } catch (e) { st = {}; }
    [['paramAdv', 'param'], ['costAdv', 'cost'], ['timingAdv', 'timing']].forEach(([id, k]) => {
      const el = document.getElementById(id);
      if (el) el.open = !!st[k];
    });
  },

  bindAdvState() {
    [['paramAdv', 'param'], ['costAdv', 'cost'], ['timingAdv', 'timing']].forEach(([id, k]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('toggle', () => {
        let st = {};
        try { st = JSON.parse(localStorage.getItem('drone_spray_adv_v1') || '{}'); } catch (e) { st = {}; }
        st[k] = el.open;
        localStorage.setItem('drone_spray_adv_v1', JSON.stringify(st));
      });
    });
  },

  /* 数值步进：-/+ 按钮，长按 300ms 后每 120ms 连发。
     事件委托在 document 上，字段重渲染后依然有效。 */
  bindSteppers() {
    if (this._steppersBound) return;
    this._steppersBound = true;
    const cleanup = btn => {
      if (btn._t0) { clearTimeout(btn._t0); btn._t0 = null; }
      if (btn._iv) { clearInterval(btn._iv); btn._iv = null; }
    };
    document.addEventListener('pointerdown', e => {
      const btn = e.target.closest('.st-btn');
      if (!btn) return;
      const wrap = btn.closest('.stepper');
      const input = wrap && wrap.querySelector('input');
      if (!input) return;
      const dir = btn.classList.contains('st-plus') ? 1 : -1;
      const step = Math.max(0.01, parseFloat(wrap.dataset.step) || 1);
      const apply = () => {
        let v = parseFloat(input.value);
        if (isNaN(v)) v = 0;
        v = Math.max(0, parseFloat((v + dir * step).toFixed(4)));
        input.value = v;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      apply();
      btn._t0 = setTimeout(() => { btn._iv = setInterval(apply, 120); }, 300);
      const stop = () => cleanup(btn);
      btn.addEventListener('pointerup', stop, { once: true });
      btn.addEventListener('pointerleave', stop, { once: true });
      btn.addEventListener('pointercancel', stop, { once: true });
    });
    window.addEventListener('pointerup', e => {
      const btn = e.target && e.target.closest && e.target.closest('.st-btn');
      if (btn) cleanup(btn);
    });
  },

  syncTimingFormFromState() {
    if (!this.state.timing) return;
    Object.keys(this.state.timing).forEach(k => {
      const el = document.getElementById(`inp-${k}`);
      if (!el) return;
      if (el.type === 'radio') {
        if (el.value === String(this.state.timing[k])) el.checked = true;
      } else if (el.tagName === 'INPUT' && el.type !== 'radio') {
        el.value = this.state.timing[k];
      }
    });
    // 飞行速度/航线间距禁用逻辑（manualFlightTime > 0 时禁用）
    this.updateFlightFieldsDisabled();
    // 单循环亩数禁用逻辑（manualChargeCount > 0 时禁用）
    this.updateChargeFieldsDisabled();
  },

  /* 飞行速度/航线间距禁用状态更新 */
  updateFlightFieldsDisabled() {
    const manualFlightTime = Number(this.state.timing.manualFlightTime) || 0;
    const disabled = manualFlightTime > 0;
    ['inp-flightSpeed', 'inp-lineSpacing'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.dataset.disabled = disabled ? 'true' : '';
        el.readOnly = disabled;
      }
    });
  },

  /* 单循环亩数禁用状态更新（manualChargeCount > 0 时禁用，充电次数已手动指定） */
  updateChargeFieldsDisabled() {
    const manualChargeCount = Number(this.state.timing.manualChargeCount) || 0;
    const disabled = manualChargeCount > 0;
    const el = document.getElementById('inp-cycleArea');
    if (el) {
      el.dataset.disabled = disabled ? 'true' : '';
      el.readOnly = disabled;
    }
  },

  /* ============================================================
     ★★ 吊运模式 ★★
     ============================================================ */

  renderHaulParamForm() {
    const form = document.getElementById('paramForm');
    form.innerHTML = '';
    HAUL_FIELD_ORDER.param.forEach(key => this.appendField(form, key, 'haul'));
    this.syncHaulParamForm();
  },

  syncHaulParamForm() {
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    setVal('inp-totalWeight', this.state.haulField.totalWeight);
    setVal('inp-flightHeight', this.state.haulField.flightHeight);
  },

  renderHaulCostTabs() {
    const tabsContainer = document.getElementById('costTabs');
    const contentContainer = document.getElementById('tabContentContainer');
    tabsContainer.innerHTML = '';
    contentContainer.innerHTML = '';

    HAUL_TAB_CONFIG.forEach((tab, i) => {
      const btn = document.createElement('button');
      btn.className = 'tab-btn' + (i === 0 ? ' active' : '');
      btn.dataset.tab = tab.key;
      btn.textContent = tab.label;
      btn.addEventListener('click', () => this.switchCostTab(tab.key, 'haul'));
      tabsContainer.appendChild(btn);

      const content = document.createElement('div');
      content.className = 'tab-content' + (i === 0 ? ' active' : '');
      content.dataset.tab = tab.key;
      contentContainer.appendChild(content);
      const wrap = document.createElement('div');
      wrap.className = 'form-grid';
      content.appendChild(wrap);
      HAUL_FIELD_ORDER[tab.key].forEach(key => this.appendField(wrap, key, 'haul'));
    });
    this.syncHaulCostFormFromState();
  },

  syncHaulCostFormFromState() {
    Object.keys(this.state.haulCosts).forEach(k => {
      const el = document.getElementById(`inp-${k}`);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!this.state.haulCosts[k];
      else el.value = this.state.haulCosts[k];
    });
  },

  renderHaulIncomeForm() {
    const form = document.getElementById('incomeForm');
    form.innerHTML = '';
    HAUL_FIELD_ORDER.income.forEach(key => this.appendField(form, key, 'haul'));
    this.syncHaulIncomeFormFromState();
  },

  syncHaulIncomeFormFromState() {
    Object.keys(this.state.haulIncome).forEach(k => {
      const el = document.getElementById(`inp-${k}`);
      if (!el) return;
      el.value = this.state.haulIncome[k];
    });
  },

  /* ---------- 通用字段渲染 ---------- */
  appendField(container, key, mode) {
    const defs = mode === 'haul' ? HAUL_FIELD_DEFS : FIELD_DEFS;
    const def = defs[key];
    if (!def) return;

    if (def.type === 'check') {
      const lbl = document.createElement('label');
      lbl.className = 'field-check';
      const curVal = this.getFieldValue(key, mode);
      lbl.innerHTML = `<input type="checkbox" id="inp-${key}" ${curVal ? 'checked' : ''}><span>${def.label}</span>`;
      container.appendChild(lbl);
    } else if (def.type === 'radio') {
      // Radio 组（如充电模式选择）
      const wrap = document.createElement('div');
      wrap.className = 'field';
      const curVal = this.getFieldValue(key, mode);
      const tipHTML = def.tip ? `<i class="tip" data-tip="${this.escapeHtml(def.tip)}">i</i>` : '';
      let optionsHTML = '';
      (def.options || []).forEach((opt, i) => {
        const checked = curVal === opt.value ? 'checked' : '';
        // 仅第一个 radio 用 id（用于 label for），其他用 data-key
        const id = i === 0 ? `id="inp-${key}"` : '';
        optionsHTML += `<label><input type="radio" name="radio-${key}" value="${opt.value}" ${checked} ${id} data-key="${key}"><span>${opt.label}</span></label>`;
      });
      wrap.innerHTML = `
        <label>${def.label} ${tipHTML}</label>
        <div class="field-radio">${optionsHTML}</div>
      `;
      container.appendChild(wrap);
    } else {
      const wrap = document.createElement('div');
      wrap.className = 'field';
      const stepAttr = def.step ? ` step="${def.step}"` : '';
      const unitAttr = def.unit ? ` data-unit="${def.unit}"` : '';
      const unitClass = def.unit ? ' unit-suffix' : '';
      const tipHTML = def.tip ? `<i class="tip" data-tip="${this.escapeHtml(def.tip)}">i</i>` : '';
      const priorityAttr = def.priority === 'high' ? ` data-priority="high"` : '';
      const stStep = def.step || 1;

      wrap.innerHTML = `
        <label for="inp-${key}">${def.label} ${tipHTML}</label>
        <div class="stepper" data-step="${stStep}">
          <button type="button" class="st-btn st-minus" aria-label="减少">−</button>
          <div class="${unitClass}"${unitAttr}>
            <input type="number" id="inp-${key}" value="${this.getFieldValue(key, mode)}"${stepAttr}${priorityAttr}>
          </div>
          <button type="button" class="st-btn st-plus" aria-label="增加">＋</button>
        </div>
      `;
      container.appendChild(wrap);
    }

    // 绑定事件
    const el = document.getElementById(`inp-${key}`);
    if (el) {
      // input 事件：仅更新 state，不计算不警告（避免退格时立即覆盖）
      el.addEventListener('input', () => this.onFieldInput(key, el, mode));
      // change 事件（失焦）：触发计算 + 验证
      el.addEventListener('change', () => this.onFieldChange(key, el, mode));
    }
    // radio 组：所有同名 radio 都绑定（立即响应）
    if (def.type === 'radio') {
      const radios = container.querySelectorAll(`input[name="radio-${key}"]`);
      radios.forEach(r => {
        r.addEventListener('change', () => this.onFieldChange(key, r, mode));
      });
    }
  },

  /* input 事件：仅更新 state，不计算不警告 */
  onFieldInput(key, el, mode) {
    // checkbox/radio 不走 input 事件
    if (el.type === 'checkbox' || el.type === 'radio') return;
    let val = el.value === '' ? null : parseFloat(el.value);
    if (val === null) return;  // 退空时不更新 state
    this.updateState(key, val, mode);
    // 特殊处理：manualFlightTime 实时更新禁用状态（但不计算）
    if (key === 'manualFlightTime') {
      this.updateFlightFieldsDisabled();
    }
    // 特殊处理：manualChargeCount 实时更新单循环亩数禁用状态（但不计算）
    if (key === 'manualChargeCount') {
      this.updateChargeFieldsDisabled();
    }
  },

  /* 更新 state 的通用方法 */
  updateState(key, val, mode) {
    if (mode === 'haul') {
      if (key === 'totalWeight' || key === 'flightHeight') {
        this.state.haulField[key] = val;
      } else if (HAUL_FIELD_ORDER.income.includes(key)) {
        this.state.haulIncome[key] = val;
      } else {
        this.state.haulCosts[key] = val;
      }
    } else if (mode === 'timing') {
      this.state.timing[key] = val;
    } else {
      if (key === 'droneTank') {
        this.state.field[key] = val;
      } else if (key === 'existingPesticideSets') {
        this.state.field.existingPesticideSets = val;
      } else if (FIELD_ORDER.param.includes(key)) {
        this.state.plant[key] = val;
      } else if (FIELD_ORDER.income.includes(key)) {
        this.state.income[key] = val;
      } else {
        this.state.costs[key] = val;
      }
    }
  },

  getFieldValue(key, mode) {
    if (mode === 'haul') {
      if (key === 'totalWeight' || key === 'flightHeight') return this.state.haulField[key];
      if (HAUL_FIELD_ORDER.income.includes(key)) return this.state.haulIncome[key];
      return this.state.haulCosts[key];
    } else if (mode === 'timing') {
      return this.state.timing[key];
    } else {
      // field 类参数（不在 plant 内）
      if (key === 'droneTank') return this.state.field[key];
      if (key === 'existingPesticideSets') return this.state.field.existingPesticideSets;
      // plant 类参数
      if (FIELD_ORDER.param.includes(key)) return this.state.plant[key];
      if (FIELD_ORDER.income.includes(key)) return this.state.income[key];
      return this.state.costs[key];
    }
  },

  onFieldChange(key, el, mode) {
    let val;
    if (el.type === 'checkbox') val = el.checked;
    else if (el.type === 'radio') val = el.value;
    else val = el.value === '' ? 0 : parseFloat(el.value);

    // 输入验证（数值字段）
    if (el.type !== 'checkbox' && el.type !== 'radio') {
      const def = (mode === 'haul' ? HAUL_FIELD_DEFS : FIELD_DEFS)[key];
      if (def) {
        // 整数约束：自动取整
        if (def.integer && typeof val === 'number' && !isNaN(val)) {
          val = Math.round(val);
          if (el.value != val) el.value = val;
        }
        // 硬性最小值：拒绝并弹窗
        if (def.minHard !== undefined && val < def.minHard) {
          el.value = def.minHard;
          val = def.minHard;
          this.toast(`⚠️ ${def.label}不能低于 ${def.minHard}，已自动修正`, 'warn');
        } else if (def.min !== undefined && val < def.min) {
          this.toast(`⚠️ ${def.label}=${val} 偏低（建议 ≥ ${def.min}）`, 'warn');
        }
        // 视觉警告标记
        let warn = false;
        if (def.warnBelow !== undefined && val < def.warnBelow) warn = true;
        if (def.warnAbove !== undefined && val > def.warnAbove) warn = true;
        el.dataset.warn = warn ? 'true' : '';
        el.dataset.invalid = '';
      }
    }

    // 更新 state
    this.updateState(key, val, mode);
    // 特殊处理：manualFlightTime 变化时更新禁用状态
    if (key === 'manualFlightTime') {
      this.updateFlightFieldsDisabled();
    }
    // 特殊处理：manualChargeCount 变化时更新单循环亩数禁用状态
    if (key === 'manualChargeCount') {
      this.updateChargeFieldsDisabled();
    }
    this.compute();
    this.save();
  },

  /* ---------- 计算 & 渲染结果 ---------- */
  compute() {
    if (this.state.mode === 'spray') {
      const r = Calculator.computePlots(this.state);
      this.renderSprayResults(r);
      this.renderPlotsTable(r);
      this.renderSummary(r, 'spray');
      this._lastResult = r;
      // 工单弹窗开着时同步刷新（如切换包药开关）
      if (document.getElementById('workOrderModal')?.classList.contains('show')) {
        this.renderWorkOrderQuick();
      }
    } else {
      const r = Calculator.computeHaul({
        field: this.state.haulField,
        costs: this.state.haulCosts,
        income: this.state.haulIncome
      });
      this.renderHaulResults(r);
      this.renderSummary(r, 'haul');
      this._lastResult = r;
    }
    return this._lastResult;
  },

  renderSprayResults(r) {
    const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const fmt = Calculator.fmt.bind(Calculator);

    /* 药剂卡片：主显示现有药量，参考行显示公式算的参考药量 */
    setText('rPesticide', r.existingSets);
    // 库存状态文案（参考药量显示：小数原值 → 取整值）
    let stockText;
    if (r.stockStatus === 'none') {
      stockText = `无库存，需 ${fmt(r.pesticide, 2)} 套 → 采购 ${r.pesticideRounded} 套（7舍8入）`;
    } else if (r.stockStatus === 'enough') {
      const surplus = r.existingSets - r.pesticideRounded;
      stockText = `库存充足（多 ${surplus} 套）| 需 ${fmt(r.pesticide, 2)} 套 → 采购 ${r.pesticideRounded} 套`;
    } else { // short
      stockText = `库存不足，需补购 ${r.needToBuy} 套 | 需 ${fmt(r.pesticide, 2)} 套 → 采购 ${r.pesticideRounded} 套`;
    }
    document.getElementById('rPesticideDetail').textContent = stockText;
    document.getElementById('rPesticideFormula').textContent =
      `现有 ${r.existingSets} 套 | 需求合计 ${fmt(r.pesticide, 2)} 套 → 采购 ${r.pesticideRounded} 套（合计后7舍8入）`;

    setText('rWater', fmt(r.totalAddWater != null ? r.totalAddWater : r.water, 1));
    document.getElementById('rWaterDetail').textContent =
      `Σ ${r.plots.length} 个地块 · 机载上限 ${r.droneTank} 升/趟 · 共 ${r.totalTrips} 趟` +
      (r.spareWater > 0 ? ` · 计算水量 ${fmt(r.water, 1)} + 富余 ${fmt(r.spareWater, 0)}` : '');
    document.getElementById('rWaterFormula').textContent =
      `公式: 亩数 × 每亩水量（无人机喷洒量，独立于药量计算）`;

    setText('rCost', Calculator.fmtMoney(r.totalCost));
    document.getElementById('rCostDetail').textContent =
      `每亩 ¥${Calculator.fmtMoney(r.costPerMu)}`;
    document.getElementById('rCostFormula').textContent =
      r.pesticideIncluded
        ? `公式: 电池折旧×${r.cycles}次充电 + 油费 + 人工 + 药剂(${r.needToBuy}套补购×¥${Calculator.fmtMoney(Number(this.state.costs.pesticidePrice)||0)}) + 设备折旧 + 其他`
        : `公式: 电池折旧×${r.cycles}次充电 + 油费 + 人工 + 设备折旧 + 其他（不包药，无药剂成本）`;

    setText('rProfit', Calculator.fmtMoney(r.profit));
    const profitCard = document.querySelector('#sprayResults .result-card.profit');
    profitCard.dataset.loss = r.profit < 0 ? 'true' : 'false';
    document.getElementById('rProfitDetail').textContent =
      r.profit >= 0 ? `利润率 ${(r.profit / Math.max(1, r.income) * 100).toFixed(1)}%` : `亏损 ¥${Calculator.fmtMoney(-r.profit)}`;
    document.getElementById('rProfitFormula').textContent =
      `公式: 总收入 ¥${Calculator.fmtMoney(r.income)} − 总成本 ¥${Calculator.fmtMoney(r.totalCost)}`;

    setText('rHeight', `${fmt(this.state.plant.flightHeight, 1)} 米`);
    setText('rCycles', `${r.cycles} 次`);
    // 电池台账提示：缓存本次充电次数（手动/参考），更新台账提示行
    this._lastCycles = r.cycles;
    this._lastChargeSource = r.chargeSource || 'estimate';
    this.updateBatteryCalcHint();
    const cyclesSub = document.getElementById('rCyclesSub');
    if (cyclesSub) {
      cyclesSub.textContent = r.chargeSource === 'manual'
        ? '（手动）'
        : (r.cycles > 0 ? `（参考：总面积÷${fmt(Number(this.state.costs.cycleArea) || 2, 1)}亩）` : '');
    }
    setText('rCostPerMu', `¥${Calculator.fmtMoney(r.costPerMu)}`);
    setText('rProfitPerMu', `¥${Calculator.fmtMoney(r.profitPerMu)}`);
    setText('rSprayIncome', `¥${Calculator.fmtMoney(r.income)}`);

    // 浓度：紧凑显示"现有 X / 参考 Y"（单位省略，靠标签说明）
    const existingConc = r.water > 0 ? (r.existingSets / r.water) * 100 : 0;
    const refConc = r.concentration || 0;
    setText('rConcentration',
      (existingConc > 0 || refConc > 0)
        ? `${fmt(existingConc, 2)} / ${fmt(refConc, 2)}`
        : '—');

    setText('rPesticideIncluded', r.pesticideIncluded ? '是（含药剂成本）' : '否（农户自备）');
    setText('rChargeOil', r.perChargeOil != null ? `¥${fmt(r.perChargeOil, 2)} / 次` : '—');

    // 药剂卡片库存状态视觉提示
    const pesticideCard = document.querySelector('#sprayResults .result-card.pesticide');
    if (pesticideCard) {
      pesticideCard.dataset.stock = r.stockStatus;
    }

    // 渲染作业时间
    this.renderTimingResults(r.timing);

    document.querySelectorAll('#sprayResults .result-value').forEach(el => {
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 600);
    });
  },

  /* ---------- 渲染作业时间结果 ---------- */
  renderTimingResults(t) {
    if (!t) return;
    const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const fmt1 = (n) => Calculator.fmt(n, 1);
    const fdur = (min) => Calculator.formatDuration(min);

    // 兑水兑药：首批串行在前，其余批次与飞行并行
    setText('tMixTime', fdur(t.mixTotalTime));
    document.getElementById('tMixDetail').textContent =
`${t.mixRounds}批 × ${fmt1(this.state.timing.baseMixTime)}min（首批串行，其余与飞行并行；每批留抽药空间后补满）`;

    // 飞行作业
    setText('tFlightTime', fdur(t.flightTimeMin));
    document.getElementById('tFlightDetail').textContent =
      t.flightTimeSource === 'manual'
        ? '✓ 准确时间（手动输入）'
        : '参考时间（按亩数与航线间距估算）';

    // 装载合计（转场概念已删除，地块远近统一由来回升降时间体现）
    setText('tRoundTrip', fdur(t.roundTripTotal));
    document.getElementById('tRoundTripDetail').textContent =
      `装载${fmt1(t.totalLoad)}min（每趟升降按时间参数的来回升降时间计）`;

    // 电池等待
    setText('tBatteryWait', fdur(t.batteryWait));
    const modeText = { generator: '仅发电机', threePhase: '仅三相电', dual: '三相电+发电机' }[t.chargeMode] || '';
    document.getElementById('tBatteryDetail').textContent =
      `${t.batteryCount}块电池 | ${modeText}`;

    // 总时间：50min+9min 格式（主显示）
    let totalTimeDisplay = fdur(t.totalTime);
    if (t.chargeAfterWork && t.afterWorkCharge > 0) {
      totalTimeDisplay += '+' + fdur(t.afterWorkCharge);
    }
    setText('tTotalTime', totalTimeDisplay);
    // 下方小字注明
    let totalDetailText;
    if (t.chargeAfterWork && t.afterWorkCharge > 0) {
      totalDetailText = `估算${fdur(t.totalTime)} + 结束充电${fdur(t.afterWorkCharge)}`;
    } else if (t.chargeAfterWork) {
      totalDetailText = `⏱️ 估算（结束充电0min）`;
    } else {
      totalDetailText = `⏱️ 估算（不充满）`;
    }
    document.getElementById('tTotalDetail').textContent = totalDetailText;

    // 公式注释：首批兑药串行，其余批次与飞行并行，两者取大者
    let formulaText = `总时间 = max(兑药 ${fdur(t.mixTotalTime)}（${t.mixRounds}批串行流水）, 首批兑药 ${fdur(t.firstMixTime)} + 飞行阶段 ${fdur(t.flightSpan)}（飞行${fdur(t.flightTimeMin)}+升降装载${fdur(t.roundTripTotal)}+电池等待${fdur(t.batteryWait)}）) = ${fdur(t.totalTime)}`;
    if (t.chargeAfterWork && t.afterWorkCharge > 0) {
      formulaText += ` + 结束后充电 ${fdur(t.afterWorkCharge)} = ${fdur(t.totalTimeWithCharge)}`;
    }
    document.getElementById('timingFormula').textContent = formulaText;

    // 模式提示
    document.getElementById('timingModeHint').textContent =
      `⏱️ 估算 · ${t.batteryCount}块电池 · ${modeText}`;

    // 同步到结果区的作业时间小框（含结束后充电用 + 链接）
    const rTiming = document.getElementById('rTiming');
    if (rTiming) {
      let timingText = fdur(t.totalTime);
      if (t.chargeAfterWork && t.afterWorkCharge > 0) {
        timingText += ` +${fdur(t.afterWorkCharge)}`;
      }
      rTiming.textContent = timingText;
    }

    // 循环数小框副文案：与浓度一致的同行格式 "5次 | 2次无等待"
    const rCyclesSub = document.getElementById('rCyclesSub');
    if (rCyclesSub) {
      const noWait = t.noWaitCount || 0;
      const total = t.batteryCycles ? t.batteryCycles.length : 0;
      rCyclesSub.textContent = total > 0 ? `| ${noWait}次无等待` : '';
    }

    // 渲染电池循环可视化色块条
    this.renderBatteryViz(t);
  },

  /* ---------- 渲染电池循环可视化色块条 ---------- */
  renderBatteryViz(t) {
    const bar = document.getElementById('batteryVizBar');
    const summary = document.getElementById('batteryVizSummary');
    if (!bar || !t.batteryCycles) return;

    const cycles = t.batteryCycles;
    const totalCycles = cycles.length;
    const noWait = t.noWaitCount || 0;
    const totalWait = t.batteryWait || 0;

    // 单次循环时间 T = 来回升降 + 飞行作业/循环数
    const T = t.T || (Number(this.state.timing.roundTripTime) || 3);
    const genTime = Number(this.state.timing.generatorChargeTime) || 8;
    const threeTime = Number(this.state.timing.threePhaseChargeTime) || 5;

    bar.innerHTML = '';

    // 渲染作业循环色块
    cycles.forEach((c, i) => {
      const block = document.createElement('div');
      block.className = 'viz-block';
      block.dataset.idx = c.idx;

      // 用该轮实际充电时间算瓶颈
      const actualChgTime = c.chargeTime || (c.charger === 'generator' ? genTime : threeTime);
      const bottleneck = Math.max(0, actualChgTime - T);
      const maxActualWait = Math.max(...cycles.map(cc => cc.wait), 0);
      const denominator = Math.max(bottleneck, maxActualWait, 0.01);

      const color = this.getWaitColor(c.wait, denominator);

      block.style.background = color;
      const waitText = c.wait > 0 ? '+' + Calculator.formatDuration(c.wait) : '';
      const bottleneckText = `瓶颈${bottleneck.toFixed(1)}min`;
      const chargerLabel = c.charger === 'generator' ? '发电机' : '三相电';
      block.innerHTML = `
        <div class="viz-block-num">#${c.idx}</div>
        ${waitText ? `<div class="viz-block-wait">${waitText}</div>` : `<div class="viz-block-wait" style="opacity:0.6">${bottleneckText}</div>`}
        <div class="viz-block-tooltip">循环#${c.idx}: ${c.wait > 0 ? '等' + Calculator.formatDuration(c.wait) : '无等待'} | 瓶颈${bottleneck.toFixed(1)}min | 电池${c.battery + 1} | ${chargerLabel}充${actualChgTime}min | ${c.tStart.toFixed(1)}→${c.tEnd.toFixed(1)}min</div>
      `;

      block.addEventListener('click', () => {
        document.querySelectorAll('.viz-block').forEach(b => b.classList.remove('active'));
        block.classList.add('active');
        this.showBatteryCycleDetail(c, t, T, bottleneck);
      });

      bar.appendChild(block);
    });

    // 作业完成虚线分隔
    if (t.chargeAfterWork && t.afterWorkBlocks && t.afterWorkBlocks.length > 0) {
      const divider = document.createElement('div');
      divider.className = 'viz-divider';
      divider.innerHTML = '<div class="viz-divider-text">作业完成</div>';
      bar.appendChild(divider);

      // 渲染结束后充电蓝色块（每块电池一个）
      t.afterWorkBlocks.forEach(b => {
        const block = document.createElement('div');
        block.className = 'viz-block viz-block-after';
        block.style.background = '#1976d2';  // 蓝色
        const chgLabel = b.charger === 'threePhase-1' || b.charger === 'threePhase-2' ? '三相电' : '三相电';
        block.innerHTML = `
          <div class="viz-block-num">🔋${b.idx + 1}</div>
          <div class="viz-block-wait">${Calculator.formatDuration(b.time)}</div>
          <div class="viz-block-tooltip">结束后充电: 电池${b.idx + 1} | ${chgLabel} | ${b.startAt.toFixed(1)}→${b.endAt.toFixed(1)}min</div>
        `;
        block.addEventListener('click', () => {
          document.querySelectorAll('.viz-block').forEach(bb => bb.classList.remove('active'));
          block.classList.add('active');
          this.showAfterWorkDetail(b, t);
        });
        bar.appendChild(block);
      });
    }

    // 汇总文案
    let summaryText = totalCycles > 0
      ? `共 ${totalCycles} 轮循环：${noWait} 轮无等待，${totalCycles - noWait} 轮等待，总等待 ${Calculator.formatDuration(totalWait)}`
      : '—';
    if (t.chargeAfterWork && t.afterWorkCharge > 0) {
      summaryText += `；结束后充电 ${Calculator.formatDuration(t.afterWorkCharge)}（${t.afterWorkBlocks.length} 块电池）`;
    } else if (t.chargeAfterWork) {
      summaryText += `；结束后充电 0min（所有电池已满）`;
    } else {
      summaryText += `；不充满电直接走`;
    }
    summaryText += `。点击色块查看详情`;
    summary.textContent = summaryText;

    // 算法公式说明（精简版，只展示核心电池充电/等待算法）
    const formulaEl = document.getElementById('batteryVizFormula');
    if (formulaEl) {
      const modeLabel = { generator: '发电机', threePhase: '三相电', dual: '三相电+发电机' }[t.chargeMode] || '';
      const afterWorkText = t.chargeAfterWork
        ? `<div class="bv-formula-line">• 结束后充电：单充电器串行，有三相电用三相电（成本低），无则用发电机</div>`
        : `<div class="bv-formula-line">• 结束后不充电，作业完成即走</div>`;
      formulaEl.innerHTML = `
        <div class="bv-formula-title">📋 电池充电/等待算法</div>
        <div class="bv-formula-line">• 单次循环时间 T = ${T.toFixed(1)}min（升降+加药装载 + 飞行作业÷循环数）</div>
        <div class="bv-formula-line">• 瓶颈 = 充电时间 − T（飞行期间电池在充电，可抵消部分）</div>
        <div class="bv-formula-line">• 等待比例 = 该轮等待 ÷ 瓶颈 → 颜色：0=绿(无等待), 1=红(满瓶颈)</div>
        <div class="bv-formula-line">• ${modeLabel}模式：${t.chargeMode === 'dual' ? '两个充电器并行，每轮记录实际充电器' : '单充电器，电池需排队'}</div>
        ${afterWorkText}
      `;
    }
  },

  /* 等待时间 → 颜色映射
     denominator = 理论瓶颈(Chg - T) 或实际最大等待
     ratio = wait / denominator
     0 → 绿(无等待), 1 → 红(满瓶颈)
  */
  getWaitColor(wait, denominator) {
    if (wait <= 0) return '#2e7d32';  // 绿：无等待
    const ratio = Math.min(1, wait / Math.max(denominator, 0.01));
    if (ratio < 0.3) {
      // 0~30%: 绿黄渐变（少量等待）
      return this.lerpColor('#2e7d32', '#ff9800', ratio / 0.3);
    } else if (ratio < 0.7) {
      // 30%~70%: 黄（中等等待）
      return '#ff9800';
    } else {
      // 70%~100%: 黄红渐变（充电瓶颈）
      return this.lerpColor('#ff9800', '#c62828', (ratio - 0.7) / 0.3);
    }
  },

  /* 颜色插值 */
  lerpColor(c1, c2, t) {
    const r1 = parseInt(c1.slice(1, 3), 16), g1 = parseInt(c1.slice(3, 5), 16), b1 = parseInt(c1.slice(5, 7), 16);
    const r2 = parseInt(c2.slice(1, 3), 16), g2 = parseInt(c2.slice(3, 5), 16), b2 = parseInt(c2.slice(5, 7), 16);
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  },

  /* 显示单轮详情面板 */
  showBatteryCycleDetail(c, t, T, bottleneck) {
    const detail = document.getElementById('batteryVizDetail');
    const content = document.getElementById('batteryVizDetailContent');
    if (!detail || !content) return;

    const chargerText = { generator: '发电机', threePhase: '三相电', dual: '双充' }[c.charger] || c.charger;
    const status = c.wait > 0 ? `等待 ${Calculator.formatDuration(c.wait)}` : '无等待';

    content.innerHTML = `
      <table>
        <tr><td>循环编号</td><td>#${c.idx}</td></tr>
        <tr><td>状态</td><td style="color:${c.wait > 0 ? '#ef6c00' : '#2e7d32'}">${status}</td></tr>
        <tr><td>使用电池</td><td>第 ${c.battery + 1} 块</td></tr>
        <tr><td>单次循环T</td><td>${T.toFixed(1)} min</td></tr>
        <tr><td>该轮瓶颈</td><td>${bottleneck.toFixed(1)} min</td></tr>
        <tr><td>开始时刻</td><td>${c.tStart.toFixed(1)} min</td></tr>
        <tr><td>结束时刻</td><td>${c.tEnd.toFixed(1)} min</td></tr>
        <tr><td>充电器</td><td>${chargerText}（${c.chargeTime || '-'}min）</td></tr>
        <tr><td>充电时段</td><td>${c.chargeStart.toFixed(1)} → ${c.chargeEnd.toFixed(1)} min</td></tr>
      </table>
    `;
    detail.style.display = 'block';
  },

  /* 显示结束后充电详情 */
  showAfterWorkDetail(b, t) {
    const detail = document.getElementById('batteryVizDetail');
    const content = document.getElementById('batteryVizDetailContent');
    if (!detail || !content) return;

    const chgLabel = b.charger === 'threePhase-1' || b.charger === 'threePhase-2' ? '三相电（双充）' : '三相电';

    content.innerHTML = `
      <table>
        <tr><td>类型</td><td style="color:#1976d2">🔋 结束后充电</td></tr>
        <tr><td>电池编号</td><td>第 ${b.idx + 1} 块</td></tr>
        <tr><td>充电器</td><td>${chgLabel}</td></tr>
        <tr><td>开始时刻</td><td>${b.startAt.toFixed(1)} min</td></tr>
        <tr><td>结束时刻</td><td>${b.endAt.toFixed(1)} min</td></tr>
        <tr><td>充电时长</td><td>${Calculator.formatDuration(b.time)}</td></tr>
        <tr><td>说明</td><td>作业完成后继续充满此电池</td></tr>
      </table>
    `;
    detail.style.display = 'block';
  },

  renderHaulResults(r) {
    const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const fmt = Calculator.fmt.bind(Calculator);

    // 总躺数
    setText('rTrips', r.totalTrips);
    document.getElementById('rTripsDetail').textContent =
      `${fmt(this.state.haulField.totalWeight, 0)} 斤 ÷ ${fmt(this.state.haulCosts.weightPerTrip, 0)} 斤/躺`;
    document.getElementById('rTripsFormula').textContent =
      `公式: ⌈总斤数 ÷ 一躺多少斤⌉ （一躺=一个来回）`;

    // 电池循环
    setText('rBatteryCycles', r.batteryCycles);
    document.getElementById('rBatteryCyclesDetail').textContent =
      `${r.totalTrips} 躺 ÷ ${this.state.haulCosts.tripsPerBatteryCycle} 躺/组`;
    document.getElementById('rBatteryCyclesFormula').textContent =
      `公式: ⌈总躺数 ÷ 多少躺一组电池⌉`;

    // 总成本
    setText('rHaulCost', Calculator.fmtMoney(r.totalCost));
    document.getElementById('rHaulCostDetail').textContent =
      `每斤 ¥${Calculator.fmtMoney(r.costPerJin)}`;
    document.getElementById('rHaulCostFormula').textContent =
      `公式: 电池折旧×${r.batteryCycles}次充电 + 油费 + 无人机人工 + 采摘人工 + 设备折旧 + 其他`;

    // 粗利润
    setText('rHaulProfit', Calculator.fmtMoney(r.profit));
    const profitCard = document.querySelector('#haulResults .result-card.profit');
    profitCard.dataset.loss = r.profit < 0 ? 'true' : 'false';
    document.getElementById('rHaulProfitDetail').textContent =
      r.profit >= 0 ? `利润率 ${(r.profit / Math.max(1, r.income) * 100).toFixed(1)}%` : `亏损 ¥${Calculator.fmtMoney(-r.profit)}`;
    document.getElementById('rHaulProfitFormula').textContent =
      `公式: 总收入 ¥${Calculator.fmtMoney(r.income)} − 总成本 ¥${Calculator.fmtMoney(r.totalCost)}`;

    // 额外信息
    setText('rHaulHeight', `${fmt(this.state.haulField.flightHeight, 1)} 米`);
    setText('rTotalWeight', `${fmt(this.state.haulField.totalWeight, 0)} 斤`);
    setText('rCostPerJin', `¥${Calculator.fmtMoney(r.costPerJin)}`);
    setText('rProfitPerJin', `¥${Calculator.fmtMoney(r.profitPerJin)}`);
    setText('rHaulIncome', `¥${Calculator.fmtMoney(r.income)}`);
    setText('rPickupIncluded', r.pickupIncluded ? '是（含采摘人工）' : '否（农户自采）');

    document.querySelectorAll('#haulResults .result-value').forEach(el => {
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 600);
    });
  },

  renderSummary(r, mode) {
    const tbody = document.getElementById('summaryBody');
    const c = r.costBreakdown;
    const total = r.totalCost || 1;
    let items, totalFormulaText, summaryFormulaText;

    if (mode === 'haul') {
      items = [
        { name: '🔋 电池循环(折旧)', val: c.cycle || 0, color: '#ab47bc' },
        { name: '⛽ 油费(本次)', val: c.fuel || 0, color: '#29b6f6' },
        { name: '🚁 无人机人工', val: c.droneLabor || 0, color: '#ffa726' },
        { name: '🧺 采摘人工', val: c.pickupLabor || 0, color: '#ef5350' },
        { name: '🛠 设备折旧/维修/保险', val: c.equipment || 0, color: '#8d6e63' },
        { name: '📦 其他(防护/清洗/杂)', val: c.other || 0, color: '#78909c' }
      ];
      totalFormulaText = `总成本 = 电池折旧×循环数 + 本次油费 + 无人机人工 + 采摘人工 + 设备折旧 + 其他 = ¥${Calculator.fmtMoney(r.totalCost)}`;
      summaryFormulaText = '粗利润 = 总收入 − 总成本';
    } else {
      items = [
        { name: '🔋 循环(电池折旧)', val: c.cycle || 0, color: '#ab47bc' },
        { name: '⛽ 油费(本次)', val: c.fuel || 0, color: '#29b6f6' },
        { name: '👥 人工(工资/餐/宿)', val: c.labor || 0, color: '#ffa726' },
        { name: '💊 药剂', val: c.pesticide || 0, color: '#66bb6a' },
        { name: '🛠 设备折旧/维修/保险', val: c.equipment || 0, color: '#8d6e63' },
        { name: '📦 其他(防护/清洗/杂)', val: c.other || 0, color: '#78909c' }
      ];
      totalFormulaText = `总成本 = 电池折旧×充电次数 + 本次油费 + 人工 + 药剂 + 设备折旧 + 其他 = ¥${Calculator.fmtMoney(r.totalCost)}${r.perChargeOil != null ? ` ｜ 每次充电油钱 ¥${Calculator.fmtMoney(r.perChargeOil)}` : ''}`;
      summaryFormulaText = '粗利润 = 总收入 − 总成本';
    }

    document.getElementById('summaryFormula').textContent = summaryFormulaText;
    document.getElementById('totalFormula').textContent = totalFormulaText;

    tbody.innerHTML = items.map(it => {
      const pct = (it.val / total * 100).toFixed(1);
      const barW = Math.max(2, it.val / total * 100);
      return `<tr>
        <td>${it.name}</td>
        <td>${Calculator.fmtMoney(it.val)}</td>
        <td><span class="cost-bar" style="width:${barW}%;background:${it.color}"></span>${pct}%</td>
      </tr>`;
    }).join('');
    document.getElementById('summaryTotal').textContent = Calculator.fmtMoney(r.totalCost);
  },

  /* ---------- 保存状态 ---------- */
  save() {
    Storage.saveState({
      mode: this.state.mode,
      plant: this.state.plant,
      field: this.state.field,
      costs: this.state.costs,
      income: this.state.income,
      timing: this.state.timing,
      haulField: this.state.haulField,
      haulCosts: this.state.haulCosts,
      haulIncome: this.state.haulIncome,
      workOrder: this.state.workOrder
    });
  },

  /* ---------- 恢复默认（打药/吊运独立）---------- */
  resetDefaults() {
    if (this.state.mode === 'spray') {
      this.confirmDialog('确定恢复打药模式所有参数为默认值？当前打药模式的所有参数将被重置。', () => {
        this._doResetDefaults('spray');
      }, { title: '恢复默认' });
      return;
    }
    this.confirmDialog('确定恢复吊运模式所有参数为默认值？当前吊运模式的所有参数将被重置。', () => {
      this._doResetDefaults('haul');
    }, { title: '恢复默认' });
  },

  _doResetDefaults(mode) {
    if (mode === 'spray') {
      // 保留用药类型，重置其他打药参数
      const keepPlant = this.state.plant;
      this.state.field = { ...DEFAULT_FIELD };
      this.state.costs = { ...DEFAULT_COSTS };
      this.state.income = { ...DEFAULT_INCOME };
      this.state.timing = { ...DEFAULT_TIMING };
      this.state.plant = keepPlant || { ...PLANT_DATABASE.shajun };
      this.ensurePlots();
      this.toast('打药模式已恢复默认', 'success');
    } else {
      this.state.haulField = { ...DEFAULT_HAUL_FIELD };
      this.state.haulCosts = { ...DEFAULT_HAUL_COSTS };
      this.state.haulIncome = { ...DEFAULT_HAUL_INCOME };
      this.toast('吊运模式已恢复默认', 'success');
    }
    this.applyMode(this.state.mode);
    this.save();
  },

  /* ---------- 事件绑定 ---------- */
  bindEvents() {
    document.getElementById('themeBtn').addEventListener('click', () => this.toggleTheme());

    // 恢复默认按钮
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetDefaults());
    }

    // 电池循环可视化关闭按钮
    const batteryVizClose = document.getElementById('batteryVizClose');
    if (batteryVizClose) {
      batteryVizClose.addEventListener('click', () => {
        document.getElementById('batteryVizDetail').style.display = 'none';
        document.querySelectorAll('.viz-block').forEach(b => b.classList.remove('active'));
      });
    }

    // 地块编辑器事件委托（行内编辑/增删/档位，重渲染后依然有效）
    const plotsEditor = document.getElementById('plotsEditor');
    if (plotsEditor) {
      plotsEditor.addEventListener('input', e => {
        const row = e.target.closest('.plot-card');
        if (!row) return;
        const plot = (this.state.field.plots || []).find(p => String(p.id) === row.dataset.id);
        if (!plot) return;
        if (e.target.classList.contains('plot-name')) {
          plot.name = e.target.value;
        } else if (e.target.classList.contains('plot-size')) {
          const v = parseFloat(e.target.value);
          plot.area = isNaN(v) ? 0 : Math.max(0, v);
        } else if (e.target.classList.contains('plot-group')) {
          const v = parseInt(e.target.value, 10);
          plot.groupId = (!v || v < 1) ? 1 : Math.min(9, Math.round(v));
        }
        // 卡片底部统计实时刷新
        const stat = row.querySelector('.plot-stat');
        if (stat) {
          stat.innerHTML = this.plotStatText(plot);
        }
        this.compute();
      });
      plotsEditor.addEventListener('change', e => {
        // 农户下拉（change 语义：选择即生效）
        if (e.target.classList.contains('plot-farmer')) {
          const row = e.target.closest('.plot-card');
          const plot = (this.state.field.plots || []).find(pl => String(pl.id) === row.dataset.id);
          if (!plot) return;
          if (e.target.value === '__new') {
            // APK WebView 不支持 prompt：打开档案弹窗建档，保存后自动绑定该地块
            e.target.value = plot.farmerId || 'farmer_default';
            this._pendingBindPlotId = plot.id;
            this.openFarmersModal();
            this._editingFarmerId = null;
            this.renderFarmerForm();
            setTimeout(() => { const el = document.getElementById('ff-name'); if (el) el.focus(); }, 80);
          } else {
            this.assignPlotFarmer(plot, e.target.value);
          }
          this.compute();
          this.save();
          return;
        }
        this.save();
      });
      plotsEditor.addEventListener('click', e => {
        if (e.target.closest('.plot-add')) {
          this.addPlot();
          return;
        }
        const saveTpl = e.target.closest('.plot-save-tpl');
        if (saveTpl) {
          const rowEl = saveTpl.closest('.plot-card');
          const plot = (this.state.field.plots || []).find(pl => String(pl.id) === rowEl.dataset.id);
          if (plot) this.savePlotTemplate(plot);
          return;
        }
        const loadTpl = e.target.closest('.plot-load-tpl');
        if (loadTpl) {
          const rowEl = loadTpl.closest('.plot-card');
          const plot = (this.state.field.plots || []).find(pl => String(pl.id) === rowEl.dataset.id);
          if (plot) this.loadPlotTemplate(plot);
          return;
        }
        const del = e.target.closest('.plot-del');
        if (del) {
          const row = del.closest('.plot-card');
          this.state.field.plots = (this.state.field.plots || []).filter(p => String(p.id) !== row.dataset.id);
          this.renderPlotsEditor();
          this.compute();
          this.save();
        }
      });
    }

    document.getElementById('calcBtn').addEventListener('click', () => {
      this.flyDrone();
      this.compute();
      this.toast('计算完成 ✈️', 'success');
      const r = this._lastResult;
      Storage.addHistory({
        mode: this.state.mode,
        plant: this.state.mode === 'spray' ? this.state.plant.name : '吊运',
        area: this.state.mode === 'spray'
          ? (this._lastResult && this._lastResult.area != null ? this._lastResult.area : this.state.field.area)
          : this.state.haulField.totalWeight,
        pesticide: r.pesticide || r.totalTrips || 0,
        water: r.water || 0,
        totalCost: r.totalCost,
        profit: r.profit
      });
    });

    // 作业工单
    document.getElementById('workOrderBtn').addEventListener('click', () => this.openWorkOrder());
    document.getElementById('copyWorkOrder').addEventListener('click', () => {
      const txt = this.buildWorkOrderText();
      if (!txt) {
        this.toast('请先完成一次计算', 'warn');
        return;
      }
      this.copyToClipboard(txt).then(ok => {
        this.toast(ok ? '纯文本工单已复制到剪贴板 📋' : '复制失败，请手动选择文本', ok ? 'success' : 'error');
      });
    });

    // 组汇总条：组趟数 ±（事件委托在结果区容器上）
    const plotsWrap = document.getElementById('plotsTableWrap');
    if (plotsWrap) {
      plotsWrap.addEventListener('click', e => {
        const btn = e.target.closest('.group-trips-btn');
        if (!btn) return;
        this.adjustGroupTrips(btn.dataset.g, parseInt(btn.dataset.delta, 10));
      });
    }

    // 工单快捷修改（事件委托：重渲染后依然有效）
    const woQuick = document.getElementById('workOrderQuick');
    if (woQuick) {
      woQuick.addEventListener('input', e => {
        const wo = this.getWorkOrder();
        const r = this._lastResult;
        if (e.target.classList.contains('wo-completed')) {
          const v = parseFloat(e.target.value);
          wo.completedByPlot[e.target.dataset.id] = isNaN(v) ? 0 : Math.max(0, v);
          const restEl = woQuick.querySelector(`.wo-plot-rest[data-id="${e.target.dataset.id}"]`);
          const plot = r && r.plots ? r.plots.find(p => String(p.id) === String(e.target.dataset.id)) : null;
          if (restEl && plot) {
            const done = wo.completedByPlot[plot.id] || 0;
            const rest = Math.max(0, plot.water - done);
            restEl.textContent = `剩余 ${Calculator.fmt(rest, 1)} 升 ≈ ${plot.perTripWater > 0 ? Math.ceil(rest / plot.perTripWater) : 0} 趟`;
          }
        } else if (e.target.classList.contains('wo-single')) {
          const v = parseFloat(e.target.value);
          wo.completedSingle = isNaN(v) ? 0 : Math.max(0, v);
          const restEl = document.getElementById('woRestSingle');
          if (restEl && r) restEl.textContent = `剩余 ${Calculator.fmt(Math.max(0, r.water - wo.completedSingle), 1)} 升`;
        } else if (e.target.classList.contains('wo-sets')) {
          const v = parseFloat(e.target.value);
          wo.actualSets = isNaN(v) ? 0 : Math.max(0, v);
          // 汇总卡/续药条随实际套数联动刷新（重渲染后输入框失焦可接受，该字段改动频率低）
          this.renderWorkOrderQuick();
          return;
        } else if (e.target.classList.contains('wo-self')) {
          const v = parseFloat(e.target.value);
          wo.selfByFarmer = wo.selfByFarmer || {};
          wo.selfByFarmer[e.target.dataset.fid] = isNaN(v) ? 0 : Math.max(0, v);
          this.compute();   // 重算结算并经弹窗钩子重渲染
          this.save();
          return;
        } else if (e.target.classList.contains('wo-note')) {
          wo.note = e.target.value;
        } else if (e.target.classList.contains('wo-farmer')) {
          this.state.field.farmerName = e.target.value;
        } else {
          return;
        }
        this.save();
      });
    }

    document.getElementById('presetBtn').addEventListener('click', () => this.openPresetModal());
    document.getElementById('savePresetBtn').addEventListener('click', () => this.savePresetPrompt());
    document.getElementById('loadPresetBtn').addEventListener('click', () => this.openPresetModal());
    document.getElementById('deletePresetBtn').addEventListener('click', () => this.openPresetModal());

    // 通用确认/输入模态
    document.getElementById('confirmOk').addEventListener('click', () => {
      const cb = this._confirmCb;
      this._confirmCb = null;
      this.closeModal('confirmModal');
      if (cb) cb();
    });
    document.getElementById('confirmCancel').addEventListener('click', () => {
      this._confirmCb = null;
      this.closeModal('confirmModal');
    });
    document.getElementById('inputOk').addEventListener('click', () => {
      const cb = this._inputCb;
      const val = document.getElementById('inputValue').value.trim();
      this._inputCb = null;
      this.closeModal('inputModal');
      if (cb) cb(val);
      document.getElementById('inputValue').value = '';
    });
    document.getElementById('inputCancel').addEventListener('click', () => {
      this._inputCb = null;
      this.closeModal('inputModal');
      document.getElementById('inputValue').value = '';
    });
    document.getElementById('inputValue').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('inputOk').click();
    });

    // 数值步进按钮（事件委托 + 长按连发）
    this.bindSteppers();

    // 高级设置折叠状态记忆
    this.bindAdvState();

    // 药量参考卡（四来源：按亩/按棵/农户标准/实际）
    const tq = document.getElementById('treeQuickInput');
    const md = document.getElementById('manualDoseInput');
    if (tq) {
      tq.addEventListener('input', () => this.renderDoseRef());
      this._treeQuickRender = () => this.renderDoseRef();   // 切换类型后按新类型参数重算
    }
    if (md) md.addEventListener('input', () => {
      this.state.field.manualDosePerMu = parseFloat(md.value) || 0;
      this.renderDoseRef();
      this.save();
    });

    // 农户档案
    document.getElementById('farmersBtn').addEventListener('click', () => this.openFarmersModal());
    document.getElementById('farmerNew').addEventListener('click', () => {
      this._editingFarmerId = null;
      this.renderFarmerForm();
      this.renderFarmersList();
    });
    document.getElementById('farmerSave').addEventListener('click', () => this.saveFarmerForm());
    document.getElementById('farmerDelete').addEventListener('click', () => this.deleteFarmerForm());
    document.getElementById('farmerSearch').addEventListener('input', () => this.renderFarmersList());

    // 用药类型管理
    document.getElementById('addTypeBtn').addEventListener('click', () => this.openTypeModal(null));
    document.getElementById('editTypeBtn').addEventListener('click', () => this.openTypeModal(this.state.field.plantKey));
    document.getElementById('restoreTypesBtn').addEventListener('click', () => this.restoreDefaultTypes());
    document.getElementById('saveTypeBtn').addEventListener('click', () => this.saveTypeForm());
    document.getElementById('deleteTypeBtn').addEventListener('click', () => this.deleteCurrentType());

    document.getElementById('importBtn').addEventListener('click', () => this.openModal('importModal'));
    document.getElementById('exportBtn').addEventListener('click', () => this.openExportModal());
    document.getElementById('importConfirm').addEventListener('click', () => this.doImport());

    document.getElementById('historyBtn').addEventListener('click', () => this.openHistoryModal());
    document.getElementById('clearHistoryBtn').addEventListener('click', () => {
      Storage.clearHistory();
      this.renderHistoryList();
      this.toast('历史已清空', 'warn');
    });

    document.querySelectorAll('[data-close]').forEach(el => {
      el.addEventListener('click', () => this.closeModal(el.closest('.modal').id));
    });
    document.querySelectorAll('.modal').forEach(m => {
      m.addEventListener('click', e => { if (e.target === m) this.closeModal(m.id); });
    });

    document.querySelectorAll('.export-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.export-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.updateExportText(btn.dataset.exp);
      });
    });

    document.getElementById('copyExport').addEventListener('click', () => {
      const txt = document.getElementById('exportText').value;
      this.copyToClipboard(txt).then(ok => {
        this.toast(ok ? '已复制到剪贴板 📋' : '复制失败，请手动选择', ok ? 'success' : 'error');
      });
    });

    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'V') {
        e.preventDefault();
        navigator.clipboard.readText().then(text => {
          this.applyImportText(text);
        }).catch(() => this.openModal('importModal'));
      }
    });
  },

  /* ---------- 主题 ---------- */
  applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.getElementById('themeBtn').textContent = theme === 'day' ? '☀️' : '🌙';
    Storage.setTheme(theme);
  },
  toggleTheme() {
    const cur = Storage.getTheme();
    const next = cur === 'day' ? 'night' : 'day';
    this.applyTheme(next);
    this.toast(next === 'day' ? '已切换为日间模式 ☀️' : '已切换为夜间模式 🌙', 'success');
  },

  flyDrone() {
    const d = document.getElementById('flyingDrone');
    d.classList.remove('flying');
    void d.offsetWidth;
    d.classList.add('flying');
    setTimeout(() => d.classList.remove('flying'), 5100);
  },

  openModal(id) {
    document.getElementById(id).classList.add('show');
    document.getElementById(id).setAttribute('aria-hidden', 'false');
  },
  closeModal(id) {
    document.getElementById(id).classList.remove('show');
    document.getElementById(id).setAttribute('aria-hidden', 'true');
  },

  /* ============================================================
     应用内 confirm/prompt 替代（APK WebView 不支持原生对话框：
     confirm() 恒 false、prompt() 恒 null——正是"无法添加农户"的根因）
     ============================================================ */
  confirmDialog(message, onOk, opts) {
    const o = opts || {};
    document.getElementById('confirmTitle').firstChild.textContent = (o.title || '请确认') + ' ';
    document.getElementById('confirmText').textContent = message;
    this._confirmCb = onOk || null;
    this.openModal('confirmModal');
  },

  promptInput(title, defaultValue, onOk) {
    document.getElementById('inputTitle').firstChild.textContent = title + ' ';
    const input = document.getElementById('inputValue');
    input.value = defaultValue || '';
    this._inputCb = onOk || null;
    this.openModal('inputModal');
    setTimeout(() => { input.focus(); input.select(); }, 80);
  },

  openExportModal() {
    this.openModal('exportModal');
    this.updateExportText('text');
  },
  updateExportText(type) {
    const txt = type === 'json'
      ? Storage.exportJSON(this.state, this.state.mode)
      : Storage.exportText(this.state, this.state.mode);
    document.getElementById('exportText').value = txt;
  },

  doImport() {
    const text = document.getElementById('importText').value;
    if (!text.trim()) {
      this.toast('请粘贴配置文本', 'warn');
      return;
    }
    if (this.applyImportText(text)) {
      document.getElementById('importText').value = '';
      this.closeModal('importModal');
    }
  },

  applyImportText(text) {
    const imported = Storage.importText(text);
    if (!imported) {
      this.toast('无法识别配置文本，请检查格式', 'error');
      return false;
    }
    // 应用导入的数据
    if (imported.mode) this.state.mode = imported.mode;
    if (imported.plant) this.state.plant = imported.plant;
    if (imported.field) this.state.field = imported.field;
    if (imported.costs) this.state.costs = imported.costs;
    if (imported.income) this.state.income = imported.income;
    // 时间参数：合并而非整体替换，兼容不含 timing 的旧配置
    if (imported.timing) {
      this.state.timing = { ...this.state.timing, ...imported.timing };
    }
    if (imported.haulField) this.state.haulField = imported.haulField;
    if (imported.haulCosts) this.state.haulCosts = imported.haulCosts;
    if (imported.haulIncome) this.state.haulIncome = imported.haulIncome;
    // 工单覆盖值（实际用药套数/备注/已完成量）
    if (imported.workOrder) {
      this.state.workOrder = { ...this.getWorkOrder(), ...imported.workOrder };
    }
    // 导入的自定义用药类型并入类型库（重名跳过）
    (imported.types || []).forEach(t => {
      if (!this.typeLibrary.find(x => x.name === t.name)) {
        this.typeLibrary.push({ ...t, builtin: false });
      }
    });
    if ((imported.types || []).length) this.saveTypes();
    // 导入的农户档案并入（重名跳过），再校验地块归属
    (imported.farmers || []).forEach(f => {
      if (!this.state.farmers.find(x => x.name === f.name)) {
        this.state.farmers.push({ ...f, builtin: undefined });
      }
    });
    if ((imported.farmers || []).length) this.saveFarmers();
    // 电池台账：导入即整体替换（循环数是累计资产，以配置为准；分配记录不随配置迁移）
    if (imported.batteries && Array.isArray(imported.batteries.list) && imported.batteries.list.length) {
      this.state.batteries = { list: imported.batteries.list, records: [] };
      this.saveBatteries();
      this.renderBatteryLedger();
    }
    (this.state.field.plots || []).forEach(pl => {
      if (!pl.farmerId || !this.getFarmer(pl.farmerId)) pl.farmerId = 'farmer_default';
    });
    // 选中类型不在库中（如旧配置的作物）→ 注册为自定义类型
    if (!this.getType(this.state.field.plantKey) || this.state.plant.name !== (this.getType(this.state.field.plantKey) || {}).name) {
      const key = this.registerTypeSnapshot(this.state.plant);
      if (key) {
        this.state.field.plantKey = key;
        this.state.plant = { ...this.getType(key) };
      }
    }

    this.applyMode(this.state.mode);
    this.compute();
    this.save();
    this.toast('配置已成功导入 ✅', 'success');
    return true;
  },

  savePresetPrompt() {
    const label = this.state.mode === 'spray'
      ? `${this.state.plant.name}_${new Date().toLocaleDateString('zh-CN')}`
      : `吊运_${new Date().toLocaleDateString('zh-CN')}`;
    this.promptInput('请输入预设名称：', label, name => {
      if (!name) return;
      Storage.savePreset(name, this.state.mode, this.state);
      this.toast(`预设「${name}」已保存`, 'success');
    });
  },

  openPresetModal() {
    this.renderPresetList();
    this.openModal('presetModal');
  },
  renderPresetList() {
    const list = document.getElementById('presetList');
    const presets = Storage.getPresets();
    if (presets.length === 0) {
      list.innerHTML = '<li style="text-align:center;color:var(--text-muted);cursor:default;">暂无预设，点击「存为预设」创建</li>';
      return;
    }
    list.innerHTML = presets.map((p, i) => {
      const modeLabel = p.mode === 'haul' ? '📦 吊运' : `🚁 ${p.plant ? p.plant.name : ''}`;
      // 预设为扁平结构（name/mode/field/haulField...），旧版本曾误用 p.state.* 会直接抛错
      const sizeInfo = p.mode === 'haul'
        ? `${p.haulField ? p.haulField.totalWeight : '—'} 斤`
        : `${p.field ? p.field.area : '—'} 亩`;
      return `
        <li data-idx="${i}">
          <div>
            <div><b>${this.escapeHtml(p.name)}</b> <span style="margin-left:6px">${modeLabel}</span></div>
            <div class="preset-meta">${new Date(p.savedAt).toLocaleString('zh-CN')} · ${sizeInfo}</div>
          </div>
          <span class="preset-meta">点击加载</span>
        </li>`;
    }).join('');
    list.querySelectorAll('li').forEach(li => {
      li.addEventListener('click', () => {
        const idx = parseInt(li.dataset.idx);
        this.loadPreset(idx);
      });
      li.addEventListener('contextmenu', e => {
        e.preventDefault();
        const idx = parseInt(li.dataset.idx);
        this.confirmDialog(`删除预设「${presets[idx].name}」？`, () => {
          Storage.deletePreset(presets[idx].name);
          this.renderPresetList();
          this.toast('预设已删除', 'warn');
        }, { title: '删除预设' });
      });
    });
  },
  loadPreset(idx) {
    const presets = Storage.getPresets();
    const p = presets[idx];
    if (!p) return;
    this.state.mode = p.mode || 'spray';
    if (p.plant) this.state.plant = { ...p.plant };
    if (p.field) this.state.field = { ...this.state.field, ...p.field };
    // 旧预设的作物快照不在类型库中 → 注册为自定义类型
    if (!this.getType(this.state.field.plantKey)) {
      const key = this.registerTypeSnapshot(this.state.plant);
      if (key) {
        this.state.field.plantKey = key;
        this.state.plant = { ...this.getType(key) };
      }
    }
    if (p.costs) this.state.costs = { ...this.state.costs, ...p.costs };
    if (p.income) this.state.income = { ...this.state.income, ...p.income };
    // 旧版预设未保存 timing，缺失时保留当前值
    if (p.timing) this.state.timing = { ...this.state.timing, ...p.timing };
    if (p.haulField) this.state.haulField = { ...this.state.haulField, ...p.haulField };
    if (p.haulCosts) this.state.haulCosts = { ...this.state.haulCosts, ...p.haulCosts };
    if (p.haulIncome) this.state.haulIncome = { ...this.state.haulIncome, ...p.haulIncome };
    this.applyMode(this.state.mode);
    this.compute();
    this.save();
    this.closeModal('presetModal');
    this.toast(`已加载预设「${p.name}」`, 'success');
  },

  openHistoryModal() {
    this.renderHistoryList();
    this.openModal('historyModal');
  },
  renderHistoryList() {
    const list = document.getElementById('historyList');
    const history = Storage.getHistory();
    if (history.length === 0) {
      list.innerHTML = '<li style="text-align:center;color:var(--text-muted);cursor:default;">暂无历史记录</li>';
      return;
    }
    list.innerHTML = history.map(h => {
      const modeTag = h.mode === 'haul' ? '📦 吊运' : '🚁 打药';
      const sizeTag = h.mode === 'haul' ? `${h.area} 斤` : `${h.area} 亩`;
      const extraInfo = h.mode === 'haul'
        ? `躺数 ${h.pesticide}`
        : `药 ${h.pesticide.toFixed(2)} 套 · 水 ${h.water.toFixed(1)} 升`;
      return `
        <li>
          <div>
            <b>${modeTag}</b> · ${sizeTag}
            <div class="hist-meta">${new Date(h.time).toLocaleString('zh-CN')} · ${extraInfo} · 成本 ¥${h.totalCost.toFixed(2)} · 利润 ¥${h.profit.toFixed(2)}</div>
          </div>
        </li>`;
    }).join('');
  },

  toast(msg, type = '') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show ' + type;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { el.className = 'toast ' + type; }, 2400);
  },

  copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true).catch(() => this._fallbackCopy(text));
    }
    return Promise.resolve(this._fallbackCopy(text));
  },
  _fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  },

  escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  }
};

window.UI = UI;
