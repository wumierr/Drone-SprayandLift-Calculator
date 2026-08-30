# 🚀 部署总说明 — 无人机打药计算器

> 本项目是**纯静态站点**（HTML + CSS + JS，无后端、无数据库、无构建工具链）。
> 这意味着：**任何能放文件的地方都能当服务器**，部署难度是所有 Web 项目里最低的那一档。
>
> 本文按「越往下越麻烦」排序，**从上往下挑第一个你能接受的就行**，不用全看。

---

## 目录

- [0. 一分钟决策表](#0-一分钟决策表)
- [1. 本地使用](#1-本地使用)
- [2. 公网部署 · 免运维路线（推荐）](#2-公网部署--免运维路线推荐)
- [3. 公网部署 · 自有服务器路线](#3-公网部署--自有服务器路线)
- [4. 服务器配置要求](#4-服务器配置要求)
- [5. 打包安卓 APK](#5-打包安卓-apk)
- [6. 常见问题](#6-常见问题)

---

## 0. 一分钟决策表

| 你的情况 | 选这个 | 要花钱吗 | 大概几分钟 | 命令 / 入口 |
|---|---|---|---|---|
| 就想自己在电脑上用 | 本地服务 | 否 | 1 分钟 | 双击 `1-启动服务并打开网页.bat` |
| 想发给别人用，不想折腾 | **Cloudflare Pages** | 免费 | 5 分钟 | 双击 `6-部署Cloudflare.bat` |
| 已经在用 GitHub | GitHub Pages | 免费 | 3 分钟 | 推代码 + 仓库里点一下 |
| 有自己的服务器 + 域名 | Caddy 自动 HTTPS | 服务器费用 | 10 分钟 | `sudo bash deploy/install-linux.sh caddy 你的域名` |
| 有服务器但不想装东西 | Docker | 服务器费用 | 5 分钟 | `sudo bash deploy/install-linux.sh docker` |
| 公司内网 / 局域网共享 | 局域网模式 | 否 | 1 分钟 | 菜单选 `5` |
| 要装到手机上离线用 | APK | 否 | 首次 20 分钟 | 双击 `5-打包APK.bat` |

**没主意就选 Cloudflare Pages** —— 免费、国内速度好、自动 HTTPS、自动续期、不用买服务器。

---

## 1. 本地使用

### 最简单：双击 bat

| 文件 | 作用 |
|---|---|
| `0-一键菜单.bat` | 菜单式入口，所有功能都在里面（**推荐**） |
| `1-启动服务并打开网页.bat` | 启动服务 + 自动开浏览器 |
| `2-打开网页.bat` | 只开浏览器（服务没起会自动起） |
| `3-停止服务.bat` | 关掉服务，释放 8080 端口 |
| `4-推送GitHub.bat` | 一键提交并推送（本地优先） |
| `5-打包APK.bat` | 打包安卓安装包 |
| `6-部署Cloudflare.bat` | 部署到公网 |

### 命令行（Windows）

```powershell
powershell -ExecutionPolicy Bypass -File scripts\serve.ps1 start     # 启动
powershell -ExecutionPolicy Bypass -File scripts\serve.ps1 open      # 打开网页
powershell -ExecutionPolicy Bypass -File scripts\serve.ps1 status    # 看状态
powershell -ExecutionPolicy Bypass -File scripts\serve.ps1 stop      # 停止
powershell -ExecutionPolicy Bypass -File scripts\serve.ps1 start -Lan  # 局域网可访问
```

### 命令行（Linux / macOS / WSL）

```bash
./scripts/serve.sh start
LAN=1 ./scripts/serve.sh start     # 局域网可访问
./scripts/serve.sh stop
```

### 局域网共享（手机同 WiFi 直接打开，不用部署公网）

菜单选 `5`，或加 `-Lan` 参数。脚本会打印类似 `http://192.168.1.23:8080` 的地址，
手机浏览器输入即可。**这是给同事/家人临时试用最快的办法。**

> 首次可能被 Windows 防火墙拦，弹窗时勾选「专用网络」→ 允许访问。

### 连服务都不想起

本项目支持直接双击 `index.html` 打开。唯一限制是 Service Worker（离线缓存）在
`file://` 协议下不工作，其余功能完全正常。
另有单文件版 `drone-spray-calculator-standalone.html`，把它单独发给别人也能用。

---

## 2. 公网部署 · 免运维路线（推荐）

这几种都是**别人帮你管服务器**，你只管上传文件。不用买服务器、不用配 HTTPS、不用管续期。

### 2.1 Cloudflare Pages ⭐ 首选

**为什么推荐**：免费额度足够（每月 500 次构建、无限带宽）、国内访问速度在同类里最好、
自动 HTTPS、自动全球 CDN。

#### 路线 A：命令行一键（本地已有 Node.js）

```bash
# Windows：双击 6-部署Cloudflare.bat，或
powershell -ExecutionPolicy Bypass -File scripts\deploy-cloudflare.ps1

# Linux / macOS
./scripts/deploy-cloudflare.sh
```

首次会自动弹浏览器让你登录授权，之后再跑就是全自动。
完成后地址：`https://drone-spray-calculator.pages.dev`

#### 路线 B：控制台连 Git（连命令行都不用碰）

1. 先把代码推到 GitHub（双击 `4-推送GitHub.bat`）
2. 打开 [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages → Create → Pages
3. Connect to Git → 选中本仓库
4. 构建设置：
   - **Framework preset**：`None`
   - **Build command**：`bash scripts/build-web.sh`
   - **Build output directory**：`dist`
5. Save and Deploy

之后每次 `git push` 自动重新部署，**你只需要双击 `4-推送GitHub.bat`**。

#### 路线 C：GitHub Actions 自动部署

仓库里已经准备好 `.github/workflows/deploy-cloudflare.yml`，
只要在 GitHub 仓库 Settings → Secrets 里加两个密钥即可：

| Secret 名 | 从哪拿 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → 个人资料 → API 令牌 → 创建（权限：账户 → Cloudflare Pages → 编辑） |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare → Workers & Pages 概览页右侧 |

#### 绑定自己的域名

Pages 项目 → Custom domains → Set up a custom domain → 输入域名 → 按提示改 DNS。
证书 Cloudflare 自动签发续期，**不用做任何事**。

---

### 2.2 GitHub Pages

**免费、无需信用卡**，公开仓库无限流量。缺点是国内访问速度一般。

1. 仓库 Settings → Pages → Source 选 **GitHub Actions**
2. 推一次代码（`4-推送GitHub.bat`）
3. 等 1~2 分钟，访问 `https://<用户名>.github.io/<仓库名>/`

配置文件已备好：`.github/workflows/deploy-pages.yml`，不用改。

> ⚠️ 如果站点部署在子路径（`/<仓库名>/`）下，`sw.js` 的缓存路径用的是相对路径，
> 本项目已经用 `./` 开头写好了，可以直接工作。

---

### 2.3 Netlify

```bash
cp deploy/netlify.toml ./netlify.toml     # 配置移到根目录
npx netlify-cli deploy --dir=dist --prod  # 或在 app.netlify.com 连 Git
```

### 2.4 Vercel

```bash
cp deploy/vercel.json ./vercel.json
npx vercel --prod
```

> Vercel 在中国大陆访问不太稳，国内用户优先 Cloudflare。

### 2.5 其它能放静态文件的地方

任何支持静态托管的服务都能用，把 `dist/` 目录整个传上去就行：

- **对象存储 + CDN**：阿里云 OSS / 腾讯云 COS / 七牛云（国内备案后速度最好，按量计费很便宜）
- **Gitee Pages**：国内 Git 托管，需实名
- **Surge.sh**：`npx surge dist`，一条命令
- **自己的虚拟主机 / 宝塔面板**：把 `dist/` 传到网站根目录即可

生成 `dist/` 的命令：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-web.ps1
```
```bash
./scripts/build-web.sh
```

---

## 3. 公网部署 · 自有服务器路线

有 VPS / 云服务器 / 树莓派 / 家里的软路由，都适用。

### 3.1 一条命令全自动（推荐）

把项目传到服务器后：

```bash
sudo bash deploy/install-linux.sh
```

会让你在四种方案里选：

| 方案 | 适合 | 需要域名 | 自动 HTTPS |
|---|---|---|---|
| `caddy` | **绝大多数人**，最省心 | ✅ | ✅ 自动申请+续期 |
| `nginx` | 已经在用 nginx | ✅ | ✅ 通过 certbot |
| `docker` | 不想污染系统 | ❌ | ❌（需再套反代） |
| `node` | 极低配机器（128MB 内存够用） | ❌ | ❌ |

非交互式用法：

```bash
sudo bash deploy/install-linux.sh caddy  calc.example.com
sudo bash deploy/install-linux.sh nginx  calc.example.com
sudo bash deploy/install-linux.sh docker
sudo bash deploy/install-linux.sh node
```

支持 Debian / Ubuntu / CentOS / RHEL / Rocky / Alma。

### 3.2 Docker（手动）

```bash
# 在项目根目录
docker build -f deploy/Dockerfile -t drone-spray-calculator .
docker run -d --name drone-spray -p 8080:80 --restart unless-stopped drone-spray-calculator
```

或用 compose：

```bash
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml logs -f
docker compose -f deploy/docker-compose.yml down
```

镜像约 50MB，内存占用 < 20MB。
想要自动 HTTPS，把 `docker-compose.yml` 里的 `caddy` 服务取消注释（文件里有详细步骤）。

### 3.3 nginx（手动）

```bash
./scripts/build-web.sh
sudo mkdir -p /var/www/drone-spray
sudo cp -r dist/. /var/www/drone-spray/
sudo cp deploy/nginx.conf /etc/nginx/conf.d/drone-spray.conf
sudo sed -i 's|/usr/share/nginx/html|/var/www/drone-spray|' /etc/nginx/conf.d/drone-spray.conf
sudo sed -i 's|server_name  _;|server_name  calc.example.com;|' /etc/nginx/conf.d/drone-spray.conf
sudo nginx -t && sudo systemctl reload nginx

# HTTPS
sudo certbot --nginx -d calc.example.com
```

### 3.4 Caddy（手动，最省心）

```bash
./scripts/build-web.sh
sudo mkdir -p /var/www/drone-spray && sudo cp -r dist/. /var/www/drone-spray/
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo sed -i 's/calc.example.com/你的域名/' /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy 会自己去 Let's Encrypt 申请证书并且**永久自动续期**，这一步不需要你做任何事。

### 3.5 systemd 常驻（不装 web 服务器）

```bash
sudo cp deploy/drone-spray.service /etc/systemd/system/
sudo useradd -r -s /usr/sbin/nologin webapp
sudo mkdir -p /opt/drone-spray && sudo cp -r . /opt/drone-spray/
sudo chown -R webapp:webapp /opt/drone-spray
sudo systemctl daemon-reload && sudo systemctl enable --now drone-spray
```

单元文件里已经做了安全加固（只读文件系统、内存上限 128M、禁止提权）。

---

## 4. 服务器配置要求

### 4.1 最低配置（纯静态站点，要求极低）

| 项 | 最低 | 建议 | 说明 |
|---|---|---|---|
| CPU | 1 核 | 1 核 | 静态文件几乎不吃 CPU |
| 内存 | **128 MB** | 512 MB | nginx 约 10MB / Caddy 约 30MB / Node 约 40MB |
| 磁盘 | 200 MB | 1 GB | 站点本体 < 1MB，其余是系统和日志 |
| 带宽 | 1 Mbps | 3 Mbps | 首屏总计约 250KB，gzip 后约 80KB |
| 系统 | 任意 Linux | Debian 12 / Ubuntu 22.04 | Windows Server 也可（用 IIS 指向 dist） |

**结论**：最便宜的那档云服务器（一年几十块的「轻量应用服务器」）绰绰有余。
甚至树莓派 Zero、老旧笔记本、NAS 都能跑。

### 4.2 端口与防火墙

| 端口 | 用途 | 何时需要 |
|---|---|---|
| 80 | HTTP，也是签发证书用的验证端口 | 用域名时**必开** |
| 443 | HTTPS | 用域名时**必开** |
| 8080 | 无域名时直接访问 | 只用 docker/node 方案时 |

云服务器要在**两个地方**放行：厂商控制台的安全组 + 系统防火墙（`ufw` / `firewalld`）。
`install-linux.sh` 会自动处理系统防火墙那一半，**安全组还得自己去控制台点**。

### 4.3 域名与 DNS

- 域名不是必须的（用 IP + 端口也能访问），但没有域名就没有 HTTPS
- 添加一条 **A 记录**，指向服务器公网 IP，TTL 用默认值
- DNS 生效通常几分钟，最长 24 小时
- **中国大陆服务器**：域名必须完成 ICP 备案，否则 80/443 会被拦截
  → 不想备案就用**境外服务器**或直接用 **Cloudflare Pages**（不涉及备案）

### 4.4 各托管平台免费额度对照

| 平台 | 流量 | 构建次数 | 自定义域名 | 国内速度 |
|---|---|---|---|---|
| Cloudflare Pages | 无限 | 500 次/月 | ✅ 免费 | ⭐⭐⭐⭐ |
| GitHub Pages | 100GB/月 软限制 | 无明确限制 | ✅ 免费 | ⭐⭐ |
| Netlify | 100GB/月 | 300 分钟/月 | ✅ 免费 | ⭐⭐ |
| Vercel | 100GB/月 | 6000 分钟/月 | ✅ 免费 | ⭐ |

### 4.5 本机开发环境要求

| 工具 | 版本 | 必需性 | 本机现状 |
|---|---|---|---|
| Node.js | 18+ | 本地服务 / Cloudflare 部署 | ✅ v20.17.0（`D:\nodejs`） |
| Git | 2.x | 推 GitHub | ✅ v2.54.0 |
| JDK | **17** | 打 APK | ✅ 17.0.3.1 |
| Android SDK | API 34 + build-tools 34 | 打 APK | ❌ 未安装，脚本可自动装 |
| Gradle | 8.5 | 打 APK | ❌ 未安装，脚本会自动下载 |
| PowerShell | 5.1+ | 跑 .ps1 | ✅ 系统自带 |

> ⚠️ **网络提醒**：本机 `HTTP_PROXY` 指向一个并非常驻的本地端口，
> 挂着它会让 git / npm / wrangler 直接失败。所有脚本已在会话内自动清除代理变量，
> 但**对 GitHub 的访问本身受限**，`git push` 失败属于预期情况，
> 需要时请先确认代理软件已启动。

---

## 5. 打包安卓 APK

### 路线 A：本地打包（脚本全自动）

```
双击 5-打包APK.bat
```

或：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1 -InstallSdk -Mirror
```

- `-InstallSdk`：没有 Android SDK 时自动下载安装（约 600MB，装到 `%LOCALAPPDATA%\Android\Sdk`）
- `-Mirror`：依赖走阿里云镜像，**国内必加**，否则大概率超时

首次约 15~25 分钟（下载 SDK + Gradle + 依赖），之后每次 1~2 分钟。
产物：项目根目录的 `drone-spray-calculator-debug-<日期>.apk`

### 路线 B：Android Studio

File → Open → 选 `androidapp/` 目录 → 等 Gradle Sync → Build → Build APK(s)

### 路线 C：在线转换（零本地依赖）⭐ 最省事

本项目自带 `manifest.json` + `sw.js`，是标准 PWA，可以直接被在线工具识别：

1. 先把站点部署到公网（第 2 节任选一种）
2. 打开 [PWABuilder](https://www.pwabuilder.com/)（微软出品，免费）
3. 输入你的网址 → Package for stores → Android → 下载 APK

缺点：APK 内容来自线上，**需要联网**才能加载（离线缓存靠 Service Worker）。
路线 A/B 打出来的 APK 把网页资源打进包里，**完全离线可用**。

---

## 6. 常见问题

**Q：双击 bat 闪一下就没了**
A：脚本出错会停留。若真的闪退，改用命令行看报错：
`powershell -ExecutionPolicy Bypass -File scripts\serve.ps1 start`

**Q：提示"无法加载文件，未对脚本进行数字签名"**
A：所有 bat 都已带 `-ExecutionPolicy Bypass`。若手动跑 ps1 报这个，用同样的参数即可，
不需要改系统策略。

**Q：8080 端口被占用**
A：`scripts\serve.ps1 stop` 会连子进程一起清理。若是别的软件占用，
用 `scripts\serve.ps1 start -Port 8090` 换端口。

**Q：改了代码，网页还是老样子**
A：Service Worker 缓存所致。浏览器按 `Ctrl+Shift+R` 强刷，
或 F12 → Application → Service Workers → Unregister。

**Q：`git push` 失败**
A：本机 GitHub 访问受限。依次检查：代理软件是否启动 → 凭据是否过期 →
换 SSH 方式 `git remote set-url origin git@github.com:wumierr/Drone-SprayandLift-Calculator.git`

**Q：APK 构建卡在 "Downloading..."**
A：加 `-Mirror` 参数走阿里云镜像。已经卡住的话先 `Ctrl+C`，
删掉 `%USERPROFILE%\.gradle\caches` 再重来。

**Q：腾讯 CloudBase 部署成功，PC 打开网址却变成"下载 index.html"**
A：这是 CloudBase **默认域名（*.tcloudbaseapp.com）的限制**——未绑定自定义域名时，
腾讯会对 HTML 响应强制下载（防未备案域名被当网页访问）。解决办法三选一：
1. CloudBase 控制台 → 静态网站托管 → 绑定**已备案的自定义域名**（官方指定路径）；
2. 改用 GitHub Pages / Cloudflare Pages（无此限制，项目有现成脚本）；
3. 本地自用不受影响（双击 index.html 即可）。
验证部署是否成功：直接访问 `.../js/storage.js` 这类非 HTML 资源能看到源码，即部署正常。

**Q：CloudBase 更新部署后，手机上还是旧版本**
A：三步排查：
1. 手机访问 `.../sw.js`，看注释里的版本号（如 drone-spray-v4.2.0）——已是新版说明
   服务器正常，是手机本地缓存：完全关闭页面重开 1-2 次（Service Worker 自动换新），
   或清除该站点数据；微信内置浏览器缓存最顽固，建议用系统浏览器；
2. 服务器版本也旧：CloudBase 走 CDN，边缘节点有缓存延迟，等一会儿或重新触发部署；
3. 确认手机访问的域名/路径与本次部署一致。

**Q：CloudBase 部署把整个仓库（含 androidapp/tests/文档）都传上去了**
A：`tcb hosting deploy ./` 会传仓库全部文件。建议部署构建产物：
本地先 `bash scripts/build-web.sh`（Windows `powershell -File scripts/build-web.ps1`）
生成 `dist/`，再 `tcb hosting deploy ./dist /sprayandliftcalculator`，
线上只保留运行必需的文件（构建脚本会自动重生成 standalone 单文件版）。

**Q：手机装 APK 提示"安装被阻止"**
A：设置 → 应用 → 特殊权限 → 安装未知应用 → 允许你用的那个文件管理器 / 浏览器。

---

## 附：文件清单

```
scripts/                      跨平台脚本
├─ _lib.ps1                   公共函数（Windows）
├─ menu.ps1                   一键菜单
├─ serve.ps1     / serve.sh           本地服务管理
├─ build-web.ps1 / build-web.sh       生成 dist/
├─ push-github.ps1 / push-github.sh   推送 GitHub（本地优先）
├─ deploy-cloudflare.ps1 / .sh        部署 Cloudflare Pages
├─ build-apk.ps1                      打包 APK
└─ static-server.cjs                  零依赖静态服务器

deploy/                       部署配置
├─ Dockerfile                 容器镜像（nginx:alpine，约 50MB）
├─ docker-compose.yml         一条命令起容器（可选带 Caddy）
├─ nginx.conf                 nginx 站点配置（含缓存/安全头/HTTPS 注释）
├─ Caddyfile                  Caddy 配置（自动 HTTPS）
├─ drone-spray.service        systemd 单元（含安全加固）
├─ install-linux.sh           Linux 一键部署（四种方案可选）
├─ gradle-mirror.init.gradle  Gradle 阿里云镜像
├─ netlify.toml               Netlify 配置
└─ vercel.json                Vercel 配置

.github/workflows/            CI 自动部署
├─ deploy-pages.yml           推代码自动发 GitHub Pages
└─ deploy-cloudflare.yml      推代码自动发 Cloudflare Pages
```
