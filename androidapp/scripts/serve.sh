#!/bin/bash
# 启动本地 HTTP 服务（PWA 需要 http(s) 协议才能注册 service worker）
# 用法: ./serve.sh [port]
set -e
PORT="${1:-8080}"
cd "$(dirname "$0")/../.."
echo "============================================================"
echo "  无人机打药计算器 - 本地预览"
echo "  地址: http://localhost:$PORT"
echo "  按 Ctrl+C 停止"
echo "============================================================"
# 优先使用 Python（无需安装额外依赖）
if command -v python3 &> /dev/null; then
  python3 -m http.server $PORT --bind 127.0.0.1
elif command -v python &> /dev/null; then
  python -m SimpleHTTPServer $PORT
elif command -v npx &> /dev/null; then
  npx serve -l $PORT .
else
  echo "未找到 Python 或 npx，请先安装其一"
  exit 1
fi
