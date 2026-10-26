/* همیار پلاس — سرویس‌ورکر آفلاین: اول شبکه برای داده تازه، همیشه کش برای کارکرد بدون اینترنت */
const CACHE = 'hamyar-plus-v1';
const CORE = ['./', './index.html', './styles.css', './app.js', './config.js', './data/catalog.js', './manifest.webmanifest', './favicon.svg', './icon-192.png', './icon-512.png', './fonts/vazirmatn-arabic-400.woff2', './fonts/vazirmatn-arabic-600.woff2', './fonts/vazirmatn-latin-400.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return; // درخواست‌های سایت دیگر (همگام‌سازی اپ) را دست نمی‌زنیم
  if (url.pathname.startsWith('/api/')) {
    // دادهٔ تازه از شبکه؛ اگر نشد کش
    e.respondWith(fetch(request).then((res) => { const clone = res.clone(); caches.open(CACHE).then((c) => c.put(request, clone)); return res; }).catch(() => caches.match(request)));
    return;
  }
  // دارایی‌های استاتیک: شبکه با بازگشت به کش تا همیشه نسخهٔ جدید بیاید ولی آفلاین هم کار کند
  e.respondWith(fetch(request).then((res) => { if (res.ok) { const clone = res.clone(); caches.open(CACHE).then((c) => c.put(request, clone)); } return res; })
    .catch(() => caches.match(request, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html'))));
});
