@echo off
chcp 65001 >nul 2>&1
title Drone Spray Calculator - Build APK
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-apk.ps1" -InstallSdk -Mirror %*
