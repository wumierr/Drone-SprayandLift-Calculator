@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM 同步 Web 文件到 androidapp\app\src\main\assets\www\
REM scripts 目录的上级是 androidapp，再上级是项目根目录
set SCRIPT_DIR=%~dp0
set SRC=%SCRIPT_DIR%..\..
set DST=%SRC%\androidapp\app\src\main\assets\www

echo ============================================================
echo   同步 Web 文件到 androidapp 工程
echo ============================================================
echo 源目录: %SRC%
echo 目标目录: %DST%
echo.

echo [1/6] 清空旧目录...
if exist "%DST%" rmdir /s /q "%DST%"
mkdir "%DST%"

echo [2/6] 复制 index.html + manifest.json + sw.js...
copy "%SRC%\index.html" "%DST%\index.html" >nul
copy "%SRC%\manifest.json" "%DST%\manifest.json" >nul
copy "%SRC%\sw.js" "%DST%\sw.js" >nul

echo [3/6] 复制 css 目录...
xcopy "%SRC%\css" "%DST%\css\" /e /y /i >nul

echo [4/6] 复制 js 目录...
xcopy "%SRC%\js" "%DST%\js\" /e /y /i >nul

echo [5/6] 复制 assets 目录...
xcopy "%SRC%\assets" "%DST%\assets\" /e /y /i >nul

echo [6/6] 校验...
if exist "%DST%\index.html" if exist "%DST%\css\style.css" if exist "%DST%\js\app.js" (
    echo ✅ 同步完成！
    dir /b "%DST%"
) else (
    echo ❌ 同步失败：关键文件缺失
    exit /b 1
)
echo.
pause
