/* AMIN CHESS AI — نقطه شروع برنامه */
(function (global) {
  'use strict';

  function boot() {
    var AMIN = global.AMIN;
    AMIN.db.init().then(function () {
      return AMIN.state.load();
    }).then(function () {
      return AMIN.api.load();
    }).then(function () {
      AMIN.nav.init();
      AMIN.nav.updateCoins();

      /* موتور شطرنج را پس‌زمینه آماده می‌کنیم (بدون بلاک‌کردن UI) */
      AMIN.engine.init().catch(function (e) {
        console.warn('موتور آماده نشد:', e);
        var banner = document.getElementById('engine-banner');
        banner.classList.remove('hidden');
        banner.textContent = 'موتور Stockfish در این مرورگر اجرا نشد — بازی بدون تحلیل ممکن است.';
      });

      /* خوش‌آمدگویی یا ورود مستقیم */
      if (!AMIN.state.getSettings().onboarded) {
        AMIN.screens.onboarding.show();
      } else {
        document.getElementById('app').classList.remove('hidden');
        AMIN.nav.go('home');
        AMIN.state.checkDailyLogin().then(function (r) {
          if (r && r.rewarded) AMIN.util.toast('🎁 جایزه ورود روزانه: ' + AMIN.util.faNum(r.amount) + ' سکه (روز ' + AMIN.util.faNum(r.streak) + ' پیاپی)');
        });
      }

      registerServiceWorker();
    }).catch(function (e) {
      console.error('خطای شروع:', e);
      document.body.insertAdjacentHTML('beforeend',
        '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;background:#12071f;padding:20px;text-align:center;z-index:9999">خطا در شروع برنامه: ' + (e && e.message || 'نامشخص') + '</div>');
    });
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in global.navigator)) return;
    /* فقط روی https یا localhost ثبت می‌شود؛ در WebView اندروید نیازی نیست */
    if (location.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(location.hostname)) return;
    global.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (e) {
        console.warn('Service Worker ثبت نشد:', e);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else boot();
})(window);
