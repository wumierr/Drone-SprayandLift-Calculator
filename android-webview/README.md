# 📱 Android WebView APK 打包指南

本项目可打包为安卓 APK，安装到手机直接使用（无需浏览器）。提供两种方式：

---

## 方式 A：使用 Android Studio 编译（推荐，免费、可定制）

### 1. 准备环境
- 安装 **Android Studio**：https://developer.android.com/studio
- 首次运行会自动下载 SDK

### 2. 复制 Web 文件到模板工程

把项目根目录下的 Web 文件复制到模板的 `assets/www/` 目录：

```
android-webview/app/src/main/assets/www/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── data.js
│   ├── calculator.js
│   ├── storage.js
│   ├── ui.js
│   └── app.js
└── assets/
    └── icons/
        └── favicon.svg
```

**Windows 命令行操作**（在项目根目录打开 CMD）：
```cmd
:: 清空旧的 www 目录
rmdir /s /q android-webview\app\src\main\assets\www

:: 创建新目录
mkdir android-webview\app\src\main\assets\www

:: 复制文件
xcopy index.html android-webview\app\src\main\assets\www\ /y
xcopy css android-webview\app\src\main\assets\www\css\ /e /y /i
xcopy js android-webview\app\src\main\assets\www\js\ /e /y /i
xcopy assets android-webview\app\src\main\assets\www\assets\ /e /y /i
```

或使用 PowerShell：
```powershell
$src = "."
$dst = "android-webview/app/src/main/assets/www"
Remove-Item -Recurse -Force $dst -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $dst -Force
Copy-Item "$src/index.html" "$dst/" -Recurse -Force
Copy-Item "$src/css" "$dst/" -Recurse -Force
Copy-Item "$src/js" "$dst/" -Recurse -Force
Copy-Item "$src/assets" "$dst/" -Recurse -Force
```

或提供一个一键打包脚本（见本目录下 `sync-web.bat` 和 `sync-web.sh`）。

### 3. 用 Android Studio 打开模板工程
- File → Open → 选择 `android-webview/` 目录
- 等待 Gradle 同步完成（首次约 2-5 分钟）

### 4. 修改应用信息（可选）
编辑 `app/src/main/res/values/strings.xml`：
```xml
<resources>
    <string name="app_name">无人机打药计算器</string>
</resources>
```

### 5. 替换应用图标（可选）
- 准备一张 1024×1024 PNG 图标
- 使用 Android Studio 的 Image Asset 工具：右键 `app` → New → Image Asset
- 或直接替换 `app/src/main/res/mipmap-*/ic_launcher.png`

### 6. 编译生成 APK

**Debug APK（自用）：**
- 菜单 Build → Build Bundle(s) / APK(s) → Build APK(s)
- 完成后点击 "locate" 找到 APK：
  `app/build/outputs/apk/debug/app-debug.apk`

**Release APK（发布，需签名）：**
- 菜单 Build → Generate Signed Bundle / APK → APK
- 首次需创建 keystore（Key store path → Create new）
- 填写别名、密码、有效期（建议 25 年）
- 选 release → Finish
- APK 输出在 `app/release/app-release.apk`

### 7. 安装到手机
- 把 APK 拷到手机，文件管理器点击安装
- 或使用 ADB：`adb install app-debug.apk`
- 首次安装需开启「未知来源应用」权限

---

## 方式 B：在线 WebView 打包服务（无需 Android Studio）

如果不想装 Android Studio，可用以下在线服务把 Web 项目打包成 APK：

### 推荐：Median.co（原 GoNative）
- 官网：https://median.co/
- 上传项目 zip 或填入 GitHub Pages URL
- 一键生成 APK，免费版含水印

### 其他选择
- **WebIntoApp**：https://www.webintoapp.com/
- **AppsGeyser**：https://appsgeyser.com/
- **Apache Cordova**（命令行）：https://cordova.apache.org/

### Apache Cordova 示例
```bash
npm install -g cordova
cordova create dronespray com.dronespray.calculator "无人机打药计算器"
cd dronespray
# 删除默认 www，复制本项目文件到 www/
rm -rf www/*
cp -r /path/to/drone-spray-calculator/* www/
cordova platform add android
cordova build android
# APK 在 platforms/android/app/build/outputs/apk/debug/
```

---

## 重要说明

### 1. WebView 兼容性
模板工程中的 `MainActivity.java` 已配置：
- 启用 JavaScript
- 启用 DOM Storage（LocalStorage 必需）
- 启用文件访问
- 防止 WebView 打开外部浏览器
- 支持返回键回退网页

### 2. 数据存储
APK 安装后，数据存在应用的内部存储中。**卸载 APK 会丢失数据**，请用「导出」备份。

### 3. 离线使用
打包后完全离线可用，无需任何网络权限（已在 AndroidManifest 中最小化权限）。

### 4. Android 最低版本
模板工程设置 `minSdkVersion 21`（Android 5.0），覆盖 99%+ 的设备。

### 5. APK 大小
约 3-5 MB（主要是 AndroidX WebView 组件）。

---

## 故障排查

### APK 闪退
- 检查 `assets/www/index.html` 是否存在
- 用 `adb logcat` 查看日志

### LocalStorage 不工作
- 确认 `WebSettings.setDomStorageEnabled(true)` 已设置（模板已包含）

### 图片不显示
- 确认路径为相对路径（如 `assets/icons/favicon.svg`），不要用绝对路径

### 中文乱码
- 确认 `index.html` 顶部有 `<meta charset="UTF-8">`（本项目已包含）

---

## 进阶定制

### 添加启动屏
编辑 `app/src/main/res/layout/activity_main.xml`，添加 ImageView 启动屏，2 秒后隐藏。

### 添加菜单
在 `MainActivity.java` 中重写 `onCreateOptionsMenu` 添加菜单项（如「关于」「检查更新」）。

### 接入原生功能
如需调用相机、GPS、推送等原生功能，建议改用 Apache Cordova 或 Capacitor。

### 自动同步 Web 文件
编辑 `sync-web.bat`（Windows）或 `sync-web.sh`（Mac/Linux），运行后会自动把根目录的最新 Web 文件同步到 `android-webview/app/src/main/assets/www/`。
