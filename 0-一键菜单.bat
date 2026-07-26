@echo off
chcp 65001 >nul 2>&1
title Drone Spray Calculator - Menu
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\menu.ps1"
