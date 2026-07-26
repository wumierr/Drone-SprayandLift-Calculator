# ============================================================
#  serve.ps1 — 本地服务管理（启动 / 打开 / 停止 / 状态 / 重启）
#
#  用法:
#    powershell -ExecutionPolicy Bypass -File scripts\serve.ps1 start
#    powershell -ExecutionPolicy Bypass -File scripts\serve.ps1 stop
#    powershell -ExecutionPolicy Bypass -File scripts\serve.ps1 open
#    powershell -ExecutionPolicy Bypass -File scripts\serve.ps1 status
#    powershell -ExecutionPolicy Bypass -File scripts\serve.ps1 restart
#
#  参数:
#    -Port 8080     指定端口
#    -NoOpen        启动后不自动打开浏览器
#    -Lan           监听 0.0.0.0 并输出局域网地址（手机同一 WiFi 可访问）
# ============================================================

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('start', 'stop', 'restart', 'status', 'open')]
    [string]$Action = 'start',

    [int]$Port = 8080,
    [switch]$NoOpen,
    [switch]$Lan
)

. (Join-Path $PSScriptRoot '_lib.ps1')

Set-Location $ProjectRoot

$PidFile = Join-Path $ProjectRoot '.server.pid'
$LogDir  = Join-Path $ProjectRoot 'logs'
$LogOut  = Join-Path $LogDir 'server.out.log'
$LogErr  = Join-Path $LogDir 'server.err.log'
$Url     = "http://localhost:$Port"

function Get-ServerPid {
    # 1) PID 文件
    if (Test-Path $PidFile) {
        $saved = (Get-Content $PidFile -Raw).Trim()
        if ($saved -match '^\d+$') {
            $p = Get-Process -Id ([int]$saved) -ErrorAction SilentlyContinue
            if ($p) { return [int]$saved }
        }
    }
    # 2) 回退：按端口找
    return (Get-ListenerPid -Port $Port)
}

function Get-LanAddress {
    try {
        $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
              Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
              Select-Object -First 1 -ExpandProperty IPAddress
        if ($ip) { return $ip }
    } catch { }
    return $null
}

function Start-Server {
    $existing = Get-ServerPid
    if ($existing -ne 0) {
        Write-Note "服务已在运行 (PID: $existing, 端口 $Port)"
        if (-not $NoOpen) { Open-Browser $Url | Out-Null }
        return $true
    }

    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

    $serverJs = Join-Path $PSScriptRoot 'static-server.cjs'
    $proc = $null

    if (Test-Cmd 'node') {
        Write-Note "使用 Node.js 静态服务器，端口 $Port"
        $env:BIND_HOST = if ($Lan) { '0.0.0.0' } else { '127.0.0.1' }
        # 项目路径可能含空格（如 D:\agent work\...），参数必须自己加引号
        $proc = Start-Process -FilePath 'node' `
            -ArgumentList @("`"$serverJs`"", $Port) `
            -WorkingDirectory $ProjectRoot `
            -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput $LogOut -RedirectStandardError $LogErr
    }
    elseif (Test-Cmd 'python') {
        Write-Note "未找到 Node.js，回退到 Python http.server，端口 $Port"
        $proc = Start-Process -FilePath 'python' `
            -ArgumentList @('-m', 'http.server', $Port, '--bind', '127.0.0.1') `
            -WorkingDirectory $ProjectRoot `
            -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput $LogOut -RedirectStandardError $LogErr
    }
    else {
        Write-Fail '未找到 node 或 python，无法启动本地服务'
        Write-Tip  '本项目是纯静态页面，也可以直接双击 index.html 打开（部分 PWA 特性不可用）'
        return $false
    }

    if ($null -eq $proc) { Write-Fail '进程启动失败'; return $false }
    Set-Content -Path $PidFile -Value $proc.Id -Encoding ascii

    Write-Note '等待服务就绪...'
    if (Wait-HttpReady -Url $Url -TimeoutSec 20) {
        Write-Ok "服务已启动 (PID: $($proc.Id))"
        Write-Host ''
        Write-Host "    本机访问 : $Url" -ForegroundColor White
        if ($Lan) {
            $lanIp = Get-LanAddress
            if ($lanIp) { Write-Host "    局域网   : http://${lanIp}:$Port   (手机连同一 WiFi 可访问)" -ForegroundColor White }
        }
        Write-Host "    日志     : logs\server.out.log" -ForegroundColor DarkGray
        Write-Host ''
        if (-not $NoOpen) { Open-Browser $Url | Out-Null }
        return $true
    }

    Write-Fail '服务启动超时（20 秒）'
    if (Test-Path $LogErr) {
        Write-Tip '错误日志尾部：'
        Get-Content $LogErr -Tail 10 | ForEach-Object { Write-Tip $_ }
    }
    return $false
}

function Stop-Server {
    $target = Get-ServerPid
    if ($target -eq 0) {
        Write-Note '服务未在运行'
        if (Test-Path $PidFile) { Remove-Item $PidFile -Force }
        return $true
    }
    Write-Note "正在停止服务 (PID: $target)..."
    Stop-ProcTree -ProcId $target
    Start-Sleep -Milliseconds 800

    if (Test-PortBusy -Port $Port) {
        $again = Get-ListenerPid -Port $Port
        if ($again -ne 0) { Stop-ProcTree -ProcId $again; Start-Sleep -Milliseconds 500 }
    }
    if (Test-Path $PidFile) { Remove-Item $PidFile -Force }

    if (Test-PortBusy -Port $Port) {
        Write-Fail "端口 $Port 仍被占用，可能是别的程序在用"
        return $false
    }
    Write-Ok '服务已停止'
    return $true
}

function Show-Status {
    $target = Get-ServerPid
    if ($target -eq 0) {
        Write-Note "服务未在运行（端口 $Port 空闲）"
        return
    }
    Write-Ok "服务运行中 (PID: $target, 端口 $Port)"
    try {
        $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
        Write-Ok "HTTP 响应正常 ($($r.StatusCode))  ->  $Url"
    } catch {
        Write-Fail "HTTP 无响应，进程可能已僵死，建议执行 stop 后重启"
    }
}

Write-Step "无人机打药计算器 — 本地服务 [$Action]"

switch ($Action) {
    'start'   { $r = Start-Server; if (-not $r) { Wait-Exit 1 } }
    'stop'    { $r = Stop-Server;  if (-not $r) { Wait-Exit 1 } }
    'restart' { Stop-Server | Out-Null; Start-Sleep -Seconds 1; $r = Start-Server; if (-not $r) { Wait-Exit 1 } }
    'status'  { Show-Status }
    'open'    {
        if ((Get-ServerPid) -eq 0) {
            Write-Note '服务未运行，正在自动启动...'
            if (-not (Start-Server)) { Wait-Exit 1 }
        } else {
            Open-Browser $Url | Out-Null
            Write-Ok "已打开 $Url"
        }
    }
}

if ($env:NO_PAUSE -eq '1') { exit 0 }
if ($Action -eq 'status') { Wait-Exit 0 }
Start-Sleep -Seconds 2
