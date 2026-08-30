/* ============================================================
   sw.js — PWA Service Worker
   策略：
   - 静态资源（HTML/CSS/JS/SVG/JSON）使用缓存优先
   - 其他请求回退到网络
   - 缓存版本号管理，更新时自动清理旧缓存
   ============================================================ */

/* 改任何 JS/CSS 后必须递增此版本号，否则 PWA 用户拿到的仍是旧缓存 */
const CACHE_VERSION = 'drone-spray-v4.1.0';
const CACHE_NAME = CACHE_VERSION;
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/data.js',
  './js/calculator.js',
  './js/storage.js',
  './js/ui.js',
  './js/app.js',
  './assets/icons/favicon.svg'
];

/* 安装：预缓存核心资源 */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // 用 addAll 失败一项不会阻塞整体，逐个添加更稳健
      return Promise.allSettled(ASSETS.map(url => cache.add(url)));
    }).then(() => self.skipWaiting())
  );
});

/* 激活：清理旧缓存 */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

/* 请求拦截：缓存优先，回退网络 */
self.addEventListener('fetch', event => {
  const req = event.request;

  // 仅处理 GET 请求
  if (req.method !== 'GET') return;

  // 跨域请求直接走网络
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(resp => {
        // 成功响应才缓存
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const respClone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, respClone));
        }
        return resp;
      }).catch(() => {
        // 离线时的兜底
        if (req.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('离线状态', { status: 503, statusText: 'Offline' });
      });
    })
  );
});

/* 接收更新消息 */
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
