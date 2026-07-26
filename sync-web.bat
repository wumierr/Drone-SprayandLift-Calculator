@echo off
chcp 65001 >nul
echo ============================================================
echo   同步 Web 文件到 Android WebView 工程
echo ============================================================

set SRC=%~dp0
set DST=%SRC%android-webview\app\src\main\assets\www\

echo 源目录: %SRC%
echo 目标目录: %DST%
echo.

:: 清空目标
echo [1/5] 清空旧的 www 目录...
if exist "%DST%" rmdir /s /q "%DST%"
mkdir "%DST%"

:: 复制 index.html
echo [2/5] 复制 index.html...
copy "%SRC%index.html" "%DST%index.html" >nul

:: 复制 css
echo [3/5] 复制 css 目录...
xcopy "%SRC%css" "%DST%css\" /e /y /i >nul

:: 复制 js
echo [4/5] 复制 js 目录...
xcopy "%SRC%js" "%DST%js\" /e /y /i >nul

:: 复制 assets
echo [5/5] 复制 assets 目录...
xcopy "%SRC%assets" "%DST%assets\" /e /y /i >nul

echo.
echo ✅ 同步完成！
echo 现在 Android Studio 工程中的 WebView 会加载最新 Web 文件。
echo.
pause
