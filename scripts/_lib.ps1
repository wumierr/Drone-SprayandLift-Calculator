# ============================================================
#  _lib.ps1 — 公共函数库（被 scripts/ 下其它脚本 dot-source 引用）
#  兼容 Windows PowerShell 5.1（不使用三元/??/&& 等新语法）
# ============================================================

# ---------- 控制台编码：保证中文不乱码 ----------
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
try { $OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

# ---------- 项目根目录（scripts/ 的上一级）----------
$Global:ProjectRoot = Split-Path -Parent $PSScriptRoot
$Global:ProjectName = 'drone-spray-calculator'

# ---------- 彩色输出 ----------
function Write-Step {
    param([string]$Text)
    Write-Host ''
    Write-Host ('━' * 56) -ForegroundColor DarkCyan
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host ('━' * 56) -ForegroundColor DarkCyan
}
function Write-Ok   { param([string]$Text) Write-Host "  [OK]   $Text" -ForegroundColor Green }
function Write-Fail { param([string]$Text) Write-Host "  [X]    $Text" -ForegroundColor Red }
function Write-Note { param([string]$Text) Write-Host "  [i]    $Text" -ForegroundColor Yellow }
function Write-Tip  { param([string]$Text) Write-Host "         $Text" -ForegroundColor DarkGray }

# ---------- 工具检测 ----------
function Test-Cmd {
    param([string]$Name)
    $c = Get-Command $Name -ErrorAction SilentlyContinue
    return ($null -ne $c)
}

function Get-CmdPath {
    param([string]$Name)
    $c = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -eq $c) { return $null }
    if ($c.Source) { return $c.Source }
    return $c.Name
}

# ---------- 代理处理 ----------
# 本机 HTTP_PROXY/HTTPS_PROXY 指向的代理只转发部分流量（端口在监听，
# 但访问很多站点会失败），所以"端口通不通"这种探测不管用，
# 必须实测目标域名能否拿到响应。
#
# 策略：先试直连，直连能通就清掉代理走直连；直连不通才保留代理。
function Test-UrlReachable {
    param(
        [string]$Url,
        [string]$ViaProxy = $null,
        [int]$TimeoutMs = 6000
    )
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    } catch { }
    try {
        $req = [System.Net.HttpWebRequest]::Create($Url)
        $req.Method = 'GET'
        $req.Timeout = $TimeoutMs
        $req.ReadWriteTimeout = $TimeoutMs
        $req.UserAgent = 'Mozilla/5.0'
        if ($ViaProxy) { $req.Proxy = New-Object System.Net.WebProxy($ViaProxy) }
        else { $req.Proxy = $null }
        $resp = $req.GetResponse()
        $code = [int]$resp.StatusCode
        $resp.Close()
        return ($code -lt 400)
    } catch { return $false }
}

function Disable-ProxyForSession {
    param(
        # 用真正要访问的域名做探测。默认用 npm registry（装包/wrangler 都要）。
        [string]$TestUrl = 'https://registry.npmjs.org/'
    )
    $names = @('HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy')
    $sample = $null
    foreach ($n in $names) {
        $v = [Environment]::GetEnvironmentVariable($n, 'Process')
        if ($v) { $sample = $v; break }
    }
    if (-not $sample) { return }

    # 1) 直连能通 -> 清代理，走直连（本机实测：直连可达，代理反而不行）
    if (Test-UrlReachable -Url $TestUrl) {
        foreach ($n in $names) { [Environment]::SetEnvironmentVariable($n, $null, 'Process') }
        Write-Note '直连可用，已临时清除代理变量（不影响系统设置）'
        return
    }

    # 2) 直连不通，代理能通 -> 保留代理
    if (Test-UrlReachable -Url $TestUrl -ViaProxy $sample) {
        Write-Note "直连不通，改走代理：$sample"
        return
    }

    # 3) 都不通 -> 清掉代理，起码让报错正常一点
    #    注意这不一定代表操作会失败：SSH（git@github.com）根本不走 HTTP 代理
    foreach ($n in $names) { [Environment]::SetEnvironmentVariable($n, $null, 'Process') }
    Write-Note "探测不到 $TestUrl（已清除代理变量，继续尝试）"
    Write-Tip  '若后面确实失败，请启动代理软件后重跑'
}

# ---------- 端口 / 进程 ----------
function Get-ListenerPid {
    param([int]$Port)
    try {
        $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
                Select-Object -First 1
        if ($conn) { return [int]$conn.OwningProcess }
    } catch {
        # 老系统回退到 netstat
        $line = netstat -ano -p TCP 2>$null | Select-String -Pattern ":$Port\s+.*LISTENING" | Select-Object -First 1
        if ($line) {
            $parts = ($line.ToString().Trim() -split '\s+')
            return [int]$parts[-1]
        }
    }
    return 0
}

function Test-PortBusy {
    param([int]$Port)
    return ((Get-ListenerPid -Port $Port) -ne 0)
}

function Stop-ProcTree {
    param([int]$ProcId)
    if ($ProcId -le 0) { return }
    # /T 连同子进程一起结束（next dev / node 会派生子进程）
    & taskkill.exe /PID $ProcId /T /F 2>&1 | Out-Null
}

# ---------- 等待 HTTP 就绪 ----------
function Wait-HttpReady {
    param(
        [string]$Url,
        [int]$TimeoutSec = 60
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
            if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { return $true }
        } catch {
            # 服务还没起来，继续等
        }
        Start-Sleep -Milliseconds 700
    }
    return $false
}

# ---------- 打开浏览器 ----------
function Open-Browser {
    param([string]$Url)
    try {
        Start-Process $Url | Out-Null
        return $true
    } catch {
        Write-Fail "无法自动打开浏览器，请手动访问：$Url"
        return $false
    }
}

# ---------- 结束时暂停（双击 bat 运行时保留窗口）----------
function Wait-Exit {
    param([int]$Code = 0)
    if ($env:NO_PAUSE -eq '1') { exit $Code }
    Write-Host ''
    Write-Host '  按任意键关闭窗口...' -ForegroundColor DarkGray
    try { $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown') } catch { Start-Sleep -Seconds 3 }
    exit $Code
}

# ---------- 目录复制（用于生成 dist）----------
function Copy-Tree {
    param([string]$From, [string]$To)
    if (-not (Test-Path $From)) { return $false }
    if (-not (Test-Path $To)) { New-Item -ItemType Directory -Path $To -Force | Out-Null }
    Copy-Item -Path (Join-Path $From '*') -Destination $To -Recurse -Force
    return $true
}

function Get-DirSize {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return '0 B' }
    $bytes = (Get-ChildItem $Path -Recurse -File -ErrorAction SilentlyContinue |
              Measure-Object -Property Length -Sum).Sum
    if ($null -eq $bytes) { $bytes = 0 }
    if ($bytes -ge 1MB) { return ('{0:N1} MB' -f ($bytes / 1MB)) }
    if ($bytes -ge 1KB) { return ('{0:N0} KB' -f ($bytes / 1KB)) }
    return "$bytes B"
}
