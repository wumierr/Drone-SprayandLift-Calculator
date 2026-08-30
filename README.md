# 🚁 无人机打药计算器

> 一款专为植保无人机作业设计的 **药量 / 水量 / 成本 / 粗略利润** 计算器。
> 纯静态 HTML+CSS+JS，无需后端、无需构建，**双击 `index.html` 即可在 Win10 本地打开**，亦可打包为安卓 WebView APK。

![license](https://img.shields.io/badge/license-MIT-green) ![platform](https://img.shields.io/badge/platform-Win10%20%7C%20Android%20%7C%20Web-blue) ![tech](https://img.shields.io/badge/pure-vanilla%20JS-orange)

---

## ⚡ 一键操作（Windows 双击即可）

| 双击这个 | 干什么 |
|---|---|
| **`0-一键菜单.bat`** | **菜单式入口，所有功能都在里面（推荐从这里开始）** |
| `1-启动服务并打开网页.bat` | 起本地服务 + 自动开浏览器（8080 端口） |
| `2-打开网页.bat` | 只开浏览器（服务没起会自动起） |
| `3-停止服务.bat` | 关服务、释放端口 |
| `4-推送GitHub.bat` | 一键提交 + 推送（冲突时保留本地版本） |
| `5-打包APK.bat` | 打安卓安装包（首次自动装 Android SDK） |
| `6-部署Cloudflare.bat` | 一键发布到公网 |

Linux / macOS 用 `scripts/*.sh`，行为与 Windows 版一致。

> 📖 **公网部署完整说明（服务器配置要求 + 8 条部署路线 + 常见问题）→ [docs/DEPLOY.md](docs/DEPLOY.md)**
>
> - 最快上公网：双击 `6-部署Cloudflare.bat`，5 分钟拿到 `https://xxx.pages.dev`，免费 + 自动 HTTPS
> - 有自己的服务器：`sudo bash deploy/install-linux.sh` 一条命令搞定（Caddy / nginx / Docker / systemd 四选一）
> - 最低配置要求：**1 核 128MB 内存**（纯静态站点，树莓派都能跑）

---

## ✨ 功能特性

### 📊 计算能力
- **药剂用量**：按果树类（每棵×每亩棵数÷一套药水量×无人机省药系数）或面积类两种公式自动适配
- **用水量**：每亩水量 × 亩数
- **成本明细**：循环（电池+充电+油钱 / 三相电模式）、交通（油费+路桥+车辆折旧）、人工（工资+餐费+住宿）、药剂、设备折旧/维修/保险、防护/清洗/杂费
- **粗略利润**：收入 - 总成本，含每亩指标、利润率、亏损警示

### 🌱 植物数据库（默认 11 种）
果树 / 密植果园 / 柑橘园 / 水稻 / 小麦 / 玉米 / 棉花 / 蔬菜 / 茶园 / 香蕉园 / 林地。每种均给出：
- 建议飞行高度
- 每亩水量
- 每亩棵数 & 每棵水量（果树类）
- 一套药需水量
- 无人机省药系数
- 作业注意事项

### 🛠 全参数可修改
每个数值字段都能修改，鼠标悬停 **`i`** 图标显示该数据的说明。修改即自动重算并保存。

### 💾 本地存储 & 预设
- 所有数据自动保存到浏览器 LocalStorage，**不会上传任何服务器**
- 可保存多套预设（如「苹果园-春季」「水稻-分蘖期」），随时切换
- 支持最近 20 次计算的历史记录

### 📋 配置分享（复制粘贴自动识别）
- 点击 **📥 导入** 粘贴他人分享的配置（支持 JSON 格式或带 `【】` 标记的易读文本格式）
- 点击 **📤 导出** 生成可分享文本，复制后发给朋友粘贴即可一键还原
- 快捷键：**`Ctrl/Cmd + Shift + V`** 直接从剪贴板识别并填入

### 🎨 UI & 体验
- 无人机 + 农田 + 远山 + 飘云的场景化背景
- **☀️ 日间 / 🌙 夜间** 一键切换，自动记忆
- 点击「开始计算」时无人机带着药雾飞过屏幕（小巧思）
- 结果数字滚动闪烁动画
- 成本占比可视化条形图
- 完全响应式，手机/平板/PC 均可使用
- 打印友好（可直接打印结算单）

---

## 🚀 快速开始

### 方式 1：本地直接打开（最简单）

**Win10 用户：**
1. 下载整个项目文件夹
2. 双击 `index.html`
3. 默认浏览器会自动打开应用

> ⚠️ 推荐使用 Chrome / Edge / Firefox。IE 不支持。

### 方式 2：本地启动 HTTP 服务（可选，某些浏览器特性需要）

```bash
# Python 3 自带
python -m http.server 8080
# 然后浏览器访问 http://localhost:8080

# 或 Node.js
npx serve .
```

### 方式 3：部署到 GitHub Pages

```bash
# 1. 在 GitHub 创建仓库，例如 drone-spray-calculator
# 2. 克隆并上传
git clone https://github.com/<你的用户名>/drone-spray-calculator.git
cd drone-spray-calculator
# 将项目所有文件复制进来
git add .
git commit -m "feat: 无人机打药计算器 v1.0"
git push origin main

# 3. 在仓库 Settings → Pages → Source 选择 main 分支
# 4. 等待 1-2 分钟，访问 https://<你的用户名>.github.io/drone-spray-calculator/
```

> 📌 详细步骤见 [docs/github-upload.md](docs/github-upload.md)

### 方式 4：打包为安卓 APK（WebView）

详见 [androidapp/README.md](androidapp/README.md)。

三种打包路线任选其一：

#### A. 本地构建 APK（轻量脚本，无需 Android Studio）
```bash
# Win10
cd androidapp\scripts
build-apk.bat debug

# Mac/Linux
cd androidapp/scripts
./build-apk.sh debug
```
脚本会自动同步 Web 文件、下载 Gradle Wrapper、构建 APK，输出到 `androidapp/build-output/`。
仅需要 JDK 17 + Android SDK command-line tools。

#### B. Android Studio 打开编译（图形界面，最稳）
1. Android Studio → File → Open → 选择 `androidapp/` 目录
2. 等 Gradle Sync 完成
3. Build → Build APK(s)

#### C. 走网页打包工具路线（无需任何 Android 环境）
1. 把项目部署到 GitHub Pages 或任意静态托管
2. 用以下任一在线服务把 URL 一键转 APK：
   - **PWABuilder**（免费、微软出品）：https://www.pwabuilder.com/
   - **Median.co**（付费无水印）：https://median.co/
   - **WebIntoApp**（免费带广告）：https://www.webintoapp.com/
3. 或用命令行 Capacitor/Cordova 桥接（详见 `androidapp/README.md`）

> ✅ 本项目已内置 `manifest.json` + `sw.js`，符合 PWA 标准，PWABuilder 可直接识别。

---

## 📁 项目结构

```
drone-spray-calculator/
├── index.html              # 主入口（双击即可打开）
├── manifest.json           # PWA 清单（让网页可被识别为应用）
├── sw.js                   # Service Worker（离线缓存）
├── css/
│   └── style.css           # 样式表（含昼夜主题、移动端深度优化）
├── js/
│   ├── data.js             # 默认植物数据库 & 字段定义
│   ├── calculator.js       # 计算核心（药量/水量/成本/利润）
│   ├── storage.js          # LocalStorage + 预设 + 导入导出
│   ├── ui.js               # UI 渲染与交互
│   └── app.js              # 主入口
├── tests/
│   └── calc.test.js        # 无依赖测试套件（运行：node tests/calc.test.js）
├── assets/
│   └── icons/
│       ├── favicon.svg         # 矢量图标
│       ├── icon-192.png        # PWA 图标 192
│       ├── icon-512.png        # PWA 图标 512
│       └── apple-touch-icon.png
├── androidapp/                 # ✅ 完整可构建的 Android 工程
│   ├── README.md               # 构建与环境配置完整指南
│   ├── app/                    # Android 应用代码 + 资源 + Web 资源
│   ├── scripts/                # 一键构建/同步/预览脚本
│   └── gradle/                 # Gradle wrapper 配置
├── docs/
│   ├── usage.md                # 详细使用说明
│   └── github-upload.md        # GitHub 上传指引
├── README.md                   # 本文件
├── LICENSE                     # MIT
└── .gitignore
```

---

## 🧮 计算公式说明

### 药剂用量

**果树类（calcMode=tree）**：
```
药量(套) = (亩数 × 每棵水量 × 每亩棵数 ÷ 一套药需水量) × 无人机省药系数
```
例：10 亩苹果树，每棵 3 升，每亩 80 棵，一套药需 300 升水，省药系数 0.7
→ (10 × 3 × 80 ÷ 300) × 0.7 = **5.6 套**（向上取整为 6 套）

**面积类（calcMode=area）**：
```
药量(套) = (亩数 × 每亩水量 ÷ 一套药需水量) × 无人机省药系数
```

### 用水量
```
水量(升) = 亩数 × 每亩水量
```

### 成本明细
| 项目 | 公式 |
|------|------|
| 循环成本 | ⌈亩数 ÷ 单循环亩数⌉ × (三相电 ? 三相电循环成本 : 单次循环成本) |
| 交通油费 | 单程路程 × 2 × 油耗/100 × 油价 + 路桥费 + 车辆折旧 × (单程×2) |
| 人工 | 人数 × 天数 × (日薪 + 餐费) + 住宿费 × 天数 |
| 药剂 | 药量(套) × 一套药剂价格 |
| 设备折旧/维修/保险 | 亩数 × (无人机折旧 + 维修储备 + 保险分摊) |
| 其他 | 防护装备 + 清洗费 + 杂费 |

### 利润
```
收入 = 亩数 × 每亩收费 + 补贴
利润 = 收入 - 总成本
```

---

## 🔧 自定义扩展

### 添加新植物
编辑 `js/data.js`，在 `PLANT_DATABASE` 中新增一项：
```javascript
custom_crop: {
  name: '我的作物',
  icon: '🌾',
  calcMode: 'area',           // 或 'tree'
  flightHeight: 2.0,
  waterPerMu: 1.8,
  treesPerMu: 0,
  waterPerTree: 0,
  pesticideWaterPerSet: 300,
  droneSavingCoeff: 0.7,
  description: '我的自定义作物',
  notes: '⚠️ 自定义注意事项'
}
```

### 修改默认参数
所有默认值都在 `js/data.js` 的 `DEFAULT_COSTS`、`DEFAULT_INCOME`、`DEFAULT_FIELD` 中。

### 自定义主题
编辑 `css/style.css` 顶部的 `[data-theme="day"]` 和 `[data-theme="night"]` 中的 CSS 变量即可。

---

## 🧪 开发与测试

项目无任何依赖、无构建步骤。修改 `js/` 后运行测试确认计算与导入导出逻辑未被破坏：

```bash
node tests/calc.test.js
```

覆盖范围：7舍8入取整、打药/吊运计算公式、电池等待模拟、文本与 JSON 导入导出往返、预设结构。
改动 `sw.js` 的 `CACHE_VERSION` 才能让 PWA 用户拿到新版本。

---

## ❓ FAQ

**Q: 数据会保存到哪里？**
A: 全部保存在你本机浏览器的 LocalStorage 中，清空浏览器缓存会丢失，请用「导出」备份。

**Q: 可以离线使用吗？**
A: 可以，纯静态文件，无任何网络请求。打包成 APK 后完全离线可用。

**Q: 在手机上能用吗？**
A: 可以，网页响应式适配。或打包成 APK 安装到安卓手机。

**Q: 公式来源？**
A: 默认值来自用户提供的果树实际作业经验（3升/棵、80棵/亩、300升/套、0.7省药系数、20升/亩水量、7元/循环、2亩/循环等），其他作物参考农业农村部植保无人机作业规范。所有数值均可根据你的实际情况修改。

---

## 📝 License

MIT License — 可自由使用、修改、商用。详见 [LICENSE](LICENSE)。

---

## 🤝 贡献

欢迎提 Issue 或 PR 添加新作物数据、修正公式或优化 UI。

## 📧 联系

如有问题或建议，请在 GitHub 仓库提 Issue。
