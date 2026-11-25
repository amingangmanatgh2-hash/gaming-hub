/* AMIN CHESS AI — Service Worker برای نسخه وب (کش کامل آفلاین) */
var CACHE = 'amin-chess-v1';
var ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/main.css',
  './vendor/chessjs/chess.js',
  './vendor/stockfish/stockfish.js',
  './vendor/stockfish/stockfish.wasm',
  './vendor/stockfish/stockfish.asm.js',
  './fonts/Vazirmatn-Regular.woff2',
  './fonts/Vazirmatn-Medium.woff2',
  './fonts/Vazirmatn-Bold.woff2',
  './fonts/Vazirmatn-ExtraBold.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './js/core/util.js', './js/core/db.js', './js/core/sound.js', './js/core/engine.js', './js/core/state.js',
  './js/data/knowledge.js', './js/data/puzzles.js', './js/data/lessons.js', './js/data/shop.js',
  './js/ai/api.js', './js/ai/analysis.js', './js/ai/master.js',
  './js/game/game.js',
  './js/ui/board.js', './js/ui/nav.js', './js/ui/shop.js', './js/ui/prompts.js',
  './js/screens/onboarding.js', './js/screens/home.js', './js/screens/play.js', './js/screens/master.js',
  './js/screens/shop.js', './js/screens/profile.js', './js/screens/lessons.js', './js/screens/puzzles.js',
  './js/screens/settings.js', './js/screens/api.js', './js/screens/analysis.js',
  './js/main.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(ASSETS.map(function (a) {
        return c.add(a).catch(function () { /* فایل نبود؟ برنامه نمی‌شکند */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches['delete'](k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* استراتژی: کش اول برای فایل‌های خود برنامه؛ شبکه اول برای APIها */
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  /* درخواست‌های API هوش مصنوعی هرگز کش نشوند */
  if (url.hostname === 'api.cloudflare.com' || url.hostname === 'api.groq.com') return;

  e.respondWith(
    caches.match(e.request).then(function (hit) {
      if (hit) {
        /* به‌روزرسانی پس‌زمینه برای HTML اصلی */
        if (url.pathname.endsWith('index.html') || url.pathname === './') {
          fetch(e.request).then(function (res) {
            if (res.ok) caches.open(CACHE).then(function (c) { c.put(e.request, res); });
          }).catch(function () {});
        }
        return hit;
      }
      return fetch(e.request).then(function (res) {
        if (res.ok && url.origin === self.location.origin) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () {
        /* آفلاین: صفحه اصلی را برگردان */
        return caches.match('./index.html');
      });
    })
  );
});
