#!/usr/bin/env bash
# ============================================================
#  deploy-cloudflare.sh — 部署到 Cloudflare Pages（Linux / macOS）
#  用法: ./scripts/deploy-cloudflare.sh [项目名]
#
#  认证二选一:
#    A. 交互式: 首次自动弹浏览器授权
#    B. 环境变量: CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID（CI 用）
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PROJECT="${1:-drone-spray-calculator}"
BRANCH="${DEPLOY_BRANCH:-main}"

G='\033[0;32m'; R='\033[0;31m'; Y='\033[1;33m'; N='\033[0m'
ok()   { echo -e "  ${G}[OK]${N}   $1"; }
err()  { echo -e "  ${R}[X]${N}    $1"; }
note() { echo -e "  ${Y}[i]${N}    $1"; }

command -v npx >/dev/null 2>&1 || { err "未安装 Node.js / npx"; exit 1; }

# 代理端口没人监听时才清掉——挂着死代理会让 npx/wrangler 报出很难懂的错
proxy_guard() {
  local p="${HTTPS_PROXY:-${HTTP_PROXY:-${https_proxy:-${http_proxy:-}}}}"
  [ -z "$p" ] && return 0
  local hp="${p#*://}"; hp="${hp%%/*}"
  local h="${hp%%:*}"; local pt="${hp##*:}"
  if timeout 1 bash -c "</dev/tcp/$h/$pt" 2>/dev/null; then return 0; fi
  unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy
  note "代理 $p 无响应，已临时清除代理变量"
}
proxy_guard

note "构建 dist/ ..."
bash "$ROOT/scripts/build-web.sh"

if [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  ok "使用 API 令牌认证"
else
  note "使用交互式登录（首次会打开浏览器）"
  npx --yes wrangler@latest whoami >/dev/null 2>&1 || npx --yes wrangler@latest login
fi

note "上传 dist/ 到 Cloudflare Pages (项目: $PROJECT)"
npx --yes wrangler@latest pages deploy dist \
  --project-name="$PROJECT" \
  --branch="$BRANCH" \
  --commit-dirty=true

ok "部署完成 -> https://$PROJECT.pages.dev"
