# ============================================================
#  build-web.ps1 — 生成可直接部署的静态站点目录 dist/
#
#  本项目是纯静态页面，"构建"其实就是把要发布的文件挑出来，
#  排除 Android 工程、文档截图、APK、.git 等不该上公网的东西。
#  dist/ 可直接喂给：Cloudflare Pages / GitHub Pages / Netlify /
#  Vercel / nginx / Caddy / Docker。
#
#  用法: powershell -ExecutionPolicy Bypass -File scripts\build-web.ps1
#        -WithApk   顺带把根目录的 .apk 复制进 dist/download/（供网页下载）
# ============================================================

[CmdletBinding()]
param(
    [switch]$WithApk,
    [string]$OutDir = 'dist'
)

. (Join-Path $PSScriptRoot '_lib.ps1')
Set-Location $ProjectRoot

$Dist = Join-Path $ProjectRoot $OutDir

Write-Step '生成静态发布目录 dist/'
# 部署前重新生成单文件版，防止 standalone 与 js/css 漂移
if (Get-Command node -ErrorAction SilentlyContinue) {
    node (Join-Path $ProjectRoot 'scriptsuild-standalone.js') | Out-Host
} else {
    Write-Note '未找到 node，使用仓库内已提交的 standalone'
}

# ---- 清空 ----
if (Test-Path $Dist) { Remove-Item $Dist -Recurse -Force }
New-Item -ItemType Directory -Path $Dist -Force | Out-Null

# ---- 单文件 ----
$files = @(
    'index.html',
    'manifest.json',
    'sw.js',
    'drone-spray-calculator-standalone.html',
    'LICENSE'
)
foreach ($f in $files) {
    $src = Join-Path $ProjectRoot $f
    if (Test-Path $src) {
        Copy-Item $src -Destination $Dist -Force
        Write-Ok "复制 $f"
    } else {
        Write-Note "跳过（不存在）$f"
    }
}

# ---- 目录 ----
$dirs = @('css', 'js', 'assets')
foreach ($d in $dirs) {
    $src = Join-Path $ProjectRoot $d
    if (Test-Path $src) {
        Copy-Item $src -Destination $Dist -Recurse -Force
        Write-Ok "复制 $d/"
    } else {
        Write-Note "跳过（不存在）$d/"
    }
}

# ---- 可选：APK 放进下载目录 ----
if ($WithApk) {
    $apks = Get-ChildItem -Path $ProjectRoot -Filter '*.apk' -File -ErrorAction SilentlyContinue
    if ($apks) {
        $dl = Join-Path $Dist 'download'
        New-Item -ItemType Directory -Path $dl -Force | Out-Null
        foreach ($a in $apks) {
            Copy-Item $a.FullName -Destination $dl -Force
            Write-Ok "复制 APK $($a.Name) -> download/"
        }
    } else {
        Write-Note '根目录没有 .apk，跳过'
    }
}

# ---- GitHub Pages 需要 .nojekyll，否则下划线开头的文件会被吞掉 ----
Set-Content -Path (Join-Path $Dist '.nojekyll') -Value '' -NoNewline -Encoding ascii

# ---- Cloudflare Pages / Netlify 缓存头 ----
$headers = @'
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
'@
Set-Content -Path (Join-Path $Dist '_headers') -Value $headers -Encoding utf8

Write-Host ''
Write-Ok "构建完成：$Dist"
Write-Host "         体积：$(Get-DirSize $Dist)" -ForegroundColor DarkGray
Write-Host "         文件数：$((Get-ChildItem $Dist -Recurse -File).Count)" -ForegroundColor DarkGray
Write-Host ''
Write-Tip '接下来可以：'
Write-Tip '  scripts\deploy-cloudflare.ps1      部署到 Cloudflare Pages'
Write-Tip '  docker compose -f deploy\docker-compose.yml up -d   本机/服务器容器化'
Write-Tip '  把 dist\ 整个丢到任意静态托管 / nginx 的网站根目录'
