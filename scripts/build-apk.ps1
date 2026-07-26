# ============================================================
#  build-apk.ps1 — 把静态网页打包成安卓 APK（WebView 壳）
#
#  用法:
#    powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1
#    powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1 -Type release
#    powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1 -InstallSdk -Mirror
#
#  参数:
#    -Type debug|release   构建类型（默认 debug；release 未签名，仅供自用/再签名）
#    -InstallSdk           缺 Android SDK 时自动下载安装（约 600MB，装到 %LOCALAPPDATA%\Android\Sdk）
#    -Mirror               依赖走国内镜像（阿里云），国内网络强烈建议加上
#    -SkipSync             跳过网页资源同步
#    -Clean                构建前清理
#
#  环境要求（脚本会逐项检查并给出解决办法）:
#    - JDK 17            必需
#    - Android SDK       必需（platform 34 + build-tools 34）
#    - Gradle 8.5        缺失时自动下载
#
#  ⚠ 装不了 Android 环境？本项目自带 PWA（manifest.json + sw.js），
#    部署到公网后可用 PWABuilder 在线一键转 APK，见脚本末尾提示。
# ============================================================

[CmdletBinding()]
param(
    [ValidateSet('debug', 'release')]
    [string]$Type = 'debug',
    [switch]$InstallSdk,
    [switch]$Mirror,
    [switch]$SkipSync,
    [switch]$Clean
)

. (Join-Path $PSScriptRoot '_lib.ps1')
Set-Location $ProjectRoot

$AppDir        = Join-Path $ProjectRoot 'androidapp'
$WwwDir        = Join-Path $AppDir 'app\src\main\assets\www'
$GradleVersion = '8.5'      # 必须与 androidapp/build.gradle 的 AGP 8.2.0 匹配（AGP 8.2 不支持 Gradle 9.x）
# SDK 默认装在 D 盘：C 盘长期紧张，且本机已有 D:\Android\Sdk
$SdkDefault    = 'D:\Android\Sdk'
$CacheDir      = 'D:\Android\build-cache\drone'

Write-Step "无人机打药计算器 — APK 打包 ($Type)"

if (-not (Test-Path $AppDir)) {
    Write-Fail "未找到 Android 工程目录：$AppDir"
    Wait-Exit 1
}
Disable-ProxyForSession
if (-not (Test-Path $CacheDir)) { New-Item -ItemType Directory -Path $CacheDir -Force | Out-Null }

# ============================================================
#  Step 1 / 6  同步网页资源
# ============================================================
Write-Step 'Step 1/6  同步网页资源到 Android 工程'

if ($SkipSync) {
    Write-Note '按 -SkipSync 跳过'
} else {
    if (Test-Path $WwwDir) { Remove-Item $WwwDir -Recurse -Force }
    New-Item -ItemType Directory -Path $WwwDir -Force | Out-Null

    foreach ($f in @('index.html', 'manifest.json', 'sw.js', 'drone-spray-calculator-standalone.html')) {
        $src = Join-Path $ProjectRoot $f
        if (Test-Path $src) { Copy-Item $src -Destination $WwwDir -Force }
    }
    foreach ($d in @('css', 'js', 'assets')) {
        $src = Join-Path $ProjectRoot $d
        if (Test-Path $src) { Copy-Item $src -Destination $WwwDir -Recurse -Force }
    }
    Write-Ok "已同步 $((Get-ChildItem $WwwDir -Recurse -File).Count) 个文件 ($(Get-DirSize $WwwDir))"
}

# ============================================================
#  Step 2 / 6  检查 JDK
# ============================================================
Write-Step 'Step 2/6  检查 JDK 17'

$javaHome = $env:JAVA_HOME
if (-not $javaHome -or -not (Test-Path (Join-Path $javaHome 'bin\java.exe'))) {
    if (Test-Cmd 'java') {
        $javaExe  = Get-CmdPath 'java'
        $javaHome = Split-Path -Parent (Split-Path -Parent $javaExe)
    }
}
if (-not (Test-Cmd 'java')) {
    Write-Fail '未找到 Java'
    Write-Tip  '下载 JDK 17 (Temurin): https://adoptium.net/temurin/releases/?version=17'
    Write-Tip  '安装后设置环境变量 JAVA_HOME 指向 JDK 目录'
    Wait-Exit 1
}
$javaVer = (& java -version 2>&1 | Select-Object -First 1) -join ' '
Write-Ok "Java: $javaVer"
if ($javaVer -notmatch '"1[7-9]|"2[0-9]') {
    Write-Note 'Android Gradle Plugin 8.x 需要 JDK 17+，当前版本可能不兼容'
}
if ($javaHome) { Write-Tip "JAVA_HOME = $javaHome" }

# ============================================================
#  Step 3 / 6  检查 / 安装 Android SDK
# ============================================================
Write-Step 'Step 3/6  检查 Android SDK'

function Find-AndroidSdk {
    # D 盘优先：C 盘剩余空间长期紧张，SDK 又是 600MB 起步
    $candidates = @(
        $env:ANDROID_HOME,
        $env:ANDROID_SDK_ROOT,
        'D:\Android\Sdk',
        (Join-Path $env:LOCALAPPDATA 'Android\Sdk'),
        (Join-Path $env:USERPROFILE 'AppData\Local\Android\Sdk'),
        'C:\Android\Sdk'
    )
    foreach ($c in $candidates) {
        # 只有 cmdline-tools、没装任何 package 的半成品 SDK 也算命中，
        # 后面 Step 3 会检测缺失的 platform 并补装
        if ($c -and (Test-Path $c)) { return $c }
    }
    return $null
}

function Install-AndroidSdk {
    param([string]$SdkRoot)

    Write-Note "开始安装 Android SDK 到 $SdkRoot（约 600MB，视网速需要几分钟）"
    $toolsZipUrl = 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip'
    $zipPath = Join-Path $CacheDir 'cmdline-tools.zip'

    if (-not (Test-Path $zipPath)) {
        Write-Note "下载命令行工具 ..."
        try {
            $ProgressPreference = 'SilentlyContinue'
            Invoke-WebRequest -Uri $toolsZipUrl -OutFile $zipPath -UseBasicParsing -TimeoutSec 600
        } catch {
            Write-Fail "下载失败: $($_.Exception.Message)"
            Write-Tip  "手动下载 $toolsZipUrl 后放到 $zipPath 再重跑"
            return $false
        }
    }

    $ctRoot = Join-Path $SdkRoot 'cmdline-tools'
    $tmp = Join-Path $CacheDir 'ct-extract'
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    New-Item -ItemType Directory -Path $tmp -Force | Out-Null
    Expand-Archive -Path $zipPath -DestinationPath $tmp -Force

    $latestDir = Join-Path $ctRoot 'latest'
    if (Test-Path $latestDir) { Remove-Item $latestDir -Recurse -Force }
    New-Item -ItemType Directory -Path $ctRoot -Force | Out-Null
    Move-Item -Path (Join-Path $tmp 'cmdline-tools') -Destination $latestDir -Force
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

    $sdkmanager = Join-Path $latestDir 'bin\sdkmanager.bat'
    if (-not (Test-Path $sdkmanager)) { Write-Fail 'sdkmanager 解压异常'; return $false }

    Write-Note '接受 SDK 许可协议 ...'
    $yes = (1..60 | ForEach-Object { 'y' })
    $yes | & $sdkmanager --sdk_root="$SdkRoot" --licenses 2>&1 | Out-Null

    Write-Note '安装 platform-tools / platforms;android-34 / build-tools;34.0.0 ...'
    & $sdkmanager --sdk_root="$SdkRoot" 'platform-tools' 'platforms;android-34' 'build-tools;34.0.0' 2>&1 |
        Select-Object -Last 5 | ForEach-Object { Write-Tip $_ }

    return (Test-Path (Join-Path $SdkRoot 'platforms\android-34'))
}

$sdkRoot = Find-AndroidSdk
if (-not $sdkRoot) {
    if ($InstallSdk) {
        $sdkRoot = $SdkDefault
        New-Item -ItemType Directory -Path $sdkRoot -Force | Out-Null
        if (-not (Install-AndroidSdk -SdkRoot $sdkRoot)) {
            Write-Fail 'Android SDK 安装失败'
            $sdkRoot = $null
        }
    } else {
        Write-Fail '未找到 Android SDK'
        Write-Host ''
        Write-Tip '三条路可选：'
        Write-Tip '  1) 本脚本自动装（推荐，无需 Android Studio）:'
        Write-Tip '       scripts\build-apk.ps1 -InstallSdk -Mirror'
        Write-Tip '  2) 装 Android Studio，用它打开 androidapp\ 目录，Build -> Build APK(s)'
        Write-Tip '  3) 完全不碰安卓环境：先把网站部署到公网，再用 PWABuilder 在线转 APK'
        Write-Tip '       https://www.pwabuilder.com/  （本项目已内置 manifest.json + sw.js）'
        Wait-Exit 1
    }
}

if ($sdkRoot) {
    $env:ANDROID_HOME     = $sdkRoot
    $env:ANDROID_SDK_ROOT = $sdkRoot
    Write-Ok "Android SDK: $sdkRoot"

    if (-not (Test-Path (Join-Path $sdkRoot 'platforms\android-34'))) {
        Write-Note '缺少 platforms;android-34'
        $sm = Join-Path $sdkRoot 'cmdline-tools\latest\bin\sdkmanager.bat'
        if (Test-Path $sm) {
            Write-Note '正在补装 ...'
            $yes = (1..60 | ForEach-Object { 'y' })
            $yes | & $sm --sdk_root="$sdkRoot" --licenses 2>&1 | Out-Null
            & $sm --sdk_root="$sdkRoot" 'platforms;android-34' 'build-tools;34.0.0' 2>&1 | Select-Object -Last 3 | ForEach-Object { Write-Tip $_ }
        } else {
            Write-Fail '找不到 sdkmanager，无法自动补装'
            Write-Tip  '请用 Android Studio 的 SDK Manager 勾选 Android 14 (API 34) 和 Build-Tools 34'
            Wait-Exit 1
        }
    }

    # local.properties 让 Gradle 找到 SDK
    $localProps = Join-Path $AppDir 'local.properties'
    $sdkEscaped = $sdkRoot -replace '\\', '\\\\' -replace ':', '\:'
    Set-Content -Path $localProps -Value "sdk.dir=$sdkEscaped" -Encoding ascii
    Write-Ok 'local.properties 已写入'
}

# ============================================================
#  Step 4 / 6  准备 Gradle
# ============================================================
Write-Step 'Step 4/6  准备 Gradle 8.5'

function Get-GradleMajor {
    param([string]$GradleBat)
    try {
        $out = (& $GradleBat --version 2>&1 | Out-String)
        if ($out -match 'Gradle\s+(\d+)\.') { return [int]$Matches[1] }
    } catch { }
    return 0
}

function Resolve-Gradle {
    $local = Join-Path $CacheDir "gradle-$GradleVersion\bin\gradle.bat"
    if (Test-Path $local) { Write-Ok "使用已缓存 Gradle $GradleVersion : $local"; return $local }

    # 系统里可能装了别的版本（本机 scoop 装的是 9.5.1）。
    # 本工程 AGP 是 8.2.0，只吃 Gradle 8.x —— 用 9.x 会直接构建失败，所以必须校验大版本。
    if (Test-Cmd 'gradle') {
        $g = Get-CmdPath 'gradle'
        $major = Get-GradleMajor $g
        if ($major -eq 8) {
            Write-Ok "使用系统 Gradle 8.x: $g"
            return $g
        }
        Write-Note "系统 Gradle 是 $major.x，与本工程的 AGP 8.2.0 不兼容，改用独立的 $GradleVersion"
    }

    $zip = Join-Path $CacheDir "gradle-$GradleVersion-bin.zip"
    $urls = @(
        "https://mirrors.cloud.tencent.com/gradle/gradle-$GradleVersion-bin.zip",
        "https://mirrors.huaweicloud.com/gradle/gradle-$GradleVersion-bin.zip",
        "https://services.gradle.org/distributions/gradle-$GradleVersion-bin.zip"
    )
    if (-not (Test-Path $zip)) {
        foreach ($u in $urls) {
            Write-Note "下载 Gradle: $u"
            try {
                $ProgressPreference = 'SilentlyContinue'
                Invoke-WebRequest -Uri $u -OutFile $zip -UseBasicParsing -TimeoutSec 900
                break
            } catch {
                Write-Note "  失败，换下一个源"
            }
        }
    }
    if (-not (Test-Path $zip)) {
        Write-Fail 'Gradle 下载失败'
        Write-Tip  "手动下载 gradle-$GradleVersion-bin.zip 解压到 $CacheDir 下再重跑"
        return $null
    }
    Write-Note '解压 Gradle ...'
    Expand-Archive -Path $zip -DestinationPath $CacheDir -Force
    if (Test-Path $local) { Write-Ok "Gradle 就绪: $local"; return $local }
    return $null
}

$gradleBat = Resolve-Gradle
if (-not $gradleBat) { Wait-Exit 1 }

# ============================================================
#  Step 5 / 6  编译
# ============================================================
Write-Step "Step 5/6  编译 APK（首次会下载依赖，请耐心等待）"

$gradleArgs = @()
if ($Clean) { $gradleArgs += 'clean' }
if ($Type -eq 'release') { $gradleArgs += 'assembleRelease' } else { $gradleArgs += 'assembleDebug' }
$gradleArgs += '--no-daemon'
$gradleArgs += '--warning-mode=none'

if ($Mirror) {
    $initScript = Join-Path $ProjectRoot 'deploy\gradle-mirror.init.gradle'
    if (Test-Path $initScript) {
        $gradleArgs += @('--init-script', $initScript)
        Write-Note '已启用阿里云 Maven 镜像'
    } else {
        Write-Note "未找到 $initScript，跳过镜像设置"
    }
}

Push-Location $AppDir
Write-Tip "gradle $($gradleArgs -join ' ')"
& $gradleBat @gradleArgs
$buildCode = $LASTEXITCODE
Pop-Location

if ($buildCode -ne 0) {
    Write-Fail "Gradle 构建失败（退出码 $buildCode）"
    Write-Host ''
    Write-Tip '常见原因：'
    Write-Tip '  · 依赖下载超时  -> 加 -Mirror 走国内镜像重试'
    Write-Tip '  · SDK 组件缺失  -> 加 -InstallSdk 重试'
    Write-Tip '  · JDK 版本不对  -> 需要 JDK 17'
    Write-Host ''
    Write-Tip '实在装不起环境，用在线转换（零本地依赖）：'
    Write-Tip '  1) scripts\deploy-cloudflare.ps1 把站点发到公网'
    Write-Tip '  2) 打开 https://www.pwabuilder.com/ 输入网址 -> Package for stores -> Android'
    Wait-Exit 1
}

# ============================================================
#  Step 6 / 6  收集产物
# ============================================================
Write-Step 'Step 6/6  收集产物'

$apkGlob = Join-Path $AppDir "app\build\outputs\apk\$Type"
$apk = Get-ChildItem -Path $apkGlob -Filter '*.apk' -File -ErrorAction SilentlyContinue |
       Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $apk) {
    Write-Fail "未找到 APK，预期目录: $apkGlob"
    Wait-Exit 1
}

$stamp   = Get-Date -Format 'yyyyMMdd'
$outName = "drone-spray-calculator-$Type-$stamp.apk"
$outPath = Join-Path $ProjectRoot $outName
Copy-Item $apk.FullName -Destination $outPath -Force

Write-Host ''
Write-Ok 'APK 打包成功！'
Write-Host "         文件: $outPath" -ForegroundColor White
Write-Host "         大小: $('{0:N1} MB' -f ($apk.Length / 1MB))" -ForegroundColor White
Write-Host ''
Write-Tip '安装方法：把 APK 传到手机 -> 设置里允许"安装未知来源应用" -> 点击安装'
Write-Tip 'APK 已内置全部网页资源，安装后完全离线可用'
if ($Type -eq 'release') {
    Write-Host ''
    Write-Note 'release 包未签名，无法直接安装。自用请打 debug 包；上架需自行签名：'
    Write-Tip  '  keytool -genkey -v -keystore my.jks -keyalg RSA -keysize 2048 -validity 10000 -alias app'
    Write-Tip  '  apksigner sign --ks my.jks app-release-unsigned.apk'
}

Wait-Exit 0
