/* ============================================================
   ui.js — UI 渲染与交互
   ============================================================ */

const UI = {
  state: {
    plant: null,        // 当前选中植物
    field: { ...DEFAULT_FIELD },
    costs: { ...DEFAULT_COSTS },
    income: { ...DEFAULT_INCOME }
  },

  /* ---------- 初始化 ---------- */
  init() {
    this.loadState();
    this.renderPlantGrid();
    this.renderParamForm();
    this.renderCostTabs();
    this.renderIncomeForm();
    this.bindEvents();
    this.updatePlantInfo();
    this.compute();
  },

  /* ---------- 加载已保存状态 ---------- */
  loadState() {
    const saved = Storage.getState();
    if (saved) {
      if (saved.plant) this.state.plant = { ...saved.plant };
      else this.state.plant = { ...PLANT_DATABASE[this.state.field.plantKey || 'fruit_tree'] };
      if (saved.field) this.state.field = { ...this.state.field, ...saved.field };
      if (saved.costs) this.state.costs = { ...this.state.costs, ...saved.costs };
      if (saved.income) this.state.income = { ...this.state.income, ...saved.income };
    } else {
      this.state.plant = { ...PLANT_DATABASE[this.state.field.plantKey || 'fruit_tree'] };
    }
  },

  /* ---------- 植物网格 ---------- */
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
    document.querySelectorAll('.plant-card').forEach(c => {
      c.classList.toggle('active', c.dataset.key === key);
    });
    this.updatePlantInfo();
    this.syncParamFormFromPlant();
    this.compute();
    this.save();
  },

  updatePlantInfo() {
    const p = this.state.plant;
    document.getElementById('plantInfoName').textContent = `${p.icon || '🌱'} ${p.name}`;
    document.getElementById('plantInfoDesc').textContent = p.description || '—';
    document.getElementById('plantInfoNotes').textContent = p.notes || '';
  },

  /* ---------- 作业参数表单 ---------- */
  renderParamForm() {
    const form = document.getElementById('paramForm');
    form.innerHTML = '';
    FIELD_ORDER.param.forEach(key => this.appendField(form, key));
    // 表单值同步
    this.syncParamFormFromPlant();
  },

  syncParamFormFromPlant() {
    const p = this.state.plant;
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    setVal('inp-flightHeight', p.flightHeight);
    setVal('inp-waterPerMu', p.waterPerMu);
    setVal('inp-treesPerMu', p.treesPerMu);
    setVal('inp-waterPerTree', p.waterPerTree);
    setVal('inp-pesticideWaterPerSet', p.pesticideWaterPerSet);
    setVal('inp-droneSavingCoeff', p.droneSavingCoeff);
    setVal('inp-area', this.state.field.area);
  },

  /* ---------- 成本 Tabs ---------- */
  renderCostTabs() {
    this.renderTabContent('cycle', 'tabCycle');
    this.renderTabContent('transport', 'tabTransport');
    this.renderTabContent('labor', 'tabLabor');
    this.renderTabContent('other', 'tabOther');

    document.querySelectorAll('.cost-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.cost-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.cost-panel .tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.querySelector(`.cost-panel .tab-content[data-tab="${btn.dataset.tab}"]`).classList.add('active');
      });
    });
  },

  renderTabContent(group, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'form-grid';
    FIELD_ORDER[group].forEach(key => this.appendField(wrap, key));
    container.appendChild(wrap);
    this.syncCostFormFromState();
  },

  syncCostFormFromState() {
    Object.keys(this.state.costs).forEach(k => {
      const el = document.getElementById(`inp-${k}`);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!this.state.costs[k];
      else el.value = this.state.costs[k];
    });
  },

  /* ---------- 收入表单 ---------- */
  renderIncomeForm() {
    const form = document.getElementById('incomeForm');
    form.innerHTML = '';
    FIELD_ORDER.income.forEach(key => this.appendField(form, key));
    this.syncIncomeFormFromState();
  },

  syncIncomeFormFromState() {
    Object.keys(this.state.income).forEach(k => {
      const el = document.getElementById(`inp-${k}`);
      if (!el) return;
      el.value = this.state.income[k];
    });
  },

  /* ---------- 通用字段渲染 ---------- */
  appendField(container, key) {
    const def = FIELD_DEFS[key];
    if (!def) return;

    if (def.type === 'check') {
      const lbl = document.createElement('label');
      lbl.className = 'field-check';
      lbl.innerHTML = `<input type="checkbox" id="inp-${key}" ${this.getValue(key) ? 'checked' : ''}><span>${def.label}</span>`;
      container.appendChild(lbl);
    } else {
      const wrap = document.createElement('div');
      wrap.className = 'field';
      const stepAttr = def.step ? ` step="${def.step}"` : '';
      const unitAttr = def.unit ? ` data-unit="${def.unit}"` : '';
      const unitClass = def.unit ? ' unit-suffix' : '';
      const tipHTML = def.tip ? `<i class="tip" data-tip="${this.escapeHtml(def.tip)}">i</i>` : '';

      wrap.innerHTML = `
        <label for="inp-${key}">${def.label} ${tipHTML}</label>
        <div class="${unitClass}"${unitAttr}>
          <input type="number" id="inp-${key}" value="${this.getValue(key)}"${stepAttr}>
        </div>
      `;
      container.appendChild(wrap);
    }

    // 绑定 input 事件
    const el = document.getElementById(`inp-${key}`);
    if (el) {
      el.addEventListener('input', () => this.onFieldChange(key, el));
      el.addEventListener('change', () => this.onFieldChange(key, el));
    }
  },

  getValue(key) {
    if (key === 'area') return this.state.field.area;
    if (FIELD_ORDER.param.includes(key)) return this.state.plant[key];
    if (FIELD_ORDER.cycle.includes(key) || FIELD_ORDER.transport.includes(key) || FIELD_ORDER.labor.includes(key) || FIELD_ORDER.other.includes(key)) {
      return this.state.costs[key];
    }
    if (FIELD_ORDER.income.includes(key)) return this.state.income[key];
    return '';
  },

  onFieldChange(key, el) {
    let val;
    if (el.type === 'checkbox') val = el.checked;
    else val = el.value === '' ? 0 : parseFloat(el.value);

    if (key === 'area') {
      this.state.field.area = val;
    } else if (FIELD_ORDER.param.includes(key)) {
      this.state.plant[key] = val;
    } else if (FIELD_ORDER.cycle.includes(key) || FIELD_ORDER.transport.includes(key) || FIELD_ORDER.labor.includes(key) || FIELD_ORDER.other.includes(key)) {
      this.state.costs[key] = val;
    } else if (FIELD_ORDER.income.includes(key)) {
      this.state.income[key] = val;
    }
    this.compute();
    this.save();
  },

  /* ---------- 计算 & 渲染结果 ---------- */
  compute() {
    const r = Calculator.compute(this.state);
    this.renderResults(r);
    this.renderSummary(r);
    this._lastResult = r;
    return r;
  },

  renderResults(r) {
    const setText = (id, v) => { document.getElementById(id).textContent = v; };
    const fmt = Calculator.fmt.bind(Calculator);

    setText('rPesticide', fmt(r.pesticide, 2));
    document.getElementById('rPesticideDetail').textContent =
      `约 ${r.pesticideRounded} 套（向上取整）`;

    setText('rWater', fmt(r.water, 1));
    document.getElementById('rWaterDetail').textContent =
      `${this.state.plant.waterPerMu} 升/亩 × ${fmt(this.state.field.area,1)} 亩`;

    setText('rCost', Calculator.fmtMoney(r.totalCost));
    document.getElementById('rCostDetail').textContent =
      `每亩 ¥${Calculator.fmtMoney(r.costPerMu)}`;

    setText('rProfit', Calculator.fmtMoney(r.profit));
    const profitCard = document.querySelector('.result-card.profit');
    profitCard.dataset.loss = r.profit < 0 ? 'true' : 'false';
    document.getElementById('rProfitDetail').textContent =
      r.profit >= 0 ? `利润率 ${(r.profit / Math.max(1, r.income) * 100).toFixed(1)}%` : `亏损 ¥${Calculator.fmtMoney(-r.profit)}`;

    setText('rHeight', `${fmt(this.state.plant.flightHeight, 1)} 米`);
    setText('rCycles', `${r.cycles} 次`);
    setText('rCostPerMu', `¥${Calculator.fmtMoney(r.costPerMu)}`);
    setText('rProfitPerMu', `¥${Calculator.fmtMoney(r.profitPerMu)}`);

    // 数字闪烁动画
    document.querySelectorAll('.result-value').forEach(el => {
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 600);
    });
  },

  renderSummary(r) {
    const tbody = document.getElementById('summaryBody');
    const c = r.costBreakdown;
    const total = r.totalCost || 1;
    const items = [
      { name: '🔋 循环(电池/充电/油)', val: c.cycle || 0, color: '#ab47bc' },
      { name: '🚚 交通(油费/折旧/路桥)', val: c.transport || 0, color: '#29b6f6' },
      { name: '👥 人工(工资/餐/宿)', val: c.labor || 0, color: '#ffa726' },
      { name: '💊 药剂', val: c.pesticide || 0, color: '#66bb6a' },
      { name: '🛠 设备折旧/维修/保险', val: c.equipment || 0, color: '#8d6e63' },
      { name: '📦 其他(防护/清洗/杂)', val: c.other || 0, color: '#78909c' }
    ];
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
      plant: this.state.plant,
      field: this.state.field,
      costs: this.state.costs,
      income: this.state.income
    });
  },

  /* ---------- 事件绑定 ---------- */
  bindEvents() {
    // 主题切换
    document.getElementById('themeBtn').addEventListener('click', () => this.toggleTheme());

    // 计算按钮（触发无人机动画）
    document.getElementById('calcBtn').addEventListener('click', () => {
      this.flyDrone();
      this.compute();
      this.toast('计算完成 ✈️', 'success');
      Storage.addHistory({
        plant: this.state.plant.name,
        area: this.state.field.area,
        pesticide: this._lastResult.pesticide,
        water: this._lastResult.water,
        totalCost: this._lastResult.totalCost,
        profit: this._lastResult.profit
      });
    });

    // 预设
    document.getElementById('presetBtn').addEventListener('click', () => this.openPresetModal());
    document.getElementById('savePresetBtn').addEventListener('click', () => this.savePresetPrompt());
    document.getElementById('loadPresetBtn').addEventListener('click', () => this.openPresetModal());
    document.getElementById('deletePresetBtn').addEventListener('click', () => this.openPresetModal());

    // 导入导出
    document.getElementById('importBtn').addEventListener('click', () => this.openModal('importModal'));
    document.getElementById('exportBtn').addEventListener('click', () => this.openExportModal());
    document.getElementById('importConfirm').addEventListener('click', () => this.doImport());

    // 历史
    document.getElementById('historyBtn').addEventListener('click', () => this.openHistoryModal());
    document.getElementById('clearHistoryBtn').addEventListener('click', () => {
      Storage.clearHistory();
      this.renderHistoryList();
      this.toast('历史已清空', 'warn');
    });

    // 模态框关闭
    document.querySelectorAll('[data-close]').forEach(el => {
      el.addEventListener('click', () => this.closeModal(el.closest('.modal').id));
    });
    document.querySelectorAll('.modal').forEach(m => {
      m.addEventListener('click', e => { if (e.target === m) this.closeModal(m.id); });
    });

    // 导出 tab 切换
    document.querySelectorAll('.export-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.export-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.updateExportText(btn.dataset.exp);
      });
    });

    // 复制导出
    document.getElementById('copyExport').addEventListener('click', () => {
      const txt = document.getElementById('exportText').value;
      this.copyToClipboard(txt).then(ok => {
        this.toast(ok ? '已复制到剪贴板 📋' : '复制失败，请手动选择', ok ? 'success' : 'error');
      });
    });

    // 全局粘贴识别（在导入框中也支持，但额外提供快捷粘贴：Ctrl+Shift+V 自动填入）
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

  /* ---------- 飞行动画 ---------- */
  flyDrone() {
    const d = document.getElementById('flyingDrone');
    d.classList.remove('flying');
    void d.offsetWidth; // 触发重绘
    d.classList.add('flying');
    setTimeout(() => d.classList.remove('flying'), 5100);
  },

  /* ---------- 模态框 ---------- */
  openModal(id) {
    document.getElementById(id).classList.add('show');
    document.getElementById(id).setAttribute('aria-hidden', 'false');
  },
  closeModal(id) {
    document.getElementById(id).classList.remove('show');
    document.getElementById(id).setAttribute('aria-hidden', 'true');
  },

  /* ---------- 导出 ---------- */
  openExportModal() {
    this.openModal('exportModal');
    this.updateExportText('text');
  },
  updateExportText(type) {
    const txt = type === 'json'
      ? Storage.exportJSON(this.state, this.state.plant)
      : Storage.exportText(this.state, this.state.plant);
    document.getElementById('exportText').value = txt;
  },

  /* ---------- 导入 ---------- */
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
    this.state.plant = imported.plant;
    this.state.field = imported.field;
    this.state.costs = imported.costs;
    this.state.income = imported.income;

    // 同步 UI
    this.renderPlantGrid();
    this.updatePlantInfo();
    this.syncParamFormFromPlant();
    this.syncCostFormFromState();
    this.syncIncomeFormFromState();
    this.compute();
    this.save();
    this.toast('配置已成功导入 ✅', 'success');
    return true;
  },

  /* ---------- 预设 ---------- */
  savePresetPrompt() {
    const name = prompt('请输入预设名称：', `${this.state.plant.name}_${new Date().toLocaleDateString('zh-CN')}`);
    if (!name) return;
    Storage.savePreset(name, this.state.plant, {
      field: this.state.field,
      costs: this.state.costs,
      income: this.state.income
    });
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
    list.innerHTML = presets.map((p, i) => `
      <li data-idx="${i}">
        <div>
          <div><b>${this.escapeHtml(p.name)}</b> <span style="margin-left:6px">${p.plant.icon || ''} ${p.plant.name}</span></div>
          <div class="preset-meta">${new Date(p.savedAt).toLocaleString('zh-CN')} · ${p.state.field.area} 亩</div>
        </div>
        <span class="preset-meta">点击加载</span>
      </li>
    `).join('');
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
    this.state.plant = { ...p.plant };
    this.state.field = { ...p.state.field };
    this.state.costs = { ...p.state.costs };
    this.state.income = { ...p.state.income };
    this.renderPlantGrid();
    this.updatePlantInfo();
    this.syncParamFormFromPlant();
    this.syncCostFormFromState();
    this.syncIncomeFormFromState();
    this.compute();
    this.save();
    this.closeModal('presetModal');
    this.toast(`已加载预设「${p.name}」`, 'success');
  },

  /* ---------- 历史 ---------- */
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
    list.innerHTML = history.map(h => `
      <li>
        <div>
          <b>${h.plant}</b> · ${h.area} 亩
          <div class="hist-meta">${new Date(h.time).toLocaleString('zh-CN')} · 药 ${h.pesticide.toFixed(2)} 套 · 水 ${h.water.toFixed(1)} 升 · 成本 ¥${h.totalCost.toFixed(2)} · 利润 ¥${h.profit.toFixed(2)}</div>
        </div>
      </li>
    `).join('');
  },

  /* ---------- 工具 ---------- */
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
