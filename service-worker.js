// service-worker.js — 缓存应用外壳，离线可用
const CACHE = 'baby-record-v6';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './src/app.js',
  './src/storage.js',
  './src/stats.js',
  './src/ui.js',
  './src/config.js',
  './src/cloud.js',
  './src/sync.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // 页面导航：离线时回退到缓存的 index.html
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html').then((r) => r || fetch(req)));
    return;
  }

  // 其它资源：缓存优先，命中失败再联网并回填缓存
  e.respondWith(
    caches.match(req).then(
      (r) =>
        r ||
        fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          })
          .catch(() => caches.match('./index.html'))
    )
  );
});
