# ============================================================
#  push-github.ps1 — 一键推送到 GitHub（本地优先）
#
#  用法:
#    powershell -ExecutionPolicy Bypass -File scripts\push-github.ps1
#    powershell -ExecutionPolicy Bypass -File scripts\push-github.ps1 -Message "feat: 新增水稻预设"
#
#  参数:
#    -Message  <str>   提交说明（默认自动生成带时间戳的说明）
#    -Branch   <str>   目标分支（默认：当前分支）
#    -Remote   <url>   远程地址（默认见下方 $DefaultRepo）
#    -Force            远程与本地冲突无法自动合并时，用本地强制覆盖远程
#    -DryRun           只显示将要做什么，不实际提交推送
#
#  ⚠ 关于"本地优先"：
#    旧脚本里的 `git pull --rebase -X ours` 其实是"远程优先"——
#    rebase 期间 ours 指的是被 rebase 到的上游（远程），theirs 才是你的提交。
#    这里改用 merge 策略 `git pull --no-rebase -X ours`，ours = 本地当前分支，
#    冲突片段真正保留本地版本。
# ============================================================

[CmdletBinding()]
param(
    [string]$Message,
    [string]$Branch,
    [string]$Remote,
    [switch]$Force,
    [switch]$DryRun
)

. (Join-Path $PSScriptRoot '_lib.ps1')
Set-Location $ProjectRoot

$DefaultRepo = 'https://github.com/wumierr/Drone-SprayandLift-Calculator.git'

Write-Step '推送到 GitHub（本地优先）'

if (-not (Test-Cmd 'git')) { Write-Fail '未找到 git，请先安装 Git for Windows'; Wait-Exit 1 }

# ---------- 1. 仓库初始化 ----------
if (-not (Test-Path (Join-Path $ProjectRoot '.git'))) {
    Write-Note '当前目录还不是 git 仓库，正在初始化...'
    if (-not $DryRun) {
        git init | Out-Null
        git branch -M main | Out-Null
    }
}

# ---------- 2. 远程地址 ----------
if (-not $Remote) { $Remote = $DefaultRepo }
$currentRemote = (git remote get-url origin 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $currentRemote) {
    Write-Note "添加远程 origin -> $Remote"
    if (-not $DryRun) { git remote add origin $Remote | Out-Null }
} elseif ($currentRemote.Trim() -ne $Remote) {
    Write-Note "远程地址与默认值不同，保持现有：$($currentRemote.Trim())"
    Write-Tip  "如需改成 $Remote，请加参数 -Remote $Remote"
    $Remote = $currentRemote.Trim()
} else {
    Write-Ok "远程 origin: $Remote"
}

# ---------- 2.5 代理 ----------
# SSH 远程（git@github.com:...）走 SSH 协议，完全不经过 HTTP 代理，探测无意义。
# 只有 HTTPS 远程才需要管代理。
if ($Remote -like 'http*') {
    Disable-ProxyForSession -TestUrl 'https://github.com'
} else {
    Write-Tip 'SSH 远程，不受 HTTP 代理影响'
}

# ---------- 3. 分支 ----------
if (-not $Branch) {
    $Branch = (git rev-parse --abbrev-ref HEAD 2>$null)
    if ($LASTEXITCODE -ne 0 -or -not $Branch -or $Branch.Trim() -eq 'HEAD') { $Branch = 'main' }
    $Branch = $Branch.Trim()
}
Write-Ok "目标分支: $Branch"

# ---------- 4. 暂存 + 提交 ----------
$status = git status --porcelain
if ($status) {
    Write-Note "检测到 $((($status -split "`n") | Where-Object { $_ }).Count) 处改动"
    ($status -split "`n") | Where-Object { $_ } | Select-Object -First 15 | ForEach-Object { Write-Tip $_ }
    if (-not $Message) {
        $Message = "chore: 更新项目 $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    }
    if ($DryRun) {
        Write-Note "[DryRun] 将执行: git add -A; git commit -m `"$Message`""
    } else {
        git add -A
        git commit -m $Message | Out-Null
        if ($LASTEXITCODE -ne 0) { Write-Fail '提交失败'; Wait-Exit 1 }
        Write-Ok "已提交: $Message"
    }
} else {
    Write-Note '工作区干净，无新改动需要提交'
}

# ---------- 5. 与远程同步（本地优先）----------
Write-Note '检查远程分支...'
$remoteHead = git ls-remote --heads origin $Branch 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Fail '无法连接远程仓库'
    Write-Tip '本机对 GitHub 的访问受限：确认代理已关闭 / 网络可达 / 凭据有效'
    Write-Tip 'SSH 方式可试: git remote set-url origin git@github.com:wumierr/Drone-SprayandLift-Calculator.git'
    Wait-Exit 1
}

if ($remoteHead) {
    Write-Note "远程已存在分支 $Branch，正在合并（冲突时保留本地版本）..."
    if (-not $DryRun) {
        git pull origin $Branch --no-rebase --no-edit -X ours
        if ($LASTEXITCODE -ne 0) {
            Write-Fail '自动合并失败（可能是历史不相关）'
            Write-Note '尝试 --allow-unrelated-histories ...'
            git pull origin $Branch --no-rebase --no-edit -X ours --allow-unrelated-histories
            if ($LASTEXITCODE -ne 0) {
                if ($Force) {
                    Write-Note '按 -Force 用本地强制覆盖远程'
                } else {
                    Write-Fail '合并仍失败。确认要用本地覆盖远程，请重跑并加 -Force'
                    Wait-Exit 1
                }
            }
        }
    }
} else {
    Write-Note "远程还没有分支 $Branch，push 时会自动创建"
}

# ---------- 6. 推送 ----------
if ($DryRun) {
    Write-Note "[DryRun] 将执行: git push -u origin $Branch"
    Wait-Exit 0
}

Write-Note "推送到 origin/$Branch ..."
if ($Force) {
    git push -u origin $Branch --force-with-lease
} else {
    git push -u origin $Branch
}

if ($LASTEXITCODE -eq 0) {
    Write-Host ''
    Write-Ok '推送成功！'
    $webUrl = $Remote -replace '\.git$', '' -replace '^git@github\.com:', 'https://github.com/'
    Write-Host "         仓库: $webUrl" -ForegroundColor White
    Write-Host "         若已接 Cloudflare Pages / GitHub Pages，几分钟后自动上线" -ForegroundColor DarkGray
} else {
    Write-Fail '推送失败'
    Write-Tip '常见原因：1) 网络/代理  2) 凭据过期  3) 远程有他人新提交（重跑一次即可）'
    Write-Tip '要用本地强制覆盖远程: scripts\push-github.ps1 -Force'
    Wait-Exit 1
}

Wait-Exit 0
