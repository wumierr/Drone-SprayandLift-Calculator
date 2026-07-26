#!/usr/bin/env bash
# ============================================================
#  push-github.sh — 一键推送到 GitHub（本地优先，Linux / macOS）
#  用法: ./scripts/push-github.sh ["提交说明"] [--force]
#
#  本地优先说明：用 merge 策略 -X ours（ours = 当前本地分支），
#  而不是 rebase -X ours（那个反而是远程优先，是常见误用）。
# ============================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REPO_DEFAULT="https://github.com/wumierr/Drone-SprayandLift-Calculator.git"
MSG="${1:-}"
FORCE=0
for a in "$@"; do [ "$a" = "--force" ] && FORCE=1; done
[ "$MSG" = "--force" ] && MSG=""

G='\033[0;32m'; R='\033[0;31m'; Y='\033[1;33m'; N='\033[0m'
ok()   { echo -e "  ${G}[OK]${N}   $1"; }
err()  { echo -e "  ${R}[X]${N}    $1"; }
note() { echo -e "  ${Y}[i]${N}    $1"; }

# 代理端口没人监听时才清掉——挂着死代理会让 git 报出很难懂的错
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

command -v git >/dev/null 2>&1 || { err "未安装 git"; exit 1; }

[ -d .git ] || { note "初始化 git 仓库"; git init -q; git branch -M main; }

if ! git remote get-url origin >/dev/null 2>&1; then
  note "添加远程 origin -> $REPO_DEFAULT"
  git remote add origin "$REPO_DEFAULT"
fi
REMOTE="$(git remote get-url origin)"
ok "远程: $REMOTE"

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
[ -z "$BRANCH" ] || [ "$BRANCH" = "HEAD" ] && BRANCH="main"
ok "分支: $BRANCH"

if [ -n "$(git status --porcelain)" ]; then
  [ -z "$MSG" ] && MSG="chore: 更新项目 $(date '+%Y-%m-%d %H:%M')"
  git add -A
  git commit -q -m "$MSG" && ok "已提交: $MSG"
else
  note "工作区干净，无新改动"
fi

if git ls-remote --heads origin "$BRANCH" 2>/dev/null | grep -q .; then
  note "合并远程（冲突保留本地版本）..."
  git pull origin "$BRANCH" --no-rebase --no-edit -X ours \
    || git pull origin "$BRANCH" --no-rebase --no-edit -X ours --allow-unrelated-histories \
    || { [ "$FORCE" = "1" ] || { err "合并失败，如需本地覆盖远程请加 --force"; exit 1; }; }
else
  note "远程尚无该分支，push 时自动创建"
fi

if [ "$FORCE" = "1" ]; then
  git push -u origin "$BRANCH" --force-with-lease
else
  git push -u origin "$BRANCH"
fi

if [ $? -eq 0 ]; then
  ok "推送成功"
  echo "     ${REMOTE%.git}"
else
  err "推送失败：检查网络 / 凭据 / 远程新提交"
  exit 1
fi
