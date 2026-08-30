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
    workOrder: { completedByPlot: {}, completedSingle: 0, actualSets: 0, note: '' }
  },

  /* ---------- 初始化 ---------- */
  init() {
    this.loadState();
    this.bindModeSwitcher();
    this.bindEvents();
    this.applyMode(this.state.mode);
    this.applyTheme(Storage.getTheme());
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
    // 植物面板和预设栏：仅打药模式显示
    const plantPanel = document.querySelector('.plant-panel');
    if (plantPanel) plantPanel.style.display = mode === 'spray' ? '' : 'none';
    // 作业时间面板和时间参数面板：仅打药模式显示
    const timingPanel = document.getElementById('timingPanel');
    const timingParamPanel = document.getElementById('timingParamPanel');
    if (timingPanel) timingPanel.style.display = mode === 'spray' ? '' : 'none';
    if (timingParamPanel) timingParamPanel.style.display = mode === 'spray' ? '' : 'none';
    // 重新渲染表单和结果
    this.renderAll();
    // 渲染完后立即计算一次，确保结果区域有值
    this.compute();
  },

  renderAll() {
    if (this.state.mode === 'spray') {
      this.renderPlantGrid();
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

  /* ---------- 加载已保存状态 ---------- */
  loadState() {
    const saved = Storage.getState();
    if (saved) {
      this.state.mode = saved.mode || 'spray';
      if (saved.plant) this.state.plant = { ...saved.plant };
      else this.state.plant = { ...PLANT_DATABASE[this.state.field.plantKey || 'fruit_tree'] };
      if (saved.field) this.state.field = { ...this.state.field, ...saved.field };
      // 旧版存档无 calcBasis：按植物类型预置基准（果树→按棵数）
      if (saved.field && saved.field.calcBasis === undefined) {
        this.state.field.calcBasis = this.state.plant.calcMode === 'tree' ? 'tree' : 'area';
      }
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
    } else {
      this.state.plant = { ...PLANT_DATABASE[this.state.field.plantKey || 'fruit_tree'] };
      // 全新访问：按植物类型预置基准（果树→按棵数，大田→按亩数）
      this.state.field.calcBasis = this.state.plant.calcMode === 'tree' ? 'tree' : 'area';
    }
  },

  /* ============================================================
     ★★ 打药模式（沿用原逻辑）★★
     ============================================================ */

  renderPlantGrid() {
    const grid = document.getElementById('plantGrid');
    grid.innerHTML = '';
    Object.entries(PLANT_DATABASE).forEach(([key, plant]) => {
      const card = document.createElement('div');
      card.className = 'plant-card';
      card.dataset.key = key;
      if (this.state.plant && this.state.plant.name === plant.name) card.classList.add('active');
      card.innerHTML = `<span class="p-icon">${plant.icon}</span><span class="p-name">${plant.name}</span>`;
      card.addEventListener('click', () => this.selectPlant(key));
      grid.appendChild(card);
    });
  },

  selectPlant(key) {
    const plant = PLANT_DATABASE[key];
    if (!plant) return;
    this.state.plant = { ...plant };
    this.state.field.plantKey = key;
    // 切换植物时按其自然基准预置（果树→按棵数，大田→按亩数）
    this.state.field.calcBasis = plant.calcMode === 'tree' ? 'tree' : 'area';
    document.querySelectorAll('.plant-card').forEach(c => {
      c.classList.toggle('active', c.dataset.key === key);
    });
    this.updatePlantInfo();
    this.syncParamFormFromPlant();
    this.updateCalcBasisVisibility();
    this.compute();
    this.save();
  },

  /* 计算基准切换后的输入项显隐：按棵数隐藏亩数、显示棵数并锁定每亩棵数 */
  updateCalcBasisVisibility() {
    const basis = this.state.field.calcBasis === 'tree' ? 'tree' : 'area';
    // 同步单选按钮选中态（切换植物时 state 变了但 DOM 不会自动跟随）
    document.querySelectorAll('input[name="radio-calcBasis"]').forEach(r => {
      r.checked = r.value === basis;
    });
    // 多地块模式下尺寸在各地块行填写，交由 updatePlotModeVisibility 处理
    if (this.state.field.plotMode) {
      this.updatePlotModeVisibility();
      return;
    }
    const areaWrap = document.getElementById('inp-area');
    const treeWrap = document.getElementById('inp-treeCount');
    const treesPerMu = document.getElementById('inp-treesPerMu');
    if (areaWrap) areaWrap.closest('.field').style.display = basis === 'tree' ? 'none' : '';
    if (treeWrap) treeWrap.closest('.field').style.display = basis === 'area' ? 'none' : '';
    if (treesPerMu) treesPerMu.readOnly = basis === 'tree';
  },

  /* ---------- 多地块模式 ---------- */
  updatePlotModeVisibility() {
    const plotsMode = !!this.state.field.plotMode;
    document.querySelectorAll('input[name="radio-plotMode"]').forEach(r => {
      r.checked = (r.value === 'plots') === plotsMode;
    });
    const editor = document.getElementById('plotsEditor');
    if (editor) editor.style.display = plotsMode ? '' : 'none';
    // 多地块时隐藏单地块的亩数/棵数输入（尺寸在各地块行填写）
    const areaEl = document.getElementById('inp-area');
    const treeEl = document.getElementById('inp-treeCount');
    if (areaEl) areaEl.closest('.field').style.display = plotsMode ? 'none' : (this.state.field.calcBasis === 'tree' ? 'none' : '');
    if (treeEl) treeEl.closest('.field').style.display = plotsMode ? 'none' : (this.state.field.calcBasis === 'area' ? 'none' : '');
    const wrap = document.getElementById('plotsTableWrap');
    if (wrap) wrap.style.display = plotsMode ? '' : 'none';
  },

  renderPlotsEditor() {
    const wrap = document.getElementById('plotsEditor');
    if (!wrap) return;
    const plots = this.state.field.plots || [];
    const basis = this.state.field.calcBasis === 'tree' ? 'tree' : 'area';
    const sizeLabel = basis === 'tree' ? '棵数' : '亩数';
    const sizeUnit = basis === 'tree' ? '棵' : '亩';
    let html = `
      <div class="plot-toolbar">
        <span class="hint">按<b>${basis === 'tree' ? '棵数' : '亩数'}</b>填写各地块；趟数留空=按机载上限自动算最少趟数</span>
        <span class="plot-presets">
          转场档位
          <button type="button" class="btn btn-sm btn-secondary plot-preset" data-min="3">保守3m</button>
          <button type="button" class="btn btn-sm btn-secondary plot-preset" data-min="5">标准5m</button>
          <button type="button" class="btn btn-sm btn-secondary plot-preset" data-min="8">激进8m</button>
        </span>
      </div>`;
    plots.forEach((p, i) => {
      const sizeVal = basis === 'tree' ? (p.treeCount || '') : (p.area || '');
      html += `
      <div class="plot-row" data-id="${p.id}">
        <input type="text" class="plot-name" value="${this.escapeHtml(p.name || `地块${i + 1}`)}" placeholder="名称">
        <div class="unit-suffix" data-unit="${sizeUnit}"><input type="number" class="plot-size" step="0.1" min="0" value="${sizeVal}" placeholder="${sizeLabel}"></div>
        <div class="unit-suffix" data-unit="min"><input type="number" class="plot-transfer" step="0.5" min="0" value="${p.transferMin != null ? p.transferMin : 5}" placeholder="转场"></div>
        <div class="unit-suffix" data-unit="趟"><input type="number" class="plot-trips" step="1" min="0" value="${p.tripsOverride || ''}" placeholder="自动"></div>
        <button type="button" class="icon-btn plot-del" title="删除地块">🗑</button>
      </div>`;
    });
    html += '<button type="button" class="btn btn-secondary btn-sm plot-add">＋ 添加地块</button>';
    wrap.innerHTML = html;
  },

  addPlot() {
    if (!Array.isArray(this.state.field.plots)) this.state.field.plots = [];
    const n = this.state.field.plots.length;
    const isTree = this.state.field.calcBasis === 'tree';
    this.state.field.plots.push({
      id: 'p' + Date.now().toString(36) + '_' + n,
      name: `地块${n + 1}`,
      area: isTree ? 0 : 10,
      treeCount: isTree ? 100 : 0,
      transferMin: 5,
      tripsOverride: 0
    });
    this.renderPlotsEditor();
    this.compute();
    this.save();
  },

  /* 地块明细表（结果区） */
  renderPlotsTable(r) {
    const wrap = document.getElementById('plotsTableWrap');
    if (!wrap) return;
    if (!r || !r.plotMode || !r.plots || r.plots.length === 0) {
      wrap.innerHTML = '';
      return;
    }
    const fmt = Calculator.fmt.bind(Calculator);
    const basis = r.calcBasis === 'tree' ? 'tree' : 'area';
    const sizeHeader = basis === 'tree' ? '棵数' : '亩数';
    const rows = r.plots.map(p => `
      <tr>
        <td>${this.escapeHtml(p.name)}</td>
        <td>${basis === 'tree' ? fmt(p.treeCount, 0) : fmt(p.area, 1)}</td>
        <td>${fmt(p.water, 1)}</td>
        <td>${p.minTrips}</td>
        <td><b>${p.trips}</b></td>
        <td>${fmt(p.perTripWater, 1)}</td>
        <td>${fmt(p.transferMin, 1)}</td>
        <td>${p.pesticideRounded}</td>
      </tr>`).join('');
    wrap.innerHTML = `
      <div class="panel-title" style="margin-top:12px;"><span>🗺️</span> 地块明细
        <span class="hint">机载上限 ${r.droneTank} 升/趟 · 共 ${r.totalTrips} 趟 · 转场合计 ${fmt(r.totalTransfer, 1)}min</span>
      </div>
      <table class="summary-table plots-table">
        <thead><tr><th>地块</th><th>${sizeHeader}</th><th>水量(升)</th><th>最少趟</th><th>趟数</th><th>每趟(升)</th><th>转场(min)</th><th>药量(套)</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td>合计</td><td>${basis === 'tree' ? fmt(r.plots.reduce((s, p) => s + p.treeCount, 0), 0) : fmt(r.area, 1)}</td><td>${fmt(r.water, 1)}</td><td>—</td><td>${r.totalTrips}</td><td>—</td><td>${fmt(r.totalTransfer, 1)}</td><td>${r.pesticideRounded}</td></tr></tfoot>
      </table>`;
  },

  /* ============================================================
     ★★★ 作业工单（快捷修改 + 纯文本输出）★★★
     - 快捷修改区：已完成量（按地块）、实际用药套数、备注，
       任一输入即时重算剩余量/续药并保存（state.workOrder 覆盖层）
     - 纯文本工单：等宽高可读，可整段复制留存或发给现场人员
     ============================================================ */
  getWorkOrder() {
    if (!this.state.workOrder || typeof this.state.workOrder !== 'object') {
      this.state.workOrder = { completedByPlot: {}, completedSingle: 0, actualSets: 0, note: '' };
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
    this.renderWorkOrderText();
    this.openModal('workOrderModal');
  },

  renderWorkOrderQuick() {
    const wrap = document.getElementById('workOrderQuick');
    if (!wrap) return;
    const r = this._lastResult;
    const wo = this.getWorkOrder();
    let html = '';
    if (r && r.plotMode) {
      (r.plots || []).forEach(p => {
        const done = Number(wo.completedByPlot[p.id]) || 0;
        const rest = Math.max(0, p.water - done);
        html += `
          <div class="field">
            <label>${this.escapeHtml(p.name)} 已完成(升)</label>
            <input type="number" class="wo-completed" data-id="${p.id}" min="0" step="1" value="${done || ''}" placeholder="0">
            <span class="wo-rest hint" data-id="${p.id}">剩余 ${Calculator.fmt(rest, 1)} 升 ≈ ${p.perTripWater > 0 ? Math.ceil(rest / p.perTripWater) : 0} 趟</span>
          </div>`;
      });
    } else {
      const done = Number(wo.completedSingle) || 0;
      const rest = Math.max(0, (r ? r.water : 0) - done);
      html += `
        <div class="field">
          <label>已完成水量(升)</label>
          <input type="number" class="wo-single" min="0" step="1" value="${done || ''}" placeholder="0">
          <span class="hint" id="woRestSingle">剩余 ${Calculator.fmt(rest, 1)} 升</span>
        </div>`;
    }
    html += `
      <div class="field">
        <label>实际用药(套)</label>
        <input type="number" class="wo-sets" min="0" step="1" value="${wo.actualSets || ''}" placeholder="参考 ${r ? r.pesticideRounded : 0}">
      </div>
      <div class="field" style="grid-column: 1 / -1;">
        <label>备注</label>
        <input type="text" class="wo-note" value="${this.escapeHtml(wo.note)}" placeholder="如：农户自备2套 / 下午续药">
      </div>`;
    wrap.innerHTML = html;
  },

  renderWorkOrderText() {
    const el = document.getElementById('workOrderText');
    if (el) el.textContent = this.buildWorkOrderText();
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
    const basisText = r.plotMode ? '多地块' : (r.calcBasis === 'tree' ? '按棵数' : '按亩数');
    L.push('🚁 无人机作业工单');
    L.push(`日期: ${new Date().toLocaleString('zh-CN')}`);
    L.push(`作物: ${plant.icon || ''}${plant.name} · ${basisText}${r.plotMode ? ` · 机载上限 ${r.droneTank}升/趟` : ''}`);
    L.push(LINE);

    if (r.plotMode) {
      (r.plots || []).forEach(p => {
        const done = Number(wo.completedByPlot[p.id]) || 0;
        const rest = Math.max(0, p.water - done);
        L.push(`【${p.name}】`);
        L.push(`  ${r.calcBasis === 'tree' ? fmt(p.treeCount, 0) + '棵' : fmt(p.area, 1) + '亩'} | 水量 ${fmt(p.water, 1)}升 | 趟数 ${p.trips} | 每趟 ${fmt(p.perTripWater, 1)}升 | 转场 ${fmt(p.transferMin, 1)}min`);
        L.push(`  已完成 ${fmt(done, 1)}升 (${p.water > 0 ? fmt(done / p.water * 100, 0) : 0}%) | 剩余 ${fmt(rest, 1)}升 ≈ ${p.perTripWater > 0 ? Math.ceil(rest / p.perTripWater) : 0}趟 | 药量 ${p.pesticideRounded}套`);
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
    const refillSets = Calculator.computeRefillSets(restTotal, plant.pesticideWaterPerSet, plant.droneSavingCoeff);
    L.push('【汇总】');
    L.push(`  总水量 ${fmt(r.water, 1)}升 | 已完成 ${fmt(doneTotal, 1)}升 | 剩余 ${fmt(restTotal, 1)}升`);
    if (r.plotMode) L.push(`  总趟数 ${r.totalTrips} | 兑药 ${r.timing.mixRounds}批(单批${fmt(r.timing.batchCapacity, 0)}升)`);
    let timeText = `预计总时长 ${fdur(r.timing.totalTime)}`;
    if (r.timing.chargeAfterWork && r.timing.afterWorkCharge > 0) timeText += `（另结束后充电 ${fdur(r.timing.afterWorkCharge)}）`;
    L.push(`  ${timeText}`);
    L.push(`  药量: 参考 ${r.pesticideRounded}套 | 实际 ${actualSets}套${Number(wo.actualSets) > 0 ? '（手填）' : ''} | 需补购 ${r.needToBuy}套`);
    if (restTotal > 0) L.push(`  续药提醒: 剩余 ${fmt(restTotal, 1)}升 ≈ 还需 ${refillSets}套（7舍8入）`);
    L.push(`  成本 ¥${Calculator.fmtMoney(r.totalCost)} | 收入 ¥${Calculator.fmtMoney(r.income)} | 利润 ¥${Calculator.fmtMoney(r.profit)}`);
    if (wo.note) L.push(`【备注】${wo.note}`);
    L.push(LINE);
    return L.join('\n');
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
    FIELD_ORDER.param.forEach(key => this.appendField(form, key, 'spray'));
    this.syncParamFormFromPlant();
    this.updateCalcBasisVisibility();
    this.renderPlotsEditor();
    this.updatePlotModeVisibility();
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
    setVal('inp-area', this.state.field.area);
    setVal('inp-treeCount', this.state.field.treeCount);
    setVal('inp-existingPesticideSets', this.state.field.existingPesticideSets);
  },

  renderCostTabs() {
    const tabsContainer = document.getElementById('costTabs');
    const contentContainer = document.getElementById('tabContentContainer');
    tabsContainer.innerHTML = '';
    contentContainer.innerHTML = '';

    const tabs = [
      { key: 'cycle',     label: '🔋 循环成本' },
      { key: 'transport', label: '🚚 交通' },
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
      FIELD_ORDER[tab.key].forEach(key => this.appendField(wrap, key, 'spray'));
    });
    this.syncCostFormFromState();
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
    FIELD_ORDER.timing.forEach(key => this.appendField(form, key, 'timing'));
    this.syncTimingFormFromState();
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

      wrap.innerHTML = `
        <label for="inp-${key}">${def.label} ${tipHTML}</label>
        <div class="${unitClass}"${unitAttr}>
          <input type="number" id="inp-${key}" value="${this.getFieldValue(key, mode)}"${stepAttr}${priorityAttr}>
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
      if (key === 'area' || key === 'calcBasis' || key === 'treeCount' || key === 'droneTank') {
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
      if (key === 'area' || key === 'calcBasis' || key === 'treeCount' || key === 'droneTank') return this.state.field[key];
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
    // 特殊处理：计算基准切换时更新输入项显隐
    if (key === 'calcBasis') {
      this.updateCalcBasisVisibility();
    }
    this.compute();
    this.save();
  },

  /* ---------- 计算 & 渲染结果 ---------- */
  compute() {
    if (this.state.mode === 'spray') {
      const r = this.state.field.plotMode
        ? Calculator.computePlots(this.state)
        : Calculator.compute(this.state);
      this.renderSprayResults(r);
      this.renderPlotsTable(r);
      this.renderSummary(r, 'spray');
      this._lastResult = r;
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
      stockText = `无库存，参考需 ${fmt(r.pesticide, 2)} → ${r.pesticideRounded} 套（7舍8入）`;
    } else if (r.stockStatus === 'enough') {
      const surplus = r.existingSets - r.pesticideRounded;
      stockText = `库存充足（多 ${surplus} 套）| 参考需 ${fmt(r.pesticide, 2)} → ${r.pesticideRounded} 套`;
    } else { // short
      stockText = `库存不足，需补购 ${r.needToBuy} 套 | 参考需 ${fmt(r.pesticide, 2)} → ${r.pesticideRounded} 套`;
    }
    // 按棵数但棵数未填（含旧存档回落）：提示补填
    if (!r.plotMode && r.calcBasis === 'tree' && !(r.treeCount > 0)) {
      stockText += ' ⚠️ 请在上方填写果树棵数';
    }
    document.getElementById('rPesticideDetail').textContent = stockText;
    document.getElementById('rPesticideFormula').textContent =
      r.plotMode
        ? `主显示=现有 ${r.existingSets} 套 | 参考=各地块7舍8入之和=${r.pesticideRounded} 套（逐块保守取整）`
        : (r.calcBasis === 'tree'
          ? `主显示=现有 ${r.existingSets} 套 | 参考=棵数${r.treeCount}×每棵水量÷一套药水量×省药系数=${fmt(r.pesticide, 2)} → ${r.pesticideRounded} 套（7舍8入）`
          : `主显示=现有 ${r.existingSets} 套 | 参考=亩数×每棵水量×每亩棵数÷一套药水量×省药系数=${fmt(r.pesticide, 2)} → ${r.pesticideRounded} 套（7舍8入）`);

    setText('rWater', fmt(r.water, 1));
    const effArea = (r.area != null ? r.area : this.state.field.area);
    if (r.plotMode) {
      document.getElementById('rWaterDetail').textContent =
        `Σ ${r.plots.length} 个地块 · 机载上限 ${r.droneTank} 升/趟 · 共 ${r.totalTrips} 趟`;
    } else {
      const treeNote = (r.calcBasis === 'tree' && r.treeCount > 0) ? `（按棵数 ${r.treeCount} 棵反推）` : '';
      document.getElementById('rWaterDetail').textContent =
        `${this.state.plant.waterPerMu} 升/亩 × ${fmt(effArea, 1)} 亩${treeNote}`;
    }
    document.getElementById('rWaterFormula').textContent =
      `公式: 亩数 × 每亩水量（无人机喷洒量，独立于药量计算）`;

    setText('rCost', Calculator.fmtMoney(r.totalCost));
    document.getElementById('rCostDetail').textContent =
      `每亩 ¥${Calculator.fmtMoney(r.costPerMu)}`;
    document.getElementById('rCostFormula').textContent =
      r.pesticideIncluded
        ? `公式: 循环 + 交通 + 人工 + 药剂(需补购${r.needToBuy}套×¥${Calculator.fmtMoney(Number(this.state.costs.pesticidePrice)||0)}) + 设备折旧 + 其他`
        : `公式: 循环 + 交通 + 人工 + 设备折旧 + 其他（不包药，无药剂成本）`;

    setText('rProfit', Calculator.fmtMoney(r.profit));
    const profitCard = document.querySelector('#sprayResults .result-card.profit');
    profitCard.dataset.loss = r.profit < 0 ? 'true' : 'false';
    document.getElementById('rProfitDetail').textContent =
      r.profit >= 0 ? `利润率 ${(r.profit / Math.max(1, r.income) * 100).toFixed(1)}%` : `亏损 ¥${Calculator.fmtMoney(-r.profit)}`;
    document.getElementById('rProfitFormula').textContent =
      `公式: 总收入 ¥${Calculator.fmtMoney(r.income)} − 总成本 ¥${Calculator.fmtMoney(r.totalCost)}`;

    setText('rHeight', `${fmt(this.state.plant.flightHeight, 1)} 米`);
    setText('rCycles', `${r.cycles} 次`);
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
      t.mixRounds > 0
        ? `${t.mixRounds}批 × ${fmt1(this.state.timing.baseMixTime)}min（首批串行，其余与飞行并行）`
        : '—';

    // 飞行作业
    setText('tFlightTime', fdur(t.flightTimeMin));
    const flightLabel = t.flightTimeSource === 'manual' ? '准确时间' : '参考时间';
    if (t.plotUnits) {
      document.getElementById('tFlightDetail').textContent =
        `Σ 各地块喷洒时间（多地块）`;
    } else {
      document.getElementById('tFlightDetail').textContent =
        t.flightTimeSource === 'manual'
          ? `✓ ${flightLabel}（手动输入）`
          : (t.flightLength > 0
              ? `${fmt1(t.flightLength, 0)}米 ÷ ${fmt1(this.state.timing.flightSpeed, 1)}m/s（${flightLabel}）`
              : '—');
    }

    // 来回升降 + 加药装载
    setText('tRoundTrip', fdur(t.roundTripTotal));
    document.getElementById('tRoundTripDetail').textContent = t.plotUnits
      ? `装载${fmt1(t.totalLoad)}min + 转场${fmt1(t.totalTransfer)}min`
      : `(${this.state.timing.roundTripTime}+装载${t.loadTime != null ? t.loadTime : 0}min) × 循环数`;

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
      `公式: 电池循环 + 无人机人工 + 采摘人工 + 交通 + 设备折旧 + 其他`;

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
        { name: '🔋 电池循环', val: c.battery || 0, color: '#ab47bc' },
        { name: '🚁 无人机人工', val: c.droneLabor || 0, color: '#ffa726' },
        { name: '🧺 采摘人工', val: c.pickupLabor || 0, color: '#ef5350' },
        { name: '🚚 交通(油费/折旧/路桥)', val: c.transport || 0, color: '#29b6f6' },
        { name: '🛠 设备折旧/维修/保险', val: c.equipment || 0, color: '#8d6e63' },
        { name: '📦 其他(防护/清洗/杂)', val: c.other || 0, color: '#78909c' }
      ];
      totalFormulaText = `总成本 = 电池循环 + 无人机人工 + 采摘人工 + 交通 + 设备折旧 + 其他 = ¥${Calculator.fmtMoney(r.totalCost)}`;
      summaryFormulaText = '粗利润 = 总收入 − 总成本';
    } else {
      items = [
        { name: '🔋 循环(电池/充电/油)', val: c.cycle || 0, color: '#ab47bc' },
        { name: '🚚 交通(油费/折旧/路桥)', val: c.transport || 0, color: '#29b6f6' },
        { name: '👥 人工(工资/餐/宿)', val: c.labor || 0, color: '#ffa726' },
        { name: '💊 药剂', val: c.pesticide || 0, color: '#66bb6a' },
        { name: '🛠 设备折旧/维修/保险', val: c.equipment || 0, color: '#8d6e63' },
        { name: '📦 其他(防护/清洗/杂)', val: c.other || 0, color: '#78909c' }
      ];
      totalFormulaText = `总成本 = 循环 + 交通 + 人工 + 药剂 + 设备折旧 + 其他 = ¥${Calculator.fmtMoney(r.totalCost)}`;
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
      if (!confirm('确定恢复打药模式所有参数为默认值？当前打药模式的所有参数将被重置。')) return;
      // 保留植物选择，重置其他打药参数
      const keepPlant = this.state.plant;
      this.state.field = { ...DEFAULT_FIELD };
      this.state.costs = { ...DEFAULT_COSTS };
      this.state.income = { ...DEFAULT_INCOME };
      this.state.timing = { ...DEFAULT_TIMING };
      this.state.plant = keepPlant || { ...PLANT_DATABASE.fruit_tree };
      // 基准随植物类型预置
      this.state.field.calcBasis = this.state.plant.calcMode === 'tree' ? 'tree' : 'area';
      this.toast('打药模式已恢复默认', 'success');
    } else {
      if (!confirm('确定恢复吊运模式所有参数为默认值？当前吊运模式的所有参数将被重置。')) return;
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

    // 地块模式切换（单地块/多地块）
    document.querySelectorAll('input[name="radio-plotMode"]').forEach(r => {
      r.addEventListener('change', () => {
        this.state.field.plotMode = r.value === 'plots';
        this.updatePlotModeVisibility();
        this.compute();
        this.save();
        this.toast(r.value === 'plots' ? '已切换为多地块模式' : '已切换为单地块模式', 'success');
      });
    });

    // 地块编辑器事件委托（行内编辑/增删/档位，重渲染后依然有效）
    const plotsEditor = document.getElementById('plotsEditor');
    if (plotsEditor) {
      plotsEditor.addEventListener('input', e => {
        const row = e.target.closest('.plot-row');
        if (!row) return;
        const plot = (this.state.field.plots || []).find(p => String(p.id) === row.dataset.id);
        if (!plot) return;
        if (e.target.classList.contains('plot-name')) {
          plot.name = e.target.value;
        } else if (e.target.classList.contains('plot-size')) {
          const v = parseFloat(e.target.value);
          if (this.state.field.calcBasis === 'tree') plot.treeCount = isNaN(v) ? 0 : Math.max(0, Math.round(v));
          else plot.area = isNaN(v) ? 0 : Math.max(0, v);
        } else if (e.target.classList.contains('plot-transfer')) {
          const v = parseFloat(e.target.value);
          plot.transferMin = isNaN(v) ? 0 : Math.max(0, v);
        } else if (e.target.classList.contains('plot-trips')) {
          const v = parseFloat(e.target.value);
          plot.tripsOverride = (!v || v <= 0) ? 0 : Math.max(0, Math.round(v));
        }
        this.compute();
      });
      plotsEditor.addEventListener('change', () => this.save());
      plotsEditor.addEventListener('click', e => {
        if (e.target.closest('.plot-add')) {
          this.addPlot();
          return;
        }
        const preset = e.target.closest('.plot-preset');
        if (preset) {
          const min = parseFloat(preset.dataset.min) || 5;
          (this.state.field.plots || []).forEach(p => { p.transferMin = min; });
          this.renderPlotsEditor();
          this.compute();
          this.save();
          this.toast(`全体地块转场已设为 ${min} 分钟`, 'success');
          return;
        }
        const del = e.target.closest('.plot-del');
        if (del) {
          const row = del.closest('.plot-row');
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
        area: this.state.mode === 'spray' ? this.state.field.area : this.state.haulField.totalWeight,
        pesticide: r.pesticide || r.totalTrips || 0,
        water: r.water || 0,
        totalCost: r.totalCost,
        profit: r.profit
      });
    });

    // 作业工单
    document.getElementById('workOrderBtn').addEventListener('click', () => this.openWorkOrder());
    document.getElementById('copyWorkOrder').addEventListener('click', () => {
      const txt = document.getElementById('workOrderText').textContent || '';
      if (!txt) {
        this.toast('工单内容为空', 'warn');
        return;
      }
      this.copyToClipboard(txt).then(ok => {
        this.toast(ok ? '工单已复制到剪贴板 📋' : '复制失败，请长按文本手动选择', ok ? 'success' : 'error');
      });
    });

    // 工单快捷修改（事件委托：重渲染后依然有效）
    const woQuick = document.getElementById('workOrderQuick');
    if (woQuick) {
      woQuick.addEventListener('input', e => {
        const wo = this.getWorkOrder();
        const r = this._lastResult;
        if (e.target.classList.contains('wo-completed')) {
          const v = parseFloat(e.target.value);
          wo.completedByPlot[e.target.dataset.id] = isNaN(v) ? 0 : Math.max(0, v);
          const restEl = woQuick.querySelector(`.wo-rest[data-id="${e.target.dataset.id}"]`);
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
        } else if (e.target.classList.contains('wo-note')) {
          wo.note = e.target.value;
        } else {
          return;
        }
        this.renderWorkOrderText();
        this.save();
      });
    }

    document.getElementById('presetBtn').addEventListener('click', () => this.openPresetModal());
    document.getElementById('savePresetBtn').addEventListener('click', () => this.savePresetPrompt());
    document.getElementById('loadPresetBtn').addEventListener('click', () => this.openPresetModal());
    document.getElementById('deletePresetBtn').addEventListener('click', () => this.openPresetModal());

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
    const name = prompt('请输入预设名称：', label);
    if (!name) return;
    Storage.savePreset(name, this.state.mode, this.state);
    this.toast(`预设「${name}」已保存`, 'success');
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
        if (confirm(`删除预设「${presets[idx].name}」？`)) {
          Storage.deletePreset(presets[idx].name);
          this.renderPresetList();
          this.toast('预设已删除', 'warn');
        }
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
