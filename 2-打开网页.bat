@echo off
chcp 65001 >nul 2>&1
title Drone Spray Calculator - Open
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\serve.ps1" open
