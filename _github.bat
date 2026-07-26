@echo off
chcp 65001 >nul 2>&1
title Push to GitHub

set REPO=https://github.com/wumierr/Drone-SprayandLift-Calculator.git

if not exist .git (
    git init
    git branch -M main
)
git remote get-url origin >nul 2>&1
if %errorlevel% neq 0 (
    git remote add origin %REPO%
) else (
    git remote set-url origin %REPO%
)

:: Stage all tracked+new files (respects .gitignore)
git add -A

:: Check if there are staged changes
git diff --cached --quiet
if %errorlevel% equ 0 (
    echo Nothing to commit.
    timeout /t 2 /nobreak >nul
    exit /b 0
)

echo Committing changes...
git commit -m "Update project"

if %errorlevel% neq 0 (
    echo Commit failed.
    pause
    exit /b 1
)

:: ========== 关键修改：添加 -X ours 自动使用本地版本解决冲突 ==========
echo Syncing with remote...
git pull origin main --rebase --autostash -X ours

if %errorlevel% neq 0 (
    echo Pull failed — check for conflicts.
    pause
    exit /b 1
)

:: Push to main
git push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo ============================================================
    echo   Push successful!
    echo   Cloudflare Pages will auto-deploy from this branch.
    echo ============================================================
) else (
    echo Push failed. Check your network or GitHub credentials.
)
pause