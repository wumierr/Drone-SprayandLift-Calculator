@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM ============================================================
REM   一键构建 APK 脚本（Windows）
REM   用法: build-apk.bat [debug|release]
REM ============================================================

set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..\..
set APP_DIR=%PROJECT_ROOT%\androidapp
set OUTPUT_DIR=%APP_DIR%\build-output
set GRADLE_VERSION=8.5
set BUILD_TYPE=%1
if "%BUILD_TYPE%"=="" set BUILD_TYPE=debug

echo ============================================================
echo   无人机打药计算器 - APK 构建脚本
echo ============================================================
echo.

REM ---------- 1. 检查 Java ----------
echo [i] 检查 Java...
where java >nul 2>&1
if errorlevel 1 (
    echo [X] 未找到 Java JDK 17
    echo     下载: https://adoptium.net/temurin/releases/
    echo     安装后设置 JAVA_HOME 环境变量
    exit /b 1
)
for /f "tokens=3" %%a in ('java -version 2^>^&1 ^| findstr /i "version"') do set JV=%%a
echo [V] Java %JV%

REM ---------- 2. 检查 Android SDK ----------
echo [i] 检查 Android SDK...
if "%ANDROID_HOME%"=="" (
    if exist "%LOCALAPPDATA%\Android\Sdk" set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
    if exist "%USERPROFILE%\AppData\Local\Android\Sdk" set ANDROID_HOME=%USERPROFILE%\AppData\Local\Android\Sdk
)
if "%ANDROID_HOME%"=="" (
    echo [X] 未找到 Android SDK
    echo     请安装 Android Studio: https://developer.android.com/studio
    echo     或仅 command-line tools: https://developer.android.com/studio#command-line-tools-only
    echo     设置环境变量 ANDROID_HOME 指向 SDK 目录
    exit /b 1
)
if not exist "%ANDROID_HOME%\platforms\android-34" (
    echo [!] 未安装 Android 34 Platform，正在尝试安装...
    call "%ANDROID_HOME%\cmdline-tools\latest\bin\sdkmanager.bat" "platforms;android-34" "build-tools;34.0.0"
)
echo [V] Android SDK: %ANDROID_HOME%

REM ---------- 3. 同步 Web 文件 ----------
echo [i] 同步 Web 文件...
call "%SCRIPT_DIR%sync-web.bat" >nul
if errorlevel 1 (
    echo [X] 同步 Web 文件失败
    exit /b 1
)
echo [V] Web 文件已同步

REM ---------- 4. 检查 Gradle Wrapper jar ----------
if not exist "%APP_DIR%\gradle\wrapper\gradle-wrapper.jar" (
    echo [i] 下载 gradle-wrapper.jar...
    where gradle >nul 2>&1
    if not errorlevel 1 (
        cd /d "%APP_DIR%"
        call gradle wrapper --gradle-version %GRADLE_VERSION% --distribution-type bin
    ) else (
        powershell -Command "try { Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/gradle/gradle/v%GRADLE_VERSION%/gradle/wrapper/gradle-wrapper.jar' -OutFile '%APP_DIR%\gradle\wrapper\gradle-wrapper.jar' } catch { exit 1 }"
        if not exist "%APP_DIR%\gradle\wrapper\gradle-wrapper.jar" (
            echo [X] 无法下载 gradle-wrapper.jar
            echo     请安装 Android Studio 后用其打开此工程自动生成
            exit /b 1
        )
    )
)
echo [V] Gradle Wrapper 就绪

REM ---------- 5. 构建 ----------
echo [i] 开始构建 %BUILD_TYPE% APK...
cd /d "%APP_DIR%"
call gradlew.bat clean assemble%BUILD_TYPE% --no-daemon --console=plain
if errorlevel 1 (
    echo [X] 构建失败
    exit /b 1
)

REM ---------- 6. 拷贝输出 ----------
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"
set SRC_APK=%APP_DIR%\app\build\outputs\apk\%BUILD_TYPE%\app-%BUILD_TYPE%.apk
set FINAL_NAME=drone-spray-calculator-%BUILD_TYPE%.apk

if exist "%SRC_APK%" (
    copy /Y "%SRC_APK%" "%OUTPUT_DIR%\%FINAL_NAME%" >nul
    echo.
    echo [V] 构建成功！
    echo.
    echo     APK 位置: %OUTPUT_DIR%\%FINAL_NAME%
    for %%I in ("%OUTPUT_DIR%\%FINAL_NAME%") do echo     文件大小: %%~zI 字节
    echo.
    echo     安装到手机：
    echo       adb install "%OUTPUT_DIR%\%FINAL_NAME%"
    echo.
    if /i "%BUILD_TYPE%"=="release" (
        echo [!] Release APK 需要签名才能在真机安装
        echo     详见 androidapp\README.md 中的「签名」章节
    )
) else (
    echo [X] 构建失败：未找到 APK
    exit /b 1
)

pause
