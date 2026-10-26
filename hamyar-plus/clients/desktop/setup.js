'use strict';
(async () => {
  const input = document.getElementById('origin');
  const msg = document.getElementById('msg');
  try { input.value = await window.hamyarSetup.getOrigin(); } catch { /* تازه است */ }
  document.getElementById('save').addEventListener('click', async () => {
    msg.textContent = 'در حال ذخیره و بررسی…';
    const res = await window.hamyarSetup.saveOrigin(input.value);
    msg.textContent = res.ok ? '✅ ذخیره شد؛ در حال اتصال…' : '⚠️ ' + (res.error || 'خطا');
  });
  document.getElementById('local').addEventListener('click', () => window.hamyarSetup.goLocal());
})();
