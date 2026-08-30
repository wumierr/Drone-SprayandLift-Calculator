#!/usr/bin/env node
/* ============================================================
   build-standalone.js — 重新生成单文件离线版
   把 index.html + css/style.css + js/*.js 内联为
   drone-spray-calculator-standalone.html（可直接双击打开）。
   运行：node scripts/build-standalone.js
   ⚠️ 修改 js/css 后务必重跑，否则单文件版与主版本漂移。
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'drone-spray-calculator-standalone.html');

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

// 内联样式（函数替换，避免 CSS 中 $ 序列被当作替换模式）
html = html.replace('<link rel="stylesheet" href="css/style.css" />', () =>
  '<style>\n' + css + '\n  </style>');

// 内联脚本
html = html.replace(/<script src="js\/([a-z]+)\.js"><\/script>/g, (m, name) => {
  const js = fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8');
  if (js.includes('</script>')) {
    throw new Error(`js/${name}.js 含 </script> 字面量，内联会破坏 HTML，请先转义`);
  }
  return '<script>\n' + js + '\n  </script>';
});

// 单文件版无外部资源：移除 manifest / PWA 注册（file:// 下本就跳过，但引用会 404）
html = html.replace(/\s*<link rel="manifest" href="manifest.json" \/>/, '');
html = html.replace(/<!-- PWA Service Worker[\s\S]*?<\/script>/, '<!-- 单文件离线版：无 Service Worker -->');

// 标识头
html = html.replace(
  '<html lang="zh-CN" data-theme="day">\n<head>',
  '<html lang="zh-CN" data-theme="day">\n<head>\n<!-- 独立 HTML 版本 - 所有 CSS/JS 已内联 - 可直接双击打开 -->'
);

fs.writeFileSync(out, html);
console.log(`standalone 已重新生成: ${(html.length / 1024).toFixed(1)} KB`);
