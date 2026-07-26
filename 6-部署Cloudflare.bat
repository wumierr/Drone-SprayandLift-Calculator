@echo off
chcp 65001 >nul 2>&1
title Drone Spray Calculator - Deploy to Cloudflare Pages
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy-cloudflare.ps1" %*
