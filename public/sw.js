/* Service Worker هم‌کلام — فقط کش فایل‌های ثابت (استراتژی: اول شبکه، در زمان قطعی کش)
   توجه: هرگز پاسخ‌های /api/* کش نمی‌شوند (چت و اتاق باید زنده باشند). */
const CACHE = 'hamkalam-v1';
const ASSETS = ['/', '/styles.css', '/build/home.js', '/favicon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // هیچ‌وقت کش نکن
  e.respondWith((async () => {
    try {
      const fresh = await fetch(e.request);
      if (fresh.ok && (url.pathname.startsWith('/build/') || /\.(css|svg|png|webmanifest)$/.test(url.pathname))) {
        const c = await caches.open(CACHE);
        c.put(e.request, fresh.clone());
      }
      return fresh;
    } catch {
      const cached = await caches.match(e.request, { ignoreSearch: true });
      if (cached) return cached;
      const home = await caches.match('/');
      return home || new Response('آفلاین هستید', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
  })());
});
