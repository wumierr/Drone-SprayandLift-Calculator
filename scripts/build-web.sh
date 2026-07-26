#!/usr/bin/env bash
# ============================================================
#  build-web.sh — 生成静态发布目录 dist/（Linux / macOS）
#  用法: ./scripts/build-web.sh [--with-apk]
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
DIST="$ROOT/dist"
WITH_APK=0
[ "${1:-}" = "--with-apk" ] && WITH_APK=1

G='\033[0;32m'; Y='\033[1;33m'; N='\033[0m'
ok()   { echo -e "  ${G}[OK]${N}   $1"; }
note() { echo -e "  ${Y}[i]${N}    $1"; }

echo "生成静态发布目录 dist/"
rm -rf "$DIST"; mkdir -p "$DIST"

for f in index.html manifest.json sw.js drone-spray-calculator-standalone.html LICENSE; do
  [ -f "$ROOT/$f" ] && { cp "$ROOT/$f" "$DIST/"; ok "复制 $f"; } || note "跳过 $f"
done

for d in css js assets; do
  [ -d "$ROOT/$d" ] && { cp -r "$ROOT/$d" "$DIST/"; ok "复制 $d/"; } || note "跳过 $d/"
done

if [ "$WITH_APK" = "1" ]; then
  shopt -s nullglob
  apks=("$ROOT"/*.apk)
  if [ ${#apks[@]} -gt 0 ]; then
    mkdir -p "$DIST/download"
    for a in "${apks[@]}"; do cp "$a" "$DIST/download/"; ok "复制 $(basename "$a") -> download/"; done
  fi
fi

touch "$DIST/.nojekyll"

cat > "$DIST/_headers" <<'EOF'
/assets/*
  Cache-Control: public, max-age=31536000, immutable

/css/*
  Cache-Control: public, max-age=604800

/js/*
  Cache-Control: public, max-age=604800

/sw.js
  Cache-Control: no-cache

/index.html
  Cache-Control: no-cache
EOF

ok "构建完成: $DIST  ($(du -sh "$DIST" | cut -f1))"
