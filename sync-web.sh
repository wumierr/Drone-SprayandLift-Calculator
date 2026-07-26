#!/bin/bash
# 同步 Web 文件到 Android WebView 工程
set -e

SRC="$(cd "$(dirname "$0")" && pwd)"
DST="$SRC/android-webview/app/src/main/assets/www"

echo "============================================================"
echo "  同步 Web 文件到 Android WebView 工程"
echo "============================================================"
echo "源目录: $SRC"
echo "目标目录: $DST"
echo ""

echo "[1/5] 清空旧的 www 目录..."
rm -rf "$DST"
mkdir -p "$DST"

echo "[2/5] 复制 index.html..."
cp "$SRC/index.html" "$DST/"

echo "[3/5] 复制 css 目录..."
cp -r "$SRC/css" "$DST/"

echo "[4/5] 复制 js 目录..."
cp -r "$SRC/js" "$DST/"

echo "[5/5] 复制 assets 目录..."
cp -r "$SRC/assets" "$DST/"

echo ""
echo "✅ 同步完成！"
