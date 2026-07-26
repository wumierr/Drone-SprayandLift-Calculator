# 📱 Android App（androidapp）

> 这是一个**完整可构建的 Android WebView 应用工程**，已内置 Web 资源，针对小屏幕和 Android 系统特性深度优化。

## ✨ 工程亮点

### 移动端深度优化
- ✅ **沉浸式边到边布局**：内容延伸到状态栏后方，刘海屏 `shortEdges` 模式
- ✅ **跟随系统深色模式**：DayNight 主题自动切换，状态栏图标颜色跟随
- ✅ **safe-area 适配**：通过 JS 注入 `--safe-top/--safe-bottom` CSS 变量，旧 WebView 也兼容
- ✅ **键盘适配**：`adjustResize` 模式 + WebView padding，输入框不会被软键盘遮挡
- ✅ **返回键回退**：先回退网页历史，再退出应用
- ✅ **横竖屏切换不重建**：`configChanges` 配置，状态完整保留
- ✅ **触摸目标 ≥44px**：符合 Apple HIG / Material Design 最小触摸尺寸
- ✅ **输入框 16px 字号**：防止 iOS/WebView 自动缩放页面
- ✅ **禁用 WebView 长按菜单**：UI 元素不会被选中复制
- ✅ **禁用过度滚动弹性效果**：页面不会被拖出视窗
- ✅ **取消点击高亮色**：移除 Android WebView 默认黄色/蓝色高亮
- ✅ **`prefers-reduced-motion` 无障碍**：尊重系统动画偏好
- ✅ **超小屏（<380px）紧凑布局**：老安卓机也能舒适使用

### 工程规范
- ✅ **最小权限原则**：完全离线应用，无任何网络权限
- ✅ **minSdk 21**（Android 5.0）：覆盖 99%+ 设备
- ✅ **targetSdk 34**（Android 14）：满足 Google Play 上架要求
- ✅ **AppCompat + AndroidX**：长期维护的官方库
- ✅ **BackupRules 配置**：用户换机可恢复 LocalStorage 数据
- ✅ **ProGuard 规则**：保留 WebView 相关类防崩溃

---

## 🚀 快速构建

### 方式 A：使用一键脚本（最轻量，无需 Android Studio）

#### Windows
```cmd
:: 1. 安装 JDK 17 和 Android SDK（见下方「环境配置」）
:: 2. 运行构建脚本
cd androidapp\scripts
build-apk.bat debug
```

#### Mac / Linux
```bash
# 1. 安装 JDK 17 和 Android SDK（见下方「环境配置」）
# 2. 运行构建脚本
cd androidapp/scripts
chmod +x build-apk.sh
./build-apk.sh debug
```

脚本会自动：
1. 检查环境
2. 同步 Web 文件到 `app/src/main/assets/www/`
3. 下载 Gradle Wrapper jar（如果缺失）
4. 构建 APK
5. 拷贝到 `androidapp/build-output/` 目录

### 方式 B：使用 Android Studio（图形界面，最稳）

1. 打开 Android Studio
2. **File → Open** → 选择 `androidapp/` 目录
3. 等待 Gradle Sync 完成（首次约 2-5 分钟）
4. **Build → Build Bundle(s) / APK(s) → Build APK(s)**
5. APK 输出在 `app/build/outputs/apk/debug/app-debug.apk`

### 方式 C：纯命令行 Gradle

```bash
cd androidapp
# 先同步 Web 文件
bash scripts/sync-web.sh
# 生成 wrapper（如已存在跳过）
gradle wrapper --gradle-version 8.5
# 构建 Debug APK
./gradlew assembleDebug
# 或 Release APK（需签名配置，见下方）
./gradlew assembleRelease
```

---

## 🔧 环境配置（首次使用）

### JDK 17（必需）

| 系统 | 命令 |
|------|------|
| Windows | 下载安装 [Adoptium Temurin 17](https://adoptium.net/temurin/releases/) |
| Mac | `brew install openjdk@17` |
| Linux | `sudo apt install openjdk-17-jdk` |

验证：
```bash
java -version
# 应输出 openjdk version "17.x.x" 或更高
```

### Android SDK（必需）

**方式 1：安装 Android Studio（最简单）**
1. 下载：https://developer.android.com/studio
2. 首次启动会自动安装 SDK
3. 默认路径：
   - Windows: `%LOCALAPPDATA%\Android\Sdk`
   - Mac: `~/Library/Android/sdk`
   - Linux: `~/Android/Sdk`

**方式 2：仅安装 command-line tools（轻量）**
1. 下载：https://developer.android.com/studio#command-line-tools-only
2. 解压到 `$ANDROID_HOME/cmdline-tools/latest/`
3. 安装必要组件：
```bash
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
```

**设置环境变量：**
- Windows：系统属性 → 环境变量 → 新建 `ANDROID_HOME` = SDK 路径
- Mac/Linux：在 `~/.bashrc` 或 `~/.zshrc` 添加：
  ```bash
  export ANDROID_HOME=$HOME/Android/Sdk
  export PATH=$PATH:$ANDROID_HOME/platform-tools
  ```

验证：
```bash
adb --version
# 应输出 Android Debug Bridge 版本号
```

### Gradle（可选，wrapper 会自动下载）

如果不想用 wrapper，可本机安装：
- Mac: `brew install gradle`
- Linux: `sdk install gradle`（需 [sdkman](https://sdkman.io/)）
- Windows: `choco install gradle`（需 [Chocolatey](https://chocolatey.org/)）

---

## ✍️ Release APK 签名

Debug APK 可直接安装测试，但 Release APK 需要签名才能在真机运行。

### 1. 生成签名密钥（一次性）

```bash
keytool -genkey -v -keystore drone-spray.keystore \
  -alias drone-spray \
  -keyalg RSA -keysize 2048 -validity 9125 \
  -storepass 你的密码 -keypass 你的密码 \
  -dname "CN=DroneSpray, OU=App, O=Personal, L=City, ST=Province, C=CN"
```

将 `drone-spray.keystore` 放到 `androidapp/app/` 目录。

### 2. 创建签名配置

在 `androidapp/app/build.gradle` 的 `android { ... }` 块内添加：

```gradle
signingConfigs {
    release {
        storeFile file('drone-spray.keystore')
        storePassword '你的密码'
        keyAlias 'drone-spray'
        keyPassword '你的密码'
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        // ... 其他配置
    }
}
```

⚠️ **安全提醒**：不要把 `keystore` 文件和密码提交到 git。已在 `.gitignore` 中排除。

### 3. 构建 Release APK

```bash
cd androidapp
./gradlew assembleRelease
# APK 输出在 app/build/outputs/apk/release/app-release.apk
```

---

## 📲 安装到手机

### 方式 1：ADB 命令
```bash
adb install androidapp/build-output/drone-spray-calculator-debug.apk
```

### 方式 2：文件传输
1. 把 APK 拷到手机
2. 文件管理器点击安装
3. 首次安装需开启「允许从此来源安装」

---

## 📁 工程结构

```
androidapp/
├── app/
│   ├── build.gradle                          # 模块构建配置
│   ├── proguard-rules.pro                    # 混淆规则
│   └── src/main/
│       ├── AndroidManifest.xml               # 应用清单
│       ├── assets/www/                       # Web 资源（已同步）
│       │   ├── index.html
│       │   ├── manifest.json
│       │   ├── sw.js
│       │   ├── css/ js/ assets/
│       ├── java/com/dronespray/calculator/
│       │   └── MainActivity.java             # WebView 容器
│       └── res/
│           ├── drawable/ic_launcher_foreground.xml
│           ├── layout/activity_main.xml
│           ├── mipmap-anydpi-v26/            # 自适应图标
│           ├── values/                       # 日间主题+颜色+字符串
│           ├── values-night/                 # 夜间主题
│           └── xml/                          # 备份规则
├── gradle/wrapper/
│   ├── gradle-wrapper.properties
│   └── README.md                             # wrapper jar 获取说明
├── scripts/
│   ├── sync-web.sh / .bat                    # 同步 Web 文件
│   ├── build-apk.sh / .bat                   # 一键构建
│   └── serve.sh                              # 本地预览（PWA 调试）
├── build.gradle                              # 顶层构建
├── settings.gradle
├── gradle.properties
└── README.md                                 # 本文件
```

---

## 🔄 更新 Web 内容后重新打包

修改根目录的 Web 文件后：

```bash
# Linux/Mac
cd androidapp/scripts
./sync-web.sh && ./build-apk.sh debug

# Windows
cd androidapp\scripts
sync-web.bat && build-apk.bat debug
```

---

## 🌐 走网页打包工具路线（无需装 Android 环境）

如果不想配置 Android 开发环境，可走以下**纯 Web 路线**生成 APK：

### 路线 1：PWABuilder（推荐，免费、微软出品）

1. 把整个 Web 项目部署到 GitHub Pages 或任意静态托管
2. 访问 https://www.pwabuilder.com/
3. 输入部署 URL，点击 **Start**
4. 选择 **Android**，点击 **Generate Package**
5. 下载得到一个完整的 TWA（Trusted Web Activity）APK 工程包
6. 解压后用 Android Studio 打开编译，或用其提供的云构建服务

> ✅ 本项目已内置 `manifest.json` + `sw.js`，符合 PWA 标准，可直接被 PWABuilder 识别。

### 路线 2：Median.co（原 GoNative，付费无水印）

1. 访问 https://median.co/
2. 选择 "Android App"
3. 输入部署 URL（或上传 zip）
4. 配置应用名、图标、启动屏
5. 一键生成 APK

### 路线 3：WebIntoApp（免费版带广告）

1. 访问 https://www.webintoapp.com/
2. 上传项目 zip 或填入 URL
3. 免费生成带水印 APK，付费去水印

### 路线 4：Capacitor（命令行，开源）

```bash
npm install -g @capacitor/cli
npx @capacitor/create-app drone-spray-android
cd drone-spray-android
# 复制 web 文件到 www/
npx cap add android
npx cap sync
npx cap open android  # 在 Android Studio 中打开
```

### 路线 5：Apache Cordova（命令行，开源）

```bash
npm install -g cordova
cordova create dronespray com.dronespray.calculator "无人机打药"
cd dronespray
rm -rf www/*
cp -r /path/to/drone-spray-calculator/* www/
cordova platform add android
cordova build android
```

---

## ❓ FAQ

### Q: 构建时报错 "Could not find gradle-wrapper.jar"
A: 运行 `build-apk.sh/.bat`，脚本会自动下载；或用 Android Studio 打开工程，IDE 会自动生成。

### Q: 构建时报错 "Failed to install the following Android SDK packages"
A: 用 `sdkmanager` 安装缺失组件：
```bash
sdkmanager "platforms;android-34" "build-tools;34.0.0"
```

### Q: APK 闪退
A:
1. 检查 `assets/www/index.html` 存在
2. 用 `adb logcat | grep dronespray` 查看崩溃日志
3. 确认 WebView 不低于 Chrome 51（Android 5.0+）

### Q: LocalStorage 数据丢失
A:
1. 确认 `WebSettings.setDomStorageEnabled(true)`（已配置）
2. 卸载 APK 会清空数据，请用「导出」备份
3. 换机可通过 BackupRules 恢复

### Q: 状态栏遮挡内容
A: 已通过 `setOnApplyWindowInsetsListener` 处理；如仍异常，检查 WebView padding。

### Q: 想加启动屏
A: 在 `MainActivity.onCreate` 中显示 ImageView 2 秒后隐藏，或使用 [AndroidX SplashScreen](https://developer.android.com/develop/ui/views/launch/splash-screen)。

### Q: 想加原生推送/相机
A: 建议改用 Capacitor 或 Cordova 桥接，本项目刻意保持纯 WebView。

---

## 📝 构建问题排查清单

- [ ] JDK 17+ 已安装且 `java -version` 正常
- [ ] `ANDROID_HOME` 环境变量已设置
- [ ] 已安装 `platforms;android-34` 和 `build-tools;34.0.0`
- [ ] `assets/www/index.html` 存在（运行 `sync-web.sh/.bat`）
- [ ] `gradle-wrapper.jar` 存在（运行 `build-apk.sh/.bat` 自动下载）
- [ ] 网络可访问 Google Maven（国内需配镜像，见下）

### 国内加速 Gradle 下载

在 `androidapp/build.gradle` 顶部添加（如已配置 settings.gradle repositories，则修改 settings.gradle）：

```gradle
// 阿里云镜像
maven { url 'https://maven.aliyun.com/repository/google' }
maven { url 'https://maven.aliyun.com/repository/public' }
maven { url 'https://maven.aliyun.com/repository/gradle-plugin' }
```

修改 `gradle/wrapper/gradle-wrapper.properties`：
```
distributionUrl=https\://mirrors.cloud.tencent.com/gradle/gradle-8.5-bin.zip
```
