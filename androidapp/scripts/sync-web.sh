#!/bin/bash
# 同步 Web 文件到 androidapp/assets/www/
set -e

# scripts/ 目录的上一级是 androidapp/，再上一级是项目根目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$(cd "$SCRIPT_DIR/../.." && pwd)"
DST="$SRC/androidapp/app/src/main/assets/www"

echo "============================================================"
echo "  同步 Web 文件到 androidapp 工程"
echo "============================================================"
echo "源目录: $SRC"
echo "目标目录: $DST"
echo ""

echo "[1/6] 清空旧目录..."
rm -rf "$DST"
mkdir -p "$DST"

echo "[2/6] 复制 index.html + manifest.json + sw.js..."
cp "$SRC/index.html" "$DST/"
cp "$SRC/manifest.json" "$DST/"
cp "$SRC/sw.js" "$DST/"

echo "[3/6] 复制 css 目录..."
cp -r "$SRC/css" "$DST/"

echo "[4/6] 复制 js 目录..."
cp -r "$SRC/js" "$DST/"

echo "[5/6] 复制 assets 目录..."
cp -r "$SRC/assets" "$DST/"

echo "[6/6] 校验..."
if [ -f "$DST/index.html" ] && [ -f "$DST/css/style.css" ] && [ -f "$DST/js/app.js" ]; then
  echo "✅ 同步完成！文件已就绪："
  echo "   $DST/"
  ls "$DST"
else
  echo "❌ 同步失败：关键文件缺失"
  exit 1
fi
