# ============================================================
#  deploy-cloudflare.ps1 — 一键部署到 Cloudflare Pages
#
#  用法:
#    powershell -ExecutionPolicy Bypass -File scripts\deploy-cloudflare.ps1
#
#  参数:
#    -ProjectName <str>  Cloudflare Pages 项目名（默认 drone-spray-calculator）
#    -Branch      <str>  部署分支名，production 分支会走正式域名（默认 main）
#    -SkipBuild          跳过 dist 重新构建，直接上传现有 dist/
#    -WithApk            把 APK 一并放进 dist/download/ 供网页下载
#
#  两种认证方式（任选其一）:
#    A. 交互式登录：首次会自动弹浏览器让你授权（推荐，个人使用）
#    B. 环境变量  ：CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID（适合 CI/无浏览器）
#       令牌权限需要: Account -> Cloudflare Pages -> Edit
# ============================================================

[CmdletBinding()]
param(
    [string]$ProjectName = 'drone-spray-calculator',
    [string]$Branch = 'main',
    [switch]$SkipBuild,
    [switch]$WithApk
)

. (Join-Path $PSScriptRoot '_lib.ps1')
Set-Location $ProjectRoot

$Dist = Join-Path $ProjectRoot 'dist'

Write-Step 'Cloudflare Pages 部署'

if (-not (Test-Cmd 'npx')) {
    Write-Fail '未找到 npx（Node.js 自带），请先安装 Node.js 18+：https://nodejs.org/'
    Wait-Exit 1
}

# wrangler 走 npm registry，直连可用；代理开着反而会失败
Disable-ProxyForSession

# ---------- 1. 构建 ----------
if (-not $SkipBuild) {
    $buildArgs = @()
    if ($WithApk) { $buildArgs += '-WithApk' }
    & (Join-Path $PSScriptRoot 'build-web.ps1') @buildArgs
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne $null) { Write-Fail '构建失败'; Wait-Exit 1 }
} else {
    Write-Note '跳过构建，使用现有 dist/'
}

if (-not (Test-Path $Dist)) {
    Write-Fail "dist/ 不存在，请先执行 scripts\build-web.ps1"
    Wait-Exit 1
}

# ---------- 2. 认证 ----------
Write-Step '检查 Cloudflare 登录状态'

$hasToken = ($env:CLOUDFLARE_API_TOKEN -and $env:CLOUDFLARE_ACCOUNT_ID)
if ($hasToken) {
    Write-Ok '检测到 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID，使用令牌认证'
} else {
    Write-Note '未设置 API 令牌，使用交互式登录'
    $who = & npx --yes wrangler@latest whoami 2>&1 | Out-String
    if ($who -match 'not authenticated|You are not logged in|Unable to retrieve') {
        Write-Note '尚未登录，即将打开浏览器授权（授权后回到本窗口继续）...'
        & npx --yes wrangler@latest login
        if ($LASTEXITCODE -ne 0) {
            Write-Fail '登录失败'
            Write-Tip '无浏览器环境请改用令牌方式：'
            Write-Tip '  $env:CLOUDFLARE_API_TOKEN  = "你的令牌"'
            Write-Tip '  $env:CLOUDFLARE_ACCOUNT_ID = "你的账号ID"'
            Wait-Exit 1
        }
    } else {
        Write-Ok '已登录 Cloudflare'
    }
}

# ---------- 3. 部署 ----------
Write-Step "上传 dist/ 到 Cloudflare Pages（项目：$ProjectName）"
Write-Note "文件数 $((Get-ChildItem $Dist -Recurse -File).Count)，体积 $(Get-DirSize $Dist)"

& npx --yes wrangler@latest pages deploy $Dist `
    --project-name=$ProjectName `
    --branch=$Branch `
    --commit-dirty=true

if ($LASTEXITCODE -ne 0) {
    Write-Fail '部署失败'
    Write-Host ''
    Write-Tip '排查顺序：'
    Write-Tip '  1) 项目名首次使用会自动创建；若提示项目不存在，去 dash.cloudflare.com'
    Write-Tip '     -> Workers & Pages -> Create -> Pages -> 手动建一个同名项目'
    Write-Tip '  2) 网络问题：确认没有挂着失效代理'
    Write-Tip '  3) 令牌权限不足：需要 Account -> Cloudflare Pages -> Edit'
    Write-Host ''
    Write-Tip '备选路线（不用命令行）：把仓库推到 GitHub 后，在 Cloudflare Pages'
    Write-Tip '控制台选 "Connect to Git"，构建命令留空，输出目录填 dist（或直接填 /）'
    Wait-Exit 1
}

Write-Host ''
Write-Ok '部署完成！'
Write-Host "         预览域名: https://$ProjectName.pages.dev" -ForegroundColor White
Write-Host "         控制台  : https://dash.cloudflare.com/?to=/:account/pages/view/$ProjectName" -ForegroundColor DarkGray
Write-Host ''
Write-Tip '绑定自有域名：Pages 项目 -> Custom domains -> Set up a custom domain'
Write-Tip 'HTTPS 证书由 Cloudflare 自动签发续期，无需手动配置'

Wait-Exit 0
