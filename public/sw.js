/* Madar PWA: only public static assets. Never cache API, subscriptions, admin, setup or /edge. */
const CACHE = 'madar-static-v2';
const STATIC = ['/app/', '/market.css', '/console.css', '/common.js', '/app.js', '/connectivity.js', '/favicon.svg', '/icon-192.png', '/manifest.webmanifest'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STATIC).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/panel') || url.pathname.startsWith('/setup') || url.pathname.startsWith('/edge') || url.pathname.startsWith('/r/')) return;
  const isAsset = /\.(?:js|css|svg|png|webmanifest|woff2)$/.test(url.pathname);
  event.respondWith((async () => {
    try {
      const fresh = await fetch(event.request);
      if (isAsset && fresh.ok) (await caches.open(CACHE)).put(event.request, fresh.clone());
      return fresh;
    } catch {
      const cached = await caches.match(event.request, { ignoreSearch: true });
      return cached || new Response('اتصال در دسترس نیست. محتوای آفلاین محدود است.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
  })());
});
