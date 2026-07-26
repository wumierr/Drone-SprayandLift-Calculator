#!/usr/bin/env bash
# ============================================================
#  serve.sh — 本地服务管理（Linux / macOS / WSL / Git Bash）
#  用法: ./scripts/serve.sh {start|stop|restart|status|open}
#  环境变量: PORT=8080  LAN=1（监听 0.0.0.0，局域网可访问）
# ============================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-8080}"
PID_FILE="$ROOT/.server.pid"
LOG_DIR="$ROOT/logs"
LOG_FILE="$LOG_DIR/server.out.log"
URL="http://localhost:$PORT"

G='\033[0;32m'; R='\033[0;31m'; Y='\033[1;33m'; D='\033[0;90m'; N='\033[0m'
ok()   { echo -e "  ${G}[OK]${N}   $1"; }
err()  { echo -e "  ${R}[X]${N}    $1"; }
note() { echo -e "  ${Y}[i]${N}    $1"; }
tip()  { echo -e "  ${D}       $1${N}"; }

get_pid() {
  if [ -f "$PID_FILE" ]; then
    local p; p="$(cat "$PID_FILE" 2>/dev/null)"
    if [ -n "$p" ] && kill -0 "$p" 2>/dev/null; then echo "$p"; return 0; fi
  fi
  local p2=""
  if command -v lsof >/dev/null 2>&1; then
    p2="$(lsof -ti :"$PORT" -sTCP:LISTEN 2>/dev/null | head -1)"
  elif command -v ss >/dev/null 2>&1; then
    p2="$(ss -lptn "sport = :$PORT" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1)"
  fi
  [ -n "$p2" ] && { echo "$p2"; return 0; }
  return 1
}

start_server() {
  local p; p="$(get_pid)" && { note "服务已在运行 (PID: $p)"; echo "  $URL"; return 0; }

  mkdir -p "$LOG_DIR"
  if command -v node >/dev/null 2>&1; then
    note "使用 Node.js 静态服务器，端口 $PORT"
    BIND_HOST="$([ "${LAN:-0}" = "1" ] && echo 0.0.0.0 || echo 127.0.0.1)" \
      nohup node "$ROOT/scripts/static-server.cjs" "$PORT" >"$LOG_FILE" 2>&1 &
  elif command -v python3 >/dev/null 2>&1; then
    note "未找到 Node.js，回退到 python3 http.server，端口 $PORT"
    nohup python3 -m http.server "$PORT" --bind 127.0.0.1 >"$LOG_FILE" 2>&1 &
  else
    err "未找到 node 或 python3"; return 1
  fi

  echo $! > "$PID_FILE"

  for _ in $(seq 1 30); do
    if curl -fsS -o /dev/null "$URL" 2>/dev/null; then
      ok "服务已启动 (PID: $(cat "$PID_FILE"))"
      echo "    本机访问 : $URL"
      if [ "${LAN:-0}" = "1" ]; then
        local ip; ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
        [ -n "$ip" ] && echo "    局域网   : http://$ip:$PORT"
      fi
      echo "    日志     : $LOG_FILE"
      return 0
    fi
    sleep 0.5
  done
  err "服务启动超时"; tail -n 10 "$LOG_FILE" 2>/dev/null; return 1
}

stop_server() {
  local p; p="$(get_pid)" || { note "服务未在运行"; rm -f "$PID_FILE"; return 0; }
  note "正在停止服务 (PID: $p)..."
  kill "$p" 2>/dev/null; sleep 1
  kill -0 "$p" 2>/dev/null && kill -9 "$p" 2>/dev/null
  rm -f "$PID_FILE"
  ok "服务已停止"
}

status_server() {
  local p
  if p="$(get_pid)"; then
    ok "服务运行中 (PID: $p, 端口 $PORT)"
    local code; code="$(curl -s -o /dev/null -w '%{http_code}' "$URL" 2>/dev/null)"
    [ "$code" = "200" ] && ok "HTTP 正常 ($code) -> $URL" || err "HTTP 异常 ($code)"
  else
    note "服务未在运行（端口 $PORT 空闲）"
  fi
}

open_browser() {
  get_pid >/dev/null 2>&1 || start_server || return 1
  if   command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1 &
  elif command -v open     >/dev/null 2>&1; then open "$URL" >/dev/null 2>&1 &
  else note "请手动访问: $URL"; fi
}

case "${1:-start}" in
  start)   start_server ;;
  stop)    stop_server ;;
  restart) stop_server; sleep 1; start_server ;;
  status)  status_server ;;
  open)    open_browser ;;
  *) echo "用法: $0 {start|stop|restart|status|open}"; exit 1 ;;
esac
